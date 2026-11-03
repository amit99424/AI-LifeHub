import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarCheck,
  CheckCircle2,
  Circle,
  Clock,
  Filter,
  ListChecks,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { api, qs } from '@/lib/api';
import type { Priority, Task, TaskStatus, TasksResponse } from '@/lib/types';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Select, Skeleton, Textarea, toast } from '@/components/ui';
import { PRIORITY_STYLES, STATUS_STYLES, cn, formatDate, formatMinutes, relativeTime } from '@/lib/utils';

const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const STATUSES: { value: TaskStatus | 'ALL' | 'OPEN'; label: string }[] = [
  { value: 'OPEN', label: 'Open' },
  { value: 'ALL', label: 'All' },
  { value: 'TODO', label: 'To do' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ARCHIVED', label: 'Archived' },
];

type FormState = {
  id?: string;
  title: string;
  description: string;
  category: string;
  priority: Priority;
  status: TaskStatus;
  dueDate: string;
};

const EMPTY: FormState = { title: '', description: '', category: 'General', priority: 'MEDIUM', status: 'TODO', dueDate: '' };

export default function Tasks() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ status: 'OPEN' as string, priority: '', category: '', search: '', due: '', sort: 'dueDate' });
  const [showFilters, setShowFilters] = useState(false);
  const [modal, setModal] = useState<FormState | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [quick, setQuick] = useState('');

  const query = useQuery({
    queryKey: ['tasks', filters],
    queryFn: () =>
      api.get<TasksResponse>(
        `/api/tasks${qs({
          status: filters.status,
          priority: filters.priority || undefined,
          category: filters.category || undefined,
          search: filters.search || undefined,
          due: filters.due || undefined,
          sort: filters.sort,
          limit: 200,
        })}`,
      ),
  });

  const categories = useQuery({
    queryKey: ['task-categories'],
    queryFn: () => api.get<{ categories: { category: string; count: number }[] }>('/api/tasks/meta/categories'),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['tasks'] });
    void qc.invalidateQueries({ queryKey: ['task-categories'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['analytics'] });
    void qc.invalidateQueries({ queryKey: ['nav-counts'] });
  };

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/api/tasks', body),
    onSuccess: () => {
      invalidate();
      toast('Task created.', 'success');
      setModal(null);
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patch(`/api/tasks/${id}`, body),
    onSuccess: () => {
      invalidate();
      toast('Task updated.', 'success');
      setModal(null);
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  // Optimistic completion: the row flips instantly, the server is the source of
  // truth, and a failure rolls the flip back with a toast.
  const toggle = useMutation({
    mutationFn: (id: string) => api.post<Task>(`/api/tasks/${id}/toggle`),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ['tasks'] });
      const snapshots = qc.getQueriesData<TasksResponse>({ queryKey: ['tasks'] });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        qc.setQueryData<TasksResponse>(key, {
          ...data,
          tasks: data.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  status: t.status === 'COMPLETED' ? 'TODO' : 'COMPLETED',
                  completedAt: t.status === 'COMPLETED' ? null : new Date().toISOString(),
                  overdue: false,
                }
              : t,
          ),
        });
      }
      return { snapshots };
    },
    onError: (e, _id, ctx) => {
      ctx?.snapshots?.forEach(([key, data]) => qc.setQueryData(key, data));
      toast((e as Error).message, 'error');
    },
    onSuccess: () => {
      // Refresh derived data (dashboard, analytics, counters) once, in the background.
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['analytics'] });
      void qc.invalidateQueries({ queryKey: ['nav-counts'] });
      void qc.invalidateQueries({ queryKey: ['task-categories'] });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/tasks/${id}`),
    onSuccess: () => {
      invalidate();
      toast('Task deleted.', 'success');
      setDeleting(null);
    },
  });

  const quickAdd = useMutation({
    mutationFn: (title: string) => api.post<Task>('/api/tasks', { title, category: 'General', priority: 'MEDIUM' }),
    onMutate: async (title: string) => {
      await qc.cancelQueries({ queryKey: ['tasks'] });
      const snapshots = qc.getQueriesData<TasksResponse>({ queryKey: ['tasks'] });
      const optimistic: Task = {
        id: `optimistic-${Date.now()}`,
        title,
        description: null,
        category: 'General',
        priority: 'MEDIUM',
        status: 'TODO',
        dueDate: null,
        startedAt: null,
        completedAt: null,
        timeTakenSec: null,
        isDemo: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        overdue: false,
        dueToday: false,
      };
      for (const [key, data] of snapshots) {
        if (!data) continue;
        qc.setQueryData<TasksResponse>(key, { ...data, tasks: [optimistic, ...data.tasks], total: data.total + 1 });
      }
      return { snapshots };
    },
    onError: (e, _title, ctx) => {
      ctx?.snapshots?.forEach(([key, data]) => qc.setQueryData(key, data));
      toast((e as Error).message, 'error');
    },
    onSuccess: () => {
      setQuick('');
      invalidate();
    },
  });

  const tasks = query.data?.tasks ?? [];
  const counts = query.data?.counts ?? {};

  const grouped = useMemo(() => {
    const overdue = tasks.filter((t) => t.overdue);
    const today = tasks.filter((t) => !t.overdue && t.dueToday);
    const rest = tasks.filter((t) => !t.overdue && !t.dueToday);
    return { overdue, today, rest };
  }, [tasks]);

  function openEdit(t: Task) {
    setModal({
      id: t.id,
      title: t.title,
      description: t.description ?? '',
      category: t.category,
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : '',
    });
  }

  function save() {
    if (!modal) return;
    const body = {
      title: modal.title.trim(),
      description: modal.description.trim() || null,
      category: modal.category.trim() || 'General',
      priority: modal.priority,
      status: modal.status,
      dueDate: modal.dueDate || null,
    };
    if (modal.id) update.mutate({ id: modal.id, body });
    else create.mutate(body);
  }

  const activeFilterCount = [filters.priority, filters.category, filters.due, filters.search].filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">My tasks</h1>
          <p className="mt-0.5 text-xs text-ink-500">
            {counts.TODO ?? 0} to do · {counts.IN_PROGRESS ?? 0} in progress · {counts.COMPLETED ?? 0} completed
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowFilters((v) => !v)} icon={<Filter className="h-3.5 w-3.5" />}>
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </Button>
          <Button size="sm" onClick={() => setModal({ ...EMPTY })} icon={<Plus className="h-4 w-4" />}>
            New task
          </Button>
        </div>
      </div>

      {/* quick add */}
      <Card className="p-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (quick.trim()) quickAdd.mutate(quick.trim());
          }}
        >
          <div className="relative flex-1">
            <Plus className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input className="pl-9" placeholder="Add a task and press Enter — timestamps are captured automatically" value={quick} onChange={(e) => setQuick(e.target.value)} />
          </div>
          <Button type="submit" loading={quickAdd.isPending} disabled={!quick.trim()}>
            Add
          </Button>
        </form>
      </Card>

      {/* filter bar */}
      {showFilters && (
        <Card className="animate-slide-up p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Status">
              <Select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}>
                <option value="">Any</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p[0] + p.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Category">
              <Select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}>
                <option value="">Any</option>
                {(categories.data?.categories ?? []).map((c) => (
                  <option key={c.category} value={c.category}>
                    {c.category} ({c.count})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due">
              <Select value={filters.due} onChange={(e) => setFilters((f) => ({ ...f, due: e.target.value }))}>
                <option value="">Any</option>
                <option value="today">Today</option>
                <option value="overdue">Overdue</option>
                <option value="week">Next 7 days</option>
                <option value="none">No due date</option>
              </Select>
            </Field>
            <Field label="Sort by">
              <Select value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}>
                <option value="dueDate">Due date</option>
                <option value="createdAt">Newest</option>
                <option value="priority">Priority</option>
                <option value="title">Title</option>
              </Select>
            </Field>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input className="pl-9" placeholder="Search title or description…" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
            </div>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setFilters((f) => ({ status: f.status, sort: f.sort, priority: '', category: '', search: '', due: '' }))} icon={<X className="h-3.5 w-3.5" />}>
                Clear
              </Button>
            )}
          </div>
        </Card>
      )}

      {query.isPending ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-5 w-5" />}
          title={filters.search || activeFilterCount ? 'No tasks match those filters' : 'No tasks yet'}
          description={
            filters.search || activeFilterCount
              ? 'Try clearing the filters, or create a task that matches them.'
              : 'Add your first task above. Completion dates, due dates and time-to-complete are recorded automatically for analysis.'
          }
          action={<Button size="sm" onClick={() => setModal({ ...EMPTY })} icon={<Plus className="h-3.5 w-3.5" />}>New task</Button>}
        />
      ) : (
        <div className="space-y-5">
          {grouped.overdue.length > 0 && <Group title="Overdue" tone="danger" tasks={grouped.overdue} onToggle={(id) => toggle.mutate(id)} onEdit={openEdit} onDelete={setDeleting} />}
          {grouped.today.length > 0 && <Group title="Due today" tone="warning" tasks={grouped.today} onToggle={(id) => toggle.mutate(id)} onEdit={openEdit} onDelete={setDeleting} />}
          {grouped.rest.length > 0 && (
            <Group
              title={grouped.overdue.length || grouped.today.length ? 'Everything else' : 'All tasks'}
              tasks={grouped.rest}
              onToggle={(id) => toggle.mutate(id)}
              onEdit={openEdit}
              onDelete={setDeleting}
            />
          )}
        </div>
      )}

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.id ? 'Edit task' : 'New task'}
        description={modal?.id ? 'Changing the status updates completion timestamps automatically.' : 'Only the title is required.'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={create.isPending || update.isPending} disabled={!modal?.title.trim()}>
              {modal?.id ? 'Save changes' : 'Create task'}
            </Button>
          </>
        }
      >
        {modal && (
          <div className="space-y-3.5">
            <Field label="Title">
              <Input autoFocus value={modal.title} onChange={(e) => setModal({ ...modal, title: e.target.value })} placeholder="What needs doing?" maxLength={200} />
            </Field>
            <Field label="Description (optional)">
              <Textarea value={modal.description} onChange={(e) => setModal({ ...modal, description: e.target.value })} rows={3} placeholder="Add context, links or a definition of done" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category">
                <Input value={modal.category} onChange={(e) => setModal({ ...modal, category: e.target.value })} placeholder="Work, Study, Personal…" list="task-categories" />
                <datalist id="task-categories">
                  {(categories.data?.categories ?? []).map((c) => (
                    <option key={c.category} value={c.category} />
                  ))}
                </datalist>
              </Field>
              <Field label="Due date">
                <Input type="date" value={modal.dueDate} onChange={(e) => setModal({ ...modal, dueDate: e.target.value })} />
              </Field>
              <Field label="Priority">
                <Select value={modal.priority} onChange={(e) => setModal({ ...modal, priority: e.target.value as Priority })}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p[0] + p.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={modal.status} onChange={(e) => setModal({ ...modal, status: e.target.value as TaskStatus })}>
                  <option value="TODO">To do</option>
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="ARCHIVED">Archived</option>
                </Select>
              </Field>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete task?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-600 dark:text-ink-300">
          “{deleting?.title}” will be removed permanently. Its history will no longer count toward your analytics.
        </p>
      </Modal>
    </div>
  );
}

function Group({
  title,
  tasks,
  onToggle,
  onEdit,
  onDelete,
  tone,
}: {
  title: string;
  tasks: Task[];
  onToggle: (id: string) => void;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
  tone?: 'danger' | 'warning';
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h3 className={cn('text-[11px] font-bold uppercase tracking-[0.14em]', tone === 'danger' ? 'text-rose-600' : tone === 'warning' ? 'text-amber-600' : 'text-ink-400')}>{title}</h3>
        <span className="rounded-full bg-ink-100 px-1.5 text-[10px] font-bold text-ink-500 dark:bg-ink-800 dark:text-ink-400">{tasks.length}</span>
      </div>
      <div className="space-y-2">
        {tasks.map((t) => (
          <div
            key={t.id}
            className={cn(
              'group flex items-start gap-3 rounded-xl border bg-[rgb(var(--surface))] p-3.5 transition hover:border-brand-300 hover:shadow-card dark:hover:border-brand-500/40',
              t.status === 'COMPLETED' ? 'border-[rgb(var(--border))] opacity-70' : 'border-[rgb(var(--border))]',
            )}
          >
            {/*
              Touch-friendly completion target: 44x44 CSS px (Apple HIG / WCAG 2.5.5).
              - type="button" so it can never submit a surrounding form
              - touch-manipulation removes the 300 ms double-tap delay on iOS
              - stopPropagation prevents a parent card handler from also firing
              - aria-pressed gives screen readers the on/off state
            */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle(t.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-pressed={t.status === 'COMPLETED'}
              aria-label={t.status === 'COMPLETED' ? `Mark "${t.title}" as not done` : `Mark "${t.title}" as done`}
              className={cn(
                'relative -m-2 flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl',
                'active:scale-95 transition-transform select-none',
                'hover:bg-brand-50 dark:hover:bg-brand-500/10',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60',
              )}
            >
              {t.status === 'COMPLETED' ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              ) : t.status === 'IN_PROGRESS' ? (
                <Clock className="h-6 w-6 text-brand-500" />
              ) : (
                <Circle className="h-6 w-6 text-ink-300 dark:text-ink-600" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className={cn('text-sm font-semibold', t.status === 'COMPLETED' ? 'text-ink-400 line-through' : 'text-ink-900 dark:text-white')}>{t.title}</p>
                <span className={cn('badge', PRIORITY_STYLES[t.priority])}>{t.priority.toLowerCase()}</span>
                <span className={cn('badge', STATUS_STYLES[t.status])}>{t.status.replace('_', ' ').toLowerCase()}</span>
                {t.isDemo && <Badge tone="warning">Sample</Badge>}
                {t.overdue && <Badge tone="danger">Overdue</Badge>}
              </div>
              {t.description && <p className="mt-0.5 line-clamp-1 text-xs text-ink-500">{t.description}</p>}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-400">
                <span className="inline-flex items-center gap-1">
                  <CalendarCheck className="h-3 w-3" /> {t.category}
                </span>
                {t.dueDate && (
                  <span className={cn('inline-flex items-center gap-1', t.overdue && 'font-semibold text-rose-500')}>
                    <Clock className="h-3 w-3" /> due {formatDate(new Date(t.dueDate))}
                  </span>
                )}
                {t.completedAt && <span className="text-emerald-600 dark:text-emerald-400">done {relativeTime(t.completedAt)}</span>}
                {t.timeTakenSec != null && t.timeTakenSec > 0 && <span>took {formatMinutes(Math.round(t.timeTakenSec / 60))}</span>}
                <span>created {relativeTime(t.createdAt)}</span>
              </div>
            </div>
            {/* Hover-reveal on pointer devices; always visible and 40px tall on touch. */}
            <div className="flex shrink-0 gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(t);
                }}
                className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
                aria-label={`Edit ${t.title}`}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(t);
                }}
                className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                aria-label={`Delete ${t.title}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
