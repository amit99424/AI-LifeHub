/**
 * Development plans.
 *
 * A plan is the AI's recommendation, kept as a record so it can be measured
 * later. Two rules shape this file:
 *
 *   1. The model proposes; it never writes to the database. Every item comes
 *      back as JSON, is validated here, and reaches the database only through
 *      an explicit user action (apply), which creates real Goal, Milestone and
 *      Task rows through the existing models.
 *   2. Nothing is invented. The prompt is given measured figures only, and the
 *      deterministic fallback below builds a plan from those same figures when
 *      the model is unavailable or returns something unusable — so the feature
 *      degrades into arithmetic, never into fiction.
 */
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { AIUnconfiguredError, complete, parseJsonLoose, truncateToTokens, type LLMMessage } from './llm.js';
import { compactFeatures } from './features.js';
import type { GrowthFeatureSummary } from './features.js';
import { LEVEL_WORD, SKILL_LEVELS, type SkillLevel } from './growth.js';
import { ApiError } from '../lib/http.js';

export interface PlanItemDraft {
  kind: 'OBJECTIVE' | 'ACTIVITY' | 'MILESTONE' | 'SKILL';
  title: string;
  detail: string | null;
  week: number;
  successCriteria: string | null;
  /** The skill this item belongs to, when it belongs to one the user already tracks. */
  skillId: string | null;
  /** The skill name the model proposed, before it is matched to a record. */
  skillName: string | null;
}

export interface PlanDraft {
  title: string;
  summary: string;
  horizonWeeks: number;
  items: PlanItemDraft[];
  /** True when this came from the deterministic fallback rather than the model. */
  deterministic: boolean;
  provider: string;
  model: string | null;
}

const PLAN_SYSTEM = `You are the development planner inside AI-LifeHub.
Rules you must never break:
1. Use only the skills, levels, goals and figures in the DATA block. Never invent a skill the user already has, never invent a level, never invent progress.
2. You are recommending, not reporting. A recommendation is a proposal; it must never read as something the user already did.
3. Never predict how long reaching a level will take, and never promise an outcome.
4. Do not compare this person with anyone else. Their own earlier level is the only baseline.
5. Build on what exists: if a goal already covers the outcome, put its exact title in the objective item rather than inventing a parallel one.
6. Respect the available time. If weeklyMinutes is small, propose fewer, shorter activities.
7. No emojis, no markdown headings.`;

/** Flatten the growth read into the lines the model reads. */
function growthBlock(g: GrowthFeatureSummary): string {
  const lines: string[] = [];
  lines.push(`MEASURED GROWTH (do not restate as achievement): ${g.summary.headline}. ${g.summary.detail}`);
  lines.push(`Totals: ${g.totals.skills} skills, ${g.totals.levelsGained} level changes, ${g.totals.practiceMinutes} practice minutes on ${g.totals.practiceDays} days.`);
  if (g.perSkill.length) {
    lines.push(
      `SKILLS: ${g.perSkill
        .map((p) => `${p.name} [${p.category}] ${p.currentLevel}${p.targetLevel ? ` -> ${p.targetLevel}` : ''}, ${p.practiceMinutes}min in window, last activity ${p.daysSinceActivity ?? 'never'}d ago`)
        .join('; ')}`,
    );
  } else {
    lines.push('SKILLS: none recorded.');
  }
  if (g.improving.length) lines.push(`IMPROVED (recorded level went up): ${g.improving.map((i) => `${i.name} ${i.from ?? '?'} -> ${i.to}`).join('; ')}`);
  if (g.needingAttention.length) lines.push(`NO RECENT ACTIVITY: ${g.needingAttention.map((n) => `${n.name} (${n.reason})`).join('; ')}`);
  if (g.goals.total) {
    lines.push(`GOALS: ${g.goals.total} total, ${g.goals.milestonesDone}/${g.goals.milestonesTotal} milestones done.`);
    if (g.goals.behind.length) lines.push(`BEHIND: ${g.goals.behind.map((b) => `${b.title} ${b.current ?? 0}/${b.target ?? '?'}${b.metric ? ` ${b.metric}` : ''} due ${b.deadline}`).join('; ')}`);
  }
  return lines.join('\n');
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Validate whatever the model returned. Anything unusable is dropped rather
 * than repaired into a plausible-looking item.
 */
function sanitise(raw: unknown, horizonWeeks: number, skillIds: Map<string, string>, skillNames: string[]): { title: string; summary: string; items: PlanItemDraft[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === 'string' ? r.title.trim().slice(0, 120) : '';
  if (!title) return null;
  const summary = typeof r.summary === 'string' ? r.summary.trim().slice(0, 800) : '';
  const itemsRaw = Array.isArray(r.items) ? r.items : [];
  const kinds = new Set(['OBJECTIVE', 'ACTIVITY', 'MILESTONE', 'SKILL']);
  const items: PlanItemDraft[] = [];
  for (const it of itemsRaw.slice(0, 24)) {
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    const t = typeof o.title === 'string' ? o.title.trim().slice(0, 160) : '';
    if (!t) continue;
    const kind = typeof o.kind === 'string' && kinds.has(o.kind.toUpperCase()) ? (o.kind.toUpperCase() as PlanItemDraft['kind']) : 'ACTIVITY';
    // A skill reference is only kept when it matches a skill the user already
    // tracks or a name the model proposed; an id it made up is dropped.
    let skillId: string | null = null;
    let skillName: string | null = typeof o.skillName === 'string' ? o.skillName.trim().slice(0, 80) : null;
    if (typeof o.skillId === 'string' && skillIds.has(o.skillId)) {
      skillId = o.skillId;
      skillName = null;
    } else if (skillName && !skillNames.some((n) => n.toLowerCase() === skillName!.toLowerCase())) {
      skillName = skillName || null;
    }
    items.push({
      kind,
      title: t,
      detail: typeof o.detail === 'string' ? o.detail.trim().slice(0, 600) : null,
      week: clamp(Number.isFinite(Number(o.week)) ? Math.round(Number(o.week)) : 1, 1, horizonWeeks),
      successCriteria: typeof o.successCriteria === 'string' ? o.successCriteria.trim().slice(0, 300) : null,
      skillId,
      skillName,
    });
  }
  if (!items.length) return null;
  return { title, summary, items };
}

/**
 * The fallback plan: built from the user's own records with no model involved.
 * Every item names the record that produced it, so it cannot claim anything
 * the data does not contain.
 */
export function deterministicPlan(
  g: GrowthFeatureSummary,
  opts: { horizonWeeks: number; weeklyMinutes: number | null; occupationNoun: string },
): { title: string; summary: string; items: PlanItemDraft[] } {
  const items: PlanItemDraft[] = [];
  const focusSkills = g.perSkill
    .filter((p) => p.status === 'ACTIVE')
    .sort((a, b) => {
      // Skills with a target and nothing logged come first: they are the ones
      // the data says are stalled. Then the longest untouched.
      const aScore = (a.levelsToTarget !== null ? 1 : 0) + (a.practiceMinutes === 0 ? 1 : 0);
      const bScore = (b.levelsToTarget !== null ? 1 : 0) + (b.practiceMinutes === 0 ? 1 : 0);
      return bScore - aScore || (b.daysSinceActivity ?? 0) - (a.daysSinceActivity ?? 0);
    })
    .slice(0, 3);

  if (!focusSkills.length) {
    items.push({
      kind: 'OBJECTIVE',
      title: 'Record the skills you want to develop',
      detail: 'No skills are tracked yet, so there is nothing to plan against. Add two or three and the plan can name them.',
      week: 1,
      successCriteria: null,
      skillId: null,
      skillName: null,
    });
    return {
      title: 'Start with two skills',
      summary: 'This plan is built from what is recorded, and nothing is recorded yet. Add the skills you want to develop and generate again.',
      items,
    };
  }

  for (const s of focusSkills) {
    items.push({
      kind: 'OBJECTIVE',
      title: s.levelsToTarget !== null && s.levelsToTarget > 0 ? `Move ${s.name} from ${LEVEL_WORD[s.currentLevel as SkillLevel] ?? s.currentLevel} towards ${LEVEL_WORD[s.targetLevel as SkillLevel] ?? s.targetLevel}` : `Keep ${s.name} moving`,
      detail: `${s.practiceMinutes} minutes recorded in this window, on ${s.practiceDays} day${s.practiceDays === 1 ? '' : 's'}. ${s.evidenceCount ? `${s.evidenceCount} evidence item${s.evidenceCount === 1 ? '' : 's'} attached.` : 'No evidence attached yet.'}`,
      week: 1,
      successCriteria: 'A recorded practice session and a level check at the end of the plan.',
      skillId: s.skillId,
      skillName: null,
    });
    const perWeek = opts.weeklyMinutes ? Math.max(15, Math.round(opts.weeklyMinutes / focusSkills.length)) : 60;
    for (let w = 1; w <= Math.min(opts.horizonWeeks, 4); w += 1) {
      items.push({
        kind: 'ACTIVITY',
        title: `${perWeek} minutes on ${s.name} — week ${w}`,
        detail: 'One or two sessions is enough to record. The plan counts what you log, not what you intend.',
        week: w,
        successCriteria: `${perWeek} minutes recorded against ${s.name}.`,
        skillId: s.skillId,
        skillName: null,
      });
    }
    items.push({
      kind: 'MILESTONE',
      title: `Review ${s.name} at the end of week ${Math.min(opts.horizonWeeks, 4)}`,
      detail: 'Look at the recorded sessions and decide whether the level has moved. A level change is only recorded when you make it.',
      week: Math.min(opts.horizonWeeks, 4),
      successCriteria: null,
      skillId: s.skillId,
      skillName: null,
    });
  }

  for (const b of g.goals.behind.slice(0, 2)) {
    items.push({
      kind: 'OBJECTIVE',
      title: `Close the gap on ${b.title}`,
      detail: `${b.current ?? 0} of ${b.target ?? '?'}${b.metric ? ` ${b.metric}` : ''}, due ${b.deadline}.`,
      week: 1,
      successCriteria: null,
      skillId: null,
      skillName: null,
    });
  }

  return {
    title: `${opts.horizonWeeks}-week development plan`,
    summary: `Built from your recorded skills: ${focusSkills.map((s) => s.name).join(', ')}. The AI planner was not used, so this is arithmetic on your own records, not a recommendation.`,
    items,
  };
}

export async function generatePlanDraft(
  g: GrowthFeatureSummary,
  features: Parameters<typeof compactFeatures>[0],
  opts: { horizonWeeks: number; weeklyMinutes: number | null; occupationBlock: string; noun: string },
): Promise<PlanDraft> {
  const skillIds = new Map(g.perSkill.map((p) => [p.skillId, p.skillId]));
  const skillNames = g.perSkill.map((p) => p.name);

  const prompt = `${PLAN_SYSTEM}

Return ONLY JSON:
{"title": string (max 80 chars), "summary": string (max 400 chars), "items": [{"kind": "OBJECTIVE"|"ACTIVITY"|"MILESTONE"|"SKILL", "title": string (max 120), "detail": string (max 300) | null, "week": number (1..${opts.horizonWeeks}), "successCriteria": string (max 150) | null, "skillId": string | null, "skillName": string | null}]}

Rules for items: 6 to 16 items. Use "OBJECTIVE" for the outcome, "ACTIVITY" for what to do each week, "MILESTONE" for a check point, "SKILL" only when you are recommending a skill the user does not track yet (put its name in skillName and leave skillId null). Never invent a skillId.

${opts.occupationBlock}

HORIZON: ${opts.horizonWeeks} weeks. AVAILABLE TIME: ${opts.weeklyMinutes ? `${opts.weeklyMinutes} minutes per week` : 'not stated by the user'}.

${growthBlock(g)}

OTHER RECORDED WORK (so the plan fits around it, not on top of it):
${truncateToTokens(compactFeatures(features), Math.floor(config.AI_MAX_CONTEXT_TOKENS / 2))}`;

  const messages: LLMMessage[] = [
    { role: 'system', content: PLAN_SYSTEM },
    { role: 'user', content: prompt },
  ];

  try {
    const result = await complete(messages, { json: true, maxTokens: 1600 });
    const parsed = sanitise(parseJsonLoose<unknown>(result.text), opts.horizonWeeks, skillIds, skillNames);
    if (!parsed) throw new ApiError(502, 'The planner returned nothing usable', 'ai_unusable');
    return { ...parsed, horizonWeeks: opts.horizonWeeks, deterministic: false, provider: result.provider, model: result.model ?? null };
  } catch (err) {
    // The fallback exists so the button still does something true. It is
    // labelled as arithmetic, never as an AI recommendation.
    const fb = deterministicPlan(g, { horizonWeeks: opts.horizonWeeks, weeklyMinutes: opts.weeklyMinutes, occupationNoun: opts.noun });
    if (err instanceof AIUnconfiguredError) {
      return { ...fb, horizonWeeks: opts.horizonWeeks, deterministic: true, provider: 'none', model: null };
    }
    return { ...fb, horizonWeeks: opts.horizonWeeks, deterministic: true, provider: 'fallback', model: null };
  }
}

/**
 * Apply one plan item to the real records.
 *
 * The plan never becomes a second task system: applying writes a Goal, a
 * Milestone or a Task through the existing models, and stores the id on the
 * item so the link is visible from both sides.
 */
export async function applyPlanItem(userId: string, itemId: string, opts: { createGoal?: boolean }): Promise<{ goalId?: string; milestoneId?: string; taskId?: string }> {
  const item = await prisma.developmentPlanItem.findFirst({ where: { id: itemId, userId }, include: { plan: true, skill: true } });
  if (!item) throw ApiError.notFound('Plan item not found');
  if (item.appliedAt) throw ApiError.badRequest('That item has already been applied');

  if (item.kind === 'OBJECTIVE') {
    // An objective becomes a Goal. If the plan already has a goal, the item is
    // filed under it rather than creating a second one for the same outcome.
    if (item.plan.goalId) {
      await prisma.developmentPlanItem.update({ where: { id: item.id }, data: { goalId: item.plan.goalId, appliedAt: new Date() } });
      return { goalId: item.plan.goalId };
    }
    const goal = await prisma.goal.create({
      data: {
        userId,
        title: item.title.slice(0, 160),
        description: item.detail,
        skillId: item.skillId,
        status: 'ACTIVE',
      },
    });
    await prisma.$transaction([
      prisma.developmentPlanItem.update({ where: { id: item.id }, data: { goalId: goal.id, appliedAt: new Date() } }),
      prisma.developmentPlan.update({ where: { id: item.planId }, data: { goalId: goal.id } }),
    ]);
    return { goalId: goal.id };
  }

  if (item.kind === 'MILESTONE') {
    // A milestone needs a goal to hang from: the plan's own goal, or the item's.
    const goalId = item.goalId ?? item.plan.goalId;
    if (!goalId) {
      // No goal yet: the milestone becomes a dated task instead, which is the
      // honest thing to do rather than creating a goal nobody asked for.
      const task = await prisma.task.create({
        data: { userId, title: item.title.slice(0, 160), description: item.detail, category: 'Learning', status: 'TODO' },
      });
      await prisma.developmentPlanItem.update({ where: { id: item.id }, data: { taskId: task.id, appliedAt: new Date() } });
      return { taskId: task.id };
    }
    const count = await prisma.milestone.count({ where: { goalId } });
    const m = await prisma.milestone.create({
      data: { goalId, userId, title: item.title.slice(0, 160), order: count },
    });
    await prisma.developmentPlanItem.update({ where: { id: item.id }, data: { milestoneId: m.id, goalId, appliedAt: new Date() } });
    return { milestoneId: m.id };
  }

  // ACTIVITY and SKILL become Tasks, filed under the plan's goal when there is
  // one, so the existing task, overdue and analytics machinery picks them up
  // with no new code.
  const task = await prisma.task.create({
    data: {
      userId,
      title: item.title.slice(0, 160),
      description: item.detail,
      category: 'Learning',
      priority: 'MEDIUM',
      status: 'TODO',
      goalId: item.goalId ?? item.plan.goalId ?? null,
    },
  });
  await prisma.developmentPlanItem.update({ where: { id: item.id }, data: { taskId: task.id, appliedAt: new Date() } });
  return { taskId: task.id };
}

export { SKILL_LEVELS };
