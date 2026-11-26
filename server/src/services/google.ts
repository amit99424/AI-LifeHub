/**
 * Google OAuth 2.0 (server-side "authorization code" flow) and ID-token
 * verification.
 *
 * Security model
 * ──────────────
 *  • The browser never sends us user details. It sends a one-time `code`, and we
 *    exchange it for tokens server-to-server using the client *secret*, which
 *    only exists in the backend environment.
 *  • The returned ID token is a JWT signed by Google. We verify the RS256
 *    signature against Google's published JWKS **and** the claims (issuer,
 *    audience, expiry, issued-at, email_verified). Only then is any user detail
 *    trusted.
 *  • The OAuth `state` is a random, single-use value bound to an httpOnly cookie
 *    (double-submit), so a callback cannot be forged or replayed (CSRF).
 *
 * No third-party OAuth library is required: Node 22 has WebCrypto, and the
 * verification below is the same set of checks `google-auth-library` performs.
 */

import crypto from 'node:crypto';
import { config } from '../config.js';

export const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';

/**
 * The endpoints above are Google's production hosts. Tests point these at a
 * local stand-in so the whole flow can be exercised offline; nothing in the app
 * ever changes them.
 */
export const googleEndpoints = {
  auth: GOOGLE_AUTH_ENDPOINT,
  token: GOOGLE_TOKEN_ENDPOINT,
  jwks: GOOGLE_JWKS_URI,
};

/** The only scopes needed: identify the user. Nothing about their Gmail or Drive. */
export const GOOGLE_SCOPES = ['openid', 'email', 'profile'];

export const OAUTH_STATE_COOKIE = 'lh_oauth_state';
export const OAUTH_STATE_TTL_MS = 10 * 60_000;

export interface GoogleProfile {
  /** Google's stable subject id. Never changes, even if the email does. */
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  givenName: string | null;
  picture: string | null;
  locale: string | null;
}

export class GoogleOAuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'GoogleOAuthError';
    this.code = code;
  }
}

/* ── configuration ─────────────────────────────────────────── */

export function googleConfigured(): boolean {
  return Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_REDIRECT_URI);
}

/**
 * The redirect URI must match one of the "Authorized redirect URIs" registered
 * in Google Cloud Console *exactly*, so it is configuration, not a guess.
 */
export function redirectUri(): string {
  return config.GOOGLE_REDIRECT_URI;
}

/* ── state / PKCE ──────────────────────────────────────────── */

export function createState(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** S256 PKCE challenge — recommended by Google for the code flow. */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function buildAuthUrl(state: string, codeChallenge: string, opts: { loginHint?: string } = {}): string {
  const params = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    // `select_account` lets a shared computer choose the right Google account
    // instead of silently reusing the last one.
    prompt: 'select_account',
    access_type: 'online',
    include_granted_scopes: 'true',
  });
  if (opts.loginHint) params.set('login_hint', opts.loginHint);
  return `${googleEndpoints.auth}?${params.toString()}`;
}

/* ── token exchange ────────────────────────────────────────── */

export interface GoogleTokens {
  idToken: string;
  accessToken?: string;
  scope?: string;
  expiresIn?: number;
}

/**
 * Exchanges a one-time authorization code for tokens. The client secret is used
 * here and never leaves the server.
 */
export async function exchangeCode(code: string, codeVerifier: string): Promise<GoogleTokens> {
  const body = new URLSearchParams({
    code,
    client_id: config.GOOGLE_CLIENT_ID,
    client_secret: config.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri(),
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  });

  let res: Response;
  try {
    res = await fetch(googleEndpoints.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GoogleOAuthError('google_unreachable', 'Could not reach Google to complete sign-in. Try again.');
  }

  const json = (await res.json().catch(() => ({}))) as {
    id_token?: string;
    access_token?: string;
    scope?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !json.id_token) {
    const reason = json.error ?? `http_${res.status}`;
    // invalid_grant = the code was already used, expired, or came from another
    // client/redirect URI. That is a stale tab or a misconfiguration, never a
    // reason to log anyone in.
    if (reason === 'invalid_grant') {
      throw new GoogleOAuthError(
        'google_code_invalid',
        'That Google sign-in link has expired or was already used. Please try again.',
      );
    }
    throw new GoogleOAuthError(
      'google_exchange_failed',
      `Google rejected the sign-in (${reason}${json.error_description ? `: ${json.error_description}` : ''}).`,
    );
  }

  return {
    idToken: json.id_token,
    accessToken: json.access_token,
    scope: json.scope,
    expiresIn: json.expires_in,
  };
}

/* ── ID token verification ─────────────────────────────────── */

interface Jwk {
  kid: string;
  n: string;
  e: string;
  alg?: string;
  kty?: string;
  use?: string;
}

let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60_000; // Google rotates keys slowly; 1h is safe.

async function getGoogleKeys(forceRefresh = false): Promise<Jwk[]> {
  if (!forceRefresh && jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;
  let res: Response;
  try {
    res = await fetch(googleEndpoints.jwks, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new GoogleOAuthError('google_unreachable', 'Could not verify the Google token right now. Try again.');
  }
  if (!res.ok) throw new GoogleOAuthError('google_jwks_failed', 'Could not verify the Google token right now.');
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = (body.keys ?? []).filter((k) => k.n && k.e);
  if (!keys.length) throw new GoogleOAuthError('google_jwks_failed', 'Google returned no signing keys.');
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

function decodeSegment<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
}

interface IdTokenClaims {
  iss?: string;
  aud?: string;
  azp?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  given_name?: string;
  picture?: string;
  locale?: string;
  iat?: number;
  exp?: number;
  nonce?: string;
}

const VALID_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const CLOCK_SKEW_SEC = 60;

/**
 * Verifies a Google ID token and returns the profile it asserts.
 * Throws GoogleOAuthError on any signature or claim failure.
 */
export async function verifyIdToken(idToken: string, expectedNonce?: string): Promise<GoogleProfile> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new GoogleOAuthError('google_token_malformed', 'Google returned a malformed token.');

  const header = decodeSegment<{ alg?: string; kid?: string; typ?: string }>(parts[0]);
  const claims = decodeSegment<IdTokenClaims>(parts[1]);

  if (header.alg !== 'RS256') throw new GoogleOAuthError('google_token_bad_alg', 'Unexpected token algorithm.');
  if (!header.kid) throw new GoogleOAuthError('google_token_no_kid', 'Google token has no key id.');

  // 1. Signature — verify against Google's JWKS (retry once on key rotation).
  let keys = await getGoogleKeys();
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    keys = await getGoogleKeys(true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new GoogleOAuthError('google_token_unknown_key', 'Google token was signed with an unknown key.');

  let valid = false;
  try {
    const publicKey = crypto.createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' });
    valid = crypto.verify(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      publicKey,
      Buffer.from(parts[2], 'base64url'),
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new GoogleOAuthError('google_token_bad_signature', 'Google token signature is invalid.');

  // 2. Claims.
  const now = Math.floor(Date.now() / 1000);
  if (!claims.iss || !VALID_ISSUERS.has(claims.iss)) {
    throw new GoogleOAuthError('google_token_bad_issuer', 'Google token has an unexpected issuer.');
  }
  if (claims.aud !== config.GOOGLE_CLIENT_ID) {
    // A token minted for another application must never be accepted.
    throw new GoogleOAuthError('google_token_bad_audience', 'Google token was issued for a different application.');
  }
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SEC < now) {
    throw new GoogleOAuthError('google_token_expired', 'Google token has expired.');
  }
  if (typeof claims.iat !== 'number' || claims.iat - CLOCK_SKEW_SEC > now) {
    throw new GoogleOAuthError('google_token_bad_iat', 'Google token has an invalid issue time.');
  }
  if (expectedNonce && claims.nonce && claims.nonce !== expectedNonce) {
    throw new GoogleOAuthError('google_token_bad_nonce', 'Google token nonce mismatch.');
  }
  if (!claims.sub) throw new GoogleOAuthError('google_token_no_sub', 'Google token has no subject.');
  if (!claims.email) throw new GoogleOAuthError('google_token_no_email', 'Google did not share an email address.');

  const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
  if (!emailVerified) {
    // Without a verified email we cannot safely match an existing account.
    throw new GoogleOAuthError(
      'google_email_unverified',
      'Your Google email address is not verified, so we cannot use it to sign you in.',
    );
  }

  return {
    sub: claims.sub,
    email: claims.email.trim().toLowerCase(),
    emailVerified,
    name: claims.name?.trim() || null,
    givenName: claims.given_name?.trim() || null,
    picture: claims.picture || null,
    locale: claims.locale || null,
  };
}

/** Exposed for tests: drop the cached JWKS. */
export function __clearJwksCache() {
  jwksCache = null;
}
