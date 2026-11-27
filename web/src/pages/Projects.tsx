import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronRight,
  Clock,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Field, Skeleton, Textarea, toast } from '@/components/ui';
import { useNouns } from '@/lib/occupation';
import {
  KIND_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  useProjectMutations,
  useProjects,
  type ProjectListResponse,
} from '@/lib/studyWork';
import type { ProjectDto, ProjectKind, ProjectStatus } from '@/lib/types';
import { cn, formatDate, formatMinutes } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// Projects / Subjects / Client projects — one screen, the person's word.
// ─────────────────────────────────────────────────────────────
// The container is called whatever OCCUPATION_PROFILES calls it: "Subject" for
// a student, "Client project" for a freelancer, "Initiative" for a business
// owner. The columns underneath are identical, which is why there is one page.

const KIND_OPTIONS: ProjectKind[] = ['STUDY', 'WORK', 'CLIENT', 'BUSINESS', 'JOB_SEARCH', 'PERSONAL'];
const STATUS_OPTIONS: ProjectStatus[] = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED'];

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

/**
 * Progress bar for a container.
 *
 * `progress === null` means the container has no tasks. Drawing a 0% bar there
 * would read as "nothing done" when the truth is "nothing to do yet", so the
 * row says so in words instead.
 */
export function ProgressBar({ progress, tasks }: { progress: number | null; tasks: { done: number; total: number } }) {
  if (progress === null) {
    return <p className="text-[11px] text-ink-400">No tasks yet — no progress to report</p>;
  }
  return (
    <div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-1 text-[10px] text-ink-400">
        {tasks.done} of {tasks.total} tasks · {progress}%
      </p>
    </div>
  );
}

interface DraftProject {
  id?: string;
  title: string;
  description: string;
  kind: ProjectKind;
  status: ProjectStatus;
  code: string;
  deadline: string;
}

function emptyDraft(kind: ProjectKind): DraftProject {
  return { title: '', description: '', kind, status: 'ACTIVE', code: '', deadline: '' };
}

export function ProjectForm({
  initial,
  kinds,
  noun,
  onDone,
  onCancel,
}: {
  initial?: ProjectDto;
  kinds: ProjectKind[];
  noun: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { create, update } = useProjectMutations();
  const [draft, setDraft] = useState<DraftProject>(
    initial
      ? {
          id: initial.id,
          title: initial.title,
          description: initial.description ?? '',
          kind: initial.kind,
          status: initial.status,
          code: initial.code ?? '',
          deadline: initial.deadline ? initial.deadline.slice(0, 10) : '',
        }
      : emptyDraft(kinds[0] ?? 'WORK'),
  );

  const submit = () => {
    if (!draft.title.trim()) {
      toast(`Give the ${noun.toLowerCase()} a title`, 'error');
      return;
    }
    const body = {
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      kind: draft.kind,
      status: draft.status,
      code: draft.code.trim() || null,
      deadline: draft.deadline || null,
    };
    const done = { onSuccess: () => { toast(initial ? 'Saved' : `${noun} created`); onDone(); }, onError: (e: Error) => toast(e.message, 'error') };
    if (initial) update.mutate({ id: initial.id, ...body }, done);
    else create.mutate(body, done);
  };

  return (
    <Card className="p-4">
      <CardHeader
        title={initial ? `Edit ${noun.toLowerCase()}` : `New ${noun.toLowerCase()}`}
        icon={<Layers className="h-4 w-4" />}
        action={
          <button onClick={onCancel} className="rounded p-1 text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        }
      />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Title">
            <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={`e.g. ${noun === 'Subject' ? 'Data Structures' : 'Website redesign'}`} autoFocus />
          </Field>
        </div>
        <Field label="Type">
          <select className="input" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as ProjectKind })}>
            {KIND_OPTIONS.filter((k) => kinds.length === 0 || kinds.includes(k)).map((k) => (
              <option key={k} value={k}>{KIND_LABEL[k]}</option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className="input" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as ProjectStatus })}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </Field>
        <Field label={draft.kind === 'STUDY' ? 'Subject code (optional)' : 'Client or code (optional)'}>
          <Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder={draft.kind === 'STUDY' ? 'CS201' : 'Acme Ltd'} />
        </Field>
        <Field label="Deadline (optional)">
          <Input type="date" value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description (optional)">
            <Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="What this covers" />
          </Field>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button onClick={submit} loading={create.isPending || update.isPending} icon={<Check className="h-4 w-4" />}>
          {initial ? 'Save' : `Create ${noun.toLowerCase()}`}
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  );
}

function ProjectRow({ project, noun, onEdit }: { project: ProjectDto; noun: string; onEdit: () => void }) {
  const { update, remove } = useProjectMutations();
  const [menu, setMenu] = useState(false);
  const archived = Boolean(project.archivedAt);

  return (
    <div className={cn('rounded-xl border border-[rgb(var(--border))] p-3 transition hover:border-brand-300/60', archived && 'opacity-60')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link to={`/projects/${project.id}`} className="truncate text-[13px] font-bold text-ink-900 hover:underline dark:text-white">
              {project.title}
            </Link>
            {project.code && <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-500 dark:bg-ink-800 dark:text-ink-300">{project.code}</span>}
            <Badge tone="neutral">{KIND_LABEL[project.kind]}</Badge>
            <ProjectStatusBadge status={project.status} />
          </div>
          {project.description && <p className="mt-0.5 line-clamp-1 text-[11px] text-ink-500">{project.description}</p>}
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <ProgressBar progress={project.progress} tasks={project.tasks} />
            <p className="text-[11px] text-ink-500 sm:text-right">
              <Clock className="mr-1 inline h-3 w-3" />
              {project.sessionMinutes ? formatMinutes(project.sessionMinutes) : 'no time yet'}
            </p>
            <p className="text-[11px] text-ink-500 sm:text-right">
              {project.deadline ? (
                <>
                  <CalendarClock className="mr-1 inline h-3 w-3" />
                  {formatDate(new Date(project.deadline))}
                </>
              ) : (
                'no deadline'
              )}
            </p>
          </div>
        </div>
        <div className="relative shrink-0">
          <button onClick={() => setMenu((m) => !m)} className="rounded p-1 text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800" aria-label={`Actions for ${project.title}`}>
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menu && (
            <div className="absolute right-0 top-7 z-10 w-40 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-1 shadow-lg">
              <button onClick={() => { setMenu(false); onEdit(); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-ink-100 dark:hover:bg-ink-800">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button
                onClick={() => { setMenu(false); update.mutate({ id: project.id, archived: !archived }, { onSuccess: () => toast(archived ? 'Restored' : 'Archived') }); }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-ink-100 dark:hover:bg-ink-800"
              >
                {archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                {archived ? 'Restore' : 'Archive'}
              </button>
              <button
                onClick={() => {
                  setMenu(false);
                  if (!confirm(`Delete "${project.title}"? Its tasks and sessions are kept, but will no longer be filed under it.`)) return;
                  remove.mutate(project.id, { onSuccess: () => toast('Deleted') });
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Projects() {
  const nouns = useNouns();
  const [archivedView, setArchivedView] = useState<'exclude' | 'only'>('exclude');
  const [kindFilter, setKindFilter] = useState<ProjectKind | 'ALL'>('ALL');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProjectDto | null>(null);
  const { data, isLoading, isError, error, refetch } = useProjects({ archived: archivedView, kind: kindFilter === 'ALL' ? undefined : kindFilter });

  const noun = data?.noun ?? nouns.project;
  const kinds = data?.kinds ?? [];

  const grouped = useMemo(() => {
    const list = data?.projects ?? [];
    return STATUS_OPTIONS.map((s) => ({ status: s, items: list.filter((p) => p.status === s) })).filter((g) => g.items.length > 0);
  }, [data]);

  if (isError) return <ErrorState message={(error as Error)?.message || 'Could not load your projects'} onRetry={() => void refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">{nouns.projects}</h1>
          <p className="text-[12px] text-ink-500">Everything you are working on, and how far each one has actually got.</p>
        </div>
        <div className="flex-1" />
        <div className="flex gap-1 rounded-lg border border-[rgb(var(--border))] p-0.5">
          {(['exclude', 'only'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setArchivedView(v)}
              className={cn('rounded-md px-2.5 py-1 text-[11px] font-semibold transition', archivedView === v ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300' : 'text-ink-500 hover:text-ink-800 dark:hover:text-ink-200')}
            >
              {v === 'exclude' ? 'Active' : 'Archived'}
            </button>
          ))}
        </div>
        <Button onClick={() => { setCreating(true); setEditing(null); }} icon={<Plus className="h-4 w-4" />}>
          New {noun.toLowerCase()}
        </Button>
      </div>

      {(creating || editing) && (
        <ProjectForm
          initial={editing ?? undefined}
          kinds={kinds}
          noun={noun}
          onDone={() => { setCreating(false); setEditing(null); }}
          onCancel={() => { setCreating(false); setEditing(null); }}
        />
      )}

      {kinds.length > 1 && (
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setKindFilter('ALL')} className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', kindFilter === 'ALL' ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'border border-[rgb(var(--border))] text-ink-500')}>
            All types
          </button>
          {kinds.map((k) => (
            <button key={k} onClick={() => setKindFilter(k)} className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', kindFilter === k ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'border border-[rgb(var(--border))] text-ink-500')}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : grouped.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<Layers className="h-5 w-5" />}
            title={archivedView === 'only' ? 'Nothing archived' : `No ${nouns.projects.toLowerCase()} yet`}
            description={
              archivedView === 'only'
                ? 'Archived containers stay here with their history, out of the way.'
                : `Create a ${noun.toLowerCase()} and every task, session and deadline you add files itself under it.`
            }
            action={archivedView === 'exclude' ? <Button onClick={() => setCreating(true)} icon={<Plus className="h-4 w-4" />}>New {noun.toLowerCase()}</Button> : undefined}
          />
        </Card>
      ) : (
        grouped.map((g) => (
          <section key={g.status} className="space-y-2">
            <div className="flex items-center gap-2">
              <ProjectStatusBadge status={g.status} />
              <span className="text-[11px] text-ink-400">{g.items.length}</span>
              <div className="h-px flex-1 bg-[rgb(var(--border))]" />
            </div>
            {g.items.map((p) => (
              <ProjectRow key={p.id} project={p} noun={noun} onEdit={() => { setEditing(p); setCreating(false); }} />
            ))}
          </section>
        ))
      )}

      <Card className="p-3">
        <Link to="/goals" className="flex items-center gap-2 text-[12px] font-semibold text-brand-600 hover:underline dark:text-brand-400">
          <Target className="h-4 w-4" /> Goals and milestones <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Card>
    </div>
  );
}

export { KIND_OPTIONS, STATUS_OPTIONS };
export type { ProjectListResponse };
export { ChevronRight };
