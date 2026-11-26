/**
 * "Continue with Google" — the only sign-in control in the product.
 *
 * Flow (server-side authorization code, the most secure option):
 *   1. The button is a plain link to the API: `<API>/api/auth/google/start`.
 *   2. The API sets an httpOnly CSRF/PKCE cookie and redirects to Google.
 *   3. Google calls the API callback, which exchanges the code server-to-server,
 *      verifies the ID token, links or creates the user and issues the SAME
 *      JWT + rotating refresh session the API has always used.
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

export function GoogleGlyph({ className }: { className?: string }) {
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
  if (!status?.configured) {
    if (status === null) {
      // Still asking the API; reserve the button's height so nothing jumps.
      return (
        <div
          aria-hidden="true"
          className={cn('h-[54px] w-full animate-pulse rounded-[13px] bg-white/[0.07]', className)}
        />
      );
    }
    return (
      <div
        role="status"
        className="rounded-[13px] border border-amber-400/25 bg-amber-400/10 px-4 py-3.5 text-[12.5px] leading-relaxed text-amber-100"
      >
        <p className="font-semibold">Google sign-in is not available right now.</p>
        <p className="mt-1 text-amber-100/70">
          This server has no Google OAuth credentials configured, so accounts cannot be created or opened. If you run
          AI-LifeHub yourself, set <code className="font-mono text-[11px]">GOOGLE_CLIENT_ID</code>,{' '}
          <code className="font-mono text-[11px]">GOOGLE_CLIENT_SECRET</code> and{' '}
          <code className="font-mono text-[11px]">GOOGLE_REDIRECT_URI</code> on the backend.
        </p>
      </div>
    );
  }

  const busy = disabled || leaving;

  return (
    <a
      href={googleStartUrl(next)}
      role="button"
      aria-label={label}
      aria-busy={leaving}
      aria-disabled={busy}
      onClick={(e) => {
        if (busy) {
          e.preventDefault();
          return;
        }
        // The server redirect takes a moment on a cold instance; show it.
        setLeaving(true);
      }}
      className={cn(
        'group relative inline-flex h-[54px] w-full touch-manipulation select-none items-center justify-center gap-3 overflow-hidden rounded-[13px] px-5',
        'bg-white text-[14.5px] font-semibold tracking-[-0.01em] text-[#1f1f1f]',
        'shadow-[0_1px_2px_rgba(0,0,0,0.28),0_10px_28px_-10px_rgba(0,0,0,0.7)]',
        'transition-[transform,box-shadow,background-color] duration-200 ease-out',
        'hover:-translate-y-px hover:bg-[#f6f7f9] hover:shadow-[0_2px_4px_rgba(0,0,0,0.3),0_16px_38px_-12px_rgba(127,86,255,0.55)]',
        'active:translate-y-0 active:bg-white active:shadow-[0_1px_2px_rgba(0,0,0,0.3)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0c12]',
        busy && 'pointer-events-none opacity-70',
        className,
      )}
    >
      {/* sheen on hover */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-black/[0.045] to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
      />
      {leaving ? (
        <>
          <span className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-ink-300 border-t-ink-700" />
          <span>Connecting to Google…</span>
        </>
      ) : (
        <>
          <GoogleGlyph className="h-[19px] w-[19px] shrink-0" />
          <span>{label}</span>
        </>
      )}
    </a>
  );
}
