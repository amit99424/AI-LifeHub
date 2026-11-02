import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Battery,
  CalendarClock,
  CheckCircle2,
  Clock,
  Flame,
  Plus,
  Quote,
  RefreshCw,
  Smile,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '@/lib/api';
import type { DashboardResponse, Insight } from '@/lib/types';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, ProgressBar, Skeleton, toast } from '@/components/ui';
import { AiConfigBanner } from '@/components/AiConfigBanner';
import { useAuth } from '@/lib/auth';
import { MOOD_META, PRIORITY_STYLES, cn, formatDate, formatMinutes, relativeTime } from '@/lib/utils';

const INSIGHT_ICON: Record<string, typeof Sparkles> = {
  PRODUCTIVITY: TrendingUp,
  HABIT: Activity,
  OVERLOAD: Battery,
  MOOD: Smile,
  JOURNAL: Quote,
  WEEKLY_SUMMARY: BarChart3,
  ROUTINE: Clock,
};

function ScoreRing({ score, band }: { score: number; band: string }) {
  const size = 132;
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const colors: Record<string, string> = {
    excellent: '#10b981',
    good: '#7f56ff',
    fair: '#f59e0b',
    low: '#f43f5e',
    'no-data': '#c5ccd8',
  };
  const color = colors[band] ?? '#7f56ff';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-ink-100 dark:stroke-ink-800" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (Math.min(100, score) / 100) * c}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-extrabold tracking-tight text-ink-900 dark:text-white">{score}</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">{band === 'no-data' ? 'no data' : band}</span>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, tone = 'brand', to }: { icon: typeof Zap; label: string; value: string; sub?: string; tone?: 'brand' | 'success' | 'warning' | 'info'; to?: string }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300',
    success: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
    warning: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
    info: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300',
  };
  const body = (
    <div className="card card-hover flex items-center gap-3.5 p-4">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
        <p className="font-display text-lg font-extrabold leading-tight text-ink-900 dark:text-white">{value}</p>
        {sub && <p className="truncate text-[11px] text-ink-500">{sub}</p>}
      </div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

function InsightCard({ insight, onDismiss, onPin }: { insight: Insight; onDismiss: () => void; onPin: () => void }) {
  const Icon = INSIGHT_ICON[insight.type] ?? Sparkles;
  const confidenceTone = insight.confidence === 'high' ? 'success' : insight.confidence === 'medium' ? 'brand' : 'warning';
  return (
    <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 transition hover:border-brand-300 dark:hover:border-brand-500/40">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="text-[13px] font-bold text-ink-900 dark:text-white">{insight.title}</h4>
            {insight.isDemo && <Badge tone="warning">Sample</Badge>}
            <Badge tone={confidenceTone as 'success' | 'brand' | 'warning'}>{insight.confidence} confidence</Badge>
            {insight.pinned && <Badge tone="brand">Pinned</Badge>}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-600 dark:text-ink-300">{insight.body}</p>
          {insight.recommendations.length > 0 && (
            <ul className="mt-2 space-y-1">
              {insight.recommendations.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-600 dark:text-ink-300">
                  <ArrowUpRight className="mt-0.5 h-3 w-3 shrink-0 text-brand-500" /> {r}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2.5 flex items-center gap-3 text-[10px] text-ink-400">
            <span>{insight.provider && insight.provider !== 'none' ? `${insight.provider}${insight.model ? ` · ${insight.model}` : ''}` : 'AI'}</span>
            <span>·</span>
            <span>{relativeTime(insight.createdAt)}</span>
            <button onClick={onPin} className="ml-auto font-semibold text-brand-600 hover:underline dark:text-brand-400">
              {insight.pinned ? 'Unpin' : 'Pin'}
            </button>
            <button onClick={onDismiss} className="font-semibold text-ink-400 hover:text-rose-600">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardResponse>('/api/analytics/dashboard'),
  });

  const { data: habitList } = useQuery({
    queryKey: ['habits'],
    queryFn: () => api.get<{ habits: { id: string; name: string; icon: string; color: string; doneToday: boolean; streak: number }[]; today: string }>('/api/habits'),
  });

  const generate = useMutation({
    mutationFn: () => api.post<{ insights: Insight[]; skipped: { type: string; reason: string }[]; errors: { type: string; message: string }[] }>('/api/ai/insights/generate', { type: 'ALL' }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['ai-status'] });
      if (res.insights.length) toast(`${res.insights.length} insight${res.insights.length > 1 ? 's' : ''} generated.`, 'success');
      else if (res.skipped.length) toast(res.skipped[0].reason, 'info');
      if (res.errors.length) toast(res.errors[0].message, 'error');
    },
    onError: (err) => toast((err as Error).message, 'error'),
  });

  const checkHabit = useMutation({
    mutationFn: (id: string) => api.post(`/api/habits/${id}/checkin`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['habits'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const insightAction = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, boolean> }) => api.patch(`/api/ai/insights/${id}`, patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['dashboard'] }),
  });

  const weeklyChart = useMemo(
    () =>
      (data?.daily ?? []).map((d) => ({
        label: new Date(`${d.date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short' }),
        date: formatDate(`${d.date}T00:00:00Z`),
        tasks: d.tasksCompleted,
        focus: Math.round((d.focusMinutes / 60) * 10) / 10,
        score: d.score,
      })),
    [data?.daily],
  );

  const moodPie = useMemo(() => {
    const dist = data?.totals.moodDistribution ?? {};
    return Object.entries(MOOD_META)
      .map(([key, meta]) => ({ name: meta.label, value: dist[key] ?? 0, color: meta.color }))
      .filter((d) => d.value > 0);
  }, [data?.totals.moodDistribution]);

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return <ErrorState message={(error as Error)?.message || 'Could not load your dashboard'} onRetry={() => void refetch()} />;
  }

  const s = data.summary;
  const score = s.score;

  return (
    <div className="space-y-5">
      {/* hero */}
      <div className="relative overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-card">
        <div className="mesh-bg pointer-events-none absolute inset-0 opacity-70" />
        <div className="relative flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-center">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-300">
                {new Date(`${data.today}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              {data.streaks.current > 0 && (
                <Badge tone="warning">
                  <Flame className="h-3 w-3" /> {data.streaks.current}-day streak
                </Badge>
              )}
              {user?.settings.demoDataLoaded && <Badge tone="warning">Sample data loaded</Badge>}
            </div>
            <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-[28px]">
              {greeting()}, {data.greetingName}.
            </h1>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-600 dark:text-ink-300">
              {data.isEmpty
                ? 'Your workspace is ready and empty. Add a task or tick a habit — everything else builds from there.'
                : score.band === 'no-data'
                  ? 'Nothing logged yet today. A task, a habit check-in or a focus session will start today’s score.'
                  : `Today’s score is ${score.score}/100. ${s.tasksCompleted} task${s.tasksCompleted === 1 ? '' : 's'} done, ${s.habitsDone}/${s.habitsActive} habits, ${formatMinutes(s.focusMinutes)} focused.`}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/tasks" className="btn-primary h-9 px-3.5 text-[13px]">
                <Plus className="h-4 w-4" /> Add task
              </Link>
              <Link to="/sessions" className="btn-secondary h-9 px-3.5 text-[13px]">
                <Timer className="h-4 w-4" /> Start focus session
              </Link>
              <Link to="/assistant" className="btn-secondary h-9 px-3.5 text-[13px]">
                <Sparkles className="h-4 w-4" /> Ask about my week
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <ScoreRing score={score.score} band={score.band} />
            <div className="hidden w-40 space-y-2 sm:block">
              {[
                { label: 'Tasks', value: score.components.tasks, icon: CheckCircle2 },
                { label: 'Habits', value: score.components.habits, icon: Activity },
                { label: 'Focus', value: score.components.focus, icon: Timer },
                { label: 'Consistency', value: score.components.consistency, icon: TrendingUp },
              ].map((c) => (
                <div key={c.label}>
                  <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-ink-500">
                    <span className="inline-flex items-center gap-1">
                      <c.icon className="h-3 w-3" /> {c.label}
                    </span>
                    <span>{c.value}</span>
                  </div>
                  <ProgressBar value={c.value} tone={c.value >= 70 ? 'success' : c.value >= 40 ? 'brand' : 'warning'} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* stat row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={CheckCircle2} label="Tasks today" value={`${s.tasksCompleted} done`} sub={`${s.tasksPending} pending · ${data.counts.IN_PROGRESS ?? 0} in progress`} tone="success" to="/tasks" />
        <StatCard icon={Activity} label="Habits" value={`${s.habitsDone}/${s.habitsActive}`} sub={s.habitsActive ? `${s.habitRate}% of today’s habits` : 'No habits yet'} tone="brand" to="/habits" />
        <StatCard icon={Flame} label="Current streak" value={`${data.streaks.current} day${data.streaks.current === 1 ? '' : 's'}`} sub={`Longest ${data.streaks.longest} days`} tone="warning" />
        <StatCard icon={Timer} label="Focus today" value={formatMinutes(s.focusMinutes)} sub={`${formatMinutes(data.totals.focusMinutes)} in 30 days`} tone="info" to="/sessions" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* weekly chart */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Last 14 days"
            subtitle="Task completions, focus hours and daily score"
            icon={<BarChart3 className="h-4.5 w-4.5" />}
            action={
              <Link to="/analytics" className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400">
                Full analytics →
              </Link>
            }
          />
          {weeklyChart.some((d) => d.tasks || d.focus) ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyChart} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gTasks" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7f56ff" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#7f56ff" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gFocus" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tickLine={false} axisLine={false} width={30} />
                  <Tooltip />
                  <Area type="monotone" dataKey="tasks" name="Tasks done" stroke="#7f56ff" strokeWidth={2} fill="url(#gTasks)" />
                  <Area type="monotone" dataKey="focus" name="Focus (h)" stroke="#3b82f6" strokeWidth={2} fill="url(#gFocus)" />
                  <Line type="monotone" dataKey="score" name="Score" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={<BarChart3 className="h-5 w-5" />}
              title="No activity in the last 14 days"
              description="Complete a task or run a focus session and this chart starts filling in automatically."
            />
          )}
        </Card>

        {/* AI insights */}
        <Card>
          <CardHeader
            title="AI insights"
            subtitle="Generated from your records"
            icon={<Sparkles className="h-4.5 w-4.5" />}
            action={
              <Button size="sm" variant="ghost" onClick={() => generate.mutate()} loading={generate.isPending} icon={<RefreshCw className="h-3.5 w-3.5" />}>
                {data.insights.length ? 'Refresh' : 'Generate'}
              </Button>
            }
          />
          <div className="space-y-2.5">
            <AiConfigBanner compact />
            {data.insights.length === 0 ? (
              <EmptyState
                icon={<Sparkles className="h-5 w-5" />}
                title="No insights yet"
                description="Insights appear once you have a few days of activity — at least 5 completed tasks or habit check-ins, and more for mood or journal analysis."
                action={
                  <Button size="sm" onClick={() => generate.mutate()} loading={generate.isPending}>
                    Generate now
                  </Button>
                }
              />
            ) : (
              data.insights.slice(0, 3).map((i) => (
                <InsightCard
                  key={i.id}
                  insight={i}
                  onDismiss={() => insightAction.mutate({ id: i.id, patch: { dismissed: true } })}
                  onPin={() => insightAction.mutate({ id: i.id, patch: { pinned: !i.pinned } })}
                />
              ))
            )}
            {data.insights.length > 0 && (
              <Link to="/assistant" className="block pt-1 text-center text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400">
                Ask the assistant for more →
              </Link>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* quick habits */}
        <Card>
          <CardHeader
            title="Today’s habits"
            subtitle={data.habitsToday.total ? `${data.habitsToday.done} of ${data.habitsToday.total} done` : 'One tap each'}
            icon={<Target className="h-4.5 w-4.5" />}
            action={
              <Link to="/habits" className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400">
                Manage
              </Link>
            }
          />
          {habitList?.habits.length ? (
            <div className="space-y-1.5">
              {habitList.habits.slice(0, 6).map((h) => (
                <button
                  key={h.id}
                  onClick={() => checkHabit.mutate(h.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition',
                    h.doneToday
                      ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/25 dark:bg-emerald-500/10'
                      : 'border-[rgb(var(--border))] hover:border-brand-300 hover:bg-brand-50/40 dark:hover:bg-brand-500/5',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition',
                      h.doneToday ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-ink-300 dark:border-ink-600',
                    )}
                  >
                    {h.doneToday && <CheckCircle2 className="h-3.5 w-3.5" />}
                  </span>
                  <span className={cn('flex-1 text-[13px] font-medium', h.doneToday ? 'text-emerald-800 line-through dark:text-emerald-300' : 'text-ink-700 dark:text-ink-200')}>
                    {h.name}
                  </span>
                  {h.streak > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                      <Flame className="h-3 w-3" /> {h.streak}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Target className="h-5 w-5" />}
              title="No habits yet"
              description="Start with one small daily habit. Checking it in takes a single click."
              action={
                <Link to="/habits" className="btn-primary h-8 px-3 text-xs">
                  <Plus className="h-3.5 w-3.5" /> Add habit
                </Link>
              }
            />
          )}
        </Card>

        {/* mood + deadlines */}
        <Card>
          <CardHeader title="Mood" subtitle="Self-reported, one tap a day" icon={<Smile className="h-4.5 w-4.5" />} action={<Link to="/mood" className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400">Log</Link>} />
          {data.mood ? (
            <div className="flex items-center gap-4">
              <div className="text-5xl">{MOOD_META[data.mood.level].emoji}</div>
              <div>
                <p className="font-display text-lg font-extrabold text-ink-900 dark:text-white">{MOOD_META[data.mood.level].label}</p>
                <p className="text-xs text-ink-500">Logged today{data.mood.focus ? ` · focus ${data.mood.focus}/5` : ''}</p>
                {data.mood.note && <p className="mt-1 line-clamp-2 text-xs italic text-ink-500">“{data.mood.note}”</p>}
              </div>
            </div>
          ) : (
            <EmptyState icon={<Smile className="h-5 w-5" />} title="Not logged today" description="Pick one of five faces — optional note, no questions." />
          )}
          {moodPie.length > 0 && (
            <div className="mt-4 flex items-center gap-2">
              <div className="h-24 w-24">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={moodPie} dataKey="value" innerRadius={26} outerRadius={44} paddingAngle={2} stroke="none">
                      {moodPie.map((m) => (
                        <Cell key={m.name} fill={m.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1">
                {moodPie.map((m) => (
                  <div key={m.name} className="flex items-center gap-1.5 text-[11px] text-ink-600 dark:text-ink-300">
                    <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
                    {m.name}
                    <span className="ml-auto font-semibold">{m.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-4 border-t border-[rgb(var(--border))] pt-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Upcoming deadlines</p>
              <CalendarClock className="h-3.5 w-3.5 text-ink-400" />
            </div>
            {data.deadlines.length ? (
              <div className="space-y-1.5">
                {data.deadlines.slice(0, 4).map((d) => (
                  <Link key={d.id} to="/tasks" className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-[12px] hover:bg-ink-50 dark:hover:bg-ink-800/60">
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', d.overdue ? 'bg-rose-500' : 'bg-brand-500')} />
                    <span className="flex-1 truncate text-ink-700 dark:text-ink-200">{d.title}</span>
                    <span className={cn('badge', PRIORITY_STYLES[d.priority])}>{d.priority}</span>
                    <span className={cn('shrink-0 text-[10px] font-semibold', d.overdue ? 'text-rose-600' : 'text-ink-400')}>
                      {d.dueDate ? formatDate(new Date(d.dueDate)) : '—'}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="py-2 text-[11px] text-ink-400">Nothing scheduled. Add a due date to a task to see it here.</p>
            )}
          </div>
        </Card>

        {/* heatmap + best time */}
        <Card>
          <CardHeader title="Consistency" subtitle="Last 5 weeks of activity" icon={<Trophy className="h-4.5 w-4.5" />} />
          <div className="grid grid-cols-7 gap-1.5">
            {data.heatmap.map((h) => {
              const levels = ['bg-ink-100 dark:bg-ink-800', 'bg-brand-100 dark:bg-brand-500/20', 'bg-brand-300 dark:bg-brand-500/40', 'bg-brand-500 dark:bg-brand-500/70', 'bg-brand-700 dark:bg-brand-400'];
              return (
                <div
                  key={h.date}
                  title={`${h.date} · score ${h.score}`}
                  className={cn('aspect-square rounded-[4px] transition hover:ring-2 hover:ring-brand-400/50', levels[h.level])}
                />
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] text-ink-400">
            <span>5 weeks ago</span>
            <span className="flex items-center gap-1">
              Less
              {[0, 1, 2, 3, 4].map((l) => (
                <span key={l} className={cn('h-2 w-2 rounded-[2px]', ['bg-ink-100 dark:bg-ink-800', 'bg-brand-100 dark:bg-brand-500/20', 'bg-brand-300 dark:bg-brand-500/40', 'bg-brand-500 dark:bg-brand-500/70', 'bg-brand-700 dark:bg-brand-400'][l])} />
              ))}
              More
            </span>
          </div>

          <div className="mt-4 border-t border-[rgb(var(--border))] pt-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-400">Completions by time of day</p>
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.hourly.filter((h) => h.hour % 3 === 0).map((h) => ({ hour: `${h.hour}:00`, completions: h.completions }))} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
                  <XAxis dataKey="hour" tickLine={false} axisLine={false} interval={1} />
                  <YAxis tickLine={false} axisLine={false} width={28} />
                  <Tooltip />
                  <Bar dataKey="completions" name="Tasks done" fill="#7f56ff" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]/60 px-4 py-2.5">
        <p className="text-[11px] text-ink-500">
          Data covers {data.daily.length} days · {data.totals.tasksCompleted} tasks completed · {formatMinutes(data.totals.focusMinutes)} focused · {data.totals.habitLogs} habit check-ins
        </p>
        <Button size="sm" variant="ghost" onClick={() => void refetch()} loading={isFetching} icon={<RefreshCw className="h-3.5 w-3.5" />}>
          Refresh
        </Button>
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Working late';
}
