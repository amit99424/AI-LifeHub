import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Flag, Plus, Target, Trash2, X } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, Skeleton, Textarea, toast } from '@/components/ui';
import { useNouns } from '@/lib/occupation';
import { useGoalMutations, useGoals, useProjects } from '@/lib/studyWork';
import type { GoalDto, GoalStatus } from '@/lib/types';
import { cn, formatDate } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// Goals and milestones
// ─────────────────────────────────────────────────────────────
// A goal's percentage exists only when it has a target. A goal without one is
// measured by its milestones and says so, because "3 of ?" is not a progress
// bar and pretending otherwise is the kind of fake number this app refuses.

const STATUS_TONE: Record<GoalStatus, 'brand' | 'success' | 'warning' | 'neutral'> = {
  ACTIVE: 'brand',
  ACHIEVED: 'success',
  PAUSED: 'warning',
  ABANDONED: 'neutral',
};

function GoalCard({ goal, projectTitle }: { goal: GoalDto; projectTitle?: string }) {
  const { update, addMilestone, toggleMilestone, removeMilestone, remove } = useGoalMutations();
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: goal.title, target: goal.target ?? '', metric: goal.metric ?? '', deadline: goal.deadline?.slice(0, 10) ?? '' });

  const save = () => {
    update.mutate(
      {
        id: goal.id,
        title: draft.title.trim() || goal.title,
        target: draft.target === '' ? null : Number(draft.target),
        metric: draft.metric.trim() || null,
        deadline: draft.deadline || null,
      },
      { onSuccess: () => { toast('Saved'); setEditing(false); }, onError: (e) => toast((e as Error).message, 'error') },
    );
  };

  return (
    <div className="rounded-xl border border-[rgb(var(--border))] p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-[13px] font-bold text-ink-900 dark:text-white">{goal.title}</p>
            <Badge tone={STATUS_TONE[goal.status]}>{goal.status.toLowerCase()}</Badge>
            {projectTitle && <Badge tone="neutral">{projectTitle}</Badge>}
          </div>

          {editing ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <div className="sm:col-span-3"><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
              <Field label="Target"><Input type="number" value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} placeholder="13" /></Field>
              <Field label="Unit"><Input value={draft.metric} onChange={(e) => setDraft({ ...draft, metric: e.target.value })} placeholder="chapters" /></Field>
              <Field label="Deadline"><Input type="date" value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} /></Field>
              <div className="flex gap-1.5 sm:col-span-3">
                <Button size="sm" onClick={save} loading={update.isPending}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <>
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
                <p className="mt-1 text-[10px] text-ink-400">
                  No target — progress is {goal.milestonesDone} of {goal.milestonesTotal} milestones
                  {goal.deadline ? ` · due ${formatDate(new Date(goal.deadline))}` : ''}
                </p>
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 gap-0.5">
          {goal.status !== 'ACHIEVED' && (
            <button
              onClick={() => update.mutate({ id: goal.id, status: 'ACHIEVED' }, { onSuccess: () => toast('Goal achieved') })}
              className="rounded p-1 text-ink-400 hover:text-emerald-600"
              aria-label={`Mark ${goal.title} achieved`}
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={() => setEditing((e) => !e)} className="rounded p-1 text-ink-400 hover:text-brand-600" aria-label={`Edit ${goal.title}`}>
            <Flag className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => { if (confirm(`Delete "${goal.title}"? Its milestones go with it.`)) remove.mutate(goal.id, { onSuccess: () => toast('Goal deleted') }); }}
            className="rounded p-1 text-ink-400 hover:text-rose-600"
            aria-label={`Delete ${goal.title}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
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
              <X className="h-3 w-3" />
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
          <span className="text-[10px] text-ink-400">Recorded:</span>
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

export default function Goals() {
  const nouns = useNouns();
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<'ACTIVE' | 'ALL'>('ACTIVE');
  const [draft, setDraft] = useState({ title: '', description: '', target: '', metric: '', deadline: '', projectId: '' });
  const { data, isLoading, isError, error, refetch } = useGoals({ status: filter === 'ALL' ? 'ALL' : 'ACTIVE' });
  const projects = useProjects();
  const { create } = useGoalMutations();

  const projectNames = useMemo(() => new Map((projects.data?.projects ?? []).map((p) => [p.id, p.title])), [projects.data]);
  const goalNoun = projects.data?.goalNoun ?? 'Goal';

  const submit = () => {
    if (!draft.title.trim()) {
      toast('Give the goal a title', 'error');
      return;
    }
    create.mutate(
      {
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        target: draft.target === '' ? null : Number(draft.target),
        metric: draft.metric.trim() || null,
        deadline: draft.deadline || null,
        projectId: draft.projectId || null,
      },
      {
        onSuccess: () => { toast('Goal created'); setDraft({ title: '', description: '', target: '', metric: '', deadline: '', projectId: '' }); setShowForm(false); },
        onError: (e) => toast((e as Error).message, 'error'),
      },
    );
  };

  if (isError) return <ErrorState message={(error as Error)?.message || 'Could not load your goals'} onRetry={() => void refetch()} />;

  const goals = data?.goals ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">Goals</h1>
          <p className="text-[12px] text-ink-500">Measurable outcomes, broken into milestones you can tick off.</p>
        </div>
        <div className="flex-1" />
        <div className="flex gap-1 rounded-lg border border-[rgb(var(--border))] p-0.5">
          {(['ACTIVE', 'ALL'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={cn('rounded-md px-2.5 py-1 text-[11px] font-semibold transition', filter === v ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300' : 'text-ink-500 hover:text-ink-800 dark:hover:text-ink-200')}
            >
              {v === 'ACTIVE' ? 'Active' : 'All'}
            </button>
          ))}
        </div>
        <Button onClick={() => setShowForm((s) => !s)} icon={<Plus className="h-4 w-4" />}>New goal</Button>
      </div>

      {showForm && (
        <Card className="p-4">
          <CardHeader
            title={`New ${goalNoun.toLowerCase()}`}
            subtitle="A target is optional — without one the milestones are the progress"
            icon={<Target className="h-4 w-4" />}
            action={<button onClick={() => setShowForm(false)} className="rounded p-1 text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800" aria-label="Close"><X className="h-4 w-4" /></button>}
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Title"><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Finish the syllabus" autoFocus /></Field>
            </div>
            <Field label="Target (optional)"><Input type="number" value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} placeholder="13" /></Field>
            <Field label="Unit (optional)"><Input value={draft.metric} onChange={(e) => setDraft({ ...draft, metric: e.target.value })} placeholder="chapters" /></Field>
            <Field label="Deadline (optional)"><Input type="date" value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} /></Field>
            <Field label={`${nouns.project} (optional)`}>
              <select className="input" value={draft.projectId} onChange={(e) => setDraft({ ...draft, projectId: e.target.value })}>
                <option value="">None</option>
                {(projects.data?.projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Description (optional)"><Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button onClick={submit} loading={create.isPending} icon={<Check className="h-4 w-4" />}>Create goal</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
      ) : goals.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<Target className="h-5 w-5" />}
            title={filter === 'ALL' ? 'No goals yet' : 'No active goals'}
            description="A goal gives the work a finish line. Add a target and a few milestones, and the progress bar means something."
            action={<Button onClick={() => setShowForm(true)} icon={<Plus className="h-4 w-4" />}>New goal</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} projectTitle={g.project ? projectNames.get(g.project.id) ?? g.project.title : undefined} />
          ))}
        </div>
      )}

      <Card className="p-3">
        <Link to="/projects" className="text-[12px] font-semibold text-brand-600 hover:underline dark:text-brand-400">
          Browse {nouns.projects.toLowerCase()} →
        </Link>
      </Card>
    </div>
  );
}
