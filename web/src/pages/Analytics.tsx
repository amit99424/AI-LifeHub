import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, CalendarRange, CheckCircle2, Clock, Flame, Smile, Timer, TrendingUp } from 'lucide-react';
import { api, qs } from '@/lib/api';
import type { AnalyticsResponse } from '@/lib/types';
import { Badge, Card, CardHeader, EmptyState, ErrorState, ProgressBar, Select, Skeleton } from '@/components/ui';
import { MOOD_META, cn, formatDate, formatMinutes, todayIsoLocal } from '@/lib/utils';

const PRESETS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom range' },
];

export default function Analytics() {
  const [preset, setPreset] = useState('30d');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(todayIsoLocal());

  const query = useQuery({
    queryKey: ['analytics', preset, from, to],
    queryFn: () => api.get<AnalyticsResponse>(`/api/analytics${qs({ preset, from: preset === 'custom' ? from : undefined, to: preset === 'custom' ? to : undefined })}`),
  });

  const data = query.data;

  const dailyChart = useMemo(
    () =>
      (data?.daily ?? []).map((d) => ({
        label: new Date(`${d.date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        tasks: d.tasksCompleted,
        focus: Math.round((d.focusMinutes / 60) * 10) / 10,
        score: d.score,
        habits: d.habitsDone,
      })),
    [data?.daily],
  );

  const moodDist = useMemo(() => {
    const dist = data?.totals.moodDistribution ?? {};
    return Object.entries(MOOD_META)
      .map(([k, m]) => ({ name: m.label, value: dist[k] ?? 0, color: m.color }))
      .filter((d) => d.value > 0);
  }, [data?.totals.moodDistribution]);

  const radar = useMemo(() => {
    if (!data) return [];
    const t = data.totals;
    return [
      { subject: 'Task rate', value: Math.min(100, t.completionRate) },
      { subject: 'Habit rate', value: Math.min(100, t.habitsRate) },
      { subject: 'Focus', value: Math.min(100, Math.round((t.focusMinutes / Math.max(1, data.range.days * 60)) * 100)) },
      { subject: 'On time', value: Math.min(100, Math.round(((t.tasksCompleted - t.completedLate) / Math.max(1, t.tasksCompleted)) * 100)) },
      { subject: 'Mood', value: t.avgMood ? Math.round((t.avgMood / 5) * 100) : 0 },
    ];
  }, [data]);

  if (query.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (query.isError || !data) {
    return <ErrorState message={(query.error as Error)?.message || 'Could not load analytics'} onRetry={() => void query.refetch()} />;
  }

  const t = data.totals;
  const hasData = t.tasksCompleted + t.habitLogs + t.sessions > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">Analytics</h1>
          <p className="mt-0.5 text-xs text-ink-500">
            {formatDate(`${data.range.from}T00:00:00Z`, { year: 'numeric' })} → {formatDate(`${data.range.to}T00:00:00Z`, { year: 'numeric' })} · {data.range.days} days
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={preset} onChange={(e) => setPreset(e.target.value)} className="w-auto">
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
          {preset === 'custom' && (
            <>
              <input type="date" className="input w-auto" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
              <span className="text-xs text-ink-400">to</span>
              <input type="date" className="input w-auto" value={to} max={todayIsoLocal()} onChange={(e) => setTo(e.target.value)} />
            </>
          )}
        </div>
      </div>

      {!hasData ? (
        <EmptyState
          icon={<BarChart3 className="h-5 w-5" />}
          title="No data in this range"
          description="Analytics are computed from your real records. Complete a task, check in a habit or run a focus session — or widen the date range."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={CheckCircle2} label="Task completion" value={`${t.completionRate}%`} sub={`${t.tasksCompleted} of ${t.tasksCreated} created`} tone="brand" />
            <Kpi icon={Flame} label="Habit consistency" value={`${t.habitsRate}%`} sub={`${t.habitLogs} check-ins`} tone="success" />
            <Kpi icon={Timer} label="Focus time" value={formatMinutes(t.focusMinutes)} sub={`${t.sessions} sessions · avg ${t.avgSessionMinutes}m`} tone="info" />
            <Kpi icon={Smile} label="Average mood" value={t.avgMood ? `${t.avgMood}/5` : '—'} sub={t.overdueOpen ? `${t.overdueOpen} overdue tasks` : 'No overdue tasks'} tone="warning" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Productivity trend" subtitle="Daily task completions, focus hours and weighted score" icon={<TrendingUp className="h-4.5 w-4.5" />} />
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyChart} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="aTasks" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7f56ff" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#7f56ff" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="aFocus" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={22} interval="preserveStartEnd" />
                    <YAxis tickLine={false} axisLine={false} width={30} />
                    <Tooltip />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="tasks" name="Tasks done" stroke="#7f56ff" strokeWidth={2} fill="url(#aTasks)" />
                    <Area type="monotone" dataKey="focus" name="Focus (h)" stroke="#3b82f6" strokeWidth={2} fill="url(#aFocus)" />
                    <Line type="monotone" dataKey="score" name="Score" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <CardHeader title="Balance" subtitle="Each axis normalised to 0-100" />
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radar} outerRadius="72%">
                    <PolarGrid stroke="rgb(var(--border))" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: 'rgb(var(--muted))' }} />
                    <Radar dataKey="value" stroke="#7f56ff" fill="#7f56ff" fillOpacity={0.28} />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Weekly rollup" subtitle="Tasks, focus minutes, habit rate and mood by week" icon={<CalendarRange className="h-4.5 w-4.5" />} />
              {data.weekly.length ? (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.weekly} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} width={30} />
                      <Tooltip />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="tasksCompleted" name="Tasks" fill="#7f56ff" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="focusMinutes" name="Focus min" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="habitsRate" name="Habit %" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState icon={<CalendarRange className="h-5 w-5" />} title="No weeks in range" description="Widen the range to see weekly rollups." />
              )}
            </Card>

            <Card>
              <CardHeader title="Monthly rollup" subtitle="Longer-view trend" icon={<BarChart3 className="h-4.5 w-4.5" />} />
              {data.monthly.length ? (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.monthly} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} width={30} />
                      <Tooltip />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="tasksCompleted" name="Tasks" stroke="#7f56ff" strokeWidth={2.5} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="score" name="Score" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="avgMood" name="Mood" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState icon={<BarChart3 className="h-5 w-5" />} title="No months in range" description="Pick a longer preset such as 90 days." />
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader title="Mood distribution" subtitle={t.avgMood ? `Average ${t.avgMood}/5` : 'No mood data'} />
              {moodDist.length ? (
                <>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={moodDist} dataKey="value" innerRadius={40} outerRadius={64} paddingAngle={3} stroke="none">
                          {moodDist.map((m) => (
                            <Cell key={m.name} fill={m.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 space-y-1">
                    {moodDist.map((m) => (
                      <div key={m.name} className="flex items-center gap-2 text-[11px]">
                        <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
                        <span className="text-ink-600 dark:text-ink-300">{m.name}</span>
                        <span className="ml-auto font-semibold">{m.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="py-8 text-center text-xs text-ink-400">Log moods to see the distribution.</p>
              )}
            </Card>

            <Card>
              <CardHeader title="When you complete tasks" subtitle="Completions by hour of day" icon={<Clock className="h-4.5 w-4.5" />} />
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.hourly.map((h) => ({ hour: h.hour, completions: h.completions }))} margin={{ top: 0, right: 4, left: -28, bottom: 0 }}>
                    <XAxis dataKey="hour" tickLine={false} axisLine={false} interval={3} />
                    <YAxis tickLine={false} axisLine={false} width={28} />
                    <Tooltip />
                    <Bar dataKey="completions" name="Tasks" fill="#7f56ff" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-[11px] text-ink-500">Weekday pattern</p>
              <div className="mt-1.5 space-y-1">
                {[...data.weekday].sort((a, b) => b.completions - a.completions).slice(0, 3).map((d) => (
                  <div key={d.day} className="flex items-center gap-2 text-[11px]">
                    <span className="w-8 font-semibold text-ink-700 dark:text-ink-200">{d.day}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${(d.completions / Math.max(1, ...data.weekday.map((w) => w.completions))) * 100}%` }} />
                    </div>
                    <span className="w-6 text-right text-ink-500">{d.completions}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader title="Task health" subtitle="Priority mix and overdue load" />
              <div className="space-y-2">
                {data.priorities.map((p) => (
                  <div key={p.priority}>
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-ink-700 dark:text-ink-200">{p.priority.toLowerCase()}</span>
                      <span className="text-ink-500">
                        {p.open} open · {p.completed} done
                      </span>
                    </div>
                    <ProgressBar value={(p.completed / Math.max(1, p.completed + p.open)) * 100} tone={p.priority === 'URGENT' ? 'danger' : p.priority === 'HIGH' ? 'warning' : 'brand'} />
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-[rgb(var(--border))] p-2.5 text-center">
                  <p className="font-display text-base font-extrabold text-rose-600">{t.overdueOpen}</p>
                  <p className="text-[10px] uppercase tracking-wide text-ink-400">Overdue open</p>
                </div>
                <div className="rounded-lg border border-[rgb(var(--border))] p-2.5 text-center">
                  <p className="font-display text-base font-extrabold text-amber-600">{t.completedLate}</p>
                  <p className="text-[10px] uppercase tracking-wide text-ink-400">Finished late</p>
                </div>
              </div>
              {t.avgSleepHours != null && (
                <div className="mt-3 flex items-center justify-between border-t border-[rgb(var(--border))] pt-2.5 text-[11px] text-ink-500">
                  <span>Avg sleep</span>
                  <span className="font-bold text-ink-800 dark:text-ink-100">{t.avgSleepHours}h</span>
                </div>
              )}
              {t.avgScreenHours != null && (
                <div className="mt-1 flex items-center justify-between text-[11px] text-ink-500">
                  <span>Avg screen time</span>
                  <span className="font-bold text-ink-800 dark:text-ink-100">{t.avgScreenHours}h</span>
                </div>
              )}
            </Card>
          </div>

          <Card>
            <CardHeader title="Activity heatmap" subtitle={`${data.heatmap.length} days · darker means a higher daily score`} />
            <div className="grid grid-cols-[repeat(auto-fill,minmax(14px,1fr))] gap-1.5">
              {data.heatmap.map((h) => {
                const levels = ['bg-ink-100 dark:bg-ink-800', 'bg-brand-100 dark:bg-brand-500/20', 'bg-brand-300 dark:bg-brand-500/40', 'bg-brand-500 dark:bg-brand-500/70', 'bg-brand-700 dark:bg-brand-400'];
                return <div key={h.date} title={`${h.date} · score ${h.score}`} className={cn('aspect-square rounded-[3px] transition hover:ring-2 hover:ring-brand-400/60', levels[h.level])} />;
              })}
            </div>
            <div className="mt-3 flex items-center justify-between text-[10px] text-ink-400">
              <span>{data.range.from}</span>
              <span className="flex items-center gap-1">
                Less
                {[0, 1, 2, 3, 4].map((l) => (
                  <span key={l} className={cn('h-2.5 w-2.5 rounded-[2px]', ['bg-ink-100 dark:bg-ink-800', 'bg-brand-100 dark:bg-brand-500/20', 'bg-brand-300 dark:bg-brand-500/40', 'bg-brand-500 dark:bg-brand-500/70', 'bg-brand-700 dark:bg-brand-400'][l])} />
                ))}
                More
              </span>
              <span>{data.range.to}</span>
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]/60 px-4 py-2.5 text-[11px] text-ink-500">
            <Badge tone="brand">{data.streaks.current}-day current streak</Badge>
            <Badge tone="neutral">Longest {data.streaks.longest} days</Badge>
            <span>·</span>
            <span>{t.journalEntries} journal entries · {t.routineDays} routine days logged</span>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone }: { icon: typeof Timer; label: string; value: string; sub: string; tone: 'brand' | 'success' | 'info' | 'warning' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300',
    success: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
    info: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300',
    warning: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
  };
  return (
    <div className="card flex items-center gap-3.5 p-4">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
        <p className="font-display text-lg font-extrabold leading-tight text-ink-900 dark:text-white">{value}</p>
        <p className="truncate text-[11px] text-ink-500">{sub}</p>
      </div>
    </div>
  );
}
