/**
 * Sign in — Google only.
 *
 * A first-time visitor's "Continue with Google" creates their account, a
 * returning visitor's signs them back in; the backend decides which.
 */

import { useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { AlertTriangle, X } from 'lucide-react';
import { AuthShell } from '@/components/AuthShell';
import { GoogleButton } from '@/components/GoogleButton';

const ERROR_COPY: Record<string, string> = {
  google_unconfigured:
    'Google sign-in is not configured on this server yet. Add the Google client id, secret and redirect URI to the backend environment.',
  google_bad_state: 'That sign-in attempt expired. Please start again.',
  google_code_invalid: 'That sign-in link was already used. Please start again.',
  google_cancelled: 'You closed the Google window before finishing. Nothing was changed.',
  google_exchange_failed:
    'Google rejected the sign-in. This is usually a deployment configuration issue — please try again in a moment.',
  google_email_unverified: 'Your Google email address is not verified, so it cannot be used to sign in.',
  account_deleted: 'This account has been deleted.',
  google_failed: 'Google sign-in failed. Please try again.',
};

export default function Login() {
  const location = useLocation() as { state?: { from?: string } };
  const [params] = useSearchParams();
  const [dismissed, setDismissed] = useState(false);

  const errorCode = params.get('error');
  const errorMessage = params.get('message');
  const next = location.state?.from || '/dashboard';

  return (
    <AuthShell title="Welcome to AI-LifeHub" subtitle="Your personal space for smarter productivity.">
      {errorCode && !dismissed && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-[13px] border border-rose-400/25 bg-rose-500/[0.12] px-3.5 py-3 text-[12.5px] font-medium leading-relaxed text-rose-100"
        >
          <AlertTriangle className="mt-[1px] h-4 w-4 shrink-0 text-rose-300" />
          <p className="min-w-0 flex-1">{errorMessage || ERROR_COPY[errorCode] || 'Google sign-in failed. Please try again.'}</p>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="rounded p-0.5 text-rose-200/60 transition hover:text-rose-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <GoogleButton next={next} />
    </AuthShell>
  );
}
