import { useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarDays, Check, Clock, Coffee, Flag, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { Badge, Button, Card, Input, Skeleton } from '@/components/ui';
import { useDailyPlan, useWeeklyReview } from '@/lib/assistant';
import type { DailyPlanDto } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * The day as the records support it.
 *
 * Two rules this panel keeps visible:
 *   - it never assumes the day is long enough — what does not fit is listed as
 *     postponed with the reason, rather than dropped silently;
 *   - every recommendation shows the figures behind it, so the ranking can be
 *     argued with.
 */
export function DailyPlanPanel({ onAsk }: { onAsk: (q: string) => void }) {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const plan = useDailyPlan(minutes);

  const applyMinutes = () => {
    const n = Number(draft);
    setMinutes(Number.isFinite(n) && n >= 10 ? Math.min(960, Math.round(n)) : null);
  };

  if (plan.isPending) {
    return (
      <Card className="p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-3 h-24 w-full" />
      </Card>
    );
  }

  if (plan.isError) {
    return (
      <Card className="p-4">
        <div className="flex items-start gap-2 text-[12px] text-rose-700 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Today’s plan could not be loaded.</p>
            <p className="mt-0.5 opacity-80">{(plan.error as Error).message}</p>
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => void plan.refetch()} icon={<RefreshCw className="h-3.5 w-3.5" />}>
              Try again
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  const p = plan.data!;
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgb(var(--border))] px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-brand-600 dark:text-brand-300" />
          <p className="text-[13px] font-bold text-ink-900 dark:text-white">Today’s plan</p>
          <Badge tone="neutral">{p.date}</Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Input
              className="h-8 w-28 pl-7 text-[12px]"
              placeholder="minutes"
              value={draft}
              inputMode="numeric"
              onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyMinutes();
              }}
              aria-label="Minutes available today"
            />
            <Clock className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          </div>
          <Button size="sm" variant="secondary" onClick={applyMinutes}>
            Set
          </Button>
          {minutes !== null && (
            <Button size="sm" variant="ghost" onClick={() => { setMinutes(null); setDraft(''); }} icon={<X className="h-3.5 w-3.5" />}>
              Clear
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => void plan.refetch()} icon={<RefreshCw className="h-3.5 w-3.5" />}>
            Rebuild
          </Button>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Time available</p>
          <p className="mt-0.5 text-[12.5px] text-ink-700 dark:text-ink-200">
            {p.budget.minutes === null ? 'Not known — so nothing is assumed to fit.' : `${p.budget.minutes} minutes`}
            <span className="ml-1.5 text-[11px] text-ink-400">{p.budget.basis}</span>
          </p>
        </div>

        {p.blocks.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              <Sparkles className="h-3 w-3" /> Recommended order
            </p>
            <ol className="space-y-1.5">
              {p.blocks.map((b, i) => (
                <li key={b.taskId} className="flex gap-2.5 rounded-xl border border-[rgb(var(--border))] px-3 py-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-ink-800 dark:text-ink-100">{b.title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500">{b.why}</p>
                  </div>
                  <span className="shrink-0 self-center rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                    {b.minutes} min
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {p.breaks.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              <Coffee className="h-3 w-3" /> Breaks
            </p>
            <ul className="space-y-1">
              {p.breaks.map((b) => (
                <li key={b} className="text-[11.5px] leading-relaxed text-ink-600 dark:text-ink-300">
                  • {b}
                </li>
              ))}
            </ul>
          </div>
        )}

        {p.deadlines.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              <Flag className="h-3 w-3" /> Deadlines in the next 14 days
            </p>
            <ul className="space-y-1">
              {p.deadlines.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 text-[11.5px] text-ink-600 dark:text-ink-300">
                  <span className="truncate">{d.title}</span>
                  <span className={cn('shrink-0 font-semibold', d.daysUntil <= 1 ? 'text-rose-600 dark:text-rose-400' : 'text-ink-500')}>
                    {d.daysUntil === 0 ? 'today' : `in ${d.daysUntil}d`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {p.postponed.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Not today</p>
            <ul className="space-y-1">
              {p.postponed.slice(0, 6).map((x) => (
                <li key={x.taskId} className="text-[11.5px] leading-relaxed text-ink-500">
                  <span className="font-medium text-ink-600 dark:text-ink-300">{x.title}</span> — {x.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {p.caveats.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5 dark:border-amber-500/25 dark:bg-amber-500/5">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">What this plan cannot see</p>
            <ul className="mt-1 space-y-1">
              {p.caveats.map((c) => (
                <li key={c} className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">
                  • {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {p.priorities.length === 0 && (
          <p className="text-[12px] text-ink-500">No open tasks, so there is nothing to schedule today.</p>
        )}

        <div className="flex flex-wrap gap-1.5 border-t border-[rgb(var(--border))] pt-3">
          <Button size="sm" variant="secondary" onClick={() => onAsk('Plan my day in order, and say why each task is where it is.')} icon={<ArrowRight className="h-3.5 w-3.5" />}>
            Explain this plan
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAsk('Which of my overdue tasks matters most, and why?')}>
            What is most overdue?
          </Button>
        </div>
      </div>
    </Card>
  );
}

/**
 * The week, measured. Never says "you did well" — it shows the figure and lets
 * the person read it.
 */
export function WeeklyReviewPanel({ onAsk }: { onAsk: (q: string) => void }) {
  const review = useWeeklyReview();
  if (review.isPending) return <Card className="p-4"><Skeleton className="h-5 w-40" /><Skeleton className="mt-3 h-20 w-full" /></Card>;
  if (review.isError || !review.data) {
    return (
      <Card className="p-4 text-[12px] text-ink-500">
        The weekly review could not be loaded.
        <Button size="sm" variant="secondary" className="ml-2" onClick={() => void review.refetch()} icon={<RefreshCw className="h-3.5 w-3.5" />}>
          Retry
        </Button>
      </Card>
    );
  }

  const r = review.data;
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-[rgb(var(--border))] px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-300" />
          <p className="text-[13px] font-bold text-ink-900 dark:text-white">This week</p>
          <Badge tone="neutral">
            {r.thisWeek.weekStart} → {r.thisWeek.weekEnd}
          </Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={() => void review.refetch()} icon={<RefreshCw className="h-3.5 w-3.5" />}>
          Refresh
        </Button>
      </div>

      <div className="space-y-4 px-4 py-4">
        {!r.enoughData && (
          <p className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/5 dark:text-amber-200">
            There are only a few records this week, so this is a list of what exists rather than a picture of your week.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {r.deltas.map((d) => (
            <div key={d.key} className="rounded-xl border border-[rgb(var(--border))] px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{d.label}</p>
              <p className="mt-0.5 text-[15px] font-extrabold tabular-nums text-ink-900 dark:text-white">{d.thisWeek ?? '—'}</p>
              <p className="text-[10px] text-ink-400">
                {d.change === null ? 'no comparison' : `${d.change > 0 ? '+' : ''}${d.change} vs last week`}
              </p>
            </div>
          ))}
        </div>

        {r.goals.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Goals</p>
            <ul className="space-y-1.5">
              {r.goals.slice(0, 6).map((g) => (
                <li key={g.id} className="text-[11.5px] text-ink-600 dark:text-ink-300">
                  <span className="font-medium text-ink-700 dark:text-ink-200">{g.title}</span>
                  {' — '}
                  {g.current ?? 'not recorded'} of {g.target ?? 'no target'}
                  {g.metric ? ` ${g.metric}` : ''}
                  {g.fraction === null ? ' (no percentage can be computed)' : ` (${Math.round(g.fraction * 100)}%)`}
                  {g.deadline ? `, due ${g.deadline}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        {r.obstacles.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">What the records show</p>
            <ul className="space-y-1">
              {r.obstacles.map((o) => (
                <li key={o} className="text-[11.5px] leading-relaxed text-ink-600 dark:text-ink-300">
                  • {o}
                </li>
              ))}
            </ul>
          </div>
        )}

        {r.caveats.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Missing</p>
            <ul className="space-y-1">
              {r.caveats.map((c) => (
                <li key={c} className="text-[11px] leading-relaxed text-ink-500">
                  • {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 border-t border-[rgb(var(--border))] pt-3">
          <Button size="sm" variant="secondary" onClick={() => onAsk('How much progress did I make this week, and how does it compare with last week?')}>
            Review my week
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAsk('What should I improve next week?')}>
            What to improve
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** A confirmation card for one proposed write. Nothing is written until Confirm. */
export function ActionCard({
  action,
  pending,
  done,
  onConfirm,
  onCancel,
}: {
  action: { kind: string; summary: string; references: { task?: { title: string }; project?: { title: string }; goal?: { title: string } } };
  pending: boolean;
  done: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-2xl border border-brand-300 bg-brand-50/70 px-3.5 py-3 dark:border-brand-500/30 dark:bg-brand-500/10">
      <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
        <Sparkles className="h-3 w-3" /> Proposed action · needs your confirmation
      </p>
      <p className="mt-1 text-[12.5px] font-medium text-ink-800 dark:text-ink-100">{action.summary}</p>
      {done ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] font-semibold text-emerald-700 dark:text-emerald-400">
          <Check className="h-3.5 w-3.5" /> {done}
        </p>
      ) : (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Button size="sm" onClick={onConfirm} disabled={pending} icon={pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}>
            {pending ? 'Saving…' : 'Confirm'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending} icon={<X className="h-3.5 w-3.5" />}>
            Cancel
          </Button>
          <span className="self-center text-[10.5px] text-ink-500">Nothing has been saved yet.</span>
        </div>
      )}
    </div>
  );
}
