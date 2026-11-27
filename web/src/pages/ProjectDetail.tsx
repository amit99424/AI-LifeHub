import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, Check, ChevronRight, Clock, Layers, Plus, Target, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, Skeleton, Textarea, toast } from '@/components/ui';
import { useNouns } from '@/lib/occupation';
import { KIND_LABEL, useGoalMutations, useProjectMutations, type TaskRow } from '@/lib/studyWork';
import { ProgressBar, ProjectStatusBadge } from '@/pages/Projects';
import type { GoalDto, ProjectDto } from '@/lib/types';
import { PRIORITY_STYLES, cn, formatDate, formatMinutes } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// One container: its tasks, subtasks, goals and logged time.
// ─────────────────────────────────────────────────────────────
// Every number on this page comes from the project detail payload. The page
// adds nothing of its own, so the container cannot disagree with the dashboard.

function TaskLine({ task, projectId }: { task: TaskRow; projectId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState('');
  const [adding, setAdding] = useState(false);

  const subtasks = useQuery({
    queryKey: ['subtasks', task.id],
    queryFn: () => api.get<{ tasks: TaskRow[] }>(`/api/tasks?parentId=${task.id}`),
    enabled: open,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['project', projectId] });
    void qc.invalidateQueries({ queryKey: ['subtasks', task.id] });
    void qc.invalidateQueries({ queryKey: ['projects'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const toggle = useMutation({
    mutationFn: () => api.post<{ task: TaskRow; nextOccurrence: TaskRow | null }>(`/api/tasks/${task.id}/toggle`),
    onSuccess: (r) => {
      if (r.nextOccurrence) toast(`Next one is due ${formatDate(new Date(r.nextOccurrence.dueDate!))}`);
      invalidate();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const addSub = useMutation({
    mutationFn: () => api.post('/api/tasks', { title: sub.trim(), parentId: task.id, projectId }),
    onSuccess: () => { setSub(''); setAdding(false); invalidate(); },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const toggleSub = useMutation({
    mutationFn: (id: string) => api.post(`/api/tasks/${id}/toggle`),
    onSuccess: invalidate,
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const done = task.status === 'COMPLETED';
  const overdue = Boolean(task.dueDate && !done && new Date(task.dueDate) < new Date());

  return (
    <div className="border-t border-[rgb(var(--border))] py-2 first:border-t-0">
      <div className="flex items-start gap-2">
        <button
          onClick={() => toggle.mutate()}
          disabled={toggle.isPending}
          className={cn(
            'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition',
            done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-ink-300 hover:border-brand-400 dark:border-ink-600',
          )}
          aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        >
          {done && <Check className="h-2.5 w-2.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={cn('text-[12.5px] font-medium text-ink-800 dark:text-ink-100', done && 'line-through text-ink-400 dark:text-ink-500')}>{task.title}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className={cn('text-[10px] font-bold', PRIORITY_STYLES[task.priority])}>{task.priority}</span>
            {task.dueDate && (
              <span className={cn('text-[10px]', overdue ? 'font-bold text-rose-600 dark:text-rose-400' : 'text-ink-400')}>
                {overdue ? 'overdue · ' : ''}{formatDate(new Date(task.dueDate))}
              </span>
            )}
            {task.recurrence !== 'NONE' && <Badge tone="brand">repeats</Badge>}
            {task._count?.subtasks ? (
              <button onClick={() => setOpen((o) => !o)} className="text-[10px] font-semibold text-brand-600 hover:underline dark:text-brand-400">
                {task._count.subtasks} subtask{task._count.subtasks === 1 ? '' : 's'}
              </button>
            ) : (
              <button onClick={() => { setOpen(true); setAdding(true); }} className="text-[10px] text-ink-400 hover:text-brand-600">+ subtask</button>
            )}
          </div>
          {open && (
            <div className="mt-1.5 space-y-1 border-l-2 border-[rgb(var(--border))] pl-2.5">
              {(subtasks.data?.tasks ?? []).map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <button
                    onClick={() => toggleSub.mutate(s.id)}
                    className={cn('flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border-2', s.status === 'COMPLETED' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-ink-300 dark:border-ink-600')}
                    aria-label={`Toggle ${s.title}`}
                  >
                    {s.status === 'COMPLETED' && <Check className="h-2 w-2" />}
                  </button>
                  <span className={cn('text-[11.5px]', s.status === 'COMPLETED' && 'line-through text-ink-400')}>{s.title}</span>
                </div>
              ))}
              {adding ? (
                <div className="flex gap-1.5">
                  <Input
                    value={sub}
                    onChange={(e) => setSub(e.target.value)}
                    placeholder="Subtask title"
                    className="h-7 text-[11px]"
                    onKeyDown={(e) => { if (e.key === 'Enter' && sub.trim()) addSub.mutate(); }}
                    autoFocus
                  />
                  <Button size="sm" onClick={() => sub.trim() && addSub.mutate()} loading={addSub.isPending}>Add</Button>
                </div>
              ) : (
                <button onClick={() => setAdding(true)} className="text-[10px] text-ink-400 hover:text-brand-600">+ add subtask</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GoalCard({ goal }: { goal: GoalDto }) {
  const { update, addMilestone, toggleMilestone, removeMilestone, remove } = useGoalMutations();
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);

  return (
    <div className="rounded-xl border border-[rgb(var(--border))] p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-[13px] font-bold text-ink-900 dark:text-white">{goal.title}</p>
            <Badge tone={goal.status === 'ACHIEVED' ? 'success' : 'brand'}>{goal.status.toLowerCase()}</Badge>
          </div>
          {goal.progress !== null ? (
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
                <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400" style={{ width: `${goal.progress}%` }} />
              </div>
              <p className="mt-1 text-[10px] text-ink-400">
                {goal.current ?? 0} of {goal.target} {goal.metric ?? ''} · {goal.progress}%
                {goal.deadline ? ` · due ${formatDate(new Date(goal.deadline))}` : ''}
              </p>
            </div>
          ) : (
            // No target means no percentage. Saying "0%" would invent one.
            <p className="mt-1 text-[10px] text-ink-400">
              No target set — {goal.milestonesDone} of {goal.milestonesTotal} milestones done
              {goal.deadline ? ` · due ${formatDate(new Date(goal.deadline))}` : ''}
            </p>
          )}
        </div>
        <button
          onClick={() => { if (confirm(`Delete "${goal.title}"?`)) remove.mutate(goal.id, { onSuccess: () => toast('Goal deleted') }); }}
          className="rounded p-1 text-ink-400 hover:text-rose-600"
          aria-label={`Delete ${goal.title}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 space-y-1">
        {goal.milestones.map((m) => (
          <div key={m.id} className="flex items-center gap-2">
            <button
              onClick={() => toggleMilestone.mutate({ goalId: goal.id, id: m.id, completed: !m.completedAt })}
              className={cn('flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2', m.completedAt ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-ink-300 dark:border-ink-600')}
              aria-label={`Toggle ${m.title}`}
            >
              {m.completedAt && <Check className="h-2 w-2" />}
            </button>
            <span className={cn('flex-1 text-[11.5px]', m.completedAt && 'line-through text-ink-400')}>{m.title}</span>
            {m.dueDate && <span className="text-[10px] text-ink-400">{formatDate(new Date(m.dueDate))}</span>}
            <button onClick={() => removeMilestone.mutate({ goalId: goal.id, id: m.id })} className="text-ink-300 hover:text-rose-500" aria-label={`Remove ${m.title}`}>
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        {adding ? (
          <div className="flex gap-1.5">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Milestone"
              className="h-7 text-[11px]"
              onKeyDown={(e) => { if (e.key === 'Enter' && title.trim()) { addMilestone.mutate({ goalId: goal.id, title: title.trim() }); setTitle(''); setAdding(false); } }}
              autoFocus
            />
            <Button size="sm" onClick={() => { if (title.trim()) { addMilestone.mutate({ goalId: goal.id, title: title.trim() }); setTitle(''); setAdding(false); } }}>Add</Button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="text-[10px] text-ink-400 hover:text-brand-600">+ add milestone</button>
        )}
      </div>

      {goal.target !== null && (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-[10px] text-ink-400">Progress:</span>
          <Input
            type="number"
            className="h-6 w-16 text-[11px]"
            defaultValue={goal.current ?? 0}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v !== goal.current) update.mutate({ id: goal.id, current: v }, { onSuccess: () => toast('Progress saved') });
            }}
          />
          <span className="text-[10px] text-ink-400">of {goal.target} {goal.metric ?? ''}</span>
        </div>
      )}
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const nouns = useNouns();
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.get<{ project: ProjectDto; tasks: TaskRow[]; goals: GoalDto[] }>(`/api/projects/${id}`),
    enabled: Boolean(id),
  });

  const [newTask, setNewTask] = useState('');
  const [newGoal, setNewGoal] = useState('');
  const { update } = useProjectMutations();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['project', id] });
    void qc.invalidateQueries({ queryKey: ['projects'] });
    void qc.invalidateQueries({ queryKey: ['goals'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const addTask = useMutation({
    mutationFn: () => api.post('/api/tasks', { title: newTask.trim(), projectId: id }),
    onSuccess: () => { setNewTask(''); invalidate(); },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const addGoal = useMutation({
    mutationFn: () => api.post('/api/goals', { title: newGoal.trim(), projectId: id }),
    onSuccess: () => { setNewGoal(''); invalidate(); },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  if (isError) return <ErrorState message={(error as Error)?.message || 'Could not load this project'} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <div className="space-y-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-48 w-full" /></div>;

  const p = data.project;
  const open = data.tasks.filter((t) => t.status !== 'COMPLETED');
  const done = data.tasks.filter((t) => t.status === 'COMPLETED');

  return (
    <div className="space-y-4">
      <Link to="/projects" className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-500 hover:text-ink-800 dark:hover:text-ink-200">
        <ArrowLeft className="h-3.5 w-3.5" /> All {nouns.projects.toLowerCase()}
      </Link>

      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h1 className="font-display text-lg font-extrabold text-ink-900 dark:text-white">{p.title}</h1>
              {p.code && <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-500 dark:bg-ink-800 dark:text-ink-300">{p.code}</span>}
              <Badge tone="neutral">{KIND_LABEL[p.kind]}</Badge>
              <ProjectStatusBadge status={p.status} />
            </div>
            {p.description && <p className="mt-1 text-[12px] text-ink-500">{p.description}</p>}
          </div>
          <div className="flex gap-1.5">
            {p.status !== 'COMPLETED' ? (
              <Button size="sm" variant="secondary" onClick={() => update.mutate({ id: p.id, status: 'COMPLETED' }, { onSuccess: () => toast('Marked complete') })}>
                Mark complete
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => update.mutate({ id: p.id, status: 'ACTIVE' }, { onSuccess: () => toast('Reopened') })}>
                Reopen
              </Button>
            )}
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Progress</p>
            <div className="mt-1"><ProgressBar progress={p.progress} tasks={p.tasks} /></div>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Time logged</p>
            <p className="mt-1 text-[13px] font-bold text-ink-900 dark:text-white">
              <Clock className="mr-1 inline h-3.5 w-3.5" />{p.sessionMinutes ? formatMinutes(p.sessionMinutes) : '—'}
              <span className="ml-1 text-[10px] font-normal text-ink-400">across {p.sessions} session{p.sessions === 1 ? '' : 's'}</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Deadline</p>
            <p className="mt-1 text-[13px] font-bold text-ink-900 dark:text-white">
              <CalendarClock className="mr-1 inline h-3.5 w-3.5" />{p.deadline ? formatDate(new Date(p.deadline)) : '—'}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <CardHeader title="Tasks" subtitle={`${open.length} open · ${done.length} done`} icon={<Check className="h-4 w-4" />} />
          <div className="mt-2 flex gap-1.5">
            <Input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="Add a task"
              className="h-8 text-[12px]"
              onKeyDown={(e) => { if (e.key === 'Enter' && newTask.trim()) addTask.mutate(); }}
            />
            <Button size="sm" onClick={() => newTask.trim() && addTask.mutate()} loading={addTask.isPending} icon={<Plus className="h-3.5 w-3.5" />}>Add</Button>
          </div>
          {data.tasks.length === 0 ? (
            <EmptyState icon={<Check className="h-4 w-4" />} title="No tasks yet" description="This container has no tasks, so it has no progress to report. Add the first one." />
          ) : (
            <div className="mt-2">
              {[...open, ...done].map((t) => <TaskLine key={t.id} task={t} projectId={p.id} />)}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <CardHeader title="Goals" subtitle="Measurable, with milestones" icon={<Target className="h-4 w-4" />} action={<Link to="/goals" className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400">All goals <ChevronRight className="inline h-3 w-3" /></Link>} />
          <div className="mt-2 flex gap-1.5">
            <Input
              value={newGoal}
              onChange={(e) => setNewGoal(e.target.value)}
              placeholder="Add a goal"
              className="h-8 text-[12px]"
              onKeyDown={(e) => { if (e.key === 'Enter' && newGoal.trim()) addGoal.mutate(); }}
            />
            <Button size="sm" onClick={() => newGoal.trim() && addGoal.mutate()} loading={addGoal.isPending} icon={<Plus className="h-3.5 w-3.5" />}>Add</Button>
          </div>
          {data.goals.length === 0 ? (
            <EmptyState icon={<Target className="h-4 w-4" />} title="No goals here" description="A goal gives the work a finish line you can measure." />
          ) : (
            <div className="mt-2 space-y-2">{data.goals.map((g) => <GoalCard key={g.id} goal={g} />)}</div>
          )}
        </Card>
      </div>

      <Card className="p-3">
        <Link to="/sessions" className="flex items-center gap-2 text-[12px] font-semibold text-brand-600 hover:underline dark:text-brand-400">
          <Clock className="h-4 w-4" /> Start a {nouns.session.toLowerCase()} on this {nouns.project.toLowerCase()}
        </Link>
      </Card>
    </div>
  );
}

export { GoalCard, Layers };
