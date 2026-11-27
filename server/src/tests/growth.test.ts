import assert from 'node:assert/strict';
import { analyseGrowth, levelRank, skillProgress, type GrowthInput, type SkillRecord } from '../services/growth.js';
import { deterministicPlan } from '../services/growthPlans.js';
import type { GrowthFeatureSummary } from '../services/features.js';

const register = (globalThis as unknown as { __lhTest: (name: string, fn: () => void | Promise<void>) => void }).__lhTest;

const TODAY = '2026-06-30';
const START = '2026-06-01';

function skill(over: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: 's1',
    name: 'TypeScript',
    category: 'TECHNICAL',
    status: 'ACTIVE',
    currentLevel: 'INTERMEDIATE',
    targetLevel: 'ADVANCED',
    startedAt: '2026-01-10T00:00:00.000Z',
    updates: [
      { at: '2026-01-10T09:00:00.000Z', fromLevel: null, toLevel: 'BEGINNER', minutes: null, note: 'Starting level' },
      { at: '2026-03-01T09:00:00.000Z', fromLevel: 'BEGINNER', toLevel: 'INTERMEDIATE', minutes: 120, note: null },
    ],
    evidenceCount: 0,
    ...over,
  };
}

function input(over: Partial<GrowthInput> = {}): GrowthInput {
  return { skills: [], updates: [], evidence: [], goals: [], windowStart: START, today: TODAY, activePlans: 0, ...over };
}

// ── levels ────────────────────────────────────────────────────
register('growth: level ranks are ordered and unknown levels rank null', () => {
  assert.equal(levelRank('BEGINNER'), 1);
  assert.equal(levelRank('EXPERT'), 4);
  assert.ok(levelRank('ADVANCED')! > levelRank('INTERMEDIATE')!);
  assert.equal(levelRank(null), null);
});

// ── the central honesty rule ──────────────────────────────────
register('growth: a level recorded before the window is not progress inside it', () => {
  const p = skillProgress(skill(), START, TODAY);
  assert.equal(p.levelsGainedInWindow, 0);
  assert.equal(p.improvedInWindow, false);
  // The level in force at window start is still reported: it is a fact.
  assert.equal(p.levelAtWindowStart, 'INTERMEDIATE');
  assert.equal(p.currentLevel, 'INTERMEDIATE');
});

register('growth: a level change inside the window is progress, with its basis stated', () => {
  const p = skillProgress(
    skill({
      currentLevel: 'ADVANCED',
      updates: [
        { at: '2026-01-10T09:00:00.000Z', fromLevel: null, toLevel: 'BEGINNER', minutes: null, note: null },
        { at: '2026-06-10T09:00:00.000Z', fromLevel: 'INTERMEDIATE', toLevel: 'ADVANCED', minutes: 60, note: 'shipped the parser' },
      ],
    }),
    START,
    TODAY,
  );
  assert.equal(p.levelsGainedInWindow, 1);
  assert.equal(p.improvedInWindow, true);
  assert.equal(p.levelsToTarget, 0);
  assert.match(p.evidence, /ADVANCED|level/i);
});

register('growth: a level that went down is not counted as improvement', () => {
  const p = skillProgress(
    skill({
      currentLevel: 'BEGINNER',
      updates: [
        { at: '2026-01-10T09:00:00.000Z', fromLevel: null, toLevel: 'ADVANCED', minutes: null, note: null },
        { at: '2026-06-10T09:00:00.000Z', fromLevel: 'ADVANCED', toLevel: 'BEGINNER', minutes: null, note: 're-baselined' },
      ],
    }),
    START,
    TODAY,
  );
  assert.equal(p.levelsGainedInWindow, 0);
  assert.equal(p.improvedInWindow, false);
});

register('growth: practice minutes come only from recorded updates', () => {
  const p = skillProgress(
    skill({
      updates: [
        { at: '2026-06-02T09:00:00.000Z', fromLevel: null, toLevel: 'INTERMEDIATE', minutes: 45, note: null },
        { at: '2026-06-02T18:00:00.000Z', fromLevel: null, toLevel: 'INTERMEDIATE', minutes: 15, note: null },
        { at: '2026-06-05T09:00:00.000Z', fromLevel: null, toLevel: 'INTERMEDIATE', minutes: 30, note: null },
      ],
    }),
    START,
    TODAY,
  );
  assert.equal(p.practiceMinutes, 90);
  // Two distinct days, not three rows: days are what a streak is made of.
  assert.equal(p.practiceDays, 2);
});

// ── nothing recorded means nothing claimed ────────────────────
register('growth: an empty account reports nothing rather than zeros dressed as progress', () => {
  const a = analyseGrowth(input());
  assert.equal(a.hasAnyRecord, false);
  assert.equal(a.perSkill.length, 0);
  assert.equal(a.improving.length, 0);
  assert.equal(a.totals.levelsGained, 0);
  assert.equal(a.sufficiency.enough, false);
  assert.ok(a.sufficiency.message.length > 0);
});

register('growth: a skill with no target has no distance to target', () => {
  const a = analyseGrowth(input({ skills: [skill({ targetLevel: null })] }));
  assert.equal(a.perSkill[0].levelsToTarget, null);
});

register('growth: an untouched active skill is listed as needing attention with a reason', () => {
  const a = analyseGrowth(input({ skills: [skill({ updates: [] })] }));
  assert.equal(a.needingAttention.length, 1);
  assert.equal(a.needingAttention[0].skill.name, 'TypeScript');
  assert.ok(a.needingAttention[0].reason.length > 0);
});

register('growth: goals without a target are never described as behind', () => {
  const a = analyseGrowth(
    input({
      goals: [
        { id: 'g1', title: 'Ship the app', current: null, target: null, metric: null, deadline: '2026-07-15', milestonesTotal: 0, milestonesDone: 0, skillId: null },
        { id: 'g2', title: 'Read 12 books', current: 1, target: 12, metric: 'books', deadline: '2026-07-15', milestonesTotal: 2, milestonesDone: 1, skillId: null },
      ],
    }),
  );
  assert.equal(a.goals.behind.length, 1);
  assert.equal(a.goals.behind[0].title, 'Read 12 books');
  assert.equal(a.goals.withTarget, 1);
});

// ── the deterministic fallback cannot invent anything ─────────
const emptyGrowth: GrowthFeatureSummary = {
  tracked: { skills: 0, updatesInWindow: 0 },
  totals: { skills: 0, active: 0, paused: 0, completed: 0, levelsGained: 0, practiceMinutes: 0, practiceDays: 0, evidence: 0, activePlans: 0 },
  perSkill: [],
  improving: [],
  needingAttention: [],
  goals: { total: 0, withTarget: 0, milestonesDone: 0, milestonesTotal: 0, behind: [] },
  consistency: { activeDays: 0, bestStreak: 0, thin: true, note: 'No practice recorded.' },
  weekly: [],
  summary: { headline: 'No skills recorded yet', detail: 'Nothing recorded in this window, so there is nothing to report.' },
  sufficiency: { enough: false, message: 'No skills recorded yet.' },
};

register('growth plan: the fallback with no skills asks for skills instead of inventing some', () => {
  const p = deterministicPlan(emptyGrowth, { horizonWeeks: 4, weeklyMinutes: null, occupationNoun: 'project' });
  assert.equal(p.items.length, 1);
  assert.equal(p.items[0].kind, 'OBJECTIVE');
  assert.match(p.summary, /nothing is recorded/i);
  // No skill name is conjured up.
  assert.ok(!/TypeScript|Python|leadership/i.test(JSON.stringify(p.items)));
});

register('growth plan: the fallback builds activities from the recorded skills and minutes', () => {
  const g: GrowthFeatureSummary = {
    ...emptyGrowth,
    totals: { ...emptyGrowth.totals, skills: 1, active: 1, practiceMinutes: 90, practiceDays: 2 },
    perSkill: [
      {
        skillId: 's1',
        name: 'TypeScript',
        category: 'TECHNICAL',
        status: 'ACTIVE',
        currentLevel: 'INTERMEDIATE',
        targetLevel: 'ADVANCED',
        levelsToTarget: 1,
        levelsGainedInWindow: 0,
        practiceMinutes: 90,
        practiceDays: 2,
        daysSinceActivity: 4,
        evidenceCount: 0,
      },
    ],
  };
  const p = deterministicPlan(g, { horizonWeeks: 4, weeklyMinutes: 200, occupationNoun: 'project' });
  assert.ok(p.items.length > 1);
  assert.ok(p.items.some((i) => i.kind === 'OBJECTIVE' && i.skillId === 's1'));
  assert.ok(p.items.some((i) => i.kind === 'ACTIVITY' && /TypeScript/.test(i.title)));
  // The stated weekly time is respected, not inflated.
  const activity = p.items.find((i) => i.kind === 'ACTIVITY')!;
  assert.match(activity.title, /200 minutes/);
  assert.match(p.summary, /not a recommendation/i);
});
