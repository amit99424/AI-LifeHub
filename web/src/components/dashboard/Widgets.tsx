import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Battery,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  EyeOff,
  Flame,
  GripVertical,
  HeartPulse,
  Layers,
  Minus,
  Moon,
  RotateCcw,
  Settings2,
  Smile,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { DashboardResponse, Insight, WidgetId } from '@/lib/types';
import { Badge, Button, Card, CardHeader, EmptyState, ProgressBar, toast } from '@/components/ui';
import { WIDGET_META, useDashboardLayout } from '@/lib/dashboardLayout';
import { useNouns } from '@/lib/occupation';
import { MOOD_META, PRIORITY_STYLES, cn, formatDate, formatMinutes } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// Dashboard widgets
// ─────────────────────────────────────────────────────────────
// Every widget below renders what the server sent. None of them computes a
// number: the dashboard payload already carries the life-engine analysis, the
// comparisons and the widget order, so the screen and the AI cannot disagree
// about what happened.
//
// The honesty rules are visible in the UI, not just in the engine:
//   - a correlation below the sample threshold is shown as withheld, with its
//     count, and never drawn
//   - a comparison with nothing on either side says so instead of showing a
//     change
//   - an empty widget explains what would fill it

type Props = { data: DashboardResponse; onInsightAction: (id: string, patch: Record<string, boolean>) => void; onGenerate: () => void; generating: boolean };

const WIDGET_SPAN: Partial<Record<WidgetId, string>> = {
  today: 'lg:col-span-3',
  score: 'lg:col-span-1',
  tasks: 'lg:col-span-1',
  habits: 'lg:col-span-1',
  focus: 'lg:col-span-1',
  mood: 'lg:col-span-1',
  wellness: 'lg:col-span-1',
  deadlines: 'lg:col-span-1',
  insight: 'lg:col-span-1',
  week: 'lg:col-span-2',
  trend: 'lg:col-span-2',
  consistency: 'lg:col-span-1',
  strengths: 'lg:col-span-1',
  correlations: 'lg:col-span-2',
  timeofday: 'lg:col-span-1',
  studywork: 'lg:col-span-2',
  goals: 'lg:col-span-1',
  overdue: 'lg:col-span-1',
  growth: 'lg:col-span-2',
};

/** A delta chip: direction, magnitude, and whether it is inside the noise band. */
function DeltaChip({ d }: { d?: import('@/lib/types').DeltaDto }) {
  if (!d || d.direction === 'unknown') {
    return <span className="text-[10px] font-semibold text-ink-400">no comparison</span>;
  }
  const good = d.higherIsBetter ? d.direction === 'up' : d.direction === 'down';
  const Icon = d.direction === 'up' ? ArrowUpRight : d.direction === 'down' ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[10px] font-bold',
        d.withinNoise ? 'text-ink-400' : good ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
      )}
      title={d.withinNoise ? 'Smaller than the noise band we treat as real' : `${d.previous} → ${d.current}`}
    >
      <Icon className="h-3 w-3" />
      {d.change !== null ? Math.abs(d.change) : '—'}
      {d.withinNoise && <span className="font-normal text-ink-400"> (flat)</span>}
    </span>
  );
}

function Stat({ label, value, unit, delta, sub }: { label: string; value: string | number | null; unit?: string; delta?: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3">
      <div className="flex items-start justify-between gap-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">{label}</p>
        {delta}
      </div>
      <p className="mt-1 font-display text-xl font-extrabold tabular-nums text-ink-900 dark:text-white">
        {value === null ? '—' : value}
        {value !== null && unit && <span className="ml-0.5 text-[11px] font-semibold text-ink-400">{unit}</span>}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-ink-400">{sub}</p>}
    </div>
  );
}

/** Small inline trend line, drawn from real scores only. */
function Sparkline({ points }: { points: { date: string; score: number | null; hasData: boolean }[] }) {
  const real = points.filter((p) => p.hasData && p.score !== null);
  if (real.length < 2) return null;
  const w = 100;
  const h = 28;
  const max = 100;
  const step = w / Math.max(1, points.length - 1);
  const path = points
    .map((p, i) => {
      if (!p.hasData || p.score === null) return null;
      return `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - (p.score / max) * h).toFixed(1)}`;
    })
    .filter(Boolean)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={path} fill="none" stroke="#a855f7" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DashboardWidget({
  id,
  data,
  onInsightAction,
  onGenerate,
  generating,
}: { id: WidgetId } & Props) {
  const nouns = useNouns();
  const life = data.life;
  const cmp = data.comparisons?.week;
  const deltaFor = (key: string) => life?.deltas.find((d) => d.key === key);
  const habitList = useQuery({
    queryKey: ['habits'],
    queryFn: () => api.get<{ habits: { id: string; name: string; doneToday: boolean; streak: number }[] }>('/api/habits'),
    enabled: id === 'habits',
  });
  const qc = useQueryClient();
  const checkHabit = useMutation({
    mutationFn: (hid: string) => api.post(`/api/habits/${hid}/checkin`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['habits'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  switch (id) {
    // ── daily overview ────────────────────────────────────────
    case 'today': {
      const s = data.summary;
      return (
        <Card className="p-4">
          <CardHeader title="Today" subtitle={data.today} icon={<CheckCircle2 className="h-4 w-4" />} />
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Tasks done" value={s.tasksCompleted} sub={`${s.tasksPending} pending`} delta={<DeltaChip d={deltaFor('tasksCompleted')} />} />
            <Stat label={nouns.sessionLabel === 'Area' ? 'Focus' : 'Focus time'} value={formatMinutes(s.focusMinutes)} sub={`${formatMinutes(data.totals.focusMinutes)} in 30 days`} delta={<DeltaChip d={deltaFor('focusMinutes')} />} />
            <Stat label="Habits" value={s.habitsActive ? `${s.habitsDone}/${s.habitsActive}` : '—'} sub={s.habitsActive ? `${s.habitRate}% of today` : 'No habits yet'} delta={<DeltaChip d={deltaFor('habitRate')} />} />
            <Stat
              label="Wellness"
              value={data.daily.at(-1)?.wellness?.sleepHours != null ? `${data.daily.at(-1)!.wellness!.sleepHours}` : '—'}
              unit="h sleep"
              sub={
                data.daily.at(-1)?.wellness?.energy != null
                  ? `energy ${data.daily.at(-1)!.wellness!.energy}/5`
                  : 'not logged today'
              }
            />
          </div>
          <p className="mt-3 text-[11px] text-ink-500">{life?.sufficiency.message ?? 'Log a few days and the analysis starts here.'}</p>
        </Card>
      );
    }

    // ── score ─────────────────────────────────────────────────
    case 'score': {
      const s = data.summary;
      const sc = s.score;
      const band = sc.band;
      return (
        <Card className="p-4">
          <CardHeader title="Daily score" subtitle={band} icon={<TrendingUp className="h-4 w-4" />} />
          <p className="mt-2 font-display text-4xl font-extrabold tabular-nums text-ink-900 dark:text-white">
            {sc.score}
            <span className="ml-1 text-sm font-semibold text-ink-400">/100</span>
          </p>
          <div className="mt-3 space-y-1.5">
            {(['tasks', 'habits', 'focus', 'consistency'] as const).map((k) => (
              <div key={k}>
                <div className="flex justify-between text-[10px] font-semibold text-ink-500">
                  <span className="capitalize">{k}</span>
                  <span>{sc.components?.[k] ?? 0}</span>
                </div>
                <ProgressBar value={sc.components?.[k] ?? 0} tone={(sc.components?.[k] ?? 0) >= 60 ? 'success' : 'brand'} />
              </div>
            ))}
          </div>
        </Card>
      );
    }

    // ── tasks ─────────────────────────────────────────────────
    case 'tasks': {
      const open = data.counts.TODO ?? 0;
      const inProgress = data.counts.IN_PROGRESS ?? 0;
      return (
        <Card className="p-4">
          <CardHeader
            title="Tasks"
            subtitle={`${data.summary.tasksCompleted} done today`}
            icon={<CheckCircle2 className="h-4 w-4" />}
            action={<Link to="/tasks" className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400">Open</Link>}
          />
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'To do', value: open },
              { label: 'Doing', value: inProgress },
              { label: 'Done', value: data.totals.tasksCompleted },
            ].map((x) => (
              <div key={x.label}>
                <p className="font-display text-lg font-extrabold tabular-nums text-ink-900 dark:text-white">{x.value}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{x.label}</p>
              </div>
            ))}
          </div>
        </Card>
      );
    }

    // ── habits ────────────────────────────────────────────────
    case 'habits': {
      const list = habitList.data?.habits ?? [];
      return (
        <Card className="p-4">
          <CardHeader
            title="Habits"
            subtitle={data.habitsToday.total ? `${data.habitsToday.done} of ${data.habitsToday.total} today` : 'One tap each'}
            icon={<Target className="h-4 w-4" />}
            action={<Link to="/habits" className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400">Manage</Link>}
          />
          {list.length ? (
            <div className="mt-2 space-y-1.5">
              {list.slice(0, 5).map((h) => (
                <button
                  key={h.id}
                  onClick={() => checkHabit.mutate(h.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition',
                    h.doneToday
                      ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/25 dark:bg-emerald-500/10'
                      : 'border-[rgb(var(--border))] hover:border-brand-300',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                      h.doneToday ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-ink-300 dark:border-ink-600',
                    )}
                  >
                    {h.doneToday && <Check className="h-3 w-3" />}
                  </span>
                  <span className={cn('flex-1 truncate text-[12px] font-medium', h.doneToday && 'line-through text-emerald-800 dark:text-emerald-300')}>{h.name}</span>
                  {h.streak > 0 && <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">{h.streak}</span>}
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Target className="h-4 w-4" />} title="No habits yet" description="Start with one small daily habit — checking it in is a single click." />
          )}
        </Card>
      );
    }

    // ── focus ─────────────────────────────────────────────────
    case 'focus': {
      const s = data.summary;
      return (
        <Card className="p-4">
          <CardHeader title="Focus time" subtitle={`${formatMinutes(data.totals.focusMinutes)} in 30 days`} icon={<Timer className="h-4 w-4" />} action={<Link to="/sessions" className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400">Start</Link>} />
          <p className="mt-2 font-display text-3xl font-extrabold tabular-nums text-ink-900 dark:text-white">{formatMinutes(s.focusMinutes)}</p>
          <p className="text-[11px] text-ink-400">today · avg {formatMinutes(data.totals.avgSessionMinutes)} per {nouns.session.toLowerCase()}</p>
          {life?.trend && life.trend.length > 2 && <div className="mt-2"><Sparkline points={life.trend.slice(-14)} /></div>}
        </Card>
      );
    }

    // ── mood ──────────────────────────────────────────────────
    case 'mood': {
      const m = data.mood;
      return (
        <Card className="p-4">
          <CardHeader title="Mood" subtitle="Self-reported, one tap a day" icon={<Smile className="h-4 w-4" />} action={<Link to="/mood" className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400">Log</Link>} />
          {m ? (
            <div className="mt-2 flex items-center gap-3">
              <span className="text-4xl">{MOOD_META[m.level].emoji}</span>
              <div>
                <p className="font-display text-base font-extrabold text-ink-900 dark:text-white">{MOOD_META[m.level].label}</p>
                <p className="text-[11px] text-ink-500">
                  {m.focus ? `focus ${m.focus}/5` : 'no focus rating'}
                  {m.energy ? ` · energy ${m.energy}/5` : ''}
                </p>
              </div>
            </div>
          ) : (
            <EmptyState icon={<Smile className="h-4 w-4" />} title="Not logged today" description="Pick one of five faces — optional note, no questions." />
          )}
        </Card>
      );
    }

    // ── wellness ──────────────────────────────────────────────
    case 'wellness': {
      const today = data.daily.at(-1)?.wellness;
      const cur = life?.current;
      const logged = Boolean(today && (today.sleepHours !== null || today.energy !== null || today.stress !== null));
      return (
        <Card className="p-4">
          <CardHeader title="Wellness" subtitle="Sleep, energy, stress" icon={<HeartPulse className="h-4 w-4" />} action={<Link to="/wellness" className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400">{logged ? 'Edit' : 'Log'}</Link>} />
          {logged ? (
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="font-display text-lg font-extrabold tabular-nums text-ink-900 dark:text-white">{today?.sleepHours ?? '—'}</p>
                <p className="text-[10px] font-semibold uppercase text-ink-400">h sleep</p>
              </div>
              <div>
                <p className="font-display text-lg font-extrabold tabular-nums text-ink-900 dark:text-white">{today?.energy ?? '—'}</p>
                <p className="text-[10px] font-semibold uppercase text-ink-400">energy</p>
              </div>
              <div>
                <p className="font-display text-lg font-extrabold tabular-nums text-ink-900 dark:text-white">{today?.stress ?? '—'}</p>
                <p className="text-[10px] font-semibold uppercase text-ink-400">stress</p>
              </div>
            </div>
          ) : (
            <EmptyState icon={<HeartPulse className="h-4 w-4" />} title="Nothing logged today" description="Sleep, energy and stress take about fifteen seconds and make every pattern below possible." />
          )}
          {cur && cur.daysWithData > 0 && (
            <p className="mt-2 text-[10px] text-ink-400">
              30-day averages: {cur.sleepHours ?? '—'}h sleep · {cur.energy ?? '—'}/5 energy · {cur.stress ?? '—'}/5 stress
            </p>
          )}
        </Card>
      );
    }

    // ── deadlines ─────────────────────────────────────────────
    case 'deadlines':
      return (
        <Card className="p-4">
          <CardHeader title="Deadlines" subtitle="Next few, overdue first" icon={<Clock className="h-4 w-4" />} action={<Link to="/tasks" className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400">All</Link>} />
          {data.deadlines.length ? (
            <div className="mt-2 space-y-1">
              {data.deadlines.slice(0, 5).map((d) => (
                <div key={d.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-[12px]">
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', d.overdue ? 'bg-rose-500' : 'bg-brand-500')} />
                  <span className="flex-1 truncate text-ink-700 dark:text-ink-200">{d.title}</span>
                  <span className={cn('shrink-0 text-[10px] font-semibold', d.overdue ? 'text-rose-600' : 'text-ink-400')}>{d.dueDate ? formatDate(new Date(d.dueDate)) : '—'}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Clock className="h-4 w-4" />} title="Nothing scheduled" description="Give a task a due date and it appears here." />
          )}
        </Card>
      );

    // ── AI insights ───────────────────────────────────────────
    case 'insight':
      return (
        <Card className="p-4">
          <CardHeader
            title="AI insights"
            subtitle="Generated from your records"
            icon={<Sparkles className="h-4 w-4" />}
            action={
              <Button size="sm" variant="ghost" onClick={onGenerate} loading={generating} icon={<Sparkles className="h-3.5 w-3.5" />}>
                {data.insights.length ? 'Refresh' : 'Generate'}
              </Button>
            }
          />
          <div className="mt-2 space-y-2">
            {data.insights.length === 0 ? (
              <EmptyState
                icon={<Sparkles className="h-4 w-4" />}
                title="No insights yet"
                description="Insights need a few days of activity before they can say anything true. Log a few days first — or generate now and the engine will tell you what it is still missing."
                action={<Button size="sm" onClick={onGenerate} loading={generating}>Generate now</Button>}
              />
            ) : (
              data.insights.slice(0, 2).map((i) => <InsightRow key={i.id} insight={i} onAction={onInsightAction} />)
            )}
          </div>
        </Card>
      );

    // ── recent activity ───────────────────────────────────────
    case 'week': {
      const last14 = data.daily.slice(-14);
      const any = last14.some((d) => d.tasksCompleted || d.focusMinutes || d.habitsDone);
      return (
        <Card className="p-4">
          <CardHeader title="Last 14 days" subtitle="Daily score, tasks and focus" icon={<BarChart3 className="h-4 w-4" />} action={<Link to="/analytics" className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400">Analytics →</Link>} />
          {any ? (
            <>
              <div className="mt-2"><Sparkline points={life?.trend?.slice(-14) ?? last14.map((d) => ({ date: d.date, score: d.score, hasData: true }))} /></div>
              <div className="mt-2 grid grid-cols-7 gap-1">
                {last14.map((d) => {
                  const level = d.score >= 80 ? 4 : d.score >= 60 ? 3 : d.score >= 35 ? 2 : d.tasksCompleted || d.focusMinutes ? 1 : 0;
                  return <div key={d.date} title={`${d.date} · score ${d.score}`} className={cn('aspect-square rounded-[4px]', ['bg-ink-100 dark:bg-ink-800', 'bg-brand-500/20', 'bg-brand-500/40', 'bg-brand-500/70', 'bg-brand-400'][level])} />;
                })}
              </div>
            </>
          ) : (
            <EmptyState icon={<BarChart3 className="h-4 w-4" />} title="No activity in the last 14 days" description="Complete a task or run a focus session and this fills in automatically." />
          )}
        </Card>
      );
    }

    // ── trend ─────────────────────────────────────────────────
    case 'trend': {
      const points = life?.trend ?? [];
      const real = points.filter((p) => p.hasData);
      return (
        <Card className="p-4">
          <CardHeader title="Score trend" subtitle={`${real.length} of ${points.length} days have a record`} icon={<TrendingUp className="h-4 w-4" />} />
          {real.length >= 3 ? (
            <div className="mt-3">
              <Sparkline points={points} />
              <div className="mt-2 flex justify-between text-[10px] text-ink-400">
                <span>{points[0]?.date}</span>
                <span>{points.at(-1)?.date}</span>
              </div>
            </div>
          ) : (
            <EmptyState icon={<TrendingUp className="h-4 w-4" />} title="Not enough days for a trend" description={`${real.length} day${real.length === 1 ? '' : 's'} recorded. A line through fewer than three points would be a drawing, not a trend.`} />
          )}
        </Card>
      );
    }

    // ── consistency ───────────────────────────────────────────
    case 'consistency': {
      const c = life?.consistency;
      return (
        <Card className="p-4">
          <CardHeader title="Consistency" subtitle="Habit check-ins" icon={<Flame className="h-4 w-4" />} />
          {c ? (
            <>
              <div className="mt-2 flex items-end gap-4">
                <div>
                  <p className="font-display text-2xl font-extrabold tabular-nums text-ink-900 dark:text-white">{c.streak}</p>
                  <p className="text-[10px] font-semibold uppercase text-ink-400">current streak</p>
                </div>
                <div>
                  <p className="font-display text-2xl font-extrabold tabular-nums text-ink-900 dark:text-white">{c.bestStreak}</p>
                  <p className="text-[10px] font-semibold uppercase text-ink-400">best in 30 days</p>
                </div>
              </div>
              <p className={cn('mt-2 text-[11px]', c.thin ? 'text-amber-600 dark:text-amber-400' : 'text-ink-500')}>{c.note}</p>
              <div className="mt-2 grid grid-cols-7 gap-1">
                {data.heatmap.map((h) => (
                  <div key={h.date} title={`${h.date} · ${h.score}`} className={cn('aspect-square rounded-[3px]', ['bg-ink-100 dark:bg-ink-800', 'bg-brand-500/20', 'bg-brand-500/40', 'bg-brand-500/70', 'bg-brand-400'][h.level])} />
                ))}
              </div>
            </>
          ) : (
            <EmptyState icon={<Flame className="h-4 w-4" />} title="No consistency data" description="Check in a habit for a few days and the streak appears here." />
          )}
        </Card>
      );
    }

    // ── strengths ─────────────────────────────────────────────
    case 'strengths': {
      const list = life?.strengths ?? [];
      return (
        <Card className="p-4">
          <CardHeader title="What is working" subtitle="With the figures behind it" icon={<CheckCircle2 className="h-4 w-4" />} />
          {list.length ? (
            <div className="mt-2 space-y-2">
              {list.map((s) => (
                <div key={s.key} className="rounded-lg border border-[rgb(var(--border))] p-2.5">
                  <p className="text-[12px] font-bold text-ink-900 dark:text-white">{s.title}</p>
                  <p className="mt-0.5 text-[11px] text-ink-500">{s.detail}</p>
                  <p className="mt-1 text-[10px] text-ink-400">{s.evidence}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<CheckCircle2 className="h-4 w-4" />} title="Nothing supported yet" description="Strengths are only listed when a number backs them. A few more recorded days and this fills in." />
          )}
        </Card>
      );
    }

    // ── correlations ──────────────────────────────────────────
    case 'correlations': {
      const corr = life?.correlations;
      return (
        <Card className="p-4">
          <CardHeader title="Patterns" subtitle="Relationships in your own data, with sample size" icon={<Activity className="h-4 w-4" />} />
          {corr && corr.correlations.length ? (
            <div className="mt-2 space-y-2">
              {corr.correlations.slice(0, 4).map((c) => (
                <div key={c.key} className="flex items-start gap-2">
                  <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', c.strength === 'strong' ? 'bg-brand-500' : c.strength === 'moderate' ? 'bg-brand-400' : 'bg-ink-300')} />
                  <div className="min-w-0">
                    <p className="text-[12px] text-ink-700 dark:text-ink-200">{c.sentence}</p>
                    <p className="text-[10px] text-ink-400">n = {c.n} days · r = {c.r} · {c.strength}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Activity className="h-4 w-4" />} title="Not enough paired days" description="A relationship is only shown once two domains have 14 days recorded together. Below that it would be a line drawn through a handful of points." />
          )}
          {corr && corr.withheld.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[11px] font-semibold text-ink-500">
                {corr.withheld.length} pair{corr.withheld.length === 1 ? '' : 's'} withheld for too little data
              </summary>
              <ul className="mt-1.5 space-y-0.5">
                {corr.withheld.slice(0, 8).map((w) => (
                  <li key={w.key} className="text-[10px] text-ink-400">
                    {w.xLabel} vs {w.yLabel} — {w.n} of {w.need ?? 14} days
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      );
    }

    // ── best time ─────────────────────────────────────────────
    case 'timeofday': {
      const bt = life?.bestTime;
      return (
        <Card className="p-4">
          <CardHeader title="Best time" subtitle="Strongest hours and weekdays" icon={<Clock className="h-4 w-4" />} />
          {bt && (bt.hour || bt.weekday) ? (
            <>
              <div className="mt-2 grid grid-cols-2 gap-2 text-center">
                <div>
                  <p className="font-display text-xl font-extrabold tabular-nums text-ink-900 dark:text-white">{bt.hour?.label ?? '—'}</p>
                  <p className="text-[10px] font-semibold uppercase text-ink-400">best hour</p>
                </div>
                <div>
                  <p className="font-display text-xl font-extrabold text-ink-900 dark:text-white">{bt.weekday?.label ?? '—'}</p>
                  <p className="text-[10px] font-semibold uppercase text-ink-400">best weekday</p>
                </div>
              </div>
              <p className={cn('mt-2 text-[11px]', bt.lowConfidence ? 'text-amber-600 dark:text-amber-400' : 'text-ink-500')}>{bt.note}</p>
            </>
          ) : (
            <EmptyState icon={<Clock className="h-4 w-4" />} title="No clear best time yet" description={bt?.note ?? 'Complete tasks or run sessions across a few different hours and a pattern may appear.'} />
          )}
        </Card>
      );
    }

    // ── study & work ─────────────────────────────────────────
    // These three read `data.studyWork`, which the server builds from the same
    // 30-day window the rest of the payload uses. No widget derives a number.
    case 'studywork': {
      const sw = data.studyWork;
      const projects = sw?.projects ?? [];
      if (!sw || projects.length === 0) {
        return (
          <Card className="p-4">
            <CardHeader title={nouns.projects} subtitle="Containers and the time filed under them" icon={<Layers className="h-4 w-4" />} />
            <EmptyState
              icon={<Layers className="h-4 w-4" />}
              title={`No ${nouns.projects.toLowerCase()} yet`}
              description={`A ${nouns.project.toLowerCase()} collects tasks, sessions and deadlines in one place, and gives them a progress figure that means something.`}
              action={<Link to="/projects" className="text-[11px] font-bold text-brand-600 hover:underline dark:text-brand-400">Create one →</Link>}
            />
          </Card>
        );
      }
      const max = Math.max(...projects.map((p) => p.minutes), 1);
      return (
        <Card className="p-4">
          <CardHeader
            title={nouns.projects}
            subtitle="Open containers, their tasks and the time filed under them (30 days)"
            icon={<Layers className="h-4 w-4" />}
            action={<Link to="/projects" className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400">All →</Link>}
          />
          <div className="mt-2 space-y-2">
            {projects.slice(0, 5).map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="block rounded-lg border border-[rgb(var(--border))] p-2 transition hover:border-brand-300/60">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] font-bold text-ink-900 dark:text-white">{p.title}</span>
                  <span className="shrink-0 text-[10px] text-ink-400">{p.tasks} task{p.tasks === 1 ? '' : 's'}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400" style={{ width: `${Math.round((p.minutes / max) * 100)}%` }} />
                </div>
                <p className="mt-0.5 text-[10px] text-ink-400">
                  {p.minutes ? formatMinutes(p.minutes) : 'no time yet'}
                  {p.deadline ? ` · due ${formatDate(new Date(p.deadline))}` : ''}
                </p>
              </Link>
            ))}
          </div>
        </Card>
      );
    }

    case 'goals': {
      const goals = data.studyWork?.goals ?? [];
      return (
        <Card className="p-4">
          <CardHeader
            title="Goals"
            subtitle="Against their own targets"
            icon={<Target className="h-4 w-4" />}
            action={<Link to="/goals" className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400">All →</Link>}
          />
          {goals.length === 0 ? (
            <EmptyState icon={<Target className="h-4 w-4" />} title="No active goals" description="A target turns effort into something you can measure." />
          ) : (
            <div className="mt-2 space-y-2">
              {goals.slice(0, 4).map((g) => {
                const pct = g.target && g.target > 0 ? Math.min(100, Math.round(((g.current ?? 0) / g.target) * 100)) : null;
                return (
                  <div key={g.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12px] font-semibold text-ink-800 dark:text-ink-100">{g.title}</span>
                      <span className="shrink-0 text-[10px] text-ink-400">
                        {g.target ? `${g.current ?? 0}/${g.target} ${g.metric ?? ''}` : 'no target'}
                      </span>
                    </div>
                    {pct !== null ? (
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
                        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400" style={{ width: `${pct}%` }} />
                      </div>
                    ) : (
                      <p className="mt-0.5 text-[10px] text-ink-400">Progress is not a percentage without a target</p>
                    )}
                    {g.deadline && <p className="mt-0.5 text-[10px] text-ink-400">due {formatDate(new Date(g.deadline))}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      );
    }

    case 'overdue': {
      const n = data.studyWork?.overdueTasks ?? 0;
      return (
        <Card className="p-4">
          <CardHeader title="Overdue work" subtitle="Tasks past their due date" icon={<Clock className="h-4 w-4" />} />
          {n === 0 ? (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-200/60 bg-emerald-50/60 p-2.5 dark:border-emerald-500/20 dark:bg-emerald-500/10">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <p className="text-[12px] font-semibold text-emerald-800 dark:text-emerald-300">Nothing overdue</p>
            </div>
          ) : (
            <div className="mt-2">
              <p className="font-display text-3xl font-extrabold tabular-nums text-ink-900 dark:text-white">{n}</p>
              <p className="text-[11px] text-ink-500">task{n === 1 ? '' : 's'} past their due date</p>
              <Link to="/tasks?filter=overdue" className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400">
                See them <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </Card>
      );
    }

    case 'growth': {
      const g = data.growth;
      // No skills recorded is not "0 skills improved": it is nothing to read.
      if (!g || !g.hasAnyRecord) {
        return (
          <Card className="p-4">
            <CardHeader title="Growth" subtitle="Skills and what your records show" icon={<TrendingUp className="h-4 w-4" />} />
            <p className="mt-2 text-[12px] text-ink-500">
              No skills recorded yet, so there is nothing to measure. Adding one is what makes growth readable.
            </p>
            <Link to="/growth?tab=skills" className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400">
              Add a skill <ArrowRight className="h-3 w-3" />
            </Link>
          </Card>
        );
      }
      const maxWeekly = Math.max(1, ...g.weekly.map((w) => w.minutes));
      return (
        <Card className="p-4">
          <CardHeader title="Growth" subtitle="From recorded skills and level changes" icon={<TrendingUp className="h-4 w-4" />} />
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Stat label="Skills" value={String(g.totals.skills)} />
            <Stat label="Practice" value={`${Math.round(g.totals.practiceMinutes / 60)}h`} />
            <Stat label="Level ups" value={String(g.totals.levelsGained)} />
          </div>

          {g.improving.length > 0 ? (
            <ul className="mt-2.5 space-y-1">
              {g.improving.map((i) => (
                <li key={i.name} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="truncate text-ink-700 dark:text-ink-200">{i.name}</span>
                  <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                    +{i.gained} level{i.gained === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2.5 text-[12px] text-ink-500">No level change recorded in this window.</p>
          )}

          {g.needingAttention.length > 0 && (
            <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
              No recent activity: {g.needingAttention.map((n) => n.name).join(', ')}
            </p>
          )}

          {g.weekly.some((w) => w.minutes > 0) && (
            <div className="mt-2.5 flex h-10 items-end gap-1">
              {g.weekly.map((w) => (
                <div key={w.weekStart} className="flex-1 rounded-t bg-brand-500/60" style={{ height: `${Math.max(4, (w.minutes / maxWeekly) * 100)}%` }} title={`${w.minutes} min`} />
              ))}
            </div>
          )}

          <Link to="/growth" className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400">
            Open Growth Hub <ArrowRight className="h-3 w-3" />
          </Link>
        </Card>
      );
    }

    default:
      return null;
  }
}

function InsightRow({ insight, onAction }: { insight: Insight; onAction: (id: string, patch: Record<string, boolean>) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-[rgb(var(--border))] p-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-bold text-ink-900 dark:text-white">{insight.title}</p>
        <button onClick={() => onAction(insight.id, { dismissed: true })} className="text-ink-400 hover:text-ink-700" aria-label="Dismiss">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className={cn('mt-0.5 text-[11px] text-ink-500', !open && 'line-clamp-2')}>{insight.body}</p>
      {insight.body.length > 120 && (
        <button onClick={() => setOpen((o) => !o)} className="mt-0.5 text-[10px] font-semibold text-brand-600 dark:text-brand-400">
          {open ? 'Less' : 'More'}
        </button>
      )}
      {insight.recommendations?.length ? (
        <ul className="mt-1.5 space-y-0.5">
          {insight.recommendations.slice(0, 2).map((r, i) => (
            <li key={i} className="flex gap-1.5 text-[11px] text-ink-600 dark:text-ink-300">
              <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-brand-500" />
              {r}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-1.5 flex items-center gap-1.5">
        <Badge tone={insight.confidence === 'high' ? 'success' : insight.confidence === 'medium' ? 'brand' : 'neutral'}>{insight.confidence} confidence</Badge>
        {insight.isDemo && <Badge tone="warning">sample data</Badge>}
      </div>
    </div>
  );
}

/** The customiser: reorder, hide, show, reset. */
export function DashboardCustomiser({ widgets, onClose }: { widgets: WidgetId[]; onClose: () => void }) {
  const { data, save, reset } = useDashboardLayout();
  const [order, setOrder] = useState<WidgetId[]>(widgets);
  const hidden = data?.layout.hidden ?? [];

  const move = (i: number, dir: -1 | 1) => {
    const next = [...order];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };

  const toggle = (w: WidgetId) => {
    const next = hidden.includes(w) ? hidden.filter((x) => x !== w) : [...hidden, w];
    save.mutate({ order, hidden: next });
  };

  return (
    <Card className="p-4">
      <CardHeader
        title="Customise dashboard"
        subtitle="Reorder with the arrows, hide what you do not use"
        icon={<Settings2 className="h-4 w-4" />}
        action={
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => reset.mutate()} icon={<RotateCcw className="h-3.5 w-3.5" />}>
              Reset
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} icon={<X className="h-3.5 w-3.5" />}>
              Done
            </Button>
          </div>
        }
      />
      <ul className="mt-2 space-y-1">
        {order.map((w, i) => {
          const isHidden = hidden.includes(w);
          return (
            <li key={w} className={cn('flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] px-2 py-1.5', isHidden && 'opacity-50')}>
              <GripVertical className="h-3.5 w-3.5 shrink-0 text-ink-300" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-ink-800 dark:text-ink-100">{WIDGET_META[w]?.title ?? w}</p>
                <p className="truncate text-[10px] text-ink-400">{WIDGET_META[w]?.description}</p>
              </div>
              <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-ink-400 hover:bg-ink-100 disabled:opacity-25 dark:hover:bg-ink-800" aria-label="Move up">
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => move(i, 1)} disabled={i === order.length - 1} className="rounded p-1 text-ink-400 hover:bg-ink-100 disabled:opacity-25 dark:hover:bg-ink-800" aria-label="Move down">
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => toggle(w)} className="rounded p-1 text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800" aria-label={isHidden ? 'Show' : 'Hide'}>
                {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10px] text-ink-400">Order changes are saved when you hide or show a widget; use Reset to go back to your occupation’s default.</p>
    </Card>
  );
}

/** A single row of a period comparison, with the honest "unavailable" state. */
export function ComparisonStrip({ label, comparison }: { label: string; comparison?: { available: boolean; note: string; changes: { key: string; current: number | null; previous: number | null; change: number | null; direction: string }[] } }) {
  const shown = useMemo(() => comparison?.changes.filter((c) => c.current !== null || c.previous !== null) ?? [], [comparison]);
  if (!comparison) return null;
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{label}</p>
        {!comparison.available && <Badge tone="neutral">not comparable yet</Badge>}
      </div>
      {comparison.available ? (
        <div className="mt-2 flex flex-wrap gap-3">
          {shown.slice(0, 5).map((c) => (
            <div key={c.key} className="min-w-[72px]">
              <p className="text-[10px] font-semibold uppercase text-ink-400">{c.key.replace(/([A-Z])/g, ' $1')}</p>
              <p className="font-display text-sm font-extrabold tabular-nums text-ink-900 dark:text-white">
                {c.current ?? '—'}
                <span className={cn('ml-1 text-[10px]', c.direction === 'up' ? 'text-emerald-600' : c.direction === 'down' ? 'text-rose-600' : 'text-ink-400')}>
                  {c.change !== null ? (c.change > 0 ? `+${c.change}` : c.change) : ''}
                </span>
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-ink-400">{comparison.note}</p>
      )}
    </Card>
  );
}

export { WIDGET_SPAN };
