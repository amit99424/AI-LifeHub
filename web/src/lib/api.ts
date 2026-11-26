/**
 * Typed API client.
 * - Sends httpOnly cookies (`credentials: include`) and a Bearer token.
 * - Transparently refreshes the access token once on a 401, then retries.
 *
 * Where the API lives is decided by one thing: whether we are in production.
 *
 *   production  → same origin, path `/api/...`. Vercel rewrites `/api/*` to the
 *                 Render service (web/vercel.json). This is deliberate: a cookie
 *                 is only a real cookie for the app when the request is
 *                 same-origin. Cross-site cookies are blocked or partitioned by
 *                 Safari and by every in-app browser (WhatsApp, Instagram,
 *                 Facebook), which made Google sign-in impossible on iPhone.
 *                 Same-origin also survives Safari ITP and third-party cookie
 *                 phase-out, and needs no SameSite=None at all.
 *   development → `VITE_API_URL` if set (the Vite dev server), else relative.
 */

const RAW_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? '';

/**
 * In production the API is always same-origin: `/api/*` is proxied by the
 * hosting platform to the backend. `VITE_API_URL` is deliberately ignored there,
 * so a stale value can never silently reintroduce cross-site cookies.
 */
export const API_BASE = import.meta.env.PROD ? '' : RAW_BASE.replace(/\/+$/, '').replace(/\/api$/, '');

if (import.meta.env.DEV && RAW_BASE && !/^https?:\/\//i.test(RAW_BASE)) {
  console.error(`[api] VITE_API_URL must be an absolute URL (got "${RAW_BASE}"). Falling back to same-origin.`);
}

/** Used only when no explicit base was given: same origin in both modes. */
const BASE = /^https?:\/\//i.test(API_BASE) ? API_BASE : '';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, message: string, code = 'error', details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True when the server could not be reached at all (network / CORS / offline). */
  get isNetworkError() {
    return this.status === 0;
  }
}

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;
let refreshPromise: Promise<boolean> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${BASE}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { accessToken: string };
        accessToken = data.accessToken;
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => {
          refreshPromise = null;
        }, 0);
      }
    })();
  }
  return refreshPromise;
}

/**
 * Why a request was refused, in the only terms that help a user: was it the
 * server, the network, or a cookie the browser did not send?
 */
export type AuthProbe = {
  reachable: boolean;
  authenticated: boolean;
  status: number | null;
  code: string | null;
  /** True when no cookies reached the API at all (cross-site cookie policy). */
  cookieMissing: boolean;
};

/**
 * Asks the API who we are without throwing, and reports enough detail for the
 * OAuth landing page to name the real cause on customer support tickets.
 * Never logs or returns token material.
 */
export async function probeSession(): Promise<AuthProbe> {
  try {
    const res = await fetch(`${BASE}/api/auth/me`, {
      credentials: 'include',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (res.ok) return { reachable: true, authenticated: true, status: res.status, code: null, cookieMissing: false };
    const body = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
    const code = body.error?.code ?? null;
    // 401 without any cookie ever arriving is the cross-site case: the session
    // was created server-side but the browser withheld it.
    return { reachable: true, authenticated: false, status: res.status, code, cookieMissing: code === 'unauthorized' };
  } catch {
    return { reachable: false, authenticated: false, status: null, code: 'network', cookieMissing: false };
  }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(res.status, 'The server returned an unreadable response', 'bad_response');
  }
  if (!res.ok) {
    const err = (data as { error?: { message?: string; code?: string; details?: unknown } }).error;
    throw new ApiError(res.status, err?.message || `Request failed (${res.status})`, err?.code || 'error', err?.details);
  }
  return data as T;
}

/**
 * Render's free tier suspends the API after ~15 minutes idle and the first
 * request afterwards can take 30-60 s (or fail once while the instance boots).
 * Long AI calls can also exceed that window. These are transient: retry them
 * rather than showing the user a scary error.
 */
export function isTransientError(err: unknown): boolean {
  const e = err as Partial<ApiError> | undefined;
  if (!e) return false;
  if (e.status === 0) return true; // network / cold start
  if (e.status === 502 || e.status === 503 || e.status === 504) return true; // gateway / booting
  if (e.status === 408) return true;
  if (e.code === 'ai_provider_error' || e.code === 'upstream_error') return true;
  return false;
}

function networkError(path: string): ApiError {
  const target = BASE || window.location.origin;
  // Behind the same-origin proxy the Render host is invisible from the browser,
  // so the cold-start hint cannot rely on the URL: in production every network
  // failure may be the free-tier instance booting.
  const isColdStart = /onrender\.com/i.test(target) || (BASE === '' && import.meta.env.PROD);
  return new ApiError(
    0,
    isColdStart
      ? `The server is waking up (Render free tier). This can take up to a minute — retrying automatically…`
      : `Cannot reach the API at ${target}. Check that the backend is running and that this origin is listed in CORS_ORIGINS.`,
    'network_error',
    { path, coldStart: isColdStart },
  );
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers, credentials: 'include' });
  } catch {
    throw networkError(path);
  }

  if (res.status === 401 && retry && !path.startsWith('/api/auth/')) {
    const ok = await tryRefresh();
    if (ok) return request<T>(path, init, false);
    onUnauthorized?.();
  }
  return parse<T>(res);
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) }),
  raw: async (path: string) => {
    const headers = new Headers();
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, { headers, credentials: 'include' });
    } catch {
      throw networkError(path);
    }
    if (!res.ok) throw new ApiError(res.status, 'Download failed');
    return res;
  },
};

/** SWR-like fetch helper used with TanStack Query. */
export const fetcher = <T>(path: string) => api.get<T>(path);

export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}
