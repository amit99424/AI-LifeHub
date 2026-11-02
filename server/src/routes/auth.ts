import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError, ah, validate } from '../lib/http.js';
import {
  createRefreshToken,
  hashPassword,
  hashToken,
  randomToken,
  signAccessToken,
  verifyPassword,
} from '../lib/auth.js';
import { clearAuthCookies, requireAuth, setAuthCookies } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { config } from '../config.js';

export const authRouter = Router();

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')
  .regex(/[a-zA-Z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Tell us your name').max(80),
  email: emailSchema,
  password: passwordSchema,
  timezone: z.string().trim().max(64).optional(),
});

const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, 'Password is required') });

const refreshSchema = z.object({ refreshToken: z.string().optional() });

function userDto(user: {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  profile: { onboarded: boolean; timezone: string; primaryGoal: string | null; occupation: string | null; avatarUrl: string | null } | null;
  settings: { theme: string; accent: string; aiEnabled: boolean; aiAutoInsights: boolean; moodTrackingOptIn: boolean; demoDataLoaded: boolean } | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    profile: {
      onboarded: user.profile?.onboarded ?? false,
      timezone: user.profile?.timezone ?? 'UTC',
      primaryGoal: user.profile?.primaryGoal ?? null,
      occupation: user.profile?.occupation ?? null,
      avatarUrl: user.profile?.avatarUrl ?? null,
    },
    settings: {
      theme: user.settings?.theme ?? 'system',
      accent: user.settings?.accent ?? 'violet',
      aiEnabled: user.settings?.aiEnabled ?? true,
      aiAutoInsights: user.settings?.aiAutoInsights ?? true,
      moodTrackingOptIn: user.settings?.moodTrackingOptIn ?? true,
      demoDataLoaded: user.settings?.demoDataLoaded ?? false,
    },
  };
}

const userSelect = {
  id: true,
  email: true,
  name: true,
  createdAt: true,
  profile: { select: { onboarded: true, timezone: true, primaryGoal: true, occupation: true, avatarUrl: true } },
  settings: {
    select: { theme: true, accent: true, aiEnabled: true, aiAutoInsights: true, moodTrackingOptIn: true, demoDataLoaded: true },
  },
} as const;

async function issueSession(
  userId: string,
  meta: { userAgent?: string; ip?: string },
  res: Parameters<typeof setAuthCookies>[0],
) {
  const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  const session = await prisma.session.create({
    data: { userId, userAgent: meta.userAgent?.slice(0, 400), ip: meta.ip, expiresAt },
  });
  const { token, hash } = createRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      sessionId: session.id,
      tokenHash: hash,
      family: session.id,
      expiresAt,
    },
  });
  const accessToken = signAccessToken(userId, session.id);
  setAuthCookies(res, accessToken, token);
  return { accessToken, refreshToken: token, sessionId: session.id, expiresIn: 15 * 60 };
}

// POST /api/auth/register
authRouter.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  ah(async (req, res) => {
    const { name, email, password, timezone } = req.body as z.infer<typeof registerSchema>;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw ApiError.conflict('An account with this email already exists');

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        profile: { create: { timezone: timezone || 'Asia/Kolkata' } },
        settings: { create: {} },
      },
      select: userSelect,
    });

    const tokens = await issueSession(user.id, { userAgent: req.headers['user-agent'], ip: req.ip }, res);
    await prisma.auditLog.create({ data: { userId: user.id, action: 'auth.register', ip: req.ip } });
    res.status(201).json({ user: userDto(user), ...tokens });
  }),
);

// POST /api/auth/login
authRouter.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  ah(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await prisma.user.findUnique({ where: { email }, select: { ...userSelect, passwordHash: true, deletedAt: true } });
    // Constant-ish work either way to avoid user enumeration timing.
    const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyPassword(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
    if (!user || !ok || user.deletedAt) throw ApiError.unauthorized('Incorrect email or password');

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const tokens = await issueSession(user.id, { userAgent: req.headers['user-agent'], ip: req.ip }, res);
    await prisma.auditLog.create({ data: { userId: user.id, action: 'auth.login', ip: req.ip } });
    res.json({ user: userDto(user), ...tokens });
  }),
);

// POST /api/auth/refresh  (rotating refresh tokens + reuse detection)
authRouter.post(
  '/refresh',
  validate({ body: refreshSchema }),
  ah(async (req, res) => {
    const fromBody = (req.body as z.infer<typeof refreshSchema>).refreshToken;
    const cookieToken = (req as unknown as { cookies?: Record<string, string> }).cookies?.lh_rt;
    const raw = fromBody || cookieToken;
    if (!raw) throw ApiError.unauthorized('No refresh token');

    const hash = hashToken(raw);
    const record = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
    if (!record) throw ApiError.unauthorized('Invalid refresh token');

    if (record.revokedAt || record.expiresAt < new Date()) {
      // Reuse of a rotated token → revoke the whole family (possible theft).
      await prisma.refreshToken.updateMany({ where: { family: record.family, revokedAt: null }, data: { revokedAt: new Date() } });
      if (record.sessionId) await prisma.session.update({ where: { id: record.sessionId }, data: { revokedAt: new Date() } }).catch(() => undefined);
      clearAuthCookies(res);
      throw ApiError.unauthorized('Session expired. Please sign in again.');
    }

    const user = await prisma.user.findUnique({ where: { id: record.userId }, select: userSelect });
    if (!user) throw ApiError.unauthorized('Account not found');

    const next = createRefreshToken();
    await prisma.$transaction([
      prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } }),
      prisma.refreshToken.create({
        data: {
          userId: record.userId,
          sessionId: record.sessionId,
          tokenHash: next.hash,
          family: record.family,
          expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
        },
      }),
    ]);
    const sessionId = record.sessionId!;
    const accessToken = signAccessToken(user.id, sessionId);
    setAuthCookies(res, accessToken, next.token);
    res.json({ user: userDto(user), accessToken, refreshToken: next.token, expiresIn: 15 * 60 });
  }),
);

// POST /api/auth/logout
authRouter.post(
  '/logout',
  ah(async (req, res) => {
    const cookieToken = (req as unknown as { cookies?: Record<string, string> }).cookies?.lh_rt;
    const bodyToken = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
    const raw = bodyToken || cookieToken;
    if (raw) {
      const record = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(raw) } });
      if (record) {
        await prisma.refreshToken.updateMany({ where: { family: record.family, revokedAt: null }, data: { revokedAt: new Date() } });
        if (record.sessionId) {
          await prisma.session.update({ where: { id: record.sessionId }, data: { revokedAt: new Date() } }).catch(() => undefined);
        }
      }
    }
    clearAuthCookies(res);
    res.json({ ok: true });
  }),
);

// POST /api/auth/forgot-password
authRouter.post(
  '/forgot-password',
  authLimiter,
  validate({ body: z.object({ email: emailSchema }) }),
  ah(async (req, res) => {
    const { email } = req.body as { email: string };
    const user = await prisma.user.findUnique({ where: { email } });
    // Always answer 200 — never reveal whether an account exists.
    if (!user || user.deletedAt) {
      return res.json({ ok: true, message: 'If that account exists, a reset link has been created.' });
    }
    const token = randomToken(32);
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60_000) },
    });
    await prisma.auditLog.create({ data: { userId: user.id, action: 'auth.forgot_password', ip: req.ip } });

    // No mail provider is configured in this deployment, so the link is
    // returned directly (dev) or logged. Wire an SMTP/SES provider here.
    const resetUrl = `${config.APP_URL}/reset-password?token=${token}`;
    if (!config.isProd) {
      // eslint-disable-next-line no-console
      console.log(`[auth] password reset link for ${email}: ${resetUrl}`);
      return res.json({ ok: true, message: 'Reset link generated.', resetUrl, devOnly: true });
    }
    return res.json({ ok: true, message: 'If that account exists, a reset link has been sent.' });
  }),
);

// POST /api/auth/reset-password
authRouter.post(
  '/reset-password',
  authLimiter,
  validate({ body: z.object({ token: z.string().min(10), password: passwordSchema }) }),
  ah(async (req, res) => {
    const { token, password } = req.body as { token: string; password: string };
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw ApiError.badRequest('This reset link is invalid or has expired');
    }
    const passwordHash = await hashPassword(password);
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // Sign out everywhere after a password change.
      prisma.refreshToken.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
      prisma.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await prisma.auditLog.create({ data: { userId: record.userId, action: 'auth.reset_password', ip: req.ip } });
    res.json({ ok: true, message: 'Password updated. Please sign in.' });
  }),
);

// GET /api/auth/me
authRouter.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: userSelect });
    res.json({ user: userDto(user) });
  }),
);

// GET /api/auth/sessions
authRouter.get(
  '/sessions',
  requireAuth,
  ah(async (req, res) => {
    const sessions = await prisma.session.findMany({
      where: { userId: req.user!.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, userAgent: true, ip: true, createdAt: true, lastSeenAt: true },
      take: 20,
    });
    res.json({
      sessions: sessions.map((s) => ({ ...s, current: s.id === req.user!.sessionId })),
    });
  }),
);

// DELETE /api/auth/sessions/:id
authRouter.delete(
  '/sessions/:id',
  requireAuth,
  ah(async (req, res) => {
    const session = await prisma.session.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!session) throw ApiError.notFound('Session not found');
    await prisma.$transaction([
      prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } }),
      prisma.refreshToken.updateMany({ where: { sessionId: session.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    res.json({ ok: true });
  }),
);

// POST /api/auth/sessions/revoke-all
authRouter.post(
  '/sessions/revoke-all',
  requireAuth,
  ah(async (req, res) => {
    await prisma.$transaction([
      prisma.session.updateMany({
        where: { userId: req.user!.id, revokedAt: null, id: { not: req.user!.sessionId } },
        data: { revokedAt: new Date() },
      }),
      prisma.refreshToken.updateMany({
        where: { userId: req.user!.id, revokedAt: null, sessionId: { not: req.user!.sessionId } },
        data: { revokedAt: new Date() },
      }),
    ]);
    res.json({ ok: true });
  }),
);
