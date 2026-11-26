/**
 * Landing page for the server-side Google OAuth callback.
 *
 * The backend has already verified the Google ID token, linked/created the user
 * and set the same httpOnly cookies that email/password login sets. This page
 * only asks the API who we are now, then sends the user onward. No token or
 * profile data ever travels through the URL.
 *
 * Mobile Safari is strict about cookies on a redirect chain that crosses
 * origins (Vercel → Render → Google → Render → Vercel), so "the session cookie
 * never arrived" is a real outcome, not a rare one. When that happens the cookie
 * may still turn up a moment later — the browser is allowed to finish writing it
 * — so this page gives it a generous window, retries, and then names the actual
 * cause instead of a generic failure.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Loader2, RotateCcw } from 'lucide-react';
import { LogoMark } from '@/components/Logo';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { probeSession, type AuthProbe } from '@/lib/api';

const STATUS_COPY: Record<string, string> = {
  login: 'Welcome back — signing you in…',
  linked: 'Google connected to your existing account — signing you in…',
  created: 'Account created with Google — setting things up…',
};

const ERROR_HINTS: Record<string, string> = {
  google_unconfigured:
    'Google sign-in is not configured on this server. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI to the backend environment.',
  google_bad_state: 'The sign-in request expired or was started in another browser. Please try again.',
  google_code_invalid: 'That sign-in link was already used. Please start again from the sign-in page.',
  google_cancelled: 'You closed the Google window before finishing. Nothing was changed.',
  google_email_unverified:
    'Your Google email address is not verified, so it cannot be used to sign in. Verify it with Google and try again.',
  google_token_bad_audience:
    'The Google sign-in was issued for a different application. Check that the Client ID matches this deployment.',
  email_mismatch: 'That Google account uses a different email address from this account.',
  identity_in_use: 'That Google account is already connected to another AI-LifeHub account.',
  account_deleted: 'This account has been deleted.',
  google_failed: 'Google sign-in failed. Please try again.',
  session_failed: 'You signed in with Google, but this browser did not keep the sign-in cookies.',
  server_unreachable: 'The server could not be reached from this browser.',
};

/** How long we keep retrying before telling the user the session did not arrive. */
const BUDGET_MS = 30_000;
const ATTEMPTS = 6;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Turns a probe into the sentence the user actually needs to read. */
function describe(probe: AuthProbe): string {
  if (!probe.reachable) {
    return 'The AI-LifeHub API could not be reached from this browser. Check your connection and try again.';
  }
  if (probe.cookieMissing) {
    // The API is called same-origin through the host's proxy, so a third-party
    // cookie block is no longer a plausible cause: the cookie is the site's own.
    return 'Your Google account was verified, but the sign-in cookie did not reach the app. Check that cookies are allowed for this site (Safari → Settings → Safari → Block All Cookies, or the “Prevent cross-site tracking” toggle), then try again.';
  }
  return `Your Google account was verified, but the server refused the session (HTTP ${probe.status ?? '—'}${
    probe.code ? `, ${probe.code}` : ''
  }).`;
}

export default function GoogleCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const ran = useRef(false);

  const errorCode = params.get('error');
  const errorMessage = params.get('message');
  const status = params.get('status') ?? 'login';
  const next = params.get('next') ?? '/dashboard';

  /**
   * Wait for the session cookies to be visible to the API, then navigate.
   * Safe to call again from the error screen ("Check again").
   */
  const settle = useCallback(async () => {
    const started = Date.now();
    let last: AuthProbe | null = null;

    for (let i = 0; i < ATTEMPTS; i += 1) {
      try {
        await refreshUser();
        navigate(next.startsWith('/') ? next : '/dashboard', { replace: true });
        return;
      } catch {
        /* fall through to the probe so we can name the cause */
      }

      last = await probeSession();
      setAttempt(i + 1);
      if (last.authenticated) {
        navigate(next.startsWith('/') ? next : '/dashboard', { replace: true });
        return;
      }
      if (Date.now() - started > BUDGET_MS) break;
      // 1s, 2s, 3s, 4s, 5s between attempts.
      await sleep(1000 * (i + 1));
    }

    setError({
      code: last && !last.reachable ? 'server_unreachable' : 'session_failed',
      message: last ? describe(last) : 'Signed in with Google, but the session could not be established.',
    });
  }, [navigate, next, refreshUser]);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (errorCode) {
      setError({ code: errorCode, message: errorMessage || 'Google sign-in failed.' });
      return;
    }

    // The cookies are already set. Give a cold Render instance, and Safari
    // persisting a cross-site cookie, a real window instead of three quick tries.
    const slowTimer = setTimeout(() => setSlow(true), 5000);
    void settle().finally(() => clearTimeout(slowTimer));
    return () => clearTimeout(slowTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5 py-10">
        <div className="w-full max-w-md rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-7 text-center shadow-card">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-500/15">
            <AlertTriangle className="h-6 w-6 text-rose-600 dark:text-rose-400" />
          </div>
          <h1 className="mt-4 font-display text-lg font-extrabold text-ink-900 dark:text-white">
            Could not sign you in with Google
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-600 dark:text-ink-300">{error.message}</p>
          {ERROR_HINTS[error.code] && ERROR_HINTS[error.code] !== error.message && (
            <p className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-left text-[11px] leading-relaxed text-ink-500 dark:bg-ink-800/60 dark:text-ink-400">
              {ERROR_HINTS[error.code]}
            </p>
          )}
          <div className="mt-5 flex flex-col gap-2">
            <Link
              to="/login"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </Link>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setSlow(false);
                setAttempt(0);
                void settle();
              }}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-[rgb(var(--border))] text-xs font-semibold text-ink-600 transition hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Check again
            </button>
          </div>
          <p className="mt-4 font-mono text-[10px] text-ink-400">code: {error.code}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-5">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 shadow-lg">
        <LogoMark size={26} gradient />
      </div>
      <div className="flex items-center gap-2 text-sm font-semibold text-ink-700 dark:text-ink-200">
        <Loader2 className="h-4 w-4 animate-spin" />
        {STATUS_COPY[status] ?? STATUS_COPY.login}
      </div>
      {slow && (
        <p className="max-w-xs text-center text-[11px] leading-relaxed text-ink-400">
          Still connecting… the server may be waking up. This can take up to a minute
          {attempt > 0 ? ` (attempt ${attempt + 1})` : ''}.
        </p>
      )}
    </div>
  );
}
