/**
 * Growth intelligence.
 *
 * The rules here are the same ones the life engine already lives by, applied to
 * skills:
 *   - nothing is claimed without a record. A skill "improved" only when a
 *     SkillUpdate row says the level went up, never because time passed.
 *   - a comparison is against the person's own earlier level, never against a
 *     population. There is no average learner to be behind.
 *   - thin data is reported as thin, with the count, not smoothed into a
 *     number that looks confident.
 *   - a recommendation is always labelled as a recommendation. Nothing in this
 *     module produces text a reader could mistake for a measurement.
 *
 * Pure functions only: no Prisma, no dates from the clock. Everything that
 * needs "now" receives it, so the same inputs always give the same output and
 * every rule is testable.
 */

// ─────────────────────────────────────────────────────────────
// Levels
// ─────────────────────────────────────────────────────────────

export const SKILL_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

/**
 * Position in the ladder (1..4), for sorting and for "went up". Never a
 * percentage, and null when there is no level to rank.
 */
export function levelRank(level: SkillLevel | null | undefined): number | null {
  if (!level) return null;
  const i = SKILL_LEVELS.indexOf(level);
  return i < 0 ? null : i + 1;
}

export const LEVEL_WORD: Record<SkillLevel, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced',
  EXPERT: 'Expert',
};

export interface SkillRecord {
  id: string;
  name: string;
  category: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  currentLevel: SkillLevel;
  targetLevel: SkillLevel | null;
  startedAt: string;
  /** Every recorded level change, oldest first. The evidence for any claim. */
  updates: { at: string; fromLevel: SkillLevel | null; toLevel: SkillLevel; minutes: number | null; note: string | null }[];
  /** Attached evidence rows (courses, projects, certificates...). */
  evidenceCount: number;
}

// ─────────────────────────────────────────────────────────────
// Per-skill read
// ─────────────────────────────────────────────────────────────

export interface SkillProgress {
  skillId: string;
  name: string;
  category: string;
  status: SkillRecord['status'];
  currentLevel: SkillLevel;
  targetLevel: SkillLevel | null;
  /** Levels gained inside the window, from recorded changes only. */
  levelsGainedInWindow: number;
  /** Where they were at the start of the window (the level in force then). */
  levelAtWindowStart: SkillLevel | null;
  /** True only when a recorded change inside the window went up. */
  improvedInWindow: boolean;
  /** Distance to the target in levels, null without a target. */
  levelsToTarget: number | null;
  /** Minutes recorded in the window, and on how many distinct days. */
  practiceMinutes: number;
  practiceDays: number;
  /** Days since the last recorded activity of any kind on this skill. */
  daysSinceActivity: number | null;
  evidenceCount: number;
  /** The plain-language basis for whatever the UI says about this skill. */
  evidence: string;
}

/**
 * Read one skill over a window.
 *
 * `windowStart` and `today` are date keys (YYYY-MM-DD). A change recorded
 * before the window is still what "level at window start" reports, because the
 * level in force then is a fact about that moment, not a claim about progress.
 */
export function skillProgress(skill: SkillRecord, windowStart: string, today: string): SkillProgress {
  const sorted = [...skill.updates].sort((a, b) => a.at.localeCompare(b.at));

  let levelAtStart: SkillLevel | null = null;
  let inWindow: typeof sorted = [];
  for (const u of sorted) {
    const day = u.at.slice(0, 10);
    if (day < windowStart) levelAtStart = u.toLevel;
    else inWindow.push(u);
  }
  // No change before the window: the level they started at is the baseline,
  // and saying otherwise would credit them with movement that did not happen.
  if (levelAtStart === null && sorted.length > 0) levelAtStart = sorted[0].fromLevel;

  let gained = 0;
  for (const u of inWindow) {
    const from = levelRank(u.fromLevel ?? levelAtStart);
    const to = levelRank(u.toLevel);
    if (from !== null && to !== null && to > from) gained += to - from;
  }

  // Minutes are read from the recorded updates themselves, so there is one
  // source for "how much practice is recorded" and it cannot drift from the
  // history the user can see.
  const practiceDaySet = new Set(inWindow.filter((u) => u.minutes && u.minutes > 0).map((u) => u.at.slice(0, 10)));
  const practiceMinutes = inWindow.reduce((a, u) => a + (u.minutes && u.minutes > 0 ? u.minutes : 0), 0);

  const lastActivity = sorted.length ? sorted[sorted.length - 1].at.slice(0, 10) : skill.startedAt.slice(0, 10);
  const daysSinceActivity = dayDiff(lastActivity, today);

  const toTarget = levelRank(skill.targetLevel);
  const cur = levelRank(skill.currentLevel);

  const evidence =
    inWindow.length === 0
      ? `No level change recorded in this window; the current level was recorded earlier.`
      : gained > 0
        ? `${gained} level${gained === 1 ? '' : 's'} gained from ${inWindow.length} recorded change${inWindow.length === 1 ? '' : 's'} in this window.`
        : `${inWindow.length} recorded change${inWindow.length === 1 ? '' : 's'} in this window, none of them upward.`;

  return {
    skillId: skill.id,
    name: skill.name,
    category: skill.category,
    status: skill.status,
    currentLevel: skill.currentLevel,
    targetLevel: skill.targetLevel,
    levelsGainedInWindow: gained,
    levelAtWindowStart: levelAtStart,
    improvedInWindow: gained > 0,
    levelsToTarget: toTarget !== null && cur !== null ? Math.max(0, toTarget - cur) : null,
    practiceMinutes,
    practiceDays: practiceDaySet.size,
    daysSinceActivity,
    evidenceCount: skill.evidenceCount,
    evidence,
  };
}

// ─────────────────────────────────────────────────────────────
// The whole read
// ─────────────────────────────────────────────────────────────

export interface GrowthGoalRow {
  id: string;
  title: string;
  current: number | null;
  target: number | null;
  metric: string | null;
  deadline: string | null;
  milestonesTotal: number;
  milestonesDone: number;
  skillId: string | null;
}

export interface GrowthInput {
  skills: SkillRecord[];
  /** Every recorded update, for the activity series. */
  updates: { at: string; skillId: string; minutes: number | null }[];
  /** Evidence rows, for the "recent achievements" list. */
  evidence: { id: string; skillId: string; skillName: string; kind: string; title: string; at: string }[];
  goals: GrowthGoalRow[];
  windowStart: string;
  today: string;
  /** Active development plans, counted only — the plans page owns the detail. */
  activePlans: number;
}

export interface GrowthAnalysis {
  window: { from: string; to: string; days: number };
  /** True when there is at least one skill or one update; the UI gates on it. */
  hasAnyRecord: boolean;
  totals: {
    skills: number;
    active: number;
    paused: number;
    completed: number;
    levelsGained: number;
    practiceMinutes: number;
    practiceDays: number;
    evidence: number;
    activePlans: number;
  };
  perSkill: SkillProgress[];
  /** Skills with a recorded upward change inside the window, biggest first. */
  improving: SkillProgress[];
  /** Active skills with no recorded activity for a while, with the reason. */
  needingAttention: { skill: SkillProgress; reason: string }[];
  goals: {
    total: number;
    withTarget: number;
    achievedInWindow: number;
    milestonesDone: number;
    milestonesTotal: number;
    behind: { id: string; title: string; current: number | null; target: number | null; metric: string | null; deadline: string; fraction: number }[];
  };
  /** Learning consistency from recorded days only. */
  consistency: { activeDays: number; bestStreak: number; currentStreak: number; thin: boolean; note: string };
  /** Weekly practice minutes, oldest first, from recorded minutes only. */
  weekly: { weekStart: string; minutes: number; days: number; levelsGained: number }[];
  /** Recent evidence, newest first. */
  recentEvidence: GrowthInput['evidence'];
  /** Weekly summary sentence, template-built so it cannot overstate. */
  summary: { headline: string; detail: string };
  /** Deterministic next steps, each naming the record it came from. */
  nextSteps: { kind: 'skill' | 'goal' | 'consistency' | 'practice'; text: string; skillId?: string; goalId?: string }[];
  sufficiency: { enough: boolean; message: string };
}

export const MIN_GROWTH_DAYS = 7;
/** An active skill untouched for this long is worth mentioning. */
export const STALE_SKILL_DAYS = 21;

function dayDiff(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function addDaysKey(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week a date key falls in. */
function weekKey(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1;
  return addDaysKey(key, -back);
}

/**
 * Analyse growth over a window.
 *
 * Every branch below is decided by a record. Where there is no record, the
 * output says so — it never fills the gap with a plausible-looking number.
 */
export function analyseGrowth(input: GrowthInput): GrowthAnalysis {
  const { windowStart, today } = input;
  const days = dayDiff(windowStart, today) + 1;

  const perSkill = input.skills.map((s) => skillProgress(s, windowStart, today));
  const byId = new Map(perSkill.map((p) => [p.skillId, p]));

  const improving = perSkill.filter((p) => p.improvedInWindow).sort((a, b) => b.levelsGainedInWindow - a.levelsGainedInWindow || a.name.localeCompare(b.name));

  // "Needing attention" is deliberately narrow: an active skill the person has
  // touched neither by practice nor by a level change for a while. A paused or
  // completed skill is not neglected, it is set aside on purpose.
  const needingAttention: { skill: SkillProgress; reason: string }[] = [];
  for (const p of perSkill) {
    if (p.status !== 'ACTIVE') continue;
    const since = p.daysSinceActivity;
    if (since !== null && since >= STALE_SKILL_DAYS) {
      needingAttention.push({
        skill: p,
        reason: `No practice or level change recorded for ${since} days.`,
      });
    } else if (p.practiceMinutes === 0 && p.evidenceCount === 0 && p.levelsGainedInWindow === 0 && p.levelAtWindowStart === null) {
      needingAttention.push({ skill: p, reason: 'Added to your skills but nothing recorded against it yet.' });
    }
  }
  needingAttention.sort((a, b) => (b.skill.daysSinceActivity ?? 0) - (a.skill.daysSinceActivity ?? 0));

  // ── goals ────────────────────────────────────────────────
  const withTarget = input.goals.filter((g) => g.target !== null && g.target > 0);
  const behind = withTarget
    .filter((g) => g.deadline && (g.current ?? 0) / g.target! < 0.5)
    .map((g) => ({
      id: g.id,
      title: g.title,
      current: g.current,
      target: g.target,
      metric: g.metric,
      deadline: g.deadline!,
      fraction: Math.round(((g.current ?? 0) / g.target!) * 100) / 100,
    }));

  // ── consistency, from recorded days only ─────────────────
  const practiceByDay = new Map<string, number>();
  for (const u of input.updates) {
    if (u.minutes && u.minutes > 0) {
      const k = u.at.slice(0, 10);
      if (k >= windowStart && k <= today) practiceByDay.set(k, (practiceByDay.get(k) ?? 0) + u.minutes);
    }
  }
  const activeDayKeys = [...practiceByDay.keys()].sort();
  let bestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const k of activeDayKeys) {
    run = prev && addDaysKey(prev, 1) === k ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prev = k;
  }
  let currentStreak = 0;
  {
    let cursor = today;
    if (!practiceByDay.has(cursor)) cursor = addDaysKey(cursor, -1);
    while (practiceByDay.has(cursor) && currentStreak < 3650) {
      currentStreak += 1;
      cursor = addDaysKey(cursor, -1);
    }
  }
  const activeDays = activeDayKeys.length;
  const thin = activeDays < 3;

  // ── weekly series ────────────────────────────────────────
  const weeks = new Map<string, { minutes: number; days: Set<string>; levelsGained: number }>();
  for (const [k, mins] of practiceByDay) {
    const w = weekKey(k);
    const e = weeks.get(w) ?? { minutes: 0, days: new Set<string>(), levelsGained: 0 };
    e.minutes += mins;
    e.days.add(k);
    weeks.set(w, e);
  }
  for (const s of input.skills) {
    for (const u of s.updates) {
      const day = u.at.slice(0, 10);
      if (day < windowStart || day > today) continue;
      const from = levelRank(u.fromLevel);
      const to = levelRank(u.toLevel);
      if (from === null || to === null || to <= from) continue;
      const w = weekKey(day);
      const e = weeks.get(w) ?? { minutes: 0, days: new Set<string>(), levelsGained: 0 };
      e.levelsGained += to - from;
      weeks.set(w, e);
    }
  }
  const weekly = [...weeks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, e]) => ({ weekStart, minutes: e.minutes, days: e.days.size, levelsGained: e.levelsGained }));

  // ── totals ───────────────────────────────────────────────
  const totals = {
    skills: perSkill.length,
    active: perSkill.filter((p) => p.status === 'ACTIVE').length,
    paused: perSkill.filter((p) => p.status === 'PAUSED').length,
    completed: perSkill.filter((p) => p.status === 'COMPLETED').length,
    levelsGained: perSkill.reduce((a, p) => a + p.levelsGainedInWindow, 0),
    practiceMinutes: perSkill.reduce((a, p) => a + p.practiceMinutes, 0),
    practiceDays: activeDays,
    evidence: input.evidence.length,
    activePlans: input.activePlans,
  };

  // ── summary: template text, so it can only say what a record says ──
  const thisWeek = weekly.find((w) => w.weekStart === weekKey(today));
  const lastWeek = weekly.find((w) => w.weekStart === weekKey(addDaysKey(today, -7)));
  const headline =
    totals.skills === 0
      ? 'No skills recorded yet'
      : totals.levelsGained > 0
        ? `${totals.levelsGained} level${totals.levelsGained === 1 ? '' : 's'} gained in the last ${days} days`
        : totals.practiceMinutes > 0
          ? `${totals.practiceMinutes} minutes of recorded practice, no level change yet`
          : 'Skills recorded, no practice logged in this window';

  const parts: string[] = [];
  if (thisWeek) parts.push(`${thisWeek.minutes} minutes across ${thisWeek.days} day${thisWeek.days === 1 ? '' : 's'} this week`);
  if (lastWeek && thisWeek) {
    const diff = thisWeek.minutes - lastWeek.minutes;
    parts.push(diff === 0 ? 'the same as last week' : `${Math.abs(diff)} minutes ${diff > 0 ? 'more' : 'fewer'} than last week`);
  }
  if (improving.length) parts.push(`up in ${improving.slice(0, 3).map((p) => p.name).join(', ')}`);
  if (behind.length) parts.push(`${behind.length} goal${behind.length === 1 ? '' : 's'} under half its target with a deadline`);
  const detail = parts.length ? `${parts.join('; ')}.` : 'Nothing recorded in this window, so there is nothing to report.';

  // ── next steps: each one names its own evidence ──────────
  const nextSteps: GrowthAnalysis['nextSteps'] = [];
  for (const n of needingAttention.slice(0, 2)) {
    nextSteps.push({ kind: 'skill', skillId: n.skill.skillId, text: `Record a practice session for ${n.skill.name} — ${n.reason.toLowerCase()}` });
  }
  for (const b of behind.slice(0, 2)) {
    nextSteps.push({ kind: 'goal', goalId: b.id, text: `${b.title} is at ${b.current ?? 0} of ${b.target}${b.metric ? ` ${b.metric}` : ''} with a deadline of ${b.deadline}` });
  }
  if (thin && totals.skills > 0) {
    nextSteps.push({ kind: 'consistency', text: `Only ${activeDays} day${activeDays === 1 ? '' : 's'} with recorded practice in this window — three days would be enough to see a trend.` });
  }
  const untouchedTarget = perSkill.filter((p) => p.status === 'ACTIVE' && p.levelsToTarget !== null && p.levelsToTarget > 0 && p.practiceMinutes === 0);
  for (const p of untouchedTarget.slice(0, 1)) {
    nextSteps.push({ kind: 'practice', skillId: p.skillId, text: `${p.name} is ${p.levelsToTarget} level${p.levelsToTarget === 1 ? '' : 's'} from your target with no practice logged.` });
  }

  // ── sufficiency ──────────────────────────────────────────
  const enough = activeDays >= 3 || totals.levelsGained > 0 || input.goals.length > 0;
  const sufficiency = {
    enough,
    message: enough
      ? `Reading ${days} days: ${activeDays} with recorded practice, ${totals.levelsGained} level change${totals.levelsGained === 1 ? '' : 's'}.`
      : `Not enough recorded activity to read growth: ${activeDays} day${activeDays === 1 ? '' : 's'} with practice in ${days} days. Record a session or a level change and the read appears.`,
  };

  return {
    window: { from: windowStart, to: today, days },
    hasAnyRecord: input.skills.length > 0 || input.updates.length > 0,
    totals,
    perSkill,
    improving,
    needingAttention,
    goals: {
      total: input.goals.length,
      withTarget: withTarget.length,
      achievedInWindow: 0,
      milestonesDone: input.goals.reduce((a, g) => a + g.milestonesDone, 0),
      milestonesTotal: input.goals.reduce((a, g) => a + g.milestonesTotal, 0),
      behind,
    },
    consistency: {
      activeDays,
      bestStreak,
      currentStreak,
      thin,
      note: thin
        ? `Recorded practice on ${activeDays} day${activeDays === 1 ? '' : 's'} in this window. Streaks are not shown as meaningful below three.`
        : `Practice recorded on ${activeDays} days, longest run ${bestStreak}.`,
    },
    weekly,
    recentEvidence: [...input.evidence].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8),
    summary: { headline, detail },
    nextSteps: nextSteps.slice(0, 4),
    sufficiency,
  };
}

// ─────────────────────────────────────────────────────────────
// Prompt text
// ─────────────────────────────────────────────────────────────

/**
 * The growth block handed to the model.
 *
 * Written so the model cannot mistake a recommendation for a measurement: the
 * measured section is labelled, the suggestion section is labelled, and the
 * rules line states the constraints in the same words the engine enforces.
 */
export function growthForPrompt(a: GrowthAnalysis): string {
  const lines: string[] = [];
  lines.push(`GROWTH (window ${a.window.from} to ${a.window.to}, ${a.window.days} days)`);
  if (!a.hasAnyRecord) {
    lines.push('No skills recorded. Do not suggest that any skill has improved; there is nothing to measure.');
    return lines.join('\n');
  }
  lines.push(`MEASURED: ${a.summary.headline}. ${a.summary.detail}`);
  lines.push(`Totals: ${a.totals.skills} skills (${a.totals.active} active, ${a.totals.paused} paused, ${a.totals.completed} completed), ${a.totals.levelsGained} level changes, ${a.totals.practiceMinutes} practice minutes on ${a.totals.practiceDays} days, ${a.totals.evidence} evidence items.`);
  if (a.improving.length) {
    lines.push(`Improved (only where a recorded change went up): ${a.improving.map((p) => `${p.name} ${p.levelAtWindowStart ?? '?'} -> ${p.currentLevel} (+${p.levelsGainedInWindow})`).join('; ')}.`);
  } else {
    lines.push('Improved: none. No recorded level change went up in this window — never say a skill improved.');
  }
  if (a.perSkill.length) {
    lines.push(
      `Current levels: ${a.perSkill.map((p) => `${p.name} (${p.category}) ${p.currentLevel}${p.targetLevel ? ` -> target ${p.targetLevel}` : ''}${p.daysSinceActivity !== null ? `, last activity ${p.daysSinceActivity}d ago` : ''}`).join('; ')}.`,
    );
  }
  if (a.needingAttention.length) lines.push(`Needing attention: ${a.needingAttention.map((n) => `${n.skill.name} — ${n.reason}`).join('; ')}.`);
  if (a.goals.total) {
    lines.push(`Goals: ${a.goals.total} total, ${a.goals.withTarget} with a numeric target, ${a.goals.milestonesDone}/${a.goals.milestonesTotal} milestones done.`);
    if (a.goals.behind.length) lines.push(`Behind (recorded number under half the target, with a deadline): ${a.goals.behind.map((b) => `${b.title} ${b.current ?? 0}/${b.target}`).join('; ')}.`);
  }
  lines.push(`Consistency: ${a.consistency.note}`);
  lines.push(`Active development plans: ${a.totals.activePlans}.`);
  lines.push('RULES: growth is measured against this person\'s own earlier level, never against other people. Do not predict how long reaching a level will take. Anything you suggest is a recommendation and must be phrased as one, separate from the measured figures above.');
  return lines.join('\n');
}
