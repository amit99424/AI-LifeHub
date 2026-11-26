/**
 * Tests for Google ID-token verification.
 *
 * The point of these is the *negative* cases: a token that is expired, unsigned,
 * signed by the wrong key, or minted for a different client must be rejected.
 * That is the boundary where "never trust the frontend" is enforced.
 *
 * Google's JWKS endpoint is replaced with a locally generated RSA key so the
 * whole path (fetch keys → verify RS256 → check claims) runs offline.
 */
const register = (globalThis as unknown as { __lhTest: (name: string, fn: () => void | Promise<void>) => void }).__lhTest;

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { GoogleOAuthError, __clearJwksCache, verifyIdToken } from '../services/google.js';
import { __resetConfigCache } from '../config.js';

const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';

// Two independent RSA keys: one plays Google, one plays an attacker.
const googleKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const attackerKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-kid-1';

function publicJwk(kid: string) {
  const jwk = googleKeys.publicKey.export({ format: 'jwk' }) as { n: string; e: string };
  return { kid, n: jwk.n, e: jwk.e, kty: 'RSA', alg: 'RS256', use: 'sig' };
}

const realFetch = globalThis.fetch;

function stubJwks(keys: unknown[]) {
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    if (url.includes('googleapis.com/oauth2') || url.includes('accounts.google.com')) {
      return new Response(JSON.stringify({ keys }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(input);
  }) as typeof fetch;
}

interface ClaimOverrides {
  iss?: string;
  aud?: string;
  exp?: number;
  iat?: number;
  sub?: string | null;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

function makeToken(opts: { signWith?: 'google' | 'attacker' | 'none'; kid?: string; claims?: ClaimOverrides } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: 'google-sub-123',
    email: 'Person@Example.com',
    email_verified: true,
    name: 'Person Example',
    picture: 'https://example.com/a.png',
    iat: now - 10,
    exp: now + 3600,
    ...opts.claims,
  };
  for (const [k, v] of Object.entries(opts.claims ?? {})) {
    if (v === null) delete claims[k];
  }

  const header = { alg: opts.signWith === 'none' ? 'none' : 'RS256', kid: opts.kid ?? KID, typ: 'JWT' };
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const signingInput = `${enc(header)}.${enc(claims)}`;

  if (opts.signWith === 'none') return `${signingInput}.`;
  const key = opts.signWith === 'attacker' ? attackerKeys.privateKey : googleKeys.privateKey;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(signingInput), key).toString('base64url');
  return `${signingInput}.${sig}`;
}

function withClientId<T>(fn: () => Promise<T>): Promise<T> {
  // The config module resolves once per process; set the value before it loads
  // and reset the cached instance so each case sees the test client id.
  const prev = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  __resetConfigCache();
  return fn().finally(() => {
    if (prev === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = prev;
  });
}

async function expectRejection(token: string, expectedCode: string) {
  await assert.rejects(
    () => verifyIdToken(token),
    (err: unknown) => {
      assert.ok(err instanceof GoogleOAuthError, `expected GoogleOAuthError, got ${String(err)}`);
      assert.equal(err.code, expectedCode);
      return true;
    },
  );
}

register('google: accepts a correctly signed, correctly scoped ID token', async () => {
  await withClientId(async () => {
    stubJwks([publicJwk(KID)]);
    __clearJwksCache();
    const profile = await verifyIdToken(makeToken());
    assert.equal(profile.sub, 'google-sub-123');
    // Emails are normalised to lower case before they are ever compared.
    assert.equal(profile.email, 'person@example.com');
    assert.equal(profile.emailVerified, true);
    assert.equal(profile.name, 'Person Example');
    globalThis.fetch = realFetch;
  });
});

register('google: rejects a token signed by the wrong key', async () => {
  await withClientId(async () => {
    stubJwks([publicJwk(KID)]);
    __clearJwksCache();
    await expectRejection(makeToken({ signWith: 'attacker' }), 'google_token_bad_signature');
    globalThis.fetch = realFetch;
  });
});

register('google: rejects an unsigned token (alg=none)', async () => {
  await withClientId(async () => {
    stubJwks([publicJwk(KID)]);
    __clearJwksCache();
    await expectRejection(makeToken({ signWith: 'none' }), 'google_token_bad_alg');
    globalThis.fetch = realFetch;
  });
});

register('google: rejects a token minted for another client id', async () => {
  await withClientId(async () => {
    stubJwks([publicJwk(KID)]);
    __clearJwksCache();
    await expectRejection(makeToken({ claims: { aud: 'someone-else.apps.googleusercontent.com' } }), 'google_token_bad_audience');
    globalThis.fetch = realFetch;
  });
});

register('google: rejects an expired token and a foreign issuer', async () => {
  await withClientId(async () => {
    stubJwks([publicJwk(KID)]);
    __clearJwksCache();
    const now = Math.floor(Date.now() / 1000);
    await expectRejection(makeToken({ claims: { exp: now - 600 } }), 'google_token_expired');
    await expectRejection(makeToken({ claims: { iss: 'https://evil.example.com' } }), 'google_token_bad_issuer');
    globalThis.fetch = realFetch;
  });
});

register('google: rejects an unverified email (no safe account linking)', async () => {
  await withClientId(async () => {
    stubJwks([publicJwk(KID)]);
    __clearJwksCache();
    await expectRejection(makeToken({ claims: { email_verified: false } }), 'google_email_unverified');
    globalThis.fetch = realFetch;
  });
});

register('google: rejects a token with no subject', async () => {
  await withClientId(async () => {
    stubJwks([publicJwk(KID)]);
    __clearJwksCache();
    await expectRejection(makeToken({ claims: { sub: null } }), 'google_token_no_sub');
    globalThis.fetch = realFetch;
  });
});

register('google: unknown key id triggers a JWKS refresh and then fails', async () => {
  await withClientId(async () => {
    stubJwks([publicJwk('some-other-kid')]);
    __clearJwksCache();
    await expectRejection(makeToken({ kid: KID }), 'google_token_unknown_key');
    globalThis.fetch = realFetch;
  });
});

register('google: a malformed token is rejected before any network call', async () => {
  await withClientId(async () => {
    await expectRejection('not-a-jwt', 'google_token_malformed');
  });
});
