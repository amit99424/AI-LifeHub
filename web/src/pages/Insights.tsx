import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, BarChart3, Clock, HeartPulse, Layers, Repeat, Sparkles, Target, TrendingUp } from 'lucide-react';
import { api, qs } from '@/lib/api';
import type { AnalyticsResponse } from '@/lib/types';
import { Badge, Card, CardHeader, EmptyState, ErrorState, ProgressBar, Skeleton } from '@/components/ui';
import { useGrowth } from '@/lib/growth';
import { formatMinutes } from '@/lib/utils';

/**
 * Insights: the visual layer over the engine.
 *
 * Every panel is built from rows the user recorded. Three rules are enforced in
 * code, not just in copy:
 *
 *   - a series with no records in the window is drawn as "Not recorded" rather
 *     than as a line along zero, because a zero is a claim and an absence is not;
 *   - a pattern is only shown when `lifeEngine` computed it with at least
 *     MIN_SAMPLE paired days, and it is worded as a tendency;
 *   - nothing here compares the user with anyone else.
 */

type Granularity = 'day' | 'week' | 'month';

const PRESETS: { value: string; label: string; days: number }[] = [
  { value: '7d', label: '7 days', days: 7 },
  { value: '30d', label: '30 days', days: 30 },
  { value: '90d', label: '90 days', days: 90 },
];

/** Tooltip that never prints a null as 0. */
function TooltipBox({ active, payload, label, unit }: { active?: boolean; payload?: { name?: string; value?: number | null; color?: string }[]; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2.5 py-2 shadow-lg">
      <p className="mb-1 text-[10.5px] font-semibold text-ink-500">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-[11px] font-medium text-ink-800 dark:text-ink-100">
          <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: {p.value === null || p.value === undefined ? 'not recorded' : `${p.value}${unit ?? ''}`}
        </p>
      ))}
    </div>
  );
}

function hasAny(values: (number | null | undefined)[]) {
  return values.some((v) => typeof v === 'number' && Number.isFinite(v));
}

export default function Insights() {
  const [preset, setPreset] = useState('30d');
  const [granularity, setGranularity] = useState<Granularity>('day');

  const analytics = useQuery({
    queryKey: ['analytics', preset],
    queryFn: () => api.get<AnalyticsResponse>(`/api/analytics${qs({ preset })}`),
  });
  // The growth summary is its own query so a slow skills read never blocks the
  // charts, and so it is fetched once per window rather than per preset.
  const growthQuery = useGrowth(90);
  const growth = growthQuery.data?.growth ?? null;

  const data = analytics.data;
  const days = data?.daily ?? [];

  const series = useMemo(() => {
    if (granularity === 'day') {
      return days.map((d) => ({
        label: d.date.slice(5),
        tasks: d.tasksCompleted,
        focus: d.focusMinutes,
        habits: d.habitsTotal > 0 ? Math.round((d.habitsDone / d.habitsTotal) * 100) : null,
        mood: d.moodScore,
        // Absent wellness is null, never 0: the chart breaks the line.
        stress: d.wellness?.stress ?? null,
        energy: d.wellness?.energy ?? null,
        sleep: d.wellness?.sleepHours ?? null,
        score: d.score,
      }));
    }
    const source = granularity === 'week' ? data?.weekly ?? [] : data?.monthly ?? [];
    return source.map((r) => ({
      label: r.label,
      tasks: r.tasksCompleted,
      focus: r.focusMinutes,
      habits: r.habitsRate,
      mood: r.avgMood,
      stress: null as number | null,
      energy: null as number | null,
      sleep: null as number | null,
      score: r.score,
    }));
  }, [granularity, days, data]);

  if (analytics.isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }
  if (analytics.isError) {
    return <ErrorState message={(analytics.error as Error).message} onRetry={() => void analytics.refetch()} />;
  }
  if (!data) return null;

  const totals = data.totals;
  const life = data.life;
  const studyWork = data.studyWork;
  const nothingRecorded =
    totals.tasksCompleted === 0 && totals.focusMinutes === 0 && totals.habitLogs === 0 && totals.avgMood === null && totals.journalEntries === 0;

  const tasksSeries = hasAny(series.map((s) => s.tasks));
  const focusSeries = hasAny(series.map((s) => s.focus));
  const habitSeries = hasAny(series.map((s) => s.habits));
  const moodSeries = hasAny(series.map((s) => s.mood));
  const stressSeries = hasAny(series.map((s) => s.stress));
  const energySeries = hasAny(series.map((s) => s.energy));
  const scoreSeries = hasAny(series.map((s) => s.score));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">Insights</h1>
          <p className="mt-0.5 text-xs text-ink-500">Your recorded data, drawn. Missing days stay missing.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex rounded-lg border border-[rgb(var(--border))] p-0.5" role="tablist" aria-label="Date range">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                role="tab"
                aria-selected={preset === p.value}
                onClick={() => setPreset(p.value)}
                className={
                  preset === p.value
                    ? 'rounded-md bg-brand-600 px-2.5 py-1.5 text-[11.5px] font-semibold text-white'
                    : 'rounded-md px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-500 hover:text-ink-800 dark:hover:text-ink-100'
                }
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-[rgb(var(--border))] p-0.5" role="tablist" aria-label="Granularity">
            {(['day', 'week', 'month'] as Granularity[]).map((g) => (
              <button
                key={g}
                role="tab"
                aria-selected={granularity === g}
                onClick={() => setGranularity(g)}
                className={
                  granularity === g
                    ? 'rounded-md bg-brand-600 px-2.5 py-1.5 text-[11.5px] font-semibold text-white'
                    : 'rounded-md px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-500 hover:text-ink-800 dark:hover:text-ink-100'
                }
              >
                {g === 'day' ? 'Daily' : g === 'week' ? 'Weekly' : 'Monthly'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {nothingRecorded && (
        <Card className="p-0">
          <EmptyState
            icon={<BarChart3 className="h-5 w-5" />}
            title="Nothing has been recorded in this range"
            description="Complete a task, log a session or check in a habit and the charts will fill in. Nothing here is estimated."
          />
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Productivity trend */}
        <Card className="p-0 lg:col-span-2">
          <CardHeader title="Productivity trend" subtitle="Your 0–100 daily score. A computed score, not a measure of worth." icon={<TrendingUp className="h-4 w-4" />} />
          <div className="px-4 pb-4">
            {!scoreSeries ? (
              <NotRecorded what="daily scores" />
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
                    <defs>
                      <linearGradient id="insScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a855f7" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,149,184,0.15)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#8b95b8" tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="#8b95b8" tickLine={false} axisLine={false} />
                    <Tooltip content={<TooltipBox />} />
                    <Area type="monotone" dataKey="score" name="Score" stroke="#a855f7" strokeWidth={2} fill="url(#insScore)" connectNulls={false} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </Card>

        {/* Task completion */}
        <Card className="p-0">
          <CardHeader title="Task completion" subtitle={`${totals.tasksCompleted} completed · ${totals.completionRate}% completion rate`} icon={<Activity className="h-4 w-4" />} />
          <div className="px-4 pb-4">
            {!tasksSeries ? (
              <NotRecorded what="completed tasks" />
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ top: 6, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,149,184,0.15)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#8b95b8" tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="#8b95b8" tickLine={false} axisLine={false} />
                    <Tooltip content={<TooltipBox />} />
                    <Bar dataKey="tasks" name="Completed" fill="#6366f1" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </Card>

        {/* Focus time */}
        <Card className="p-0">
          <CardHeader
            title="Focus, work and study time"
            subtitle={`${formatMinutes(totals.focusMinutes)} over ${totals.sessions} session${totals.sessions === 1 ? '' : 's'}`}
            icon={<Clock className="h-4 w-4" />}
          />
          <div className="px-4 pb-4">
            {!focusSeries ? (
              <NotRecorded what="focus sessions" />
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 6, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,149,184,0.15)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#8b95b8" tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#8b95b8" tickLine={false} axisLine={false} />
                    <Tooltip content={<TooltipBox unit=" min" />} />
                    <Area type="monotone" dataKey="focus" name="Minutes" stroke="#38bdf8" strokeWidth={2} fill="rgba(56,189,248,0.12)" connectNulls={false} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </Card>

        {/* Habit consistency */}
        <Card className="p-0">
          <CardHeader title="Habit consistency" subtitle={`${totals.habitLogs} check-ins · ${totals.habitsRate}% coverage`} icon={<Repeat className="h-4 w-4" />} />
          <div className="px-4 pb-4">
            {!habitSeries ? (
              <NotRecorded what="habit check-ins" />
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 6, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,149,184,0.15)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#8b95b8" tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="#8b95b8" tickLine={false} axisLine={false} />
                    <Tooltip content={<TooltipBox unit="%" />} />
                    <Line type="monotone" dataKey="habits" name="Coverage" stroke="#3ddc97" strokeWidth={2} dot={false} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </Card>

        {/* Wellness */}
        <Card className="p-0">
          <CardHeader title="Wellness" subtitle="Mood, stress, energy and sleep, as recorded" icon={<HeartPulse className="h-4 w-4" />} />
          <div className="px-4 pb-4">
            {!moodSeries && !stressSeries && !energySeries ? (
              <NotRecorded what="wellness check-ins" />
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 6, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,149,184,0.15)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#8b95b8" tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} stroke="#8b95b8" tickLine={false} axisLine={false} />
                    <Tooltip content={<TooltipBox />} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    {moodSeries && <Line type="monotone" dataKey="mood" name="Mood" stroke="#a855f7" strokeWidth={2} dot={false} connectNulls={false} />}
                    {energySeries && <Line type="monotone" dataKey="energy" name="Energy" stroke="#38bdf8" strokeWidth={2} dot={false} connectNulls={false} />}
                    {stressSeries && <Line type="monotone" dataKey="stress" name="Stress" stroke="#ff6b81" strokeWidth={2} dot={false} connectNulls={false} />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Goals and projects */}
      <Card className="p-0">
        <CardHeader title="Goals and projects" subtitle="Progress is derived from records, never typed in" icon={<Target className="h-4 w-4" />} />
        <div className="grid gap-4 px-4 pb-4 lg:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">Goals</p>
            {(studyWork?.goals ?? []).length === 0 ? (
              <p className="text-[11.5px] text-ink-500">No active goals.</p>
            ) : (
              <ul className="space-y-2">
                {(studyWork?.goals ?? []).map((g) => (
                  <li key={g.id}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[12px] font-semibold text-ink-800 dark:text-ink-100">{g.title}</span>
                      <span className="shrink-0 text-[10.5px] text-ink-500">
                        {g.current ?? 'not recorded'} / {g.target ?? 'no target'}
                      </span>
                    </div>
                    {goalFraction(g) === null ? (
                      <p className="text-[10px] text-ink-400">No target number, so no percentage.</p>
                    ) : (
                      <ProgressBar value={goalFraction(g)!} className="mt-1" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1.5 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">
              <Layers className="h-3 w-3" /> Projects
            </p>
            {(studyWork?.projects ?? []).length === 0 ? (
              <p className="text-[11.5px] text-ink-500">No active projects.</p>
            ) : (
              <ul className="space-y-2">
                {(studyWork?.projects ?? []).map((p) => (
                  <li key={p.id}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[12px] font-semibold text-ink-800 dark:text-ink-100">{p.title}</span>
                      <span className="shrink-0 text-[10.5px] text-ink-500">
                        {p.tasks} task{p.tasks === 1 ? '' : 's'}
                      </span>
                    </div>
                    {p.tasks === 0 && (
                      <p className="text-[10px] text-ink-400">No tasks yet, so no percentage.</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>

      {/* Skills */}
      <Card className="p-0">
        <CardHeader title="Skill development" subtitle="Practice minutes come only from recorded updates" icon={<Sparkles className="h-4 w-4" />} />
        <div className="px-4 pb-4">
          {growthQuery.isPending && <Skeleton className="h-16 w-full" />}
          {!growthQuery.isPending && (growth?.perSkill ?? []).length === 0 && <p className="text-[11.5px] text-ink-500">No skills are tracked yet.</p>}
          {(growth?.perSkill ?? []).length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {(growth?.perSkill ?? []).map((s) => (
                <li key={s.skillId} className="rounded-xl border border-[rgb(var(--border))] px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12px] font-semibold text-ink-800 dark:text-ink-100">{s.name}</span>
                    <Badge tone="brand">{s.currentLevel.toLowerCase()}</Badge>
                  </div>
                  <p className="mt-0.5 text-[10.5px] text-ink-500">
                    {s.practiceMinutes} min on {s.practiceDays} day(s)
                    {s.levelsGainedInWindow > 0 ? ` · ${s.levelsGainedInWindow} level change(s)` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* Patterns, with the engine's own guard rails */}
      <Card className="p-0">
        <CardHeader
          title="Patterns"
          subtitle="Only shown with at least 14 paired days. These are tendencies, not causes."
          icon={<BarChart3 className="h-4 w-4" />}
        />
        <div className="px-4 pb-4">
          {(life?.correlations.correlations ?? []).length === 0 ? (
            <p className="text-[11.5px] leading-relaxed text-ink-500">
              No pattern has enough paired days yet.
              {(life?.correlations.withheld ?? []).length > 0 && (
                <> Withheld: {life!.correlations.withheld.map((w) => `${w.xLabel} vs ${w.yLabel} (${w.n} days)`).join('; ')}.</>
              )}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {life!.correlations.correlations.map((c) => (
                <li key={c.key} className="flex items-start gap-2 rounded-xl border border-[rgb(var(--border))] px-3 py-2">
                  <Badge tone={c.strength === 'strong' ? 'brand' : c.strength === 'moderate' ? 'neutral' : 'neutral'}>{c.strength}</Badge>
                  <div className="min-w-0">
                    <p className="text-[11.5px] leading-relaxed text-ink-700 dark:text-ink-200">{c.sentence}</p>
                    <p className="text-[10px] text-ink-400">
                      r = {c.r} over {c.n} paired days
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

/** A goal's percentage, or null when it has no target to measure against. */
function goalFraction(g: { current: number | null; target: number | null }): number | null {
  if (g.target === null || g.target <= 0 || g.current === null) return null;
  return Math.min(100, Math.round((g.current / g.target) * 100));
}

function NotRecorded({ what }: { what: string }) {
  return (
    <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-[rgb(var(--border))] px-4 text-center">
      <p className="text-[12px] font-semibold text-ink-600 dark:text-ink-300">Not recorded</p>
      <p className="mt-0.5 text-[10.5px] text-ink-400">No {what} in this range. This is an absence, not a zero.</p>
    </div>
  );
}
