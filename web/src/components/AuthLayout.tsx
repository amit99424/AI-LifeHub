import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, BrainCircuit, CheckCircle2, Lock, Sparkles, Zap } from 'lucide-react';

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  const points = [
    { icon: Zap, title: 'One-click tracking', body: 'Habits, mood and focus sessions take a single tap — the timestamps do the rest.' },
    { icon: BrainCircuit, title: 'Insights from real data', body: 'Patterns are computed from your own records before the model ever sees them.' },
    { icon: Lock, title: 'Private by design', body: 'User-level isolation on every query; journal text never leaves your account context.' },
  ];

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Left: brand panel */}
      <div className="relative hidden overflow-hidden bg-ink-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="mesh-bg absolute inset-0 opacity-90" />
        <div className="pointer-events-none absolute -right-24 top-1/4 h-72 w-72 rounded-full bg-brand-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />

        <div className="relative">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-blue-400 shadow-lg">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="font-display text-lg font-extrabold tracking-tight">
              AI-Life<span className="text-brand-300">Hub</span>
            </span>
          </Link>
        </div>

        <div className="relative max-w-md">
          <h1 className="font-display text-[34px] font-extrabold leading-[1.15] tracking-tight">
            Don’t record your whole life.
            <span className="block bg-gradient-to-r from-brand-300 to-blue-300 bg-clip-text text-transparent">Learn from what you already do.</span>
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-ink-300">
            Tasks, habits, mood, journal and focus sessions in one place — turned into personalised, evidence-based insights by an AI that reads your history, not someone else’s.
          </p>

          <div className="mt-8 space-y-4">
            {points.map((p) => (
              <div key={p.title} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 backdrop-blur">
                  <p.icon className="h-4 w-4 text-brand-200" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold">{p.title}</p>
                  <p className="text-xs leading-relaxed text-ink-400">{p.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-6 text-[11px] text-ink-400">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> PostgreSQL + Prisma
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> JWT + refresh rotation
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5 text-emerald-400" /> Real analytics
          </span>
        </div>
      </div>

      {/* Right: form */}
      <div className="flex flex-col justify-center px-5 py-10 sm:px-10 lg:px-14">
        <div className="mx-auto w-full max-w-[380px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-blue-500">
              <Sparkles className="h-4.5 w-4.5 text-white" />
            </div>
            <span className="font-display text-base font-extrabold tracking-tight text-ink-900 dark:text-white">
              AI-Life<span className="gradient-text">Hub</span>
            </span>
          </div>

          <h2 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white">{title}</h2>
          <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-400">{subtitle}</p>

          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-center text-xs text-ink-500">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] font-medium text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
      <span className="mt-0.5">•</span>
      <span>{message}</span>
    </div>
  );
}

export function PasswordStrength({ value }: { value: string }) {
  const checks = [
    { ok: value.length >= 8, label: '8+ characters' },
    { ok: /[A-Za-z]/.test(value), label: 'a letter' },
    { ok: /[0-9]/.test(value), label: 'a number' },
  ];
  const score = checks.filter((c) => c.ok).length;
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < score ? (score === 3 ? 'bg-emerald-500' : 'bg-amber-400') : 'bg-ink-200 dark:bg-ink-800'}`} />
        ))}
      </div>
      <span className="text-[10px] text-ink-400">{checks.filter((c) => !c.ok).map((c) => c.label).join(', ') || 'strong'}</span>
    </div>
  );
}

export function AuthLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline dark:text-brand-400">
      {children}
      <ArrowRight className="h-3 w-3" />
    </Link>
  );
}

export function useFormState<T extends Record<string, string>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const set = (key: keyof T) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));
  return { values, set, setValues };
}
