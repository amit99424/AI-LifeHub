/**
 * Google OAuth 2.0 sign-in endpoints.
 *
 *   GET  /api/auth/google/start     → 302 to Google's consent screen
 *   GET  /api/auth/google/callback  → verify, link/create user, issue the SAME
 *                                     JWT + rotating refresh session as
 *                                     email/password login, 302 to the SPA
 *   GET  /api/auth/google/status    → what the login page needs to render
 *   GET  /api/auth/google/redirect-uri → the exact URI to paste into Google Cloud Console
 *   GET  /api/auth/methods          → which sign-in methods the user has
 *   POST /api/auth/google/unlink    → remove the Google identity
 *
 * Nothing here trusts the browser for identity: the only input from the client
 * is a one-time `code`, exchanged server-to-server, whose ID token is verified
 * against Google's signing keys.
 */

import { Router } from 'express';
import type { Request } from 'express';
import { prisma } from '../lib/prisma.js';
import { ApiError, ah } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { config } from '../config.js';

/** 'google_only' = the UI offers Google and nothing else. */
function authUiMode(): 'google_only' | 'google_and_password' {
  return config.AUTH_UI_MODE;
}
import {
  GOOGLE_SCOPES,
  GoogleOAuthError,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_MS,
  buildAuthUrl,
  createPkcePair,
  createState,
  exchangeCode,
  googleConfigured,
  verifyIdToken,
} from '../services/google.js';
import { resolveGoogleUser, signInMethods } from '../services/oauthAccounts.js';
import { issueSession } from './auth.js';

export const googleAuthRouter = Router();

/** Cookie that carries state + PKCE verifier between /start and /callback. */
function stateCookieOptions() {
  return {
    httpOnly: true,
    // Lax (not None): the callback is a top-level GET navigation, so the cookie
    // is sent, and it stays unusable from third-party subrequests.
    sameSite: 'lax' as const,
    secure: config.COOKIE_SECURE,
    path: '/api/auth/google',
    maxAge: OAUTH_STATE_TTL_MS,
  };
}

/** clearCookie must not receive maxAge (Express deprecation). */
function clearStateCookieOptions() {
  const { maxAge: _ignored, ...rest } = stateCookieOptions();
  return rest;
}

function appendQuery(url: string, params: Record<string, string>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

/**
 * Log the one misconfiguration that silently breaks sign-in: the SPA calls this
 * endpoint on the API's own host, so the state cookie is scoped to the API, but
 * the callback returns the browser to the SPA's domain. The cookie is then never
 * sent, state validation fails, and the user lands on the failure page without a
 * useful reason. Reaching /start same-origin (through the host's /api proxy) is
 * what makes the cookie and the callback agree.
 */
function warnIfCrossSiteStart(req: Request): void {
  const entryOrigin = req.get('origin') ?? (req.get('referer') ? safeOrigin(req.get('referer')!) : '');
  const callbackOrigin = safeOrigin(config.GOOGLE_REDIRECT_URI);
  if (entryOrigin && callbackOrigin && entryOrigin !== callbackOrigin) {
    console.warn(
      `[oauth] /start reached from ${entryOrigin} but the callback returns to ${callbackOrigin}; ` +
        'the state cookie will not be sent back. Call this endpoint through the app\'s own /api proxy.',
    );
  }
}

/** Origin (`scheme://host`) of an absolute URL, or '' when it is not one. */
function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function isSafeRelative(p: string | undefined): p is string {
  return typeof p === 'string' && p.startsWith('/') && !p.startsWith('//');
}

// ── GET /api/auth/google/status ─────────────────────────────────────────
googleAuthRouter.get(
  '/google/status',
  ah(async (_req, res) => {
    res.json({
      configured: googleConfigured(),
      // The client id is public by design (it is in the consent URL). The secret
      // is never sent anywhere.
      clientId: googleConfigured() ? config.GOOGLE_CLIENT_ID : null,
      scopes: GOOGLE_SCOPES,
    });
  }),
);

// ── GET /api/auth/google/start ──────────────────────────────────────────
googleAuthRouter.get(
  '/google/start',
  authLimiter,
  ah(async (req, res) => {
    if (!googleConfigured()) {
      throw new ApiError(503, 'Google sign-in is not configured on this server.', 'google_unconfigured');
    }

    const state = createState();
    const { verifier, challenge } = createPkcePair();

    // Double-submit CSRF token: the browser must send the same state back, and
    // it is only readable by this server (httpOnly).
    warnIfCrossSiteStart(req);
    res.cookie(OAUTH_STATE_COOKIE, `${state}.${verifier}`, stateCookieOptions());

    const loginHint = typeof req.query.email === 'string' ? req.query.email : undefined;
    // Optional post-login destination inside the SPA, e.g. /tasks.
    const next = isSafeRelative(req.query.next as string | undefined) ? (req.query.next as string) : undefined;

    const url = buildAuthUrl(state, challenge, { loginHint });
    // Remember the destination without putting it in a cookie we would have to
    // parse back — encode it into the state cookie's companion header instead.
    if (next) res.setHeader('X-OAuth-Next', next);
    res.redirect(302, url);
  }),
);

// ── GET /api/auth/google/callback ───────────────────────────────────────
googleAuthRouter.get(
  '/google/callback',
  ah(async (req, res) => {
    const fail = (code: string, message: string) =>
      res.redirect(302, appendQuery(config.googleFailureRedirect, { error: code, message }));

    if (!googleConfigured()) return fail('google_unconfigured', 'Google sign-in is not configured on this server.');

    // Google reports user-side problems (consent denied, etc.) as query params.
    const googleError = typeof req.query.error === 'string' ? req.query.error : undefined;
    if (googleError) {
      return fail(
        'google_cancelled',
        googleError === 'access_denied'
          ? 'Google sign-in was cancelled.'
          : `Google returned an error: ${googleError}`,
      );
    }

    const code = typeof req.query.code === 'string' ? req.query.code : undefined;
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    const cookie = (req as unknown as { cookies?: Record<string, string> }).cookies?.[OAUTH_STATE_COOKIE];
    res.clearCookie(OAUTH_STATE_COOKIE, clearStateCookieOptions());

    if (!code) return fail('google_no_code', 'Google did not return an authorization code.');
    if (!state || !cookie) {
      return fail('google_bad_state', 'Your sign-in session expired. Please try again.');
    }

    const [cookieState, verifier] = cookie.split('.');
    if (!cookieState || cookieState !== state || !verifier) {
      // A mismatch means the callback did not originate from this browser.
      return fail('google_bad_state', 'The sign-in request could not be verified. Please try again.');
    }

    try {
      const tokens = await exchangeCode(code, verifier);
      const profile = await verifyIdToken(tokens.idToken);
      const account = await resolveGoogleUser(profile, { ip: req.ip });

      // Exactly the same session as email/password login: Session row, rotating
      // refresh token, 15-minute access JWT, httpOnly cookies.
      await prisma.user.update({ where: { id: account.userId }, data: { lastLoginAt: new Date() } });
      const session = await issueSession(
        account.userId,
        { userAgent: req.headers['user-agent'], ip: req.ip },
        res,
        req,
      );
      await prisma.auditLog
        .create({
          data: {
            userId: account.userId,
            action: account.outcome === 'created' ? 'auth.google_register' : 'auth.google_login',
            ip: req.ip,
            metadata: { outcome: account.outcome, provider: 'google' },
          },
        })
        .catch(() => undefined);

      // The SPA finishes the sign-in by calling /api/auth/me with the cookies it
      // now holds. Log metadata only — never values — so a mobile failure can be
      // diagnosed from Render logs alone.
      {
        const setCookie = res.getHeader('set-cookie');
        const list = Array.isArray(setCookie) ? setCookie : typeof setCookie === 'string' ? [setCookie] : [];
        const described = list.map((c) => {
          const name = c.split('=')[0];
          const samesite = /Samesite=(\w+)/i.exec(c)?.[1] ?? 'unset';
          const secure = /;\s*Secure/i.test(c) ? 'secure' : 'insecure';
          const path = /Path=([^;]+)/i.exec(c)?.[1] ?? '/';
          return `${name}[${samesite}/${secure}/path=${path}]`;
        });
        // eslint-disable-next-line no-console
        console.info(
          `[oauth] session ${session.sessionId} issued for user ${account.userId} (${account.outcome}); cookies: ${
            described.join(' ') || 'none'
          }; state-cookie-received: ${req.cookies?.[OAUTH_STATE_COOKIE] ? 'yes' : 'no'}; origin: ${
            req.headers.origin ?? 'none'
          }; ua: ${String(req.headers['user-agent'] ?? '').slice(0, 40)}`,
        );
      }

      // The SPA finishes the sign-in by calling /api/auth/me with the cookies it
      // now holds. `next` tells it where to go; no user data travels in the URL.
      const next = account.needsOnboarding ? '/onboarding' : '/dashboard';
      const target = appendQuery(config.googleSuccessRedirect, {
        status: account.outcome,
        next,
        session: session.sessionId,
      });
      return res.redirect(302, target);
    } catch (err) {
      if (err instanceof GoogleOAuthError) {
        // eslint-disable-next-line no-console
        console.error(`[oauth] google sign-in failed: ${err.code} — ${err.message}`);
        return fail(err.code, err.message);
      }
      // eslint-disable-next-line no-console
      console.error('[oauth] unexpected google sign-in failure', err);
      return fail('google_failed', 'Google sign-in failed. Please try again.');
    }
  }),
);

// ── GET /api/auth/methods ───────────────────────────────────────────────
googleAuthRouter.get(
  '/methods',
  requireAuth,
  ah(async (req, res) => {
    const methods = await signInMethods(req.user!.id);
    res.json({
      ...methods,
      googleAvailable: googleConfigured(),
      canUnlinkGoogle: Boolean(methods.google) && methods.password,
      // Which sign-in UI this deployment shows. The API itself still accepts
      // password login (and /api/auth/login keeps working) so existing clients
      // and automation are never broken by a frontend policy change.
      primaryMethod: authUiMode(),
    });
  }),
);

// ── POST /api/auth/google/unlink ────────────────────────────────────────
googleAuthRouter.post(
  '/google/unlink',
  requireAuth,
  ah(async (req, res) => {
    const methods = await signInMethods(req.user!.id);
    if (!methods.google) throw ApiError.badRequest('Google is not connected to this account.');
    if (authUiMode() === 'google_only') {
      // Google is the only way into the product: disconnecting it would lock
      // this user out of their own account.
      throw new ApiError(
        400,
        'Google is the only way to sign in to AI-LifeHub, so it cannot be disconnected.',
        'google_required',
      );
    }
    if (!methods.password) {
      // Refusing here prevents locking the user out of their own account.
      throw ApiError.badRequest(
        'Set a password first — otherwise you would have no way to sign in.',
        { code: 'password_required' },
      );
    }
    await prisma.oAuthAccount.deleteMany({ where: { userId: req.user!.id, provider: 'google' } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'auth.google_unlinked', ip: req.ip } });
    res.json({ ok: true });
  }),
);

// ── GET /api/auth/google/link ───────────────────────────────────────────
// Link Google to the *currently signed-in* account. The state cookie records the
// user id, so the callback can only ever attach Google to that same account.
googleAuthRouter.get(
  '/google/link',
  requireAuth,
  authLimiter,
  ah(async (req, res) => {
    if (!googleConfigured()) {
      throw new ApiError(503, 'Google sign-in is not configured on this server.', 'google_unconfigured');
    }
    const state = createState();
    const { verifier, challenge } = createPkcePair();
    res.cookie(OAUTH_STATE_COOKIE, `${state}.${verifier}.link:${req.user!.id}`, stateCookieOptions());
    res.redirect(302, buildAuthUrl(state, challenge));
  }),
);

// ── GET /api/auth/google/link/callback ──────────────────────────────────
googleAuthRouter.get(
  '/google/link/callback',
  ah(async (req, res) => {
    const fail = (code: string, message: string) =>
      res.redirect(302, appendQuery(config.googleFailureRedirect, { error: code, message, link: '1' }));

    const code = typeof req.query.code === 'string' ? req.query.code : undefined;
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    const cookie = (req as unknown as { cookies?: Record<string, string> }).cookies?.[OAUTH_STATE_COOKIE];
    res.clearCookie(OAUTH_STATE_COOKIE, clearStateCookieOptions());

    if (!googleConfigured()) return fail('google_unconfigured', 'Google sign-in is not configured on this server.');
    if (!code || !state || !cookie) return fail('google_bad_state', 'Your sign-in session expired. Please try again.');

    const [cookieState, verifier, linkPart] = cookie.split('.');
    const linkUserId = linkPart?.startsWith('link:') ? linkPart.slice(5) : null;
    if (!cookieState || cookieState !== state || !verifier || !linkUserId) {
      return fail('google_bad_state', 'The link request could not be verified. Please try again.');
    }

    try {
      const tokens = await exchangeCode(code, verifier);
      const profile = await verifyIdToken(tokens.idToken);

      const target = await prisma.user.findUnique({ where: { id: linkUserId }, select: { id: true, email: true, deletedAt: true } });
      if (!target || target.deletedAt) return fail('account_missing', 'That account no longer exists.');
      if (target.email.toLowerCase() !== profile.email.toLowerCase()) {
        return fail(
          'email_mismatch',
          `That Google account (${profile.email}) is not the same email as this account (${target.email}).`,
        );
      }

      const alreadyUsed = await prisma.oAuthAccount.findUnique({
        where: { provider_providerAccountId: { provider: 'google', providerAccountId: profile.sub } },
      });
      if (alreadyUsed && alreadyUsed.userId !== linkUserId) {
        return fail('identity_in_use', 'That Google account is already connected to a different AI-LifeHub account.');
      }

      await prisma.oAuthAccount.upsert({
        where: { provider_providerAccountId: { provider: 'google', providerAccountId: profile.sub } },
        create: {
          userId: linkUserId,
          provider: 'google',
          providerAccountId: profile.sub,
          email: profile.email,
          emailVerified: profile.emailVerified,
          name: profile.name,
          avatarUrl: profile.picture,
          linkedAt: new Date(),
          lastLoginAt: new Date(),
        },
        update: { lastLoginAt: new Date(), email: profile.email, avatarUrl: profile.picture },
      });
      await prisma.auditLog
        .create({ data: { userId: linkUserId, action: 'auth.google_linked', ip: req.ip, metadata: { via: 'settings' } } })
        .catch(() => undefined);

      return res.redirect(302, appendQuery(config.googleSuccessRedirect, { status: 'linked', next: '/settings' }));
    } catch (err) {
      if (err instanceof GoogleOAuthError) {
        // eslint-disable-next-line no-console
        console.error(`[oauth] google link failed: ${err.code} — ${err.message}`);
        return fail(err.code, err.message);
      }
      // eslint-disable-next-line no-console
      console.error('[oauth] unexpected google link failure', err);
      return fail('google_failed', 'Connecting Google failed. Please try again.');
    }
  }),
);

// ── GET /api/auth/google/redirect-uri (setup helper) ────────────────────
// Lets an operator copy the exact URI to paste into Google Cloud Console.
googleAuthRouter.get(
  '/google/redirect-uri',
  ah(async (_req, res) => {
    res.json({
      configured: googleConfigured(),
      redirectUri: config.GOOGLE_REDIRECT_URI || null,
      linkRedirectUri: config.GOOGLE_REDIRECT_URI ? `${config.GOOGLE_REDIRECT_URI.replace(/\/callback$/, '')}/link/callback` : null,
      successRedirect: config.googleSuccessRedirect,
    });
  }),
);
