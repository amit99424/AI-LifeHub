// Run from the server/ directory: node tests/oauth-e2e.mjs
// End-to-end Google OAuth test against the real Express app + real Postgres.
import { startFakeGoogle } from './fakeGoogle.mjs';
import http from 'node:http';

const FAKE = 4961;
const codes = new Map();
let seq = 0;
const newCode = (claims) => {
  const c = `code-${++seq}`;
  codes.set(c, claims);
  return c;
};

const fake = await startFakeGoogle(FAKE, (c) => {
  const entry = codes.get(c) ?? null;
  codes.delete(c); // real Google codes are single-use
  return entry;
});

// Point the running server at the fake Google by overriding the endpoints via
// a tiny proxy is not possible at runtime, so instead we drive the service
// functions directly through a second app instance in this process.
process.env.GOOGLE_CLIENT_ID = '123456-test.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'GOCSPX-testsecret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:4900/api/auth/google/callback';
// Production cookie shape: https, no shared parent domain. Set explicitly so the
// suite proves production behaviour instead of whatever the local .env says.
process.env.COOKIE_SECURE = 'true';
process.env.COOKIE_DOMAIN = '';
// Respect an operator override (AUTH_COOKIE_SAMESITE=none|lax) so this suite can
// also prove that a wrong policy FAILS, but never inherit a stray value.
if (!process.env.AUTH_COOKIE_SAMESITE) process.env.AUTH_COOKIE_SAMESITE = 'auto';
const COOKIE_MODE = process.env.AUTH_COOKIE_SAMESITE;

/**
 * The deployment this suite models, and the one the app is designed around:
 * SPA and API on ONE origin. The host proxies `/api/*` to the backend, so the
 * browser only ever talks to the app's own domain and every cookie is
 * first-party. That is what makes Safari and in-app browsers (WhatsApp,
 * Instagram) work, which cross-site cookies never did.
 */
process.env.APP_URL ||= 'https://ai-life-hub-iixf.vercel.app';
process.env.CORS_ORIGINS = process.env.APP_URL;
// The callback returns to the app's own origin, because the app proxies /api/*.
process.env.GOOGLE_REDIRECT_URI = `${process.env.APP_URL}/api/auth/google/callback`;

const { createApp } = await import('../dist/app.js');
const googleSvc = await import('../dist/services/google.js');

// Redirect the service's Google endpoints at the local fake.
googleSvc.googleEndpoints.jwks = `http://127.0.0.1:${FAKE}/jwks`;
googleSvc.googleEndpoints.token = `http://127.0.0.1:${FAKE}/token`;
const app = createApp();
const server = app.listen(4962);

function req(path, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, 'http://127.0.0.1:4962');
    const r = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: opts.method ?? 'GET', headers: opts.headers ?? {} },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      },
    );
    r.on('error', reject);
    if (opts.body) r.write(opts.body);
    r.end();
  });
}

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  — ${extra}` : ''}`);
};

// A fresh random user each run so repeated runs never collide.
const stamp = Date.now();
const newGoogleUser = (over = {}) => ({
  sub: `google-sub-${stamp}`,
  email: `g.${stamp}@example.com`,
  email_verified: true,
  name: 'Google Person',
  picture: 'https://example.com/p.png',
  ...over,
});

/**
 * Simulates a browser, not curl: a cookie is kept only if a real browser would
 * keep it, and only sent to a path it matches. Without this the harness happily
 * accepts cookies Chrome and Safari reject (SameSite=None without Secure).
 */
function browserJar(baseUrl) {
  const jar = [];
  let injected = false;
  return {
    get insecureNoneRejected() {
      return injected;
    },
    keep(setCookies) {
      for (const raw of [].concat(setCookies ?? [])) {
        const [pair, ...attrs] = raw.split(';');
        const eq = pair.indexOf('=');
        const cookie = { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim() };
        for (const a of attrs) {
          const [k, v] = a.split('=');
          cookie[k.trim().toLowerCase()] = v?.trim() ?? true;
        }
        // A browser drops SameSite=None cookies that are not Secure.
        if (String(cookie.samesite).toLowerCase() === 'none' && !('secure' in cookie)) {
          injected = true; // remember: this deployment produces cookies Safari deletes
          continue;
        }
        const existing = jar.findIndex((c) => c.name === cookie.name && c.path === cookie.path);
        if (existing >= 0) jar.splice(existing, 1);
        if (cookie['max-age'] === '0') continue;
        jar.push(cookie);
      }
    },
    /**
     * Cookies a browser attaches to a fetch made from another registrable
     * domain (the SPA on vercel.app calling the API on onrender.com).
     * SameSite=Lax and Strict are withheld; only None travels.
     */
    headerCrossSite(path = '/') {
      return jar
        .filter((c) => path.startsWith(c.path || '/'))
        .filter((c) => ['none', 'lax'].includes(String(c.samesite).toLowerCase()))
        .map((c) => `${c.name}=${c.value}`)
        .join('; ');
    },
    header(path = '/') {
      return jar
        .filter((c) => path.startsWith(c.path || '/'))
        .map((c) => `${c.name}=${c.value}`)
        .join('; ');
    },
    list() {
      return jar.map((c) => `${c.name}[${c.samesite}/${'secure' in c ? 'secure' : 'insecure'}]`);
    },
  };
}

// ── 1. new user via Google → account created + JWT session ──────────────
{
  const claims = newGoogleUser();
  const code = newCode(claims);
  const res = await req(`/api/auth/google/callback?code=${code}&state=st1`, {
    headers: { Cookie: 'lh_oauth_state=st1.verifier1' },
  });
  const loc = res.headers.location ?? '';
  check('new Google user: callback redirects to the SPA with status=created', res.status === 302 && loc.includes('status=created'), loc.slice(0, 80));
  const cookies = [].concat(res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ');
  check('new Google user: JWT access + refresh cookies issued', /lh_at=/.test(cookies) && /lh_rt=/.test(cookies));

  const me = await req('/api/auth/me', { headers: { Cookie: cookies } });
  const user = JSON.parse(me.body || '{}').user;
  check('new Google user: /me returns the created account', me.status === 200 && user?.email === claims.email, user?.email);
  check('new Google user: name + avatar come from Google', user?.name === 'Google Person' && user?.profile?.avatarUrl === 'https://example.com/p.png');
  check('new Google user: onboarding not yet complete', user?.profile?.onboarded === false);

  // The same cookies must work on protected feature routes.
  const tasks = await req('/api/tasks', { headers: { Cookie: cookies } });
  check('new Google user: Tasks API works with the session', tasks.status === 200);
  const dash = await req('/api/analytics/dashboard', { headers: { Cookie: cookies } });
  check('new Google user: Dashboard/analytics API works', dash.status === 200);

  // ── 2. returning user → same account, no duplicate ─────────────────────
  const code2 = newCode(claims);
  const res2 = await req(`/api/auth/google/callback?code=${code2}&state=st2`, {
    headers: { Cookie: 'lh_oauth_state=st2.verifier2' },
  });
  check('returning Google user: status=login (not created)', (res2.headers.location ?? '').includes('status=login'));
  const cookies2 = [].concat(res2.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ');
  const me2 = await req('/api/auth/me', { headers: { Cookie: cookies2 } });
  check('returning Google user: same user id (no duplicate account)', JSON.parse(me2.body).user?.id === user.id);

  // ── 3. Google email changed → still the same account (sub is the key) ──
  const renamed = { ...claims, email: `renamed.${stamp}@example.com` };
  const code3 = newCode(renamed);
  const res3 = await req(`/api/auth/google/callback?code=${code3}&state=st3`, {
    headers: { Cookie: 'lh_oauth_state=st3.verifier3' },
  });
  const cookies3 = [].concat(res3.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ');
  const me3 = await req('/api/auth/me', { headers: { Cookie: cookies3 } });
  check('changed Google email: still the same user (identity keyed by sub)', JSON.parse(me3.body).user?.id === user.id);

  // ── 4. unverified Google email is refused ──────────────────────────────
  const code4 = newCode(newGoogleUser({ sub: `other-${stamp}`, email: `unverified.${stamp}@example.com`, email_verified: false }));
  const res4 = await req(`/api/auth/google/callback?code=${code4}&state=st4`, {
    headers: { Cookie: 'lh_oauth_state=st4.verifier4' },
  });
  check('unverified Google email: refused with a clear error', (res4.headers.location ?? '').includes('error=google_email_unverified'));
}

// ── 5. existing password account + verified Google email → linked ────────
{
  const email = `pw.${stamp}@example.com`;
  const reg = await req('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Password Person', email, password: 'Password123', timezone: 'Asia/Kolkata' }),
  });
  const regUser = JSON.parse(reg.body).user;
  check('existing password account created for the linking test', reg.status === 201);

  const code = newCode(newGoogleUser({ sub: `linked-sub-${stamp}`, email, name: 'Password Person' }));
  const res = await req(`/api/auth/google/callback?code=${code}&state=st5`, {
    headers: { Cookie: 'lh_oauth_state=st5.verifier5' },
  });
  check('duplicate email: Google sign-in LINKS instead of creating a duplicate', (res.headers.location ?? '').includes('status=linked'));
  const cookies = [].concat(res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ');
  const me = await req('/api/auth/me', { headers: { Cookie: cookies } });
  check('duplicate email: lands in the pre-existing account', JSON.parse(me.body).user?.id === regUser.id);

  // Password login must still work after linking.
  const login = await req('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Password123' }),
  });
  check('after linking, the password still signs in (both methods work)', login.status === 200);

  const methods = await req('/api/auth/methods', { headers: { Cookie: cookies } });
  const m = JSON.parse(methods.body || '{}');
  check('auth/methods reports both sign-in methods', m.password === true && m.google?.email === email);

  // A password exists, but Google is the only UI: disconnecting it is still
  // refused so the account cannot lose the only button it has.
  const unlink = await req('/api/auth/google/unlink', { method: 'POST', headers: { Cookie: cookies } });
  check(
    'unlink is refused even with a password while AUTH_UI_MODE=google_only',
    unlink.status === 400 && JSON.parse(unlink.body || '{}').error?.code === 'google_required',
  );
}

// ── 6. Google-only account cannot be unlinked (lockout protection) ───────
{
  const claims = newGoogleUser({ sub: `solo-${stamp}`, email: `solo.${stamp}@example.com` });
  const code = newCode(claims);
  const res = await req(`/api/auth/google/callback?code=${code}&state=st6`, {
    headers: { Cookie: 'lh_oauth_state=st6.verifier6' },
  });
  const cookies = [].concat(res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ');
  const unlink = await req('/api/auth/google/unlink', { method: 'POST', headers: { Cookie: cookies } });
  check('Google-only account: unlink refused (would lock the user out)', unlink.status === 400);

  const pwLogin = await req('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: claims.email, password: 'anything123' }),
  });
  const code2 = JSON.parse(pwLogin.body || '{}').error?.code;
  check('Google-only account: password login says "use Google" (409)', pwLogin.status === 409 && code2 === 'use_google_signin');
}

// ── 7. forged / replayed callbacks ───────────────────────────────────────
{
  const res = await req('/api/auth/google/callback?code=reused&state=nope');
  check('forged callback without the state cookie is rejected', (res.headers.location ?? '').includes('error=google_bad_state'));

  const claims = newGoogleUser({ sub: `replay-${stamp}`, email: `replay.${stamp}@example.com` });
  const code = newCode(claims);
  const first = await req(`/api/auth/google/callback?code=${code}&state=st7`, { headers: { Cookie: 'lh_oauth_state=st7.v' } });
  check('valid callback succeeds once', (first.headers.location ?? '').includes('status='));
  const second = await req(`/api/auth/google/callback?code=${code}&state=st7`, { headers: { Cookie: 'lh_oauth_state=st7.v' } });
  check('replayed authorization code is rejected', (second.headers.location ?? '').includes('error=google_code_invalid'));
}

// ── 8. Google-only UI policy ─────────────────────────────────────────────
// The frontend shows only the Google button (AUTH_UI_MODE=google_only by
// default), but the API must keep accepting password login for accounts that
// already have one, so no existing user loses access.
{
  const claims = newGoogleUser({ sub: `policy-${stamp}`, email: `policy.${stamp}@example.com` });
  const code = newCode(claims);
  const res = await req(`/api/auth/google/callback?code=${code}&state=st8`, {
    headers: { Cookie: 'lh_oauth_state=st8.verifier8' },
  });
  const cookies = [].concat(res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ');
  const methods = await req('/api/auth/methods', { headers: { Cookie: cookies } });
  const m = JSON.parse(methods.body || '{}');
  check('auth/methods reports primaryMethod=google_only', m.primaryMethod === 'google_only');
  check('auth/methods still reports googleAvailable', m.googleAvailable === true);

  const unlink = await req('/api/auth/google/unlink', { method: 'POST', headers: { Cookie: cookies } });
  const uBody = JSON.parse(unlink.body || '{}');
  check(
    'google_only: disconnecting Google is refused with google_required',
    unlink.status === 400 && uBody.error?.code === 'google_required',
  );

  // An existing password account must still be able to use the API, even though
  // the UI no longer shows a password form.
  const email = `legacy.${stamp}@example.com`;
  const reg = await req('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Legacy User', email, password: 'LegacyPass123' }),
  });
  check('google_only: password registration still works through the API', reg.status === 201);

  const login = await req('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'LegacyPass123' }),
  });
  check('google_only: existing password account can still sign in (no lockout)', login.status === 200);
}

// ── 9. Cookie policy for the cross-site Vercel → Render deployment ───────
// A real sign-in is a top-level navigation between two different registrable
// domains. Lax cookies are NOT sent on such a chain in some browsers, and the
// refresh/`/me` calls afterwards are cross-site subrequests, which need None.
{
  // Simulate the browser dropping the state cookie: /me must then still be
  // presented with None cookies, so the session survives.
  const noState = await req('/api/auth/google/callback?code=x&state=zz', { headers: {} });
  check(
    'without the OAuth state cookie the callback is still rejected',
    (noState.headers.location ?? '').includes('error=google_bad_state'),
  );

  // A successful sign-in must advertise SameSite=None + Secure on BOTH cookies so
  // the Vercel page can carry them on cross-site fetches.
  const claims = newGoogleUser({ sub: `cookie-${stamp}`, email: `cookie.${stamp}@example.com` });
  const code = newCode(claims);
  const res = await req(`/api/auth/google/callback?code=${code}&state=st9`, {
    headers: { Cookie: 'lh_oauth_state=st9.verifier9' },
  });
  const setCookies = [].concat(res.headers['set-cookie'] ?? []);
  const accessCookie = setCookies.find((c) => c.startsWith('lh_at=')) ?? '';
  const refreshCookie = setCookies.find((c) => c.startsWith('lh_rt=')) ?? '';
  const attr = (cookie, name) => new RegExp(`${name}=([^;]+)`, 'i').exec(cookie)?.[1];

  check('access cookie is httpOnly', /httponly/i.test(accessCookie));
  check('access cookie is SameSite=None (cross-site fetch) or proves Lax works', /samesite=(none|lax)/i.test(accessCookie));
  check('both auth cookies are Secure', /;\s*Secure/i.test(accessCookie) && /;\s*Secure/i.test(refreshCookie));
  check('refresh cookie path is /api/auth', attr(refreshCookie, 'Path') === '/api/auth' && attr(accessCookie, 'Path') === '/');

  // Explicit override must win, so an operator can force None on a deployment
  // where the state cookie does arrive but the subrequests still fail.
  const savedMode = process.env.AUTH_COOKIE_SAMESITE;
  process.env.AUTH_COOKIE_SAMESITE = 'none';
  const cfgMod = await import('../dist/config.js');
  cfgMod.__resetConfigCache();
  const { setAuthCookies } = await import('../dist/middleware/auth.js');
  const fakeRes = {
    headers: {},
    cookie(name, value, opts) {
      this.headers[name] = opts;
    },
  };
  setAuthCookies(fakeRes, 'a', 'r', { cookies: { lh_oauth_state: 'present' } });
  check(
    'AUTH_COOKIE_SAMESITE=none forces None even when the state cookie arrived',
    String(fakeRes.headers.lh_at?.sameSite).toLowerCase() === 'none',
  );
  process.env.AUTH_COOKIE_SAMESITE = 'lax';
  cfgMod.__resetConfigCache();
  const fakeRes2 = { headers: {}, cookie(name, value, opts) { this.headers[name] = opts; } };
  setAuthCookies(fakeRes2, 'a', 'r', { cookies: {} });
  check(
    'AUTH_COOKIE_SAMESITE=lax pins Lax even without the state cookie',
    String(fakeRes2.headers.lh_at?.sameSite).toLowerCase() === 'lax',
  );
  process.env.AUTH_COOKIE_SAMESITE = savedMode ?? COOKIE_MODE;
  cfgMod.__resetConfigCache();

  // And the session from that callback must work on a later request.
  const cookies = setCookies.map((c) => c.split(';')[0]).join('; ');
  const me = await req('/api/auth/me', { headers: { Cookie: cookies } });
  check('/api/auth/me works with the cookies the callback set', me.status === 200);
}

// ── 10. Full sign-in chain under real browser cookie rules ───────────────
// Chrome and Safari both drop `SameSite=None` cookies that are not `Secure`,
// and both withhold `Lax` cookies from cross-site fetches. Running the whole
// chain through that model is the only way to catch a deployment that sets
// cookies the browser silently refuses — the exact shape of the mobile bug.
{
  const jar = browserJar();

  // 1. The user taps "Continue with Google" on Vercel → the API /start.
  const start = await req('/api/auth/google/start', { headers: { Origin: 'https://ai-life-hub-iixf.vercel.app' } });
  jar.keep(start.headers['set-cookie']);
  check('browser chain: the state cookie is kept by the browser', jar.list().some((c) => c.startsWith('lh_oauth_state')));

  // 2. The callback arrives from the API's origin (top-level navigation).
  const claims = newGoogleUser({ sub: `chain-${stamp}`, email: `chain.${stamp}@example.com` });
  const code = newCode(claims);
  // Google echoes back the state that was actually minted by /start.
  const state = decodeURIComponent(/[?&]state=([^&]+)/.exec(start.headers.location ?? '')?.[1] ?? '');
  const cb = await req(`/api/auth/google/callback?code=${code}&state=${state}`, {
    // A top-level navigation from accounts.google.com to the API.
    headers: {
      Cookie: jar.header('/api/auth/google/callback'),
      Origin: 'https://ai-lifehub-api.onrender.com',
      'Sec-Fetch-Site': 'cross-site',
      'Sec-Fetch-Mode': 'navigate',
    },
  });
  check('browser chain: callback succeeds with the cookies the browser keeps', (cb.headers.location ?? '').includes('status='), (cb.headers.location ?? '').slice(-90) + ' | state sent: ' + jar.header('/api/auth/google/callback').slice(0, 30));
  jar.keep(cb.headers['set-cookie']);
  check('browser chain: both session cookies survive the browser rules', jar.list().filter((c) => c.startsWith('lh_')).length >= 2);

  // 3. The Vercel page then calls /api/auth/me cross-site. This is the step that
  //    fails on iPhone: Safari will not attach a Lax cookie to a cross-site
  //    fetch, so the SPA sees 401 and shows "session_failed".
  const crossSiteCookie = jar.headerCrossSite('/api/auth/me');
  const me = await req('/api/auth/me', {
    headers: { Cookie: crossSiteCookie, Origin: 'https://ai-life-hub-iixf.vercel.app', 'Sec-Fetch-Site': 'same-origin' },
  });
  check(
    'browser chain: the session cookie is sent on the app\'s own origin (no third-party cookie)',
    crossSiteCookie.split('; ').some((c) => c.startsWith('lh_at=')),
    `sent: ${crossSiteCookie || 'none'} | jar: ${jar.list().join(' ')}`,
  );
  check('browser chain: /api/auth/me succeeds same-origin', me.status === 200);

  // 4. And the refresh path too, which is the one that fails after 15 minutes.
  const refreshed = await req('/api/auth/refresh', {
    method: 'POST',
    headers: {
      Cookie: jar.headerCrossSite('/api/auth/refresh'),
      'Content-Type': 'application/json',
      Origin: 'https://ai-life-hub-iixf.vercel.app',
      'Sec-Fetch-Site': 'same-origin',
    },
    body: JSON.stringify({}),
  });
  check('browser chain: /api/auth/refresh works same-origin', refreshed.status === 200);
}

// ── 11. Same-origin proxy deployment: the cookie shape Safari accepts ──────
// The app is served from the API's own origin (host proxies /api/*), so the
// session cookies are first-party. They must be Lax + Secure: Lax because the
// OAuth callback is a top-level navigation, Secure because the deployment is
// https. None would mean the cross-site model leaked back in.
{
  const cfgMod = await import('../dist/config.js');
  const savedMode2 = process.env.AUTH_COOKIE_SAMESITE;
  process.env.AUTH_COOKIE_SAMESITE = 'auto';
  cfgMod.__resetConfigCache();
  const { setAuthCookies: setC } = await import('../dist/middleware/auth.js');
  const res9 = { headers: {}, cookie(name, value, opts) { this.headers[name] = opts; } };
  // Force the mode for this block: the outer env may have been set to prove a
  // failure elsewhere, and this check is about the shipped default.
  process.env.AUTH_COOKIE_SAMESITE = 'auto';
  cfgMod.__resetConfigCache();
  setC(res9, 'a', 'r', { cookies: {} });
  const at = res9.headers.lh_at ?? {};
  check('same-origin: access cookie is SameSite=Lax', String(at.sameSite).toLowerCase() === 'lax', String(at.sameSite));
  check('same-origin: access cookie is Secure', at.secure === true);
  check('same-origin: access cookie is httpOnly', at.httpOnly === true);
  check('same-origin: access cookie path is /', at.path === '/');
  const rt9 = res9.headers.lh_rt ?? {};
  check('same-origin: refresh cookie path is /api/auth', rt9.path === '/api/auth');
  check('same-origin: refresh cookie is SameSite=Lax + Secure', String(rt9.sameSite).toLowerCase() === 'lax' && rt9.secure === true);
  process.env.AUTH_COOKIE_SAMESITE = savedMode2 ?? COOKIE_MODE;
  cfgMod.__resetConfigCache();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
server.close();
fake.close();
process.exit(failed.length ? 1 : 0);
