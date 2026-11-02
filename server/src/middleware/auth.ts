import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/http.js';
import { verifyAccessToken } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { localDateKey } from '../lib/dates.js';

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
  sessionId: string;
  timezone: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
      accessToken?: string;
    }
  }
}

export const ACCESS_COOKIE = 'lh_at';

/** Reads the access token from the Authorization header, or the httpOnly cookie. */
export function extractAccessToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[ACCESS_COOKIE];
  return cookie ?? null;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractAccessToken(req);
    if (!token) throw ApiError.unauthorized('Sign in to continue');

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw ApiError.unauthorized('Session expired');
    }

    const session = await prisma.session.findFirst({
      where: { id: payload.sid, userId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            deletedAt: true,
            profile: { select: { timezone: true } },
          },
        },
      },
    });
    if (!session || session.user.deletedAt) throw ApiError.unauthorized('Session expired');

    req.user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      sessionId: session.id,
      timezone: session.user.profile?.timezone ?? 'UTC',
    };
    req.accessToken = token;

    // Touch lastSeen at most once per 5 minutes (fire and forget).
    const now = new Date();
    prisma.session
      .updateMany({
        where: { id: session.id, lastSeenAt: { lt: new Date(now.getTime() - 5 * 60_000) } },
        data: { lastSeenAt: now },
      })
      .catch(() => undefined);

    next();
  } catch (err) {
    next(err);
  }
}

/** Rejects if the authenticated user is not the owner of :id resources. */
export function assertOwnership(resourceUserId: string | null | undefined, userId: string) {
  if (!resourceUserId || resourceUserId !== userId) throw ApiError.notFound();
}

export function userTz(req: Request): string {
  return req.user?.timezone || 'UTC';
}

export function userToday(req: Request): string {
  return localDateKey(new Date(), userTz(req));
}

/**
 * Cross-site deployments (Vercel frontend + Render API) are different registrable
 * domains, so the refresh cookie must be SameSite=None to be sent on the
 * cross-origin refresh call. Browsers require Secure with None, which is why the
 * two settings are derived from one another. Same-site deployments (or local
 * development) keep Lax, which is stricter.
 */
const CROSS_SITE = config.COOKIE_SECURE && !config.COOKIE_DOMAIN;
const SAME_SITE: 'lax' | 'none' = CROSS_SITE ? 'none' : 'lax';

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  const base = {
    httpOnly: true,
    sameSite: SAME_SITE,
    secure: config.COOKIE_SECURE,
    domain: config.COOKIE_DOMAIN || undefined,
    path: '/',
  };
  res.cookie(ACCESS_COOKIE, accessToken, { ...base, maxAge: 15 * 60_000 });
  res.cookie('lh_rt', refreshToken, { ...base, path: '/api/auth', maxAge: config.REFRESH_TOKEN_TTL_DAYS * 86_400_000 });
}

export function clearAuthCookies(res: Response) {
  const base = {
    httpOnly: true,
    sameSite: SAME_SITE,
    secure: config.COOKIE_SECURE,
    domain: config.COOKIE_DOMAIN || undefined,
  };
  res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
  res.clearCookie('lh_rt', { ...base, path: '/api/auth' });
}
