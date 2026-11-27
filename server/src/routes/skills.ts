import { Router } from 'express';
import { z } from 'zod';
import { EvidenceKind, SkillCategory, SkillLevel, SkillStatus, type Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ApiError, ah, validate } from '../lib/http.js';
import { requireAuth, userTz } from '../middleware/auth.js';
import { addDaysKey, todayKey } from '../lib/dates.js';
import { analyseGrowth, SKILL_LEVELS, type GrowthInput, type SkillRecord } from '../services/growth.js';

export const skillsRouter = Router();
skillsRouter.use(requireAuth);

// ─────────────────────────────────────────────────────────────
// Skills
// ─────────────────────────────────────────────────────────────
// A skill's level is only ever what the user last recorded. Every change writes
// a SkillUpdate row inside the same transaction, so "improved" is a fact about
// records rather than an inference. Nothing in this file derives a level.

const levelEnum = z.nativeEnum(SkillLevel);
const categoryEnum = z.nativeEnum(SkillCategory);
const statusEnum = z.nativeEnum(SkillStatus);
const evidenceEnum = z.nativeEnum(EvidenceKind);
const dateish = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

const createSchema = z.object({
  name: z.string().trim().min(1, 'Give the skill a name').max(80),
  category: categoryEnum.optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  currentLevel: levelEnum.optional(),
  targetLevel: levelEnum.nullable().optional(),
  status: statusEnum.optional(),
  motivation: z.string().trim().max(1000).nullable().optional(),
});

const updateSchema = createSchema.partial().extend({
  /**
   * Set when the user is recording a change rather than correcting a typo.
   * `levelNote` and `practiceMinutes` go on the SkillUpdate row with it.
   */
  recordChange: z.boolean().optional(),
  levelNote: z.string().trim().max(500).nullable().optional(),
  practiceMinutes: z.number().int().min(0).max(1440).nullable().optional(),
});

const evidenceSchema = z.object({
  kind: evidenceEnum.optional(),
  title: z.string().trim().min(1, 'Give the evidence a title').max(160),
  detail: z.string().trim().max(2000).nullable().optional(),
  url: z.string().trim().url('That does not look like a link').max(500).nullable().optional(),
  date: dateish.nullable().optional(),
});

function parseDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
  if (Number.isNaN(d.getTime())) throw ApiError.badRequest('Invalid date');
  return d;
}

const include = {
  updates: { orderBy: { createdAt: 'asc' } },
  evidence: { orderBy: { createdAt: 'desc' }, take: 50 },
  goals: { select: { id: true, title: true, status: true } },
} satisfies Prisma.SkillInclude;

type SkillRow = Prisma.SkillGetPayload<{ include: typeof include }>;

function skillDto(s: SkillRow) {
  const practice: { date: string; minutes: number }[] = [];
  for (const u of s.updates) {
    if (u.minutes && u.minutes > 0) practice.push({ date: u.createdAt.toISOString().slice(0, 10), minutes: u.minutes });
  }
  return {
    id: s.id,
    name: s.name,
    category: s.category,
    description: s.description,
    currentLevel: s.currentLevel,
    targetLevel: s.targetLevel,
    status: s.status,
    motivation: s.motivation,
    startedAt: s.startedAt,
    achievedAt: s.achievedAt,
    archivedAt: s.archivedAt,
    updates: s.updates.map((u) => ({ id: u.id, at: u.createdAt, fromLevel: u.fromLevel, toLevel: u.toLevel, note: u.note, minutes: u.minutes })),
    evidence: s.evidence.map((e) => ({ id: e.id, kind: e.kind, title: e.title, detail: e.detail, url: e.url, date: e.date, createdAt: e.createdAt })),
    goals: s.goals,
    practice,
    isDemo: s.isDemo,
    createdAt: s.createdAt,
  };
}

/** Everything the growth read needs, for one user, inside one window. */
export async function collectGrowth(userId: string, tz: string, windowDays: number): Promise<GrowthInput & { windowStart: string; today: string }> {
  const today = todayKey(tz);
  const windowStart = addDaysKey(today, -(windowDays - 1));
  const from = new Date(`${windowStart}T00:00:00.000Z`);

  const [skills, goals, updates, evidence, activePlans] = await Promise.all([
    prisma.skill.findMany({ where: { userId, archivedAt: null }, include, orderBy: { createdAt: 'asc' }, take: 200 }),
    prisma.goal.findMany({
      where: { userId },
      select: {
        id: true, title: true, current: true, target: true, metric: true, deadline: true, skillId: true, status: true, achievedAt: true,
        milestones: { select: { completedAt: true } },
      },
      take: 200,
    }),
    prisma.skillUpdate.findMany({ where: { userId, createdAt: { gte: from } }, select: { createdAt: true, skillId: true, minutes: true }, take: 5000 }),
    prisma.skillEvidence.findMany({
      where: { userId },
      select: { id: true, skillId: true, kind: true, title: true, createdAt: true, skill: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.developmentPlan.count({ where: { userId, status: 'ACTIVE' } }),
  ]);

  const records: SkillRecord[] = skills.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    status: s.status,
    currentLevel: s.currentLevel,
    targetLevel: s.targetLevel,
    startedAt: s.startedAt.toISOString(),
    updates: s.updates.map((u) => ({
      at: u.createdAt.toISOString(),
      fromLevel: u.fromLevel,
      toLevel: u.toLevel,
      minutes: u.minutes,
      note: u.note,
    })),
    evidenceCount: s.evidence.length,
  }));

  const input: GrowthInput = {
    skills: records,
    updates: updates.map((u) => ({ at: u.createdAt.toISOString(), skillId: u.skillId, minutes: u.minutes })),
    evidence: evidence.map((e) => ({
      id: e.id,
      skillId: e.skillId,
      skillName: e.skill.name,
      kind: e.kind,
      title: e.title,
      at: e.createdAt.toISOString(),
    })),
    goals: goals.map((g) => ({
      id: g.id,
      title: g.title,
      current: g.current,
      target: g.target,
      metric: g.metric,
      deadline: g.deadline ? g.deadline.toISOString().slice(0, 10) : null,
      milestonesTotal: g.milestones.length,
      milestonesDone: g.milestones.filter((m) => m.completedAt).length,
      skillId: g.skillId,
    })),
    windowStart,
    today,
    activePlans,
  };
  return { ...input, windowStart, today };
}

async function ownSkill(userId: string, id: string) {
  const s = await prisma.skill.findFirst({ where: { id, userId }, include });
  if (!s) throw ApiError.notFound('Skill not found');
  return s;
}

// GET /api/skills
skillsRouter.get(
  '/',
  validate({
    query: z.object({
      status: z.union([statusEnum, z.literal('ALL')]).optional(),
      category: categoryEnum.optional(),
      archived: z.enum(['exclude', 'only', 'all']).default('exclude'),
    }),
  }),
  ah(async (req, res) => {
    const q = req.query as { status?: SkillStatus | 'ALL'; category?: SkillCategory; archived: 'exclude' | 'only' | 'all' };
    const where: Prisma.SkillWhereInput = { userId: req.user!.id };
    if (q.status && q.status !== 'ALL') where.status = q.status;
    if (q.category) where.category = q.category;
    if (q.archived === 'exclude') where.archivedAt = null;
    else if (q.archived === 'only') where.archivedAt = { not: null };
    const rows = await prisma.skill.findMany({ where, include, orderBy: [{ status: 'asc' }, { createdAt: 'asc' }], take: 300 });
    res.json({ skills: rows.map(skillDto), levels: SKILL_LEVELS, categories: Object.values(SkillCategory) });
  }),
);

// POST /api/skills
skillsRouter.post(
  '/',
  validate({ body: createSchema }),
  ah(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    const existing = await prisma.skill.findFirst({ where: { userId: req.user!.id, name: { equals: body.name, mode: 'insensitive' } }, select: { id: true } });
    if (existing) throw ApiError.badRequest('You already track a skill with that name');
    const currentLevel = body.currentLevel ?? 'BEGINNER';
    const skill = await prisma.skill.create({
      data: {
        userId: req.user!.id,
        name: body.name,
        category: body.category ?? 'OTHER',
        description: body.description ?? null,
        currentLevel,
        targetLevel: body.targetLevel ?? null,
        status: body.status ?? 'ACTIVE',
        motivation: body.motivation ?? null,
        // The starting level is recorded as a change from nothing, so a later
        // "improved" claim always has a baseline row to compare with.
        updates: { create: { userId: req.user!.id, fromLevel: null, toLevel: currentLevel, note: 'Starting level' } },
      },
      include,
    });
    res.status(201).json({ skill: skillDto(skill) });
  }),
);

// ─────────────────────────────────────────────────────────────
// Growth read
// ─────────────────────────────────────────────────────────────

// GET /api/skills/growth/summary
// Declared before '/:id' on purpose: Express matches in declaration order, and
// a param route above this would swallow the literal path.
skillsRouter.get(
  '/growth/summary',
  validate({ query: z.object({ days: z.coerce.number().int().min(7).max(180).default(30) }) }),
  ah(async (req, res) => {
    const { days } = req.query as unknown as { days: number };
    const tz = userTz(req);
    const input = await collectGrowth(req.user!.id, tz, days);
    res.json({ growth: analyseGrowth(input) });
  }),
);

// Any new literal path must be declared above '/:id' -- Express matches in
// declaration order, and a param route above it would swallow the literal one.

// GET /api/skills/:id
skillsRouter.get('/:id', ah(async (req, res) => {
  const s = await ownSkill(req.user!.id, req.params.id);
  res.json({ skill: skillDto(s) });
}));

// PATCH /api/skills/:id
skillsRouter.patch(
  '/:id',
  validate({ body: updateSchema }),
  ah(async (req, res) => {
    const body = req.body as z.infer<typeof updateSchema>;
    const existing = await ownSkill(req.user!.id, req.params.id);

    const levelChanged = body.currentLevel !== undefined && body.currentLevel !== existing.currentLevel;
    const nextStatus = body.status ?? (body.currentLevel === 'EXPERT' || (body.targetLevel !== undefined && body.targetLevel === body.currentLevel) ? existing.status : existing.status);

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.skill.update({
        where: { id: existing.id },
        data: {
          name: body.name,
          category: body.category,
          description: body.description,
          currentLevel: body.currentLevel,
          targetLevel: body.targetLevel,
          status: nextStatus,
          motivation: body.motivation,
          achievedAt: nextStatus === 'COMPLETED' ? existing.achievedAt ?? new Date() : null,
        },
        include,
      });
      // A level change is a record, not a side effect of an edit. It is only
      // written when the user is recording one, or when the level actually
      // moved -- correcting a typo in the name must not create a history row.
      if (levelChanged && (body.recordChange !== false)) {
        await tx.skillUpdate.create({
          data: {
            skillId: s.id,
            userId: req.user!.id,
            fromLevel: existing.currentLevel,
            toLevel: body.currentLevel!,
            note: body.levelNote ?? null,
            minutes: body.practiceMinutes ?? null,
          },
        });
      }
      return tx.skill.findUniqueOrThrow({ where: { id: s.id }, include });
    });
    res.json({ skill: skillDto(updated) });
  }),
);

// POST /api/skills/:id/updates — record practice without changing the level
skillsRouter.post(
  '/:id/updates',
  validate({
    body: z.object({
      toLevel: levelEnum.optional(),
      fromLevel: levelEnum.nullable().optional(),
      note: z.string().trim().max(500).nullable().optional(),
      minutes: z.number().int().min(0).max(1440).nullable().optional(),
    }),
  }),
  ah(async (req, res) => {
    const body = req.body as { toLevel?: SkillLevel; fromLevel?: SkillLevel | null; note?: string | null; minutes?: number | null };
    const skill = await ownSkill(req.user!.id, req.params.id);
    const toLevel = body.toLevel ?? skill.currentLevel;
    if (toLevel !== skill.currentLevel && body.toLevel === undefined) {
      throw ApiError.badRequest('A level change needs the new level');
    }
    const result = await prisma.$transaction(async (tx) => {
      await tx.skillUpdate.create({
        data: {
          skillId: skill.id,
          userId: req.user!.id,
          fromLevel: body.fromLevel ?? (toLevel === skill.currentLevel ? null : skill.currentLevel),
          toLevel,
          note: body.note ?? null,
          minutes: body.minutes ?? null,
        },
      });
      if (toLevel !== skill.currentLevel) {
        return tx.skill.update({ where: { id: skill.id }, data: { currentLevel: toLevel }, include });
      }
      return tx.skill.findUniqueOrThrow({ where: { id: skill.id }, include });
    });
    res.status(201).json({ skill: skillDto(result) });
  }),
);

// DELETE /api/skills/:id — archives. A skill holds history, so it is never
// destroyed by a button in a list; the goals that referenced it are kept.
skillsRouter.delete('/:id', ah(async (req, res) => {
  const s = await ownSkill(req.user!.id, req.params.id);
  await prisma.skill.update({ where: { id: s.id }, data: { archivedAt: new Date() } });
  res.json({ ok: true, archived: true });
}));

// POST /api/skills/:id/evidence
skillsRouter.post(
  '/:id/evidence',
  validate({ body: evidenceSchema }),
  ah(async (req, res) => {
    const body = req.body as z.infer<typeof evidenceSchema>;
    const skill = await ownSkill(req.user!.id, req.params.id);
    const e = await prisma.skillEvidence.create({
      data: {
        skillId: skill.id,
        userId: req.user!.id,
        kind: body.kind ?? 'NOTE',
        title: body.title,
        detail: body.detail ?? null,
        url: body.url ?? null,
        date: parseDate(body.date) ?? null,
      },
    });
    res.status(201).json({ evidence: { id: e.id, kind: e.kind, title: e.title, detail: e.detail, url: e.url, date: e.date, createdAt: e.createdAt } });
  }),
);

// DELETE /api/skills/:id/evidence/:evidenceId
skillsRouter.delete('/:id/evidence/:evidenceId', ah(async (req, res) => {
  const e = await prisma.skillEvidence.findFirst({ where: { id: req.params.evidenceId, skillId: req.params.id, userId: req.user!.id }, select: { id: true } });
  if (!e) throw ApiError.notFound('Evidence not found');
  await prisma.skillEvidence.delete({ where: { id: e.id } });
  res.json({ ok: true });
}));

export { analyseGrowth, dateish };
