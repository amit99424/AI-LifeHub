/**
 * Sign up — Google only.
 *
 * This page exists so "Create an account" has a real destination, but it is the
 * same single action as signing in: Google decides whether the person is new.
 * Keeping one button everywhere means nobody has to guess which page they need.
 */

import { ArrowRight, CheckCircle2, Rocket, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '@/components/AuthLayout';
import { GoogleButton } from '@/components/GoogleButton';

const STEPS = [
  { title: 'Sign in with Google', body: 'One tap. No password, no email confirmation link.' },
  { title: 'Answer two quick questions', body: 'Your goal and timezone, so insights start relevant.' },
  { title: 'Use it like normal', body: 'Tasks, habits, mood, journal and focus sessions — all yours.' },
];

export default function Register() {
  return (
    <AuthLayout
      title="Create your account"
      subtitle="Two minutes of setup, then it mostly runs itself."
      footer={
        <span className="inline-flex flex-col items-center gap-2">
          <span>
            Already have an account?{' '}
            <Link to="/login" className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline dark:text-brand-400">
              Sign in <ArrowRight className="h-3 w-3" />
            </Link>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3" />
            You can export or delete everything you log, at any time.
          </span>
        </span>
      }
    >
      <GoogleButton next="/onboarding" label="Sign up with Google" />

      <ol className="mt-7 space-y-3.5">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-extrabold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              {i + 1}
            </span>
            <div>
              <p className="text-[12.5px] font-semibold text-ink-800 dark:text-ink-100">{s.title}</p>
              <p className="text-[11.5px] leading-relaxed text-ink-500 dark:text-ink-400">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-7 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3.5">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-400">
          <Sparkles className="h-3.5 w-3.5" /> Already have an account?
        </p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-600 dark:text-ink-300">
          Use the same button — you will be signed straight back into your account and everything in it.
        </p>
      </div>

      <p className="mt-5 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-400">
        <Rocket className="mt-[2px] h-3 w-3 shrink-0" />
        <span>
          By continuing you agree that AI-LifeHub stores the activity you log so it can generate your personal insights.
        </span>
      </p>

      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-400">
        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
        No credit card, no trial timer.
      </p>
    </AuthLayout>
  );
}
