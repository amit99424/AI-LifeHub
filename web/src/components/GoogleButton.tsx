/**
 * "Continue with Google" — the standard Google Identity button.
 *
 * Flow (server-side authorization code, the most secure option):
 *   1. The button is a plain link to the API: `<API>/api/auth/google/start`.
 *   2. The API sets an httpOnly CSRF/PKCE cookie and redirects to Google.
 *   3. Google calls the API callback, which exchanges the code server-to-server,
 *      verifies the ID token, links or creates the user and issues the SAME
 *      JWT + rotating refresh session as email/password login.
 *   4. The API redirects the browser to /auth/google/callback, where the SPA
 *      calls /api/auth/me with the cookies it now holds.
 *
 * The client secret never reaches the browser, and no user details are ever
 * accepted from the frontend.
 */

import { useEffect, useState } from 'react';
import { API_BASE, api } from '@/lib/api';
import { cn } from '@/lib/utils';

type GoogleStatus = { configured: boolean; clientId: string | null };

/** Cached so the button does not refetch on every mount. */
let statusPromise: Promise<GoogleStatus> | null = null;

export function fetchGoogleStatus(): Promise<GoogleStatus> {
  if (!statusPromise) {
    statusPromise = api
      .get<GoogleStatus>('/api/auth/google/status')
      .catch(() => ({ configured: false, clientId: null }));
  }
  return statusPromise;
}

/** Where the browser starts the flow. `next` is a path inside the SPA. */
export function googleStartUrl(next?: string): string {
  const params = new URLSearchParams();
  if (next) params.set('next', next);
  const q = params.toString();
  return `${API_BASE}/api/auth/google/start${q ? `?${q}` : ''}`;
}

function GoogleGlyph({ className }: { className?: string }) {
  // Official four-colour Google "G" mark.
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function GoogleButton({
  next,
  label = 'Continue with Google',
  disabled,
  className,
}: {
  next?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchGoogleStatus().then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Nothing to show until we know whether the server has Google configured.
  if (!status?.configured) return null;

  return (
    <a
      href={googleStartUrl(next)}
      role="button"
      aria-label={label}
      aria-disabled={disabled || leaving}
      onClick={(e) => {
        if (disabled || leaving) {
          e.preventDefault();
          return;
        }
        // The server redirect takes a moment on a cold Render instance; show it.
        setLeaving(true);
      }}
      className={cn(
        'group inline-flex min-h-[46px] w-full touch-manipulation select-none items-center justify-center gap-2.5 rounded-xl border border-[rgb(var(--border))] bg-white px-4 text-sm font-semibold text-ink-800 shadow-sm transition',
        'hover:border-ink-300 hover:bg-ink-50 active:scale-[0.995]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--bg))]',
        'dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100 dark:hover:bg-ink-800',
        (disabled || leaving) && 'pointer-events-none opacity-60',
        className,
      )}
    >
      {leaving ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-300 border-t-ink-700 dark:border-ink-600 dark:border-t-ink-200" />
          <span>Redirecting to Google…</span>
        </>
      ) : (
        <>
          <GoogleGlyph className="h-[18px] w-[18px] shrink-0" />
          <span>{label}</span>
        </>
      )}
    </a>
  );
}

/** "or" rule between the Google button and the email/password form. */
export function OrDivider({ label = 'or' }: { label?: string }) {
  return (
    <div className="relative my-5">
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t border-[rgb(var(--border))]" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-[rgb(var(--bg))] px-2.5 text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</span>
      </div>
    </div>
  );
}
