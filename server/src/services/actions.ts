/**
 * Natural-language actions.
 *
 * The model never writes. It proposes; this file validates the proposal
 * against the user's own records, and the record is only created when the user
 * confirms — through a POST that carries the proposal back and re-runs exactly
 * the same validation.
 *
 * Two things make that safe:
 *   1. Ownership is re-checked at execution from the database, not from the
 *      proposal. A proposal that names someone else's project fails there even
 *      if it was accepted here.
 *   2. Idempotency: a task with the same title, due date and parent already
 *      open is treated as the same task and not created twice.
 */
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/http.js';
import { complete, parseJsonLoose, AIUnconfiguredError } from './llm.js';
import { addDaysKey, todayKey } from '../lib/dates.js';

export const ACTION_KINDS = ['create_task', 'create_goal', 'update_task_status', 'complete_task', 'create_milestone', 'add_skill'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export interface ProposedAction {
  kind: ActionKind;
  /** Human sentence shown on the confirmation card, built from the checked fields. */
  summary: string;
  /** The exact fields the execution will use. Only these are acted on. */
  payload: Record<string, unknown>;
  /** Existing records this action refers to, named so the user can recognise them. */
  references: { task?: { id: string; title: string }; project?: { id: string; title: string }; goal?: { id: string; title: string } };
}

const KINDS_HELP = `Every action object MUST contain "kind". Allowed actions:
- create_task: {"title": string, "dueDate": "YYYY-MM-DD" | null, "projectId": string | null, "goalId": string | null, "priority": "LOW"|"MEDIUM"|"HIGH"|"URGENT"}
- create_goal: {"title": string, "target": number | null, "metric": string | null, "deadline": "YYYY-MM-DD" | null, "projectId": string | null}
- create_milestone: {"goalId": string, "title": string}
- update_task_status: {"taskId": string, "status": "TODO"|"IN_PROGRESS"|"COMPLETED"|"ARCHIVED"}
- complete_task: {"taskId": string}
- add_skill: {"name": string, "category": "TECHNICAL"|"COMMUNICATION"|"LEADERSHIP"|"BUSINESS"|"ACADEMIC"|"CREATIVE"|"PERSONAL"|"OTHER", "targetLevel": "BEGINNER"|"INTERMEDIATE"|"ADVANCED"|"EXPERT" | null}`;

const PROPOSE_SYSTEM = `You turn a user's request into ONE structured action for AI-LifeHub.
Rules:
1. Reply with JSON only: {"action": null} when the request is not an action, or {"action": {"kind": ..., ...fields}} using only the fields listed for that kind.
2. Use only ids that appear in the CONTEXT block. Never invent an id, a project or a goal.
3. Never guess a task id. If the user names a task, match it against CONTEXT and copy its exact id; if no task matches, return {"action": null} and nothing else.
4. Only one action per reply. If the request contains several, choose the first and return null for the rest.
5. No prose, no markdown, no explanation — JSON only.
${KINDS_HELP}`;

function todayFromPrompt(question: string, today: string): string | null {
  const q = question.toLowerCase();
  if (/\btoday\b/.test(q)) return today;
  if (/\btomorrow\b/.test(q)) return addDaysKey(today, 1);
  if (/\bnext week\b/.test(q)) return addDaysKey(today, 7);
  // A bare ISO date in the sentence is taken as the due date.
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(question);
  return iso ? iso[1] : null;
}

interface Context {
  tasks: { id: string; title: string }[];
  projects: { id: string; title: string }[];
  goals: { id: string; title: string }[];
}

async function loadContext(userId: string): Promise<Context> {
  const [tasks, projects, goals] = await Promise.all([
    prisma.task.findMany({ where: { userId, status: { in: ['TODO', 'IN_PROGRESS'] } }, select: { id: true, title: true }, orderBy: { createdAt: 'desc' }, take: 60 }),
    prisma.project.findMany({ where: { userId, archivedAt: null }, select: { id: true, title: true }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.goal.findMany({ where: { userId, status: 'ACTIVE' }, select: { id: true, title: true }, orderBy: { createdAt: 'desc' }, take: 30 }),
  ]);
  return { tasks, projects, goals };
}

/**
 * Ask the model what the user meant, then check every field of the answer
 * against the database before offering it. A rejected proposal is not an error
 * the user should see as one: it means "this was not an action I can take".
 */
export async function proposeAction(userId: string, tz: string, message: string): Promise<ProposedAction | null> {
  const ctx = await loadContext(userId);
  if (!ctx.tasks.length && !ctx.projects.length && !ctx.goals.length) {
    // Nothing to attach an action to: still allow create_task and add_skill.
    // The model gets an explicit "no records" context so it cannot invent ids.
  }
  const today = todayKey(tz);

  const context = [
    `TODAY: ${today}`,
    `OPEN TASKS: ${ctx.tasks.length ? ctx.tasks.map((t) => `${t.id} :: ${t.title}`).join(' | ') : 'none'}`,
    `PROJECTS: ${ctx.projects.length ? ctx.projects.map((p) => `${p.id} :: ${p.title}`).join(' | ') : 'none'}`,
    `ACTIVE GOALS: ${ctx.goals.length ? ctx.goals.map((g) => `${g.id} :: ${g.title}`).join(' | ') : 'none'}`,
  ].join('\n');

  let raw: { action?: Record<string, unknown> | null } = {};
  try {
    const res = await complete(
      [
        { role: 'system', content: PROPOSE_SYSTEM },
        { role: 'user', content: `${context}\n\nREQUEST: ${message}` },
      ],
      { json: true, maxTokens: 400 },
    );
    raw = parseJsonLoose<{ action?: Record<string, unknown> | null }>(res.text);
  } catch (err) {
    if (err instanceof AIUnconfiguredError) {
      // Without a model there is no honest way to read intent, so nothing is
      // proposed rather than guessing.
      return null;
    }
    return null;
  }

  const a = raw.action as (Record<string, unknown> & { kind?: unknown }) | null | undefined;
  // The model sometimes omits "kind" when there is only one obvious action and
  // instead returns the fields alone. Infer it from the fields it did send
  // rather than throwing the proposal away.
  if (a && typeof a.kind !== 'string') {
    const has = (k: string) => k in a;
    a.kind = has('taskId') && has('status')
      ? 'update_task_status'
      : has('taskId')
        ? 'complete_task'
        : has('goalId') && has('title')
          ? 'create_milestone'
          : has('name')
            ? 'add_skill'
            : has('target') || has('metric') || has('deadline')
              ? 'create_goal'
              : has('title')
                ? 'create_task'
                : undefined;
  }
  if (!a || typeof a.kind !== 'string') {
    return null;
  }
  if (!ACTION_KINDS.includes(a.kind as ActionKind)) {
    return null;
  }

  const kind = a.kind as ActionKind;
  const str = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const knownTask = (id: unknown) => ctx.tasks.find((t) => t.id === id);
  const knownProject = (id: unknown) => ctx.projects.find((p) => p.id === id);
  const knownGoal = (id: unknown) => ctx.goals.find((g) => g.id === id);

  switch (kind) {
    case 'create_task': {
      const title = str(a.title);
      if (!title) return null;
      const project = knownProject(a.projectId);
      const goal = knownGoal(a.goalId);
      const due = str(a.dueDate, 10) && /^\d{4}-\d{2}-\d{2}$/.test(String(a.dueDate)) ? String(a.dueDate) : todayFromPrompt(message, today);
      const priority = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(String(a.priority)) ? (a.priority as string) : 'MEDIUM';
      return {
        kind,
        summary: `Create the task "${title}"${due ? ` due ${due}` : ''}${project ? ` in ${project.title}` : ''}${goal ? ` linked to "${goal.title}"` : ''}.`,
        payload: { title, dueDate: due, projectId: project?.id ?? null, goalId: goal?.id ?? null, priority },
        references: { ...(project ? { project } : {}), ...(goal ? { goal } : {}) },
      };
    }
    case 'create_goal': {
      const title = str(a.title);
      if (!title) return null;
      const project = knownProject(a.projectId);
      const target = typeof a.target === 'number' && Number.isFinite(a.target) ? a.target : null;
      const metric = str(a.metric, 40);
      const deadline = str(a.deadline, 10) && /^\d{4}-\d{2}-\d{2}$/.test(String(a.deadline)) ? String(a.deadline) : null;
      return {
        kind,
        summary: `Create the goal "${title}"${target !== null ? ` with a target of ${target}${metric ? ` ${metric}` : ''}` : ' with no target number'}${deadline ? `, due ${deadline}` : ''}.`,
        payload: { title, target, metric, deadline, projectId: project?.id ?? null },
        references: project ? { project } : {},
      };
    }
    case 'create_milestone': {
      const goal = knownGoal(a.goalId);
      const title = str(a.title);
      if (!goal || !title) return null;
      return {
        kind,
        summary: `Add the milestone "${title}" to the goal "${goal.title}".`,
        payload: { goalId: goal.id, title },
        references: { goal },
      };
    }
    case 'update_task_status': {
      const task = knownTask(a.taskId);
      const status = ['TODO', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED'].includes(String(a.status)) ? (a.status as string) : null;
      if (!task || !status) return null;
      return {
        kind,
        summary: `Change "${task.title}" to ${status.replace('_', ' ').toLowerCase()}.`,
        payload: { taskId: task.id, status },
        references: { task },
      };
    }
    case 'complete_task': {
      const task = knownTask(a.taskId);
      if (!task) return null;
      return {
        kind,
        summary: `Mark "${task.title}" as completed.`,
        payload: { taskId: task.id },
        references: { task },
      };
    }
    case 'add_skill': {
      const name = str(a.name, 80);
      if (!name) return null;
      const cats = ['TECHNICAL', 'COMMUNICATION', 'LEADERSHIP', 'BUSINESS', 'ACADEMIC', 'CREATIVE', 'PERSONAL', 'OTHER'];
      const levels = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'];
      const category = cats.includes(String(a.category)) ? (a.category as string) : 'OTHER';
      const targetLevel = levels.includes(String(a.targetLevel)) ? (a.targetLevel as string) : null;
      return {
        kind,
        summary: `Track a new skill "${name}" (${category.toLowerCase()})${targetLevel ? ` towards ${targetLevel.toLowerCase()}` : ''}.`,
        payload: { name, category, targetLevel },
        references: {},
      };
    }
    default:
      return null;
  }
}

/**
 * Execute a confirmed action.
 *
 * Everything is re-validated here against the current database, because the
 * proposal may be minutes old and the world may have moved.
 */
export async function executeAction(userId: string, action: { kind: ActionKind; payload: Record<string, unknown> }) {
  const p = action.payload;
  const str = (k: string) => (typeof p[k] === 'string' && String(p[k]).trim() ? String(p[k]).trim() : null);
  const num = (k: string) => (typeof p[k] === 'number' && Number.isFinite(p[k] as number) ? (p[k] as number) : null);
  const dateish = (k: string) => {
    const v = str(k);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00.000Z`) : null;
  };

  switch (action.kind) {
    case 'create_task': {
      const title = str('title');
      if (!title) throw ApiError.badRequest('A task needs a title');
      const projectId = str('projectId');
      const goalId = str('goalId');
      if (projectId) {
        const owns = await prisma.project.count({ where: { id: projectId, userId } });
        if (!owns) throw ApiError.badRequest('That project does not exist');
      }
      if (goalId) {
        const owns = await prisma.goal.count({ where: { id: goalId, userId } });
        if (!owns) throw ApiError.badRequest('That goal does not exist');
      }
      const dueDate = dateish('dueDate');
      // Idempotency: the same title, due date and links already open is the
      // same task, not a second one.
      const duplicate = await prisma.task.findFirst({
        where: { userId, title, dueDate, projectId, goalId, status: { in: ['TODO', 'IN_PROGRESS'] } },
        select: { id: true },
      });
      if (duplicate) throw ApiError.badRequest(`"${title}" is already open, so it was not created again`);
      const task = await prisma.task.create({
        data: {
          userId,
          title,
          dueDate,
          projectId,
          goalId,
          priority: (['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(String(p.priority)) ? String(p.priority) : 'MEDIUM') as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
          category: 'General',
          status: 'TODO',
        },
      });
      return { kind: action.kind, taskId: task.id, message: `Created "${task.title}".` };
    }
    case 'create_goal': {
      const title = str('title');
      if (!title) throw ApiError.badRequest('A goal needs a title');
      const projectId = str('projectId');
      if (projectId) {
        const owns = await prisma.project.count({ where: { id: projectId, userId } });
        if (!owns) throw ApiError.badRequest('That project does not exist');
      }
      const duplicate = await prisma.goal.findFirst({ where: { userId, title, status: 'ACTIVE' }, select: { id: true } });
      if (duplicate) throw ApiError.badRequest(`An active goal called "${title}" already exists`);
      const goal = await prisma.goal.create({
        data: { userId, title, target: num('target'), metric: str('metric'), deadline: dateish('deadline'), projectId, status: 'ACTIVE' },
      });
      return { kind: action.kind, goalId: goal.id, message: `Created the goal "${goal.title}".` };
    }
    case 'create_milestone': {
      const goalId = str('goalId');
      const title = str('title');
      if (!goalId || !title) throw ApiError.badRequest('A milestone needs a goal and a title');
      const owns = await prisma.goal.count({ where: { id: goalId, userId } });
      if (!owns) throw ApiError.badRequest('That goal does not exist');
      const count = await prisma.milestone.count({ where: { goalId } });
      const m = await prisma.milestone.create({ data: { goalId, userId, title, order: count } });
      return { kind: action.kind, milestoneId: m.id, message: `Added the milestone "${m.title}".` };
    }
    case 'update_task_status':
    case 'complete_task': {
      const taskId = str('taskId');
      if (!taskId) throw ApiError.badRequest('That action needs a task');
      const task = await prisma.task.findFirst({ where: { id: taskId, userId }, select: { id: true, title: true } });
      if (!task) throw ApiError.notFound('Task not found');
      const status = action.kind === 'complete_task' ? 'COMPLETED' : (['TODO', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED'].includes(String(p.status)) ? String(p.status) : null);
      if (!status) throw ApiError.badRequest('That is not a status a task can have');
      await prisma.task.update({
        where: { id: task.id },
        data: { status: status as 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED', ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}) },
      });
      return { kind: action.kind, taskId: task.id, message: `"${task.title}" is now ${status.replace('_', ' ').toLowerCase()}.` };
    }
    case 'add_skill': {
      const name = str('name');
      if (!name) throw ApiError.badRequest('A skill needs a name');
      const existing = await prisma.skill.findFirst({ where: { userId, name: { equals: name, mode: 'insensitive' } }, select: { id: true } });
      if (existing) throw ApiError.badRequest(`You already track a skill called "${name}"`);
      const cats = ['TECHNICAL', 'COMMUNICATION', 'LEADERSHIP', 'BUSINESS', 'ACADEMIC', 'CREATIVE', 'PERSONAL', 'OTHER'];
      const levels = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'];
      const skill = await prisma.skill.create({
        data: {
          userId,
          name,
          category: (cats.includes(String(p.category)) ? String(p.category) : 'OTHER') as 'TECHNICAL' | 'COMMUNICATION' | 'LEADERSHIP' | 'BUSINESS' | 'ACADEMIC' | 'CREATIVE' | 'PERSONAL' | 'OTHER',
          targetLevel: levels.includes(String(p.targetLevel)) ? (String(p.targetLevel) as 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT') : null,
          currentLevel: 'BEGINNER',
          status: 'ACTIVE',
          updates: { create: { userId, fromLevel: null, toLevel: 'BEGINNER', note: 'Starting level' } },
        },
      });
      return { kind: action.kind, skillId: skill.id, message: `Started tracking "${skill.name}".` };
    }
    default:
      throw ApiError.badRequest('That is not an action this assistant can take');
  }
}
