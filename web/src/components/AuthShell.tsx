/**
 * The AI-LifeHub authentication shell — one premium, dark surface used by both
 * /login and /register.
 *
 * Layout
 *   • desktop / tablet  : brand story on the left, sign-in card on the right
 *   • mobile            : the card only, with the brand mark above it
 *
 * The visual language is deliberately self-contained (own background layers,
 * own card treatment) so the auth pages read as a designed product surface and
 * do not inherit the app's light theme.
 */

import type { ReactNode } from 'react';
import { BrainCircuit, Fingerprint, LineChart, ShieldCheck, Sparkles, Zap } from 'lucide-react';

const PILLARS = [
  {
    icon: BrainCircuit,
    title: 'Insights grounded in your own history',
    body: 'Patterns are computed from your records before a model ever reads them.',
  },
  {
    icon: Zap,
    title: 'One tap to log, zero friction',
    body: 'Tasks, habits, mood and focus sessions stay current without a daily ritual.',
  },
  {
    icon: LineChart,
    title: 'Every signal in one place',
    body: 'Your week, your streaks and your focus time, read as a single story.',
  },
];

export function AuthBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <div className="absolute inset-0 rounded-[13px] bg-brand-500/40 blur-md" aria-hidden="true" />
        <div className="relative flex h-11 w-11 items-center justify-center rounded-[13px] bg-gradient-to-br from-brand-400 via-brand-500 to-blue-500 ring-1 ring-inset ring-white/25">
          <Sparkles className="h-[22px] w-[22px] text-white" strokeWidth={2.2} />
        </div>
      </div>
      <div className="leading-none">
        <p className="font-display text-[19px] font-extrabold tracking-tight text-white">
          AI-Life<span className="text-brand-300">Hub</span>
        </p>
        {!compact && (
          <p className="mt-1 text-[11px] font-medium tracking-[0.14em] text-white/40">PERSONAL PRODUCTIVITY OS</p>
        )}
      </div>
    </div>
  );
}

/** Fixed, non-repeating background layers: aurora glow, grid, vignette. */
function AuthBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[#08090d]" />
      <div className="absolute -left-40 -top-48 h-[38rem] w-[38rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(127,86,255,0.32),transparent_62%)] blur-[6px]" />
      <div className="absolute -right-32 top-[-8rem] h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.24),transparent_62%)]" />
      <div className="absolute bottom-[-16rem] left-1/3 h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.16),transparent_65%)]" />
      <div
        className="absolute inset-0 opacity-[0.055]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse 90% 70% at 50% 20%, #000 35%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 90% 70% at 50% 20%, #000 35%, transparent 100%)',
        }}
      />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
    </div>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#08090d] text-white">
      <AuthBackdrop />

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[1240px] flex-col px-5 pb-6 pt-7 sm:px-8 sm:py-8 lg:grid lg:grid-cols-[1.08fr_minmax(0,440px)] lg:items-center lg:gap-16 lg:px-10 lg:py-12 xl:gap-24">
        {/* ── Brand story (tablet and up) ─────────────────────────────── */}
        <section className="hidden md:flex md:flex-col md:justify-center lg:pr-4">
          <AuthBrand />

          <h1 className="mt-12 max-w-[15ch] font-display text-[40px] font-extrabold leading-[1.06] tracking-[-0.03em] text-white lg:text-[54px]">
            Productivity that
            <span className="block bg-gradient-to-r from-brand-200 via-brand-300 to-blue-300 bg-clip-text text-transparent">
              understands you.
            </span>
          </h1>
          <p className="mt-5 max-w-[46ch] text-[15px] leading-relaxed text-white/55">
            AI-LifeHub turns the tasks, habits and focus sessions you already log into evidence-based insight about how
            you actually work.
          </p>

          <div className="mt-11 space-y-5 border-l border-white/10 pl-6">
            {PILLARS.map((p) => (
              <div key={p.title} className="flex items-start gap-3.5">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-white/[0.06] ring-1 ring-inset ring-white/10">
                  <p.icon className="h-[15px] w-[15px] text-brand-200" />
                </div>
                <div>
                  <p className="text-[13.5px] font-semibold text-white/90">{p.title}</p>
                  <p className="mt-0.5 max-w-[42ch] text-[12.5px] leading-relaxed text-white/45">{p.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11.5px] text-white/35">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/80" /> Private by design
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-white/25" /> User-level isolation on every query
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-white/25" /> Export or delete everything, any time
            </span>
          </div>
        </section>

        {/* ── Sign-in card ───────────────────────────────────────────── */}
        <section className="flex flex-1 flex-col justify-center md:flex-none">
          <div className="mb-6 flex justify-center md:hidden">
            <AuthBrand />
          </div>

          <div className="relative">
            {/* soft glow behind the card */}
            <div
              className="absolute -inset-x-6 -inset-y-5 rounded-[32px] bg-[radial-gradient(ellipse_at_top,rgba(127,86,255,0.22),transparent_70%)] blur-xl"
              aria-hidden="true"
            />
            <div className="relative rounded-[22px] border border-white/[0.1] bg-gradient-to-b from-white/[0.07] via-white/[0.035] to-white/[0.02] p-5 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.9),0_0_60px_-30px_rgba(127,86,255,0.5),0_0_0_1px_rgba(255,255,255,0.03)_inset] backdrop-blur-2xl sm:p-9">
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

              <h2 className="font-display text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-white sm:text-[28px]">
                {title}
              </h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-white/50">{subtitle}</p>

              <div className="mt-7">{children}</div>

              <div className="mt-7 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/25">Secure</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
              <p className="mt-4 text-center text-[11.5px] leading-relaxed text-white/35">
                Protected by Google OAuth 2.0 · no password is ever stored
              </p>

              <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/[0.07] pt-4">
                {[
                  { icon: ShieldCheck, label: 'Encrypted' },
                  { icon: Fingerprint, label: 'Private' },
                  { icon: Sparkles, label: 'Yours' },
                ].map((t) => (
                  <div key={t.label} className="flex flex-col items-center gap-1.5">
                    <t.icon className="h-3.5 w-3.5 text-white/30" />
                    <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/30">{t.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {footer && <div className="mt-5 text-center text-[11.5px] text-white/30">{footer}</div>}
        </section>
      </div>

      <footer className="relative mx-auto w-full max-w-[1240px] px-5 pb-6 sm:px-8 lg:px-10">
        <div className="flex flex-col items-center justify-between gap-2 border-t border-white/[0.07] pt-5 text-[11px] text-white/30 sm:flex-row">
          <p>© {new Date().getFullYear()} AI-LifeHub. All rights reserved.</p>
          <p className="flex items-center gap-4">
            <span>Built for people who want their data to work for them.</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
