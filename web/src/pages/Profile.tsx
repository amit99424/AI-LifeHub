import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Activity, BarChart3, CheckCircle2, Clock, Flame, Sparkles, TrendingUp, Trophy } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth, useProfile } from '@/lib/auth';
import type { AnalyticsResponse, DashboardResponse } from '@/lib/types';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui';
import { formatDate, formatMinutes, initials } from '@/lib/utils';

export default function Profile() {
  const { user } = useAuth();
  const profile = useProfile();

  const analytics = useQuery({
    queryKey: ['profile-analytics'],
    queryFn: () => api.get<AnalyticsResponse>('/api/analytics?preset=90d'),
  });

  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardResponse>('/api/analytics/dashboard'),
  });

  const achievements = useMemo(() => {
    const d = dashboard.data;
    if (!d) return [];
    return [
      { label: 'First task completed', earned: d.totals.tasksCompleted >= 1, icon: CheckCircle2 },
      { label: '10 tasks completed', earned: d.totals.tasksCompleted >= 10, icon: CheckCircle2 },
      { label: '7-day streak', earned: d.streaks.longest >= 7, icon: Flame },
      { label: '30-day streak', earned: d.streaks.longest >= 30, icon: Flame },
      { label: '10 hours focused', earned: d.totals.focusMinutes >= 600, icon: Clock },
      { label: 'First journal entry', earned: d.totals.journalEntries >= 1, icon: Sparkles },
    ];
  }, [dashboard.data]);

  const p = profile.data;
  const t = analytics.data?.totals;

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden">
        <div className="mesh-bg pointer-events-none absolute inset-0 opacity-70" />
        <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-blue-500 text-xl font-extrabold text-white shadow-glow">
            {initials(user?.name ?? 'U')}
          </div>
          <div className="flex-1">
            <h1 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">{user?.name}</h1>
            <p className="text-xs text-ink-500">{user?.email}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p?.profile.primaryGoal && <Badge tone="brand">{p.profile.primaryGoal}</Badge>}
              {p?.profile.occupation && <Badge tone="info">{p.profile.occupation}</Badge>}
              <Badge tone="neutral">{p?.profile.timezone ?? 'UTC'}</Badge>
              <Badge tone="neutral">Member since {formatDate(user?.createdAt ?? new Date(), { year: 'numeric' })}</Badge>
            </div>
          </div>
          <Link to="/settings" className="btn-secondary h-9 px-3.5 text-[13px]">
            Edit profile
          </Link>
        </div>
      </Card>

      {profile.isPending ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Tasks logged', value: p?.counts.tasks ?? 0, icon: CheckCircle2 },
            { label: 'Habit check-ins', value: p?.counts.habitLogs ?? 0, icon: Activity },
            { label: 'Focus sessions', value: p?.counts.workSessions ?? 0, icon: Clock },
            { label: 'Journal entries', value: p?.counts.journalEntries ?? 0, icon: Sparkles },
          ].map((s) => (
            <div key={s.label} className="card flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{s.label}</p>
                <p className="font-display text-lg font-extrabold text-ink-900 dark:text-white">{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Last 90 days" subtitle="Your personal best and averages" icon={<BarChart3 className="h-4.5 w-4.5" />} />
          {analytics.isPending || !t ? (
            <Skeleton className="h-40" />
          ) : (
            <div className="space-y-2.5">
              {[
                { label: 'Task completion rate', value: `${t.completionRate}%` },
                { label: 'Tasks completed', value: `${t.tasksCompleted}` },
                { label: 'Habit consistency', value: `${t.habitsRate}%` },
                { label: 'Focus time', value: formatMinutes(t.focusMinutes) },
                { label: 'Sessions', value: `${t.sessions} · avg ${t.avgSessionMinutes}m` },
                { label: 'Average mood', value: t.avgMood ? `${t.avgMood}/5` : '—' },
                { label: 'Current streak', value: `${analytics.data?.streaks.current ?? 0} days` },
                { label: 'Longest streak', value: `${analytics.data?.streaks.longest ?? 0} days` },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between border-b border-[rgb(var(--border))] pb-2 text-[12px] last:border-0 last:pb-0">
                  <span className="text-ink-600 dark:text-ink-300">{row.label}</span>
                  <span className="font-bold text-ink-900 dark:text-white">{row.value}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Milestones" subtitle="Earned from real activity in your account" icon={<Trophy className="h-4.5 w-4.5" />} />
          <div className="grid grid-cols-2 gap-2">
            {achievements.map((a) => (
              <div
                key={a.label}
                className={`flex items-center gap-2 rounded-xl border p-2.5 ${a.earned ? 'border-brand-200 bg-brand-50/70 dark:border-brand-500/30 dark:bg-brand-500/10' : 'border-dashed border-[rgb(var(--border))] opacity-60'}`}
              >
                <a.icon className={`h-4 w-4 shrink-0 ${a.earned ? 'text-brand-600 dark:text-brand-300' : 'text-ink-400'}`} />
                <span className={`text-[11px] font-semibold leading-tight ${a.earned ? 'text-brand-800 dark:text-brand-200' : 'text-ink-500'}`}>{a.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-ink-50 px-2.5 py-2 text-[11px] text-ink-500 dark:bg-ink-800/50">
            <TrendingUp className="h-3.5 w-3.5" />
            {dashboard.data?.insights.length ? `${dashboard.data.insights.length} AI insight${dashboard.data.insights.length > 1 ? 's' : ''} ready on your dashboard.` : 'Generate insights from the dashboard once you have a few days of data.'}
          </div>
        </Card>
      </div>
    </div>
  );
}
