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

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
server.close();
fake.close();
process.exit(failed.length ? 1 : 0);
