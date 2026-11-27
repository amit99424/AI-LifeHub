import { useMemo, useState } from 'react';
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
  HeartPulse,
  Plus,
  Quote,
  RefreshCw,
  Settings2,
  Eye,
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
import type { DashboardResponse, Insight, WidgetId } from '@/lib/types';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, ProgressBar, Skeleton, toast } from '@/components/ui';
import { AiConfigBanner } from '@/components/AiConfigBanner';
import { useAuth } from '@/lib/auth';
import { MOOD_META, PRIORITY_STYLES, cn, formatDate, formatMinutes, relativeTime } from '@/lib/utils';
import { ComparisonStrip, DashboardCustomiser, DashboardWidget, WIDGET_SPAN } from '@/components/dashboard/Widgets';

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
  const [customising, setCustomising] = useState(false);

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
  // The server resolved the widget list (occupation default merged with the
  // person's saved layout). The page renders it; it never reorders anything.
  const widgets: WidgetId[] = data.widgets ?? data.occupation.profile.widgets;

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

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-500 dark:text-ink-400">
              <span className="rounded-full border border-[rgb(var(--border))] px-2.5 py-1 font-semibold">
                {data.occupation.displayName}
              </span>
              {data.occupation.needsConfirmation ? (
                <span>
                  We inferred this from your old profile.{' '}
                  <Link to="/settings" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
                    Is that right?
                  </Link>
                </span>
              ) : (
                <span>Your dashboard and insights are tuned for this.</span>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/tasks" className="btn-primary h-9 px-3.5 text-[13px]">
                <Plus className="h-4 w-4" /> Add task
              </Link>
              <Link to="/sessions" className="btn-secondary h-9 px-3.5 text-[13px]">
                <Timer className="h-4 w-4" /> Start focus session
              </Link>
              <Link to="/wellness" className="btn-secondary h-9 px-3.5 text-[13px]">
                <HeartPulse className="h-4 w-4" /> Log wellness
              </Link>
              <Link to="/assistant" className="btn-secondary h-9 px-3.5 text-[13px]">
                <Sparkles className="h-4 w-4" /> Ask about my week
              </Link>
              <button onClick={() => setCustomising((c) => !c)} className="btn-secondary h-9 px-3.5 text-[13px]">
                <Settings2 className="h-4 w-4" /> Customise
              </button>
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

      {/* comparisons: the same numbers the analysis reads */}
      {data.comparisons && (
        <div className="grid gap-3 sm:grid-cols-3">
          <ComparisonStrip label="Today vs yesterday" comparison={data.comparisons.day} />
          <ComparisonStrip label="This week vs last" comparison={data.comparisons.week} />
          <ComparisonStrip label="This month vs last" comparison={data.comparisons.month} />
        </div>
      )}

      {customising && <DashboardCustomiser widgets={widgets} onClose={() => setCustomising(false)} />}

      {/* widget grid, in the order the server resolved */}
      <div className="grid gap-3 lg:grid-cols-3">
        {widgets.map((id) => (
          <div key={id} className={WIDGET_SPAN[id] ?? 'lg:col-span-1'}>
            <DashboardWidget
              id={id}
              data={data}
              onInsightAction={(iid, patch) => insightAction.mutate({ id: iid, patch })}
              onGenerate={() => generate.mutate()}
              generating={generate.isPending}
            />
          </div>
        ))}
      </div>

      {widgets.length === 0 && (
        <Card className="p-6">
          <EmptyState
            icon={<Eye className="h-5 w-5" />}
            title="Every widget is hidden"
            description="Nothing is selected to show. Open the customiser and switch a few back on — the daily overview is a good place to start."
            action={<Button onClick={() => setCustomising(true)}>Customise dashboard</Button>}
          />
        </Card>
      )}

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
