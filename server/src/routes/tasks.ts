import { Router } from 'express';
import { z } from 'zod';
import { RecurrenceRule, TaskPriority, TaskStatus, type Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ApiError, ah, validate } from '../lib/http.js';
import { requireAuth, userTz } from '../middleware/auth.js';
import { dateKey, localDateKey, todayKey } from '../lib/dates.js';
import { resolveOccupation } from '../services/occupations.js';

export const tasksRouter = Router();

/** Keeps only the y/m/d of a date, in the user's zone, as a UTC midnight. */
function dayOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * The next due date for a recurring task.
 *
 * Computed from the *completed* instance's due date, not from "now", so a task
 * completed late does not silently shift the whole series forward. WEEKDAYS
 * skips Saturday and Sunday. Returns null when the series has run out, which
 * is what `recurrenceUntil` means.
 */
export function nextOccurrence(
  from: Date,
  rule: RecurrenceRule,
  every: number,
  until: Date | null,
): Date | null {
  if (rule === 'NONE') return null;
  const step = Math.max(1, every);
  let next = dayOnly(from);
  if (rule === 'DAILY') {
    next.setUTCDate(next.getUTCDate() + step);
  } else if (rule === 'WEEKDAYS') {
    do {
      next.setUTCDate(next.getUTCDate() + 1);
    } while (next.getUTCDay() === 0 || next.getUTCDay() === 6);
  } else if (rule === 'WEEKLY') {
    next.setUTCDate(next.getUTCDate() + 7 * step);
  } else if (rule === 'MONTHLY') {
    next.setUTCMonth(next.getUTCMonth() + step);
  }
  if (until && next.getTime() > dayOnly(until).getTime()) return null;
  return next;
}

/** Validates that a linked container belongs to this user. Never trust an id. */
async function assertOwnedLinks(
  userId: string,
  links: { projectId?: string | null; parentId?: string | null; goalId?: string | null },
) {
  const checks: Promise<unknown>[] = [];
  if (links.projectId) {
    checks.push(
      prisma.project.findFirst({ where: { id: links.projectId, userId }, select: { id: true } }).then((p) => {
        if (!p) throw ApiError.badRequest('That project does not exist');
      }),
    );
  }
  if (links.goalId) {
    checks.push(
      prisma.goal.findFirst({ where: { id: links.goalId, userId }, select: { id: true } }).then((g) => {
        if (!g) throw ApiError.badRequest('That goal does not exist');
      }),
    );
  }
  if (links.parentId) {
    checks.push(
      prisma.task
        .findFirst({ where: { id: links.parentId, userId }, select: { id: true, parentId: true } })
        .then((t) => {
          if (!t) throw ApiError.badRequest('That parent task does not exist');
          // One level only. Deeper nesting makes "how much of this is done"
          // ambiguous, and nobody asked for it.
          if (t.parentId) throw ApiError.badRequest('A subtask cannot have its own subtasks');
        }),
    );
  }
  await Promise.all(checks);
}
tasksRouter.use(requireAuth);

const priorityEnum = z.nativeEnum(TaskPriority);
const statusEnum = z.nativeEnum(TaskStatus);

const createSchema = z.object({
  title: z.string().trim().min(1, 'Give the task a title').max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  // The default comes from the user's occupation profile (e.g. "Assignment"
  // for a student), resolved in the handler. "General" stays the fallback.
  category: z.string().trim().max(40).optional(),
  priority: priorityEnum.default('MEDIUM'),
  status: statusEnum.default('TODO'),
  dueDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  goalId: z.string().uuid().nullable().optional(),
  recurrence: z.nativeEnum(RecurrenceRule).optional(),
  recurrenceEvery: z.number().int().min(1).max(30).optional(),
  recurrenceUntil: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable().optional(),
});

const updateSchema = createSchema.partial().extend({
  status: statusEnum.optional(),
  order: z.number().int().optional(),
});

const listSchema = z.object({
  status: z.union([statusEnum, z.literal('ALL'), z.literal('OPEN')]).optional(),
  priority: priorityEnum.optional(),
  category: z.string().max(40).optional(),
  search: z.string().max(120).optional(),
  due: z.enum(['today', 'overdue', 'week', 'none']).optional(),
  projectId: z.string().uuid().optional(),
  goalId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional(),
  // The task list shows top-level tasks; a parent's subtasks are fetched with it.
  topLevel: z.enum(['true', 'false']).optional(),
  sort: z.enum(['dueDate', 'createdAt', 'priority', 'title']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

function parseDue(value: string | null | undefined, tz: string): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // A date-only due date means end of that local day.
    return new Date(`${value}T23:59:00.000Z`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw ApiError.badRequest('Invalid due date');
  return d;
}

/** Derives completion metadata automatically — users never type durations. */
function deriveTaskState(
  current: { status: TaskStatus; startedAt: Date | null; completedAt: Date | null; createdAt: Date },
  nextStatus: TaskStatus,
) {
  const now = new Date();
  if (nextStatus === 'COMPLETED' && current.status !== 'COMPLETED') {
    const startedAt = current.startedAt ?? current.createdAt;
    return {
      completedAt: now,
      startedAt,
      timeTakenSec: Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 1000)),
    };
  }
  if (nextStatus === 'IN_PROGRESS' && !current.startedAt) {
    return { startedAt: now };
  }
  if (nextStatus !== 'COMPLETED' && current.status === 'COMPLETED') {
    // Re-opened: clear the completion metadata so analytics stay truthful.
    return { completedAt: null, timeTakenSec: null };
  }
  return {};
}

// GET /api/tasks
tasksRouter.get(
  '/',
  validate({ query: listSchema }),
  ah(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listSchema>;
    const tz = userTz(req);
    const where: Prisma.TaskWhereInput = { userId: req.user!.id };

    if (q.status && q.status !== 'ALL') {
      where.status = q.status === 'OPEN' ? { in: ['TODO', 'IN_PROGRESS'] } : q.status;
    }
    if (q.priority) where.priority = q.priority;
    if (q.category) where.category = q.category;
    if (q.projectId) where.projectId = q.projectId;
    if (q.goalId) where.goalId = q.goalId;
    if (q.parentId) where.parentId = q.parentId;
    // Default view is top-level tasks: a subtask shown next to its parent is
    // the same work counted twice.
    if (q.topLevel === 'true') where.parentId = null;
    if (q.search) {
      where.OR = [
        { title: { contains: q.search, mode: 'insensitive' } },
        { description: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    const todayK = todayKey(tz);
    if (q.due === 'today') {
      where.dueDate = { gte: new Date(`${todayK}T00:00:00Z`), lt: new Date(`${todayK}T23:59:59Z`) };
    } else if (q.due === 'overdue') {
      where.dueDate = { lt: new Date() };
      where.status = { in: ['TODO', 'IN_PROGRESS'] };
    } else if (q.due === 'week') {
      const end = new Date(`${todayK}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 7);
      where.dueDate = { gte: new Date(`${todayK}T00:00:00Z`), lt: end };
    } else if (q.due === 'none') {
      where.dueDate = null;
    }

    const orderBy: Prisma.TaskOrderByWithRelationInput[] =
      q.sort === 'createdAt'
        ? [{ createdAt: 'desc' }]
        : q.sort === 'priority'
          ? [{ priority: 'desc' }, { dueDate: 'asc' }]
          : q.sort === 'title'
            ? [{ title: 'asc' }]
            : [{ dueDate: { sort: 'asc', nulls: 'last' } }, { priority: 'desc' }];

    const [items, total, counts] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy,
        take: q.limit,
        skip: q.offset,
        include: {
          _count: { select: { subtasks: true } },
          project: { select: { id: true, title: true, code: true } },
          goal: { select: { id: true, title: true } },
        },
      }),
      prisma.task.count({ where }),
      prisma.task.groupBy({ by: ['status'], where: { userId: req.user!.id }, _count: { _all: true } }),
    ]);

    const now = new Date();
    res.json({
      tasks: items.map((t) => ({
        ...t,
        overdue: Boolean(t.dueDate && t.status !== 'COMPLETED' && t.status !== 'ARCHIVED' && new Date(t.dueDate) < now),
        dueToday: Boolean(t.dueDate && localDateKey(new Date(t.dueDate), tz) === todayK),
      })),
      total,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    });
  }),
);

// POST /api/tasks
tasksRouter.post(
  '/',
  validate({ body: createSchema }),
  ah(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    const tz = userTz(req);
    const now = new Date();
    // No category chosen: use the first one this person's occupation suggests
    // rather than a generic "General" that means nothing to a student.
    let category = body.category;
    if (!category) {
      const profile = await prisma.profile.findUnique({
        where: { userId: req.user!.id },
        select: { occupation: true, occupationType: true },
      });
      const resolved = resolveOccupation({
        occupationType: profile?.occupationType ?? null,
        occupation: profile?.occupation ?? null,
      });
      category = resolved.profile.taskCategories[0] ?? 'General';
    }
    await assertOwnedLinks(req.user!.id, body);
    const task = await prisma.task.create({
      data: {
        userId: req.user!.id,
        title: body.title,
        description: body.description ?? null,
        category,
        priority: body.priority,
        status: body.status,
        dueDate: parseDue(body.dueDate, tz),
        startedAt: body.status === 'IN_PROGRESS' ? now : null,
        completedAt: body.status === 'COMPLETED' ? now : null,
        timeTakenSec: body.status === 'COMPLETED' ? 0 : null,
        projectId: body.projectId ?? null,
        parentId: body.parentId ?? null,
        goalId: body.goalId ?? null,
        recurrence: body.recurrence ?? 'NONE',
        recurrenceEvery: body.recurrenceEvery ?? 1,
        recurrenceUntil: parseDue(body.recurrenceUntil, tz),
      },
    });
    res.status(201).json({ task });
  }),
);

// GET /api/tasks/analytics/overdue
// Everything here is counted from recorded rows; nothing is estimated.
tasksRouter.get(
  '/analytics/overdue',
  ah(async (req, res) => {
    const tz = userTz(req);
    const now = new Date();
    const open = await prisma.task.findMany({
      where: { userId: req.user!.id, status: { in: ['TODO', 'IN_PROGRESS'] }, dueDate: { not: null, lt: now } },
      select: { id: true, title: true, dueDate: true, priority: true, category: true, projectId: true, project: { select: { title: true } } },
      orderBy: { dueDate: 'asc' },
      take: 500,
    });

    const byProject = new Map<string, { projectId: string | null; title: string; count: number }>();
    const byCategory = new Map<string, number>();
    const ageBuckets = { '1 day': 0, '2-3 days': 0, '4-7 days': 0, 'over a week': 0 };
    let oldestDays = 0;

    for (const t of open) {
      const key = t.projectId ?? '__none__';
      const entry = byProject.get(key) ?? { projectId: t.projectId, title: t.project?.title ?? 'No project', count: 0 };
      entry.count += 1;
      byProject.set(key, entry);
      byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + 1);
      const days = Math.max(0, Math.floor((now.getTime() - new Date(t.dueDate!).getTime()) / 86_400_000));
      oldestDays = Math.max(oldestDays, days);
      if (days <= 1) ageBuckets['1 day'] += 1;
      else if (days <= 3) ageBuckets['2-3 days'] += 1;
      else if (days <= 7) ageBuckets['4-7 days'] += 1;
      else ageBuckets['over a week'] += 1;
    }

    res.json({
      today: todayKey(tz),
      count: open.length,
      oldestDays,
      items: open.slice(0, 20).map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        priority: t.priority,
        category: t.category,
        project: t.project?.title ?? null,
        daysOverdue: Math.max(0, Math.floor((now.getTime() - new Date(t.dueDate!).getTime()) / 86_400_000)),
      })),
      byProject: [...byProject.values()].sort((a, b) => b.count - a.count).slice(0, 8),
      byCategory: [...byCategory.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
      ageBuckets: Object.entries(ageBuckets).map(([label, count]) => ({ label, count })),
    });
  }),
);

// PATCH /api/tasks/:id
tasksRouter.patch(
  '/:id',
  validate({ body: updateSchema }),
  ah(async (req, res) => {
    const body = req.body as z.infer<typeof updateSchema>;
    const tz = userTz(req);
    const existing = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!existing) throw ApiError.notFound('Task not found');

    await assertOwnedLinks(req.user!.id, body);
    const data: Prisma.TaskUpdateInput = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.category !== undefined) data.category = body.category;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.dueDate !== undefined) data.dueDate = parseDue(body.dueDate, tz);
    if (body.projectId !== undefined) data.project = body.projectId ? { connect: { id: body.projectId } } : { disconnect: true };
    if (body.parentId !== undefined) data.parent = body.parentId ? { connect: { id: body.parentId } } : { disconnect: true };
    if (body.goalId !== undefined) data.goal = body.goalId ? { connect: { id: body.goalId } } : { disconnect: true };
    if (body.recurrence !== undefined) data.recurrence = body.recurrence;
    if (body.recurrenceEvery !== undefined) data.recurrenceEvery = body.recurrenceEvery;
    if (body.recurrenceUntil !== undefined) data.recurrenceUntil = parseDue(body.recurrenceUntil, tz);
    if (body.status !== undefined) {
      data.status = body.status;
      Object.assign(data, deriveTaskState(existing, body.status));
    }

    // Completing a recurring task opens the next one in the same transaction:
    // either the series advances or nothing happened, never a half-move.
    const becomingDone = body.status === 'COMPLETED' && existing.status !== 'COMPLETED';
    const nextDue = becomingDone
      ? nextOccurrence(existing.dueDate ?? new Date(), existing.recurrence, existing.recurrenceEvery, existing.recurrenceUntil)
      : null;

    const [task, spawned] = await prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({ where: { id: existing.id }, data });
      let next = null;
      if (becomingDone && nextDue) {
        next = await tx.task.create({
          data: {
            userId: existing.userId,
            title: existing.title,
            description: existing.description,
            category: existing.category,
            priority: existing.priority,
            status: 'TODO',
            dueDate: nextDue,
            projectId: existing.projectId,
            parentId: existing.parentId,
            goalId: existing.goalId,
            recurrence: existing.recurrence,
            recurrenceEvery: existing.recurrenceEvery,
            recurrenceUntil: existing.recurrenceUntil,
            recurrenceSource: existing.id,
          },
        });
      }
      return [updated, next];
    });
    res.json({ task, nextOccurrence: spawned });
  }),
);

// POST /api/tasks/:id/toggle
tasksRouter.post(
  '/:id/toggle',
  ah(async (req, res) => {
    const existing = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!existing) throw ApiError.notFound('Task not found');
    const next: TaskStatus = existing.status === 'COMPLETED' ? 'TODO' : 'COMPLETED';
    const nextDue =
      next === 'COMPLETED'
        ? nextOccurrence(existing.dueDate ?? new Date(), existing.recurrence, existing.recurrenceEvery, existing.recurrenceUntil)
        : null;
    const [task, spawned] = await prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: existing.id },
        data: { status: next, ...deriveTaskState(existing, next) },
      });
      let created = null;
      if (next === 'COMPLETED' && nextDue) {
        created = await tx.task.create({
          data: {
            userId: existing.userId,
            title: existing.title,
            description: existing.description,
            category: existing.category,
            priority: existing.priority,
            status: 'TODO',
            dueDate: nextDue,
            projectId: existing.projectId,
            parentId: existing.parentId,
            goalId: existing.goalId,
            recurrence: existing.recurrence,
            recurrenceEvery: existing.recurrenceEvery,
            recurrenceUntil: existing.recurrenceUntil,
            recurrenceSource: existing.id,
          },
        });
      }
      return [updated, created];
    });
    res.json({ task, nextOccurrence: spawned });
  }),
);

// DELETE /api/tasks/:id
tasksRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const result = await prisma.task.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
    if (!result.count) throw ApiError.notFound('Task not found');
    res.json({ ok: true });
  }),
);

// GET /api/tasks/meta/categories
tasksRouter.get(
  '/meta/categories',
  ah(async (req, res) => {
    const groups = await prisma.task.groupBy({
      by: ['category'],
      where: { userId: req.user!.id },
      _count: { _all: true },
    });
    res.json({ categories: groups.map((g) => ({ category: g.category, count: g._count._all })) });
  }),
);

// GET /api/tasks/upcoming/deadlines
tasksRouter.get(
  '/upcoming/deadlines',
  ah(async (req, res) => {
    const tz = userTz(req);
    const now = new Date();
    const horizon = new Date(now.getTime() + 14 * 86_400_000);
    const tasks = await prisma.task.findMany({
      where: {
        userId: req.user!.id,
        status: { in: ['TODO', 'IN_PROGRESS'] },
        dueDate: { not: null, lte: horizon },
      },
      orderBy: { dueDate: 'asc' },
      take: 12,
      select: { id: true, title: true, dueDate: true, priority: true, status: true, category: true },
    });
    res.json({
      deadlines: tasks.map((t) => ({
        ...t,
        overdue: Boolean(t.dueDate && new Date(t.dueDate) < now),
        dueInDays: t.dueDate
          ? Math.round(
              (new Date(`${dateKey(new Date(t.dueDate))}T00:00:00Z`).getTime() - new Date(`${todayKey(tz)}T00:00:00Z`).getTime()) /
                86_400_000,
            )
          : null,
      })),
    });
  }),
);
