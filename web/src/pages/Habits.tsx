import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  BookOpen,
  Brain,
  Check,
  Code2,
  Droplets,
  Dumbbell,
  Flame,
  Moon,
  Pencil,
  PenLine,
  Plus,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { Habit } from '@/lib/types';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, Modal, ProgressBar, Select, Skeleton, toast } from '@/components/ui';
import { HABIT_COLORS, cn, formatDate } from '@/lib/utils';

const ICONS: Record<string, typeof Activity> = {
  Activity,
  BookOpen,
  Brain,
  Code2,
  Droplets,
  Dumbbell,
  Moon,
  PenLine,
  Sparkles,
};

type FormState = { id?: string; name: string; description: string; icon: string; color: string; frequency: 'DAILY' | 'WEEKLY'; targetPerWeek: number };
const EMPTY: FormState = { name: '', description: '', icon: 'Sparkles', color: 'violet', frequency: 'DAILY', targetPerWeek: 7 };

export default function Habits() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<FormState | null>(null);
  const [deleting, setDeleting] = useState<Habit | null>(null);
  const [historyHabit, setHistoryHabit] = useState<Habit | null>(null);

  const query = useQuery({
    queryKey: ['habits'],
    queryFn: () => api.get<{ habits: Habit[]; today: string }>('/api/habits'),
  });

  const reports = useQuery({
    queryKey: ['habit-reports'],
    queryFn: () => api.get<{ daily: { date: string; done: number; total: number }[]; perHabit: { name: string; completions: number; rate: number }[]; windowDays: number }>('/api/habits/reports/summary'),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['habits'] });
    void qc.invalidateQueries({ queryKey: ['habit-reports'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['analytics'] });
  };

  const checkin = useMutation({
    mutationFn: (id: string) => api.post<{ done: boolean }>(`/api/habits/${id}/checkin`),
    onSuccess: (res) => {
      invalidate();
      toast(res.done ? 'Checked in — logged automatically.' : 'Check-in removed.', res.done ? 'success' : 'info');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => (modal?.id ? api.patch(`/api/habits/${modal.id}`, body) : api.post('/api/habits', body)),
    onSuccess: () => {
      invalidate();
      toast(modal?.id ? 'Habit updated.' : 'Habit created.', 'success');
      setModal(null);
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const remove = useMutation({
    mutationFn: ({ id, hard }: { id: string; hard: boolean }) => api.delete(`/api/habits/${id}${hard ? '?hard=true' : ''}`),
    onSuccess: () => {
      invalidate();
      toast('Habit removed.', 'success');
      setDeleting(null);
    },
  });

  const habits = query.data?.habits ?? [];
  const doneToday = habits.filter((h) => h.doneToday).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">Habits</h1>
          <p className="mt-0.5 text-xs text-ink-500">
            {habits.length ? `${doneToday}/${habits.length} checked in today · one click each, history recorded automatically` : 'One click a day is all the tracking this needs'}
          </p>
        </div>
        <Button size="sm" onClick={() => setModal({ ...EMPTY })} icon={<Plus className="h-4 w-4" />}>
          New habit
        </Button>
      </div>

      {query.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />
      ) : habits.length === 0 ? (
        <EmptyState
          icon={<Activity className="h-5 w-5" />}
          title="No habits yet"
          description="Start with one habit you can do today. Streaks, completion rates and weekly reports are calculated for you."
          action={
            <Button size="sm" onClick={() => setModal({ ...EMPTY })} icon={<Plus className="h-3.5 w-3.5" />}>
              Create your first habit
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {habits.map((h) => {
            const Icon = ICONS[h.icon] ?? Sparkles;
            const color = HABIT_COLORS[h.color] ?? HABIT_COLORS.violet;
            return (
              <Card key={h.id} className={cn('flex flex-col p-4 transition', h.doneToday && 'ring-1 ring-emerald-300 dark:ring-emerald-500/30')}>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${color}18`, color }}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate text-sm font-bold text-ink-900 dark:text-white">{h.name}</h3>
                      {h.isDemo && <Badge tone="warning">Sample</Badge>}
                    </div>
                    <p className="mt-0.5 text-[11px] text-ink-500">
                      {h.frequency === 'DAILY' ? 'Daily' : `Weekly · ${h.targetPerWeek}×`} · every day counted since {formatDate(h.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-0.5">
                    <button onClick={() => setModal({ id: h.id, name: h.name, description: h.description ?? '', icon: h.icon, color: h.color, frequency: h.frequency, targetPerWeek: h.targetPerWeek })} className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800" aria-label="Edit habit">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setDeleting(h)} className="rounded-md p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" aria-label="Delete habit">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => checkin.mutate(h.id)}
                    disabled={checkin.isPending && checkin.variables === h.id}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-[13px] font-bold transition active:scale-[0.99]',
                      h.doneToday
                        ? 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600'
                        : 'border-dashed border-ink-300 text-ink-600 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 dark:border-ink-600 dark:text-ink-300 dark:hover:bg-brand-500/10',
                    )}
                  >
                    {h.doneToday ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {h.doneToday ? 'Done today' : 'Check in'}
                  </button>
                  {h.streak > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-amber-50 px-2.5 py-2.5 text-[12px] font-bold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                      <Flame className="h-3.5 w-3.5" /> {h.streak}
                    </span>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <div className="mb-1 flex justify-between text-[10px] font-semibold text-ink-500">
                      <span>This week</span>
                      <span>
                        {h.weekDone}/{h.weekTarget}
                      </span>
                    </div>
                    <ProgressBar value={h.weekRate} tone={h.weekRate >= 70 ? 'success' : h.weekRate >= 40 ? 'brand' : 'warning'} />
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-[10px] font-semibold text-ink-500">
                      <span>This month</span>
                      <span>{h.monthRate}%</span>
                    </div>
                    <ProgressBar value={h.monthRate} tone={h.monthRate >= 70 ? 'success' : h.monthRate >= 40 ? 'brand' : 'warning'} />
                  </div>
                </div>

                <div className="mt-3 flex items-end gap-[3px]">
                  {h.last30.map((d) => (
                    <div
                      key={d.date}
                      title={`${d.date}: ${d.done ? 'done' : 'missed'}`}
                      className="flex-1 rounded-[2px] transition hover:opacity-80"
                      style={{ height: 18, background: d.done ? color : 'rgb(var(--border))', opacity: d.done ? 1 : 0.5 }}
                    />
                  ))}
                </div>
                <button onClick={() => setHistoryHabit(h)} className="mt-2 text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400">
                  View history →
                </button>
              </Card>
            );
          })}
        </div>
      )}

      {reports.data && reports.data.perHabit.length > 0 && (
        <Card>
          <CardHeader title="Last 30 days" subtitle="Completion rate per habit" icon={<TrendingUp className="h-4.5 w-4.5" />} />
          <div className="space-y-2.5">
            {[...reports.data.perHabit].sort((a, b) => b.rate - a.rate).map((h) => (
              <div key={h.name}>
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-ink-700 dark:text-ink-200">{h.name}</span>
                  <span className="text-ink-500">
                    {h.completions}/{reports.data.windowDays} days · {h.rate}%
                  </span>
                </div>
                <ProgressBar value={h.rate} tone={h.rate >= 70 ? 'success' : h.rate >= 40 ? 'brand' : 'warning'} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.id ? 'Edit habit' : 'New habit'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button
              loading={save.isPending}
              disabled={!modal?.name.trim()}
              onClick={() =>
                modal &&
                save.mutate({
                  name: modal.name.trim(),
                  description: modal.description.trim() || null,
                  icon: modal.icon,
                  color: modal.color,
                  frequency: modal.frequency,
                  targetPerWeek: modal.frequency === 'DAILY' ? 7 : modal.targetPerWeek,
                })
              }
            >
              {modal?.id ? 'Save' : 'Create habit'}
            </Button>
          </>
        }
      >
        {modal && (
          <div className="space-y-3.5">
            <Field label="Habit name">
              <Input autoFocus value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} placeholder="e.g. Read 20 minutes" maxLength={60} />
            </Field>
            <Field label="Description (optional)">
              <Input value={modal.description} onChange={(e) => setModal({ ...modal, description: e.target.value })} placeholder="Why this habit matters to you" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Frequency">
                <Select value={modal.frequency} onChange={(e) => setModal({ ...modal, frequency: e.target.value as 'DAILY' | 'WEEKLY' })}>
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                </Select>
              </Field>
              {modal.frequency === 'WEEKLY' && (
                <Field label="Target per week">
                  <Select value={modal.targetPerWeek} onChange={(e) => setModal({ ...modal, targetPerWeek: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                      <option key={n} value={n}>
                        {n}×
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>
            <Field label="Icon">
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(ICONS).map(([name, Icon]) => (
                  <button
                    key={name}
                    onClick={() => setModal({ ...modal, icon: name })}
                    className={cn('flex h-9 w-9 items-center justify-center rounded-lg border transition', modal.icon === name ? 'border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/15' : 'border-[rgb(var(--border))] text-ink-500 hover:bg-ink-50 dark:hover:bg-ink-800')}
                    aria-label={name}
                    type="button"
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Colour">
              <div className="flex gap-2">
                {Object.entries(HABIT_COLORS).map(([name, hex]) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setModal({ ...modal, color: name })}
                    className={cn('h-7 w-7 rounded-full ring-offset-2 transition dark:ring-offset-ink-900', modal.color === name && 'ring-2 ring-brand-500')}
                    style={{ background: hex }}
                    aria-label={name}
                  />
                ))}
              </div>
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Remove habit?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="secondary" loading={remove.isPending} onClick={() => deleting && remove.mutate({ id: deleting.id, hard: false })}>
              Archive (keep history)
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => deleting && remove.mutate({ id: deleting.id, hard: true })}>
              Delete permanently
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-600 dark:text-ink-300">
          Archiving “{deleting?.name}” hides it but keeps its check-ins in your analysis. Deleting removes the habit and every check-in with it.
        </p>
      </Modal>

      {historyHabit && <HabitHistory habit={historyHabit} onClose={() => setHistoryHabit(null)} />}
    </div>
  );
}

function HabitHistory({ habit, onClose }: { habit: Habit; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['habit-history', habit.id],
    queryFn: () =>
      api.get<{ days: { date: string; done: boolean }[]; completionRate: number; streak: { current: number; longest: number } }>(`/api/habits/${habit.id}/history?days=90`),
  });

  return (
    <Modal open onClose={onClose} title={`${habit.name} · last 90 days`} size="lg">
      {isLoading || !data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-[rgb(var(--border))] p-3 text-center">
              <p className="font-display text-xl font-extrabold text-ink-900 dark:text-white">{data.completionRate}%</p>
              <p className="text-[10px] uppercase tracking-wide text-ink-400">Completion</p>
            </div>
            <div className="rounded-xl border border-[rgb(var(--border))] p-3 text-center">
              <p className="font-display text-xl font-extrabold text-amber-600">{data.streak.current}</p>
              <p className="text-[10px] uppercase tracking-wide text-ink-400">Current streak</p>
            </div>
            <div className="rounded-xl border border-[rgb(var(--border))] p-3 text-center">
              <p className="font-display text-xl font-extrabold text-ink-900 dark:text-white">{data.streak.longest}</p>
              <p className="text-[10px] uppercase tracking-wide text-ink-400">Longest streak</p>
            </div>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(12px,1fr))] gap-1.5">
            {data.days.map((d) => (
              <div
                key={d.date}
                title={`${d.date}: ${d.done ? 'done' : 'missed'}`}
                className={cn('aspect-square rounded-[3px]', d.done ? 'bg-emerald-500' : 'bg-ink-100 dark:bg-ink-800')}
              />
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
