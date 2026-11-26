/**
 * Landing page for the server-side Google OAuth callback.
 *
 * The backend has already verified the Google ID token, linked/created the user
 * and set the same httpOnly cookies that email/password login sets. This page
 * only asks the API who we are now, then sends the user onward. No token or
 * profile data ever travels through the URL.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { isTransientError } from '@/lib/api';

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
};

export default function GoogleCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [slow, setSlow] = useState(false);
  const ran = useRef(false);

  const errorCode = params.get('error');
  const errorMessage = params.get('message');
  const status = params.get('status') ?? 'login';
  const next = params.get('next') ?? '/dashboard';

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (errorCode) {
      setError({ code: errorCode, message: errorMessage || 'Google sign-in failed.' });
      return;
    }

    const slowTimer = setTimeout(() => setSlow(true), 6000);

    (async () => {
      // The cookies are already set. Retry a couple of times: a Render cold start
      // can fail the very first request after the redirect.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await refreshUser();
          clearTimeout(slowTimer);
          // Replace, so Back does not return to this interstitial page.
          navigate(next.startsWith('/') ? next : '/dashboard', { replace: true });
          return;
        } catch (err) {
          const transient = isTransientError(err) || (err as { status?: number }).status === 401;
          if (!transient || attempt === 2) {
            clearTimeout(slowTimer);
            setError({
              code: 'session_failed',
              message:
                (err as Error).message ||
                'Signed in with Google, but the session could not be established. Please try again.',
            });
            return;
          }
          await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        }
      }
    })();

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
            <Link to="/register" className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
              Create an account instead
            </Link>
          </div>
          <p className="mt-4 font-mono text-[10px] text-ink-400">code: {error.code}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-5">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-blue-500 shadow-lg">
        <Sparkles className="h-6 w-6 text-white" />
      </div>
      <div className="flex items-center gap-2 text-sm font-semibold text-ink-700 dark:text-ink-200">
        <Loader2 className="h-4 w-4 animate-spin" />
        {STATUS_COPY[status] ?? STATUS_COPY.login}
      </div>
      {slow && (
        <p className="max-w-xs text-center text-[11px] leading-relaxed text-ink-400">
          Still connecting… the server may be waking up (Render free tier). This can take up to a minute.
        </p>
      )}
    </div>
  );
}
