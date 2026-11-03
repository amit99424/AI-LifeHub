/**
 * Typed API client.
 * - Sends httpOnly cookies (`credentials: include`) and a Bearer token.
 * - Transparently refreshes the access token once on a 401, then retries.
 * - Uses `VITE_API_URL` when the API lives on a different origin (Vercel +
 *   Render), and relative `/api/...` paths when it does not (dev proxy or a
 *   single-origin deployment).
 */

const RAW_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? '';

/** Absolute API origin, or '' for same-origin requests. */
export const API_BASE = RAW_BASE.replace(/\/+$/, '').replace(/\/api$/, '');

if (import.meta.env.PROD && API_BASE && !/^https?:\/\//i.test(API_BASE)) {
  // Fails loudly at runtime instead of producing mysterious network errors.
  console.error(`[api] VITE_API_URL must be an absolute URL (got "${API_BASE}"). Falling back to same-origin.`);
}

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
  const isColdStart = /onrender\.com/i.test(target);
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
