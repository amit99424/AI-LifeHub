import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CircleDot, Clock, Pause, Play, Plus, Square, Timer, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { SessionCategory, SessionsResponse } from '@/lib/types';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, Modal, Select, Skeleton, toast } from '@/components/ui';
import { CATEGORY_META, cn, formatClock, formatDate, formatMinutes, relativeTime } from '@/lib/utils';

const CATEGORIES = Object.keys(CATEGORY_META) as SessionCategory[];

export default function Sessions() {
  const qc = useQueryClient();
  const [tick, setTick] = useState(0);
  const [manual, setManual] = useState<{ category: SessionCategory; minutes: number; label: string; date: string } | null>(null);
  const [stopModal, setStopModal] = useState(false);
  const [focusScore, setFocusScore] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [startForm, setStartForm] = useState<{ category: SessionCategory; label: string }>({ category: 'STUDYING', label: '' });

  const query = useQuery({ queryKey: ['sessions'], queryFn: () => api.get<SessionsResponse>('/api/sessions?days=30') });

  // live ticker for the running session
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['sessions'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['analytics'] });
  };

  const start = useMutation({
    mutationFn: (body: { category: SessionCategory; label?: string }) => api.post('/api/sessions/start', body),
    onSuccess: () => {
      invalidate();
      setStarting(false);
      toast('Session started — the timer runs on the server.', 'success');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const pause = useMutation({ mutationFn: (id: string) => api.post(`/api/sessions/${id}/pause`), onSuccess: invalidate, onError: (e) => toast((e as Error).message, 'error') });
  const resume = useMutation({ mutationFn: (id: string) => api.post(`/api/sessions/${id}/resume`), onSuccess: invalidate, onError: (e) => toast((e as Error).message, 'error') });
  const stop = useMutation({
    mutationFn: ({ id, score }: { id: string; score: number | null }) => api.post(`/api/sessions/${id}/stop`, score ? { focusScore: score } : {}),
    onSuccess: () => {
      invalidate();
      setStopModal(false);
      setFocusScore(null);
      toast('Session saved with its duration.', 'success');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const addManual = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/api/sessions/manual', body),
    onSuccess: () => {
      invalidate();
      setManual(null);
      toast('Session added.', 'success');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/api/sessions/${id}`), onSuccess: invalidate });

  const active = query.data?.active;
  const elapsed = useMemo(() => {
    if (!active) return 0;
    if (active.status === 'PAUSED' && active.pausedAt) return Math.max(0, Math.round((new Date(active.pausedAt).getTime() - new Date(active.startedAt).getTime() - active.pausedMs) / 1000));
    return Math.max(0, Math.round((Date.now() - new Date(active.startedAt).getTime() - active.pausedMs) / 1000));
  }, [active, tick]);

  const dailyChart = (query.data?.daily ?? []).map((d) => ({ date: formatDate(`${d.date}T00:00:00Z`), minutes: d.minutes }));
  const categoryChart = Object.entries(query.data?.stats.byCategory ?? {}).map(([k, v]) => ({ name: CATEGORY_META[k]?.label ?? k, minutes: v, color: CATEGORY_META[k]?.color ?? '#7f56ff' }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">Study and work sessions</h1>
          <p className="mt-0.5 text-xs text-ink-500">Start the timer, work, stop. Duration is recorded automatically — no manual hours.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setManual({ category: 'STUDYING', minutes: 45, label: '', date: new Date().toISOString().slice(0, 10) })} icon={<Plus className="h-4 w-4" />}>
          Add past session
        </Button>
      </div>

      {/* timer */}
      <Card className={cn('relative overflow-hidden', active && 'ring-1 ring-brand-400/50')}>
        <div className={cn('pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full blur-3xl', active ? 'bg-brand-500/20' : 'bg-brand-500/5')} />
        <div className="relative flex flex-col items-center gap-4 py-4 sm:flex-row sm:justify-between sm:py-2">
          <div className="flex items-center gap-4">
            <div className={cn('flex h-14 w-14 items-center justify-center rounded-2xl', active ? 'bg-brand-600 text-white animate-pulse-ring' : 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300')}>
              <Timer className="h-7 w-7" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">
                {active ? (active.status === 'PAUSED' ? 'Paused' : 'Session in progress') : 'Ready when you are'}
              </p>
              <p className="font-display text-4xl font-extrabold tabular-nums tracking-tight text-ink-900 dark:text-white">{formatClock(elapsed)}</p>
              {active && (
                <p className="mt-0.5 text-xs text-ink-500">
                  {CATEGORY_META[active.category]?.label}
                  {active.label ? ` · ${active.label}` : ''} · started {relativeTime(active.startedAt)}
                </p>
              )}
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:w-auto">
            {!active ? (
              <>
                <Select
                  className="w-auto min-w-[150px]"
                  value={startForm.category}
                  onChange={(e) => setStartForm((f) => ({ ...f, category: e.target.value as SessionCategory }))}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_META[c].label}
                    </option>
                  ))}
                </Select>
                <Button loading={start.isPending} onClick={() => start.mutate({ category: startForm.category, label: startForm.label || undefined })} icon={<Play className="h-4 w-4" />}>
                  Start session
                </Button>
              </>
            ) : (
              <>
                {active.status === 'RUNNING' ? (
                  <Button variant="secondary" loading={pause.isPending} onClick={() => pause.mutate(active.id)} icon={<Pause className="h-4 w-4" />}>
                    Pause
                  </Button>
                ) : (
                  <Button variant="secondary" loading={resume.isPending} onClick={() => resume.mutate(active.id)} icon={<Play className="h-4 w-4" />}>
                    Resume
                  </Button>
                )}
                <Button variant="danger" onClick={() => setStopModal(true)} icon={<Square className="h-4 w-4" />}>
                  Stop and save
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Today', value: formatMinutes(query.data?.stats.todayMinutes ?? 0), icon: Clock, tone: 'brand' },
          { label: 'Last 30 days', value: formatMinutes(query.data?.stats.totalMinutes ?? 0), icon: Timer, tone: 'info' },
          { label: 'Sessions', value: String(query.data?.stats.totalSessions ?? 0), icon: CircleDot, tone: 'success' },
          { label: 'Avg session', value: formatMinutes(query.data?.stats.avgSessionMinutes ?? 0), icon: Clock, tone: 'warning' },
        ].map((s) => (
          <div key={s.label} className="card flex items-center gap-3 p-4">
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', s.tone === 'brand' ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/10' : s.tone === 'info' ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10' : s.tone === 'success' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10' : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10')}>
              <s.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{s.label}</p>
              <p className="font-display text-lg font-extrabold text-ink-900 dark:text-white">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {query.isPending ? (
        <Skeleton className="h-64" />
      ) : query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Focus minutes per day" subtitle="Last 30 days, completed sessions only" />
            {dailyChart.some((d) => d.minutes > 0) ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyChart} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={20} />
                    <YAxis tickLine={false} axisLine={false} width={30} />
                    <Tooltip />
                    <Bar dataKey="minutes" name="Minutes" fill="#7f56ff" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState icon={<Timer className="h-5 w-5" />} title="No sessions yet" description="Hit Start above and work as you normally would. The timer captures the duration for you." />
            )}
          </Card>

          <Card>
            <CardHeader title="By category" subtitle="Minutes in the last 30 days" />
            {categoryChart.length ? (
              <div className="space-y-2.5">
                {categoryChart.sort((a, b) => b.minutes - a.minutes).map((c) => {
                  const max = Math.max(...categoryChart.map((x) => x.minutes));
                  return (
                    <div key={c.name}>
                      <div className="mb-1 flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-ink-700 dark:text-ink-200">{c.name}</span>
                        <span className="text-ink-500">{formatMinutes(c.minutes)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                        <div className="h-full rounded-full" style={{ width: `${(c.minutes / max) * 100}%`, background: c.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-6 text-center text-xs text-ink-400">Category breakdown appears after your first session.</p>
            )}
            {query.data?.stats.avgFocus != null && (
              <p className="mt-4 border-t border-[rgb(var(--border))] pt-3 text-[11px] text-ink-500">
                Average self-rated focus: <span className="font-bold text-ink-800 dark:text-ink-100">{query.data.stats.avgFocus}/5</span>
              </p>
            )}
          </Card>
        </div>
      )}

      {query.data && query.data.history.length > 0 && (
        <Card>
          <CardHeader title="Session history" subtitle={`${query.data.history.length} completed sessions in the last 30 days`} />
          <div className="divide-y divide-[rgb(var(--border))]">
            {query.data.history.slice(0, 30).map((s) => (
              <div key={s.id} className="flex items-center gap-3 py-2.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CATEGORY_META[s.category]?.color ?? '#7f56ff' }} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-ink-900 dark:text-white">{CATEGORY_META[s.category]?.label ?? s.category}</span>
                    {s.label && <span className="text-[11px] text-ink-500">· {s.label}</span>}
                    {s.isDemo && <Badge tone="warning">Sample</Badge>}
                    {s.focusScore && <Badge tone="brand">focus {s.focusScore}/5</Badge>}
                  </div>
                  <p className="text-[11px] text-ink-400">
                    {formatDate(new Date(s.startedAt), { weekday: 'short', year: 'numeric' })} · {new Date(s.startedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · {formatClock(s.durationSec)}
                  </p>
                </div>
                <span className="text-[13px] font-bold tabular-nums text-ink-700 dark:text-ink-200">{formatMinutes(Math.round(s.durationSec / 60))}</span>
                <button onClick={() => remove.mutate(s.id)} className="rounded-md p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" aria-label="Delete session">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* stop modal */}
      <Modal
        open={stopModal}
        onClose={() => setStopModal(false)}
        title="Stop session"
        description="Duration is calculated from start, pause and stop timestamps."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setStopModal(false)}>
              Keep running
            </Button>
            <Button loading={stop.isPending} onClick={() => active && stop.mutate({ id: active.id, score: focusScore })}>
              Stop and save
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-ink-600 dark:text-ink-300">
          This session lasted <span className="font-bold text-ink-900 dark:text-white">{formatClock(elapsed)}</span>.
        </p>
        <Field label="How focused were you? (optional)">
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setFocusScore(focusScore === n ? null : n)}
                className={cn('h-9 flex-1 rounded-lg border text-xs font-bold transition', focusScore === n ? 'border-brand-500 bg-brand-600 text-white' : 'border-[rgb(var(--border))] text-ink-500 hover:bg-ink-50 dark:hover:bg-ink-800')}
              >
                {n}
              </button>
            ))}
          </div>
        </Field>
      </Modal>

      {/* manual add */}
      <Modal
        open={!!manual}
        onClose={() => setManual(null)}
        title="Add a past session"
        description="For sessions you tracked elsewhere. Takes under ten seconds."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setManual(null)}>
              Cancel
            </Button>
            <Button
              loading={addManual.isPending}
              onClick={() =>
                manual &&
                addManual.mutate({ category: manual.category, minutes: manual.minutes, label: manual.label || undefined, date: manual.date })
              }
            >
              Add session
            </Button>
          </>
        }
      >
        {manual && (
          <div className="space-y-3">
            <Field label="Category">
              <Select value={manual.category} onChange={(e) => setManual({ ...manual, category: e.target.value as SessionCategory })}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_META[c].label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Minutes">
                <Input type="number" min={1} max={1440} value={manual.minutes} onChange={(e) => setManual({ ...manual, minutes: Number(e.target.value) })} />
              </Field>
              <Field label="Date">
                <Input type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} />
              </Field>
            </div>
            <Field label="Label (optional)">
              <Input value={manual.label} onChange={(e) => setManual({ ...manual, label: e.target.value })} placeholder="e.g. Chapter 6 revision" />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
