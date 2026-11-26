/**
 * The single sign-in screen. AI-LifeHub authenticates with Google only.
 *
 * Same page for both jobs: a first-time visitor's "Continue with Google"
 * creates their account, a returning visitor's signs them back in — the backend
 * decides which (see server/src/services/oauthAccounts.ts).
 *
 * The password forms are gone from the UI. The API still accepts password login
 * for accounts that already have one, so nobody loses access; those users simply
 * press "Continue with Google" with the same verified email and the backend links
 * the Google identity to their existing account.
 */

import { useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Lock, ShieldCheck, UserPlus, X } from 'lucide-react';
import { AuthLayout } from '@/components/AuthLayout';
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

const BENEFITS = [
  'No password to remember or reset',
  'One tap on mobile, no typing',
  'Your data stays tied to your own account',
];

export default function Login() {
  const location = useLocation() as { state?: { from?: string } };
  const [params] = useSearchParams();
  const [dismissed, setDismissed] = useState(false);

  const errorCode = params.get('error');
  const errorMessage = params.get('message');
  const next = location.state?.from || '/dashboard';

  return (
    <AuthLayout
      title="Welcome to AI-LifeHub"
      subtitle="Sign in with Google to pick up where your data left off."
      footer={
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-3 w-3" />
          We only read your name, email and photo — nothing else in your Google account.
        </span>
      }
    >
      {errorCode && !dismissed && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12px] font-medium text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p>{errorMessage || ERROR_COPY[errorCode] || 'Google sign-in failed. Please try again.'}</p>
            {ERROR_COPY[errorCode] && errorMessage !== ERROR_COPY[errorCode] && (
              <p className="mt-1 text-[11px] font-normal opacity-80">{ERROR_COPY[errorCode]}</p>
            )}
          </div>
          <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="rounded p-0.5 opacity-60 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <GoogleButton next={next} />

      <ul className="mt-6 space-y-2.5">
        {BENEFITS.map((b) => (
          <li key={b} className="flex items-start gap-2 text-[12.5px] leading-snug text-ink-600 dark:text-ink-300">
            <CheckCircle2 className="mt-[2px] h-3.5 w-3.5 shrink-0 text-emerald-500" />
            {b}
          </li>
        ))}
      </ul>

      <div className="mt-7 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3.5">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-400">
          <UserPlus className="h-3.5 w-3.5" /> New here?
        </p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-600 dark:text-ink-300">
          The same button creates your account. Sign in once and we set everything up — no form to fill in.
        </p>
      </div>

      <p className="mt-5 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-400">
        <Lock className="mt-[2px] h-3 w-3 shrink-0" />
        <span>
          Already had a password here? Press <span className="font-semibold">Continue with Google</span> using the same
          email — your existing account and all its data are linked automatically.
        </span>
      </p>

    </AuthLayout>
  );
}
