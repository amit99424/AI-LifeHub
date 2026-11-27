import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Award,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Compass,
  Gauge,
  GraduationCap,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, Modal, ProgressBar, Select, Skeleton, Textarea, toast } from '@/components/ui';
import {
  CATEGORY_LABEL,
  EVIDENCE_LABEL,
  LEVEL_LABEL,
  PLAN_ITEM_LABEL,
  PLAN_STATUS_TONE,
  SKILL_STATUS_LABEL,
  SKILL_STATUS_TONE,
  fmtDate,
  fmtMinutes,
  useGrowth,
  usePlanMutations,
  usePlans,
  useSkillMutations,
  useSkills,
} from '@/lib/growth';
import type { DevelopmentPlanDto, PlanItemDto, SkillDto, SkillLevel } from '@/lib/types';

// ─────────────────────────────────────────────────────────────
// Growth Hub
// ─────────────────────────────────────────────────────────────
// Every figure on this page comes from the server's growth read, which is
// computed from recorded rows only. The page never adds up its own totals, so
// what is shown here cannot drift from what is stored. Where there is nothing
// recorded it says so instead of drawing a zero.

const TABS = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'skills', label: 'Skills', icon: GraduationCap },
  { id: 'plans', label: 'Plans', icon: Compass },
] as const;
type TabId = (typeof TABS)[number]['id'];

const LEVELS: SkillLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'];

export default function GrowthHub() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabId) ?? 'overview';
  const setTab = (id: TabId) => {
    const next = new URLSearchParams(params);
    if (id === 'overview') next.delete('tab');
    else next.set('tab', id);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">Growth Hub</h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            Skills, plans and what your own records actually show.
          </p>
        </div>
        <div className="flex gap-1 rounded-xl bg-ink-100 p-1 dark:bg-ink-800/60">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition sm:flex-none ${
                  active
                    ? 'bg-white text-brand-700 shadow-sm dark:bg-ink-900 dark:text-brand-300'
                    : 'text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-100'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </header>

      {tab === 'overview' && <Overview onOpenSkills={() => setTab('skills')} />}
      {tab === 'skills' && <SkillsTab />}
      {tab === 'plans' && <PlansTab />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Overview
// ─────────────────────────────────────────────────────────────

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-ink-200/70 bg-white p-4 dark:border-ink-800 dark:bg-ink-900/40">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink-900 dark:text-ink-50">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}

function Overview({ onOpenSkills }: { onOpenSkills: () => void }) {
  const { data, isLoading, error, refetch } = useGrowth(30);

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;

  const g = data?.growth;
  if (!g) return null;

  if (!g.hasAnyRecord) {
    return (
      <EmptyState
        icon={<GraduationCap className="h-8 w-8" />}
        title="Nothing recorded yet"
        description="Add a skill you are working on. The growth read only reports what your records show, so there is nothing to measure until something is recorded."
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={onOpenSkills}>
            Add your first skill
          </Button>
        }
      />
    );
  }

  const maxWeekly = Math.max(1, ...g.weekly.map((w) => w.minutes));

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-lg font-semibold text-ink-900 dark:text-ink-50">{g.summary.headline}</p>
            <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{g.summary.detail}</p>
          </div>
          <Badge tone={g.sufficiency.enough ? 'info' : 'warning'}>
            {g.window.days}-day window
          </Badge>
        </div>
      </Card>

      {/* Two columns from the smallest width: four full-width tiles pushed the
          rest of the page below the fold on a phone. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Skills tracked" value={String(g.totals.skills)} hint={`${g.totals.active} active`} />
        <Stat label="Practice recorded" value={fmtMinutes(g.totals.practiceMinutes)} hint={`${g.totals.practiceDays} day${g.totals.practiceDays === 1 ? '' : 's'}`} />
        <Stat
          label="Level changes"
          value={String(g.totals.levelsGained)}
          hint={g.totals.levelsGained === 0 ? 'none recorded in this window' : 'recorded, upward'}
        />
        <Stat label="Evidence" value={String(g.totals.evidence)} hint={`${g.totals.activePlans} active plan${g.totals.activePlans === 1 ? '' : 's'}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Improving" subtitle="Only skills whose recorded level went up in this window." icon={<TrendingUp className="h-4 w-4" />} />
          {g.improving.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500 dark:text-ink-400">
              No level change was recorded in this window. Practising without recording a new level is not counted as improvement — the history is what makes it a fact.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {g.improving.map((s) => (
                <li key={s.skillId} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-50">{s.name}</p>
                    <p className="text-xs text-ink-500 dark:text-ink-400">{s.evidence}</p>
                  </div>
                  <Badge tone="success">
                    {s.levelAtWindowStart ? LEVEL_LABEL[s.levelAtWindowStart] : '—'} → {LEVEL_LABEL[s.currentLevel]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Needs attention" subtitle="Active skills with no recent recorded activity." icon={<AlertTriangle className="h-4 w-4" />} />
          {g.needingAttention.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500 dark:text-ink-400">Nothing is currently stalled by the data.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {g.needingAttention.map((n) => (
                <li key={n.skill.skillId}>
                  <p className="text-sm font-medium text-ink-900 dark:text-ink-50">{n.skill.name}</p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">{n.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Learning consistency" subtitle="From recorded practice days only." icon={<Activity className="h-4 w-4" />} />
          <div className="mt-3 space-y-2">
            <p className="text-sm text-ink-600 dark:text-ink-300">{g.consistency.note}</p>
            {!g.consistency.thin && (
              <div className="flex gap-2">
                <Badge tone="brand">Current streak {g.consistency.currentStreak}d</Badge>
                <Badge tone="neutral">Best {g.consistency.bestStreak}d</Badge>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Weekly practice" subtitle="Minutes recorded, week by week." icon={<BookOpen className="h-4 w-4" />} />
          {g.weekly.length === 0 || g.weekly.every((w) => w.minutes === 0) ? (
            <p className="mt-3 text-sm text-ink-500 dark:text-ink-400">No practice minutes recorded in this window.</p>
          ) : (
            <div className="mt-3 flex h-24 items-end gap-1.5">
              {g.weekly.map((w) => (
                <div key={w.weekStart} className="group flex flex-1 flex-col items-center justify-end gap-1">
                  <div
                    className="w-full rounded-t bg-brand-500/70 transition group-hover:bg-brand-500"
                    style={{ height: `${Math.max(3, (w.minutes / maxWeekly) * 100)}%` }}
                    title={`Week of ${fmtDate(w.weekStart)}: ${fmtMinutes(w.minutes)}`}
                  />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Goal gaps" subtitle="Only goals with a recorded number and a target." icon={<Target className="h-4 w-4" />} />
          {g.goals.behind.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500 dark:text-ink-400">
              {g.goals.withTarget === 0
                ? 'None of your goals have a target number, so there is no gap to measure.'
                : 'No goal with a target is behind right now.'}
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {g.goals.behind.map((b) => (
                <li key={b.id}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-50">{b.title}</p>
                    <span className="shrink-0 text-xs text-ink-500 dark:text-ink-400">
                      {b.current ?? 0}/{b.target ?? '?'} {b.metric ?? ''}
                    </span>
                  </div>
                  <ProgressBar value={Math.round(b.fraction * 100)} className="mt-1.5" tone="warning" />
                  <p className="mt-1 text-xs text-ink-400">Due {fmtDate(b.deadline)}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-ink-400">
            Milestones: {g.goals.milestonesDone} of {g.goals.milestonesTotal} done.
          </p>
        </Card>

        <Card>
          <CardHeader title="Next steps" subtitle="Each one names the record it came from." icon={<ArrowUpRight className="h-4 w-4" />} />
          {g.nextSteps.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500 dark:text-ink-400">Nothing needs a next step from what is recorded.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {g.nextSteps.map((s, i) => (
                <li key={`${s.kind}-${i}`} className="flex gap-2 text-sm text-ink-600 dark:text-ink-300">
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                  <span>{s.text}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Recent achievements" subtitle="Evidence you attached, newest first." icon={<Award className="h-4 w-4" />} />
        {g.recentEvidence.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500 dark:text-ink-400">No evidence attached yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-ink-100 dark:divide-ink-800">
            {g.recentEvidence.slice(0, 6).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink-900 dark:text-ink-50">{e.title}</p>
                  <p className="text-xs text-ink-400">
                    {e.skillName} · {EVIDENCE_LABEL[e.kind] ?? e.kind}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-ink-400">{fmtDate(e.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Skills
// ─────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '',
  category: 'TECHNICAL',
  currentLevel: 'BEGINNER' as SkillLevel,
  targetLevel: '' as '' | SkillLevel,
  description: '',
  motivation: '',
};

function SkillsTab() {
  const [archived, setArchived] = useState<'exclude' | 'only'>('exclude');
  const { data, isLoading, error, refetch } = useSkills({ archived });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SkillDto | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (isLoading) return <Skeleton className="h-64" />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;

  const skills = data?.skills ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-lg bg-ink-100 p-1 text-sm dark:bg-ink-800/60">
          <button
            type="button"
            onClick={() => setArchived('exclude')}
            className={`rounded-md px-3 py-1.5 ${archived === 'exclude' ? 'bg-white font-medium text-ink-900 shadow-sm dark:bg-ink-900 dark:text-ink-50' : 'text-ink-500 dark:text-ink-400'}`}
          >
            Current
          </button>
          <button
            type="button"
            onClick={() => setArchived('only')}
            className={`rounded-md px-3 py-1.5 ${archived === 'only' ? 'bg-white font-medium text-ink-900 shadow-sm dark:bg-ink-900 dark:text-ink-50' : 'text-ink-500 dark:text-ink-400'}`}
          >
            Archived
          </button>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
          Add skill
        </Button>
      </div>

      {skills.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-8 w-8" />}
          title={archived === 'only' ? 'No archived skills' : 'No skills yet'}
          description={
            archived === 'only'
              ? 'Archived skills keep their history and their evidence. Nothing has been archived.'
              : 'Add a skill and set where you are now and where you want to get to. Levels only change when you record a change, so the history stays honest.'
          }
          action={
            archived === 'exclude' ? (
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
                Add your first skill
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {skills.map((s) => (
            <SkillCard
              key={s.id}
              skill={s}
              expanded={expanded === s.id}
              onToggle={() => setExpanded(expanded === s.id ? null : s.id)}
              onEdit={() => setEditing(s)}
            />
          ))}
        </div>
      )}

      <SkillFormModal open={creating} onClose={() => setCreating(false)} />
      {editing && <SkillFormModal open skill={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function SkillCard({ skill, expanded, onToggle, onEdit }: { skill: SkillDto; expanded: boolean; onToggle: () => void; onEdit: () => void }) {
  const { archive } = useSkillMutations();
  const isArchived = Boolean(skill.archivedAt);

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium text-ink-900 dark:text-ink-50">{skill.name}</h3>
            <Badge tone={SKILL_STATUS_TONE[skill.status] ?? 'neutral'}>{SKILL_STATUS_LABEL[skill.status] ?? skill.status}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{CATEGORY_LABEL[skill.category] ?? skill.category}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-medium text-ink-900 dark:text-ink-50">{LEVEL_LABEL[skill.currentLevel]}</p>
          <p className="text-xs text-ink-400">{skill.targetLevel ? `→ ${LEVEL_LABEL[skill.targetLevel]}` : 'no target set'}</p>
        </div>
      </div>

      {skill.motivation && <p className="mt-2 line-clamp-2 text-sm text-ink-600 dark:text-ink-300">{skill.motivation}</p>}

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge tone="neutral">{skill.updates.length} recorded change{skill.updates.length === 1 ? '' : 's'}</Badge>
        <Badge tone="neutral">{skill.evidence.length} evidence</Badge>
        {skill.goals.length > 0 && <Badge tone="brand">{skill.goals.length} goal{skill.goals.length === 1 ? '' : 's'}</Badge>}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          History and evidence
        </button>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit} disabled={isArchived}>
            Edit
          </Button>
          {!isArchived && (
            <Button
              variant="ghost"
              size="sm"
              loading={archive.isPending}
              onClick={() =>
                archive.mutate(skill.id, {
                  onSuccess: () => toast(`"${skill.name}" archived`, 'success'),
                  onError: (e) => toast((e as Error).message, 'error'),
                })
              }
            >
              Archive
            </Button>
          )}
        </div>
      </div>

      {expanded && <SkillDetail skill={skill} />}
    </Card>
  );
}

function SkillDetail({ skill }: { skill: SkillDto }) {
  const { addEvidence, removeEvidence } = useSkillMutations();
  const [kind, setKind] = useState('PROJECT');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');

  const history = useMemo(() => [...skill.updates].sort((a, b) => b.at.localeCompare(a.at)), [skill.updates]);

  return (
    <div className="mt-4 space-y-4 border-t border-ink-100 pt-4 dark:border-ink-800">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Level history</p>
        <ol className="mt-2 space-y-2">
          {history.map((u) => (
            <li key={u.id} className="flex gap-2 text-sm">
              <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              <div className="min-w-0">
                <p className="text-ink-800 dark:text-ink-100">
                  {u.fromLevel ? `${LEVEL_LABEL[u.fromLevel]} → ${LEVEL_LABEL[u.toLevel]}` : `Starting level: ${LEVEL_LABEL[u.toLevel]}`}
                </p>
                <p className="text-xs text-ink-400">
                  {fmtDate(u.at)}
                  {u.minutes ? ` · ${fmtMinutes(u.minutes)} practised` : ''}
                </p>
                {u.note && <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{u.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Evidence</p>
        {skill.evidence.length === 0 ? (
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">Nothing attached yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {skill.evidence.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink-800 dark:text-ink-100">{e.title}</p>
                  <p className="text-xs text-ink-400">
                    {EVIDENCE_LABEL[e.kind] ?? e.kind}
                    {e.date ? ` · ${fmtDate(e.date)}` : ''}
                  </p>
                  {e.url && (
                    <a href={e.url} target="_blank" rel="noreferrer noopener" className="text-xs text-brand-600 hover:underline dark:text-brand-400">
                      Open link
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Remove evidence"
                  className="shrink-0 rounded p-1 text-ink-400 hover:text-danger-600"
                  onClick={() =>
                    removeEvidence.mutate(
                      { id: skill.id, evidenceId: e.id },
                      { onSuccess: () => toast('Evidence removed', 'success'), onError: (err) => toast((err as Error).message, 'error') },
                    )
                  }
                >
                  <XCircle className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-32 shrink-0">
              {Object.entries(EVIDENCE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Input placeholder="What is it?" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <Input placeholder="Link (optional)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button
            size="sm"
            variant="secondary"
            loading={addEvidence.isPending}
            disabled={!title.trim()}
            onClick={() =>
              addEvidence.mutate(
                { id: skill.id, kind, title: title.trim(), url: url.trim() || null },
                {
                  onSuccess: () => {
                    setTitle('');
                    setUrl('');
                    toast('Evidence added', 'success');
                  },
                  onError: (err) => toast((err as Error).message, 'error'),
                },
              )
            }
          >
            Attach evidence
          </Button>
        </div>
      </div>
    </div>
  );
}

function SkillFormModal({ open, skill, onClose }: { open: boolean; skill?: SkillDto; onClose: () => void }) {
  const { create, update, recordUpdate } = useSkillMutations();
  const [form, setForm] = useState(() =>
    skill
      ? {
          name: skill.name,
          category: skill.category,
          currentLevel: skill.currentLevel,
          targetLevel: (skill.targetLevel ?? '') as '' | SkillLevel,
          description: skill.description ?? '',
          motivation: skill.motivation ?? '',
        }
      : EMPTY_FORM,
  );
  // A level change is recorded separately from an edit: the two produce
  // different records, and only one of them is history.
  const [levelChange, setLevelChange] = useState(false);
  const [levelNote, setLevelNote] = useState('');
  const [levelMinutes, setLevelMinutes] = useState('');
  const [status, setStatus] = useState<SkillDto['status']>(skill?.status ?? 'ACTIVE');

  const levelMoved = Boolean(skill) && form.currentLevel !== skill!.currentLevel;
  const busy = create.isPending || update.isPending || recordUpdate.isPending;

  const submit = async () => {
    try {
      if (!skill) {
        await create.mutateAsync({
          name: form.name.trim(),
          category: form.category,
          currentLevel: form.currentLevel,
          targetLevel: form.targetLevel || null,
          description: form.description.trim() || null,
          motivation: form.motivation.trim() || null,
        });
        toast('Skill added', 'success');
      } else {
        await update.mutateAsync({
          id: skill.id,
          name: form.name.trim(),
          category: form.category,
          targetLevel: form.targetLevel || null,
          description: form.description.trim() || null,
          motivation: form.motivation.trim() || null,
          status,
          // Only send the level when the user asked to record the change.
          ...(levelMoved && levelChange ? { currentLevel: form.currentLevel, recordChange: true, levelNote: levelNote.trim() || null, practiceMinutes: levelMinutes ? Number(levelMinutes) : null } : {}),
        });
        toast(levelMoved && levelChange ? 'Level change recorded' : 'Skill updated', 'success');
      }
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={skill ? 'Edit skill' : 'Add a skill'}>
      <div className="space-y-3">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. TypeScript, Public speaking" autoFocus />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as SkillDto['category'] })}>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={skill ? 'Status' : 'Starting level'}>
            {skill ? (
              <Select value={status} onChange={(e) => setStatus(e.target.value as SkillDto['status'])}>
                {Object.entries(SKILL_STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            ) : (
              <Select value={form.currentLevel} onChange={(e) => setForm({ ...form, currentLevel: e.target.value as SkillLevel })}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABEL[l]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        {skill && (
          <Field label="Current level" hint="Changing this records a level change in the history.">
            <Select
              value={form.currentLevel}
              onChange={(e) => {
                setForm({ ...form, currentLevel: e.target.value as SkillLevel });
                setLevelChange(true);
              }}
            >
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {levelMoved && levelChange && (
          <div className="space-y-2 rounded-lg border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-500/30 dark:bg-brand-500/5">
            <p className="text-xs text-ink-600 dark:text-ink-300">
              This will add a history row: {skill!.currentLevel} → {form.currentLevel}. That row is what makes an improvement a fact.
            </p>
            <Field label="Note (optional)">
              <Input value={levelNote} onChange={(e) => setLevelNote(e.target.value)} placeholder="What changed?" />
            </Field>
            <Field label="Minutes practised (optional)">
              <Input type="number" min={0} value={levelMinutes} onChange={(e) => setLevelMinutes(e.target.value)} placeholder="e.g. 90" />
            </Field>
            <button type="button" className="text-xs text-ink-500 underline" onClick={() => { setLevelChange(false); setForm({ ...form, currentLevel: skill!.currentLevel }); }}>
              Cancel the level change
            </button>
          </div>
        )}

        <Field label="Target level" hint="Leave empty if there is no target — then no distance is reported.">
          <Select value={form.targetLevel} onChange={(e) => setForm({ ...form, targetLevel: e.target.value as '' | SkillLevel })}>
            <option value="">No target</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABEL[l]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Why this skill (optional)">
          <Textarea rows={2} value={form.motivation} onChange={(e) => setForm({ ...form, motivation: e.target.value })} />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!form.name.trim()} onClick={() => void submit()}>
            {skill ? 'Save' : 'Add skill'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Plans
// ─────────────────────────────────────────────────────────────

function PlansTab() {
  const { data, isLoading, error, refetch } = usePlans();
  const { generate } = usePlanMutations();
  const [open, setOpen] = useState<DevelopmentPlanDto | null>(null);
  const [horizon, setHorizon] = useState('4');
  const [weekly, setWeekly] = useState('');
  const [intent, setIntent] = useState('');
  const [showForm, setShowForm] = useState(false);

  const plans = data?.plans ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Generate a plan"
          subtitle="The AI reads your recorded skills, goals and workload. It writes a draft — nothing is added to your goals or tasks until you apply it."
          icon={<Sparkles className="h-4 w-4" />}
          action={
            <Button variant="secondary" onClick={() => setShowForm((v) => !v)}>
              {showForm ? 'Hide' : 'Options'}
            </Button>
          }
        />
        {showForm && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Horizon (weeks)">
              <Select value={horizon} onChange={(e) => setHorizon(e.target.value)}>
                {['2', '4', '6', '8', '12'].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Minutes per week" hint="Optional. Left empty, the plan makes no claim about your time.">
              <Input type="number" min={30} value={weekly} onChange={(e) => setWeekly(e.target.value)} placeholder="e.g. 180" />
            </Field>
            <Field label="What you want from this" hint="Optional.">
              <Input value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="e.g. get interview-ready" />
            </Field>
          </div>
        )}
        <div className="mt-3">
          <Button
            icon={<Sparkles className="h-4 w-4" />}
            loading={generate.isPending}
            onClick={() =>
              generate.mutate(
                { horizonWeeks: Number(horizon), weeklyMinutes: weekly ? Number(weekly) : null, intent: intent.trim() || null },
                {
                  onSuccess: (r) => {
                    toast(
                      r.generatedBy === 'ai' ? 'Draft plan generated' : 'Draft plan built from your records (AI was unavailable)',
                      r.generatedBy === 'ai' ? 'success' : 'info',
                    );
                    setOpen(r.plan);
                  },
                  onError: (e) => toast((e as Error).message, 'error'),
                },
              )
            }
          >
            Generate draft plan
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : error ? (
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      ) : plans.length === 0 ? (
        <EmptyState
          icon={<Compass className="h-8 w-8" />}
          title="No plans yet"
          description="A plan is a record of a recommendation, not a promise. Generate one and review each item before anything is added to your goals."
        />
      ) : (
        <div className="space-y-3">
          {plans.map((p) => (
            <PlanRow key={p.id} plan={p} onOpen={() => setOpen(p)} />
          ))}
        </div>
      )}

      {open && <PlanModal plan={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function PlanRow({ plan, onOpen }: { plan: DevelopmentPlanDto; onOpen: () => void }) {
  return (
    <Card className="cursor-pointer hover:border-brand-300 dark:hover:border-brand-500/40" onClick={onOpen}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium text-ink-900 dark:text-ink-50">{plan.title}</h3>
            <Badge tone={PLAN_STATUS_TONE[plan.status] ?? 'neutral'}>{plan.status}</Badge>
            <Badge tone={plan.source === 'AI' ? 'brand' : 'neutral'}>{plan.source === 'AI' ? 'AI draft' : 'Built from records'}</Badge>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-ink-600 dark:text-ink-300">{plan.summary}</p>
        </div>
        <div className="shrink-0 text-right text-xs text-ink-400">
          <p>{plan.appliedCount}/{plan.itemCount} applied</p>
          <p className="mt-0.5">{plan.horizonWeeks} weeks</p>
        </div>
      </div>
    </Card>
  );
}

function PlanModal({ plan, onClose }: { plan: DevelopmentPlanDto; onClose: () => void }) {
  const { applyItem, applyAll, setStatus, remove } = usePlanMutations();
  const [current, setCurrent] = useState(plan);

  const byWeek = useMemo(() => {
    const m = new Map<number, PlanItemDto[]>();
    for (const i of current.items) {
      const list = m.get(i.week) ?? [];
      list.push(i);
      m.set(i.week, list);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [current.items]);

  return (
    <Modal open onClose={onClose} title={current.title} size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={PLAN_STATUS_TONE[current.status] ?? 'neutral'}>{current.status}</Badge>
          <Badge tone={current.source === 'AI' ? 'brand' : 'neutral'}>{current.source === 'AI' ? 'AI draft' : 'Built from records'}</Badge>
          <span className="text-xs text-ink-400">
            {current.appliedCount}/{current.itemCount} applied · {current.horizonWeeks} weeks
            {current.weeklyMinutes ? ` · ${fmtMinutes(current.weeklyMinutes)}/week` : ''}
          </span>
        </div>

        {current.summary && <p className="text-sm text-ink-600 dark:text-ink-300">{current.summary}</p>}

        <div className="rounded-lg border border-ink-200 bg-ink-50/60 p-3 text-xs text-ink-500 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-400">
          This is a recommendation, not a record of anything you have done. Applying an item creates a real goal, milestone or task — you choose which ones.
        </div>

        <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
          {byWeek.map(([week, items]) => (
            <div key={week}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">Week {week}</p>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.id} className="rounded-lg border border-ink-200 p-2.5 dark:border-ink-800">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={item.kind === 'OBJECTIVE' ? 'brand' : item.kind === 'MILESTONE' ? 'info' : 'neutral'}>
                            {PLAN_ITEM_LABEL[item.kind] ?? item.kind}
                          </Badge>
                          {item.appliedAt && (
                            <span className="flex items-center gap-1 text-xs text-success-600 dark:text-success-400">
                              <CheckCircle2 className="h-3.5 w-3.5" /> applied
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm font-medium text-ink-900 dark:text-ink-50">{item.title}</p>
                        {item.detail && <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{item.detail}</p>}
                        {item.successCriteria && (
                          <p className="mt-1 text-xs text-ink-400">Done when: {item.successCriteria}</p>
                        )}
                      </div>
                      {!item.appliedAt && (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={applyItem.isPending}
                          onClick={() =>
                            applyItem.mutate(
                              { planId: current.id, itemId: item.id },
                              {
                                onSuccess: (r) => {
                                  setCurrent(r.plan);
                                  toast('Added to your records', 'success');
                                },
                                onError: (e) => toast((e as Error).message, 'error'),
                              },
                            )
                          }
                        >
                          Apply
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3 dark:border-ink-800">
          <div className="flex flex-wrap gap-1.5">
            {current.status === 'DRAFT' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setStatus.mutate(
                    { id: current.id, status: 'ACTIVE' },
                    { onSuccess: (r) => { setCurrent(r.plan); toast('Plan marked active', 'success'); }, onError: (e) => toast((e as Error).message, 'error') },
                  )
                }
              >
                Mark active
              </Button>
            )}
            {current.status === 'ACTIVE' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setStatus.mutate(
                    { id: current.id, status: 'COMPLETED' },
                    { onSuccess: (r) => { setCurrent(r.plan); toast('Plan completed', 'success'); }, onError: (e) => toast((e as Error).message, 'error') },
                  )
                }
              >
                Mark completed
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (!window.confirm('Delete this plan? Goals, milestones and tasks you already applied stay in your records.')) return;
                remove.mutate(current.id, {
                  onSuccess: () => { toast('Plan deleted', 'success'); onClose(); },
                  onError: (e) => toast((e as Error).message, 'error'),
                });
              }}
            >
              Delete
            </Button>
          </div>
          <Button
            size="sm"
            loading={applyAll.isPending}
            disabled={current.appliedCount === current.itemCount}
            onClick={() =>
              applyAll.mutate(current.id, {
                onSuccess: (r) => { setCurrent(r.plan); toast('All items applied', 'success'); },
                onError: (e) => toast((e as Error).message, 'error'),
              })
            }
          >
            Apply all remaining
          </Button>
        </div>
      </div>
    </Modal>
  );
}
