// ─────────────────────────────────────────────────────────────
// The life engine: one definition of "how is this person doing".
// ─────────────────────────────────────────────────────────────
// Every module and every AI prompt reads from here, so the dashboard, the
// analytics page and the assistant can never disagree about the same week.
//
// Two rules this file exists to enforce:
//
//  1. A correlation is never reported without its sample size, and never
//     below MIN_SAMPLE. A coefficient computed from six days is noise
//     wearing a number's clothing.
//  2. Nothing here says "causes". The vocabulary is "tends to", "moves with",
//     "on days when". Causation needs an experiment, and we do not run one.
//
// Pure functions only: no Prisma, no dates from the clock. Callers pass the
// rows, which is what makes this testable without a database.

/** Pearson r is only reported at or above this many paired observations. */
export const MIN_SAMPLE = 14;

/** Below this |r| we call the relationship "none worth acting on". */
const WEAK_R = 0.2;
const MODERATE_R = 0.4;

export type Strength = 'none' | 'weak' | 'moderate' | 'strong';

export interface Correlation {
  /** Machine key, e.g. "sleepVsScore". */
  key: string;
  /** The pair, as the UI should name them. */
  xLabel: string;
  yLabel: string;
  /** Pearson r over the paired observations. */
  r: number;
  /** How many days had both values present. */
  n: number;
  strength: Strength;
  /** Human sentence that states a tendency, never a cause. */
  sentence: string;
}

export interface CorrelationsResult {
  /** Pairs with enough data. */
  correlations: Correlation[];
  /** Pairs we deliberately did not compute, and why. */
  withheld: { key: string; xLabel: string; yLabel: string; n: number; reason: string }[];
  /** The threshold the caller should show the user. */
  minSample: number;
}

/** One day, already joined across the domains. Every field optional. */
export interface LifeDay {
  date: string;
  score: number | null;
  sleepHours: number | null;
  screenHours: number | null;
  exerciseMinutes: number | null;
  studyMinutes: number | null;
  mood: number | null;
  stress: number | null;
  focus: number | null;
  /** Self-reported 1-5 from the daily wellness log. */
  energy: number | null;
  sleepQuality: number | null;
  habitRate: number | null;
  tasksCompleted: number | null;
  tasksOverdue: number | null;
}

function pearson(pairs: [number, number][]): number {
  const n = pairs.length;
  if (n < 2) return 0;
  const mx = pairs.reduce((a, [x]) => a + x, 0) / n;
  const my = pairs.reduce((a, [, y]) => a + y, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const [x, y] of pairs) {
    num += (x - mx) * (y - my);
    dx += (x - mx) ** 2;
    dy += (y - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

function strengthOf(r: number): Strength {
  const a = Math.abs(r);
  if (a < WEAK_R) return 'none';
  if (a < MODERATE_R) return 'weak';
  if (a < 0.7) return 'moderate';
  return 'strong';
}

const STRENGTH_WORD: Record<Strength, string> = {
  none: 'no clear relationship',
  weak: 'a weak tendency',
  moderate: 'a moderate tendency',
  strong: 'a strong tendency',
};

/**
 * Build the sentence. Deliberately template-driven rather than model-written:
 * this text appears next to a number, so it must be as reproducible as the
 * number is.
 */
function sentenceFor(xLabel: string, yLabel: string, r: number, n: number): string {
  const s = strengthOf(r);
  if (s === 'none') {
    return `Over ${n} days, ${xLabel} and ${yLabel} showed no clear relationship (r = ${r.toFixed(2)}).`;
  }
  const dir = r > 0 ? 'higher' : 'lower';
  return `Over ${n} days, when ${xLabel} was higher, ${yLabel} tended to be ${dir} (r = ${r.toFixed(2)}, ${STRENGTH_WORD[s]}). This is a correlation, not a cause.`;
}

interface Spec {
  key: string;
  x: keyof LifeDay;
  y: keyof LifeDay;
  xLabel: string;
  yLabel: string;
}

const SPECS: Spec[] = [
  { key: 'sleepVsScore', x: 'sleepHours', y: 'score', xLabel: 'sleep', yLabel: 'your daily score' },
  { key: 'screenVsScore', x: 'screenHours', y: 'score', xLabel: 'screen time', yLabel: 'your daily score' },
  { key: 'exerciseVsScore', x: 'exerciseMinutes', y: 'score', xLabel: 'exercise', yLabel: 'your daily score' },
  { key: 'stressVsScore', x: 'stress', y: 'score', xLabel: 'stress', yLabel: 'your daily score' },
  { key: 'moodVsScore', x: 'mood', y: 'score', xLabel: 'mood', yLabel: 'your daily score' },
  { key: 'habitVsScore', x: 'habitRate', y: 'score', xLabel: 'habit completion', yLabel: 'your daily score' },
  { key: 'studyVsScore', x: 'studyMinutes', y: 'score', xLabel: 'study and work hours', yLabel: 'your daily score' },
  { key: 'overdueVsScore', x: 'tasksOverdue', y: 'score', xLabel: 'overdue tasks', yLabel: 'your daily score' },
  { key: 'sleepVsFocus', x: 'sleepHours', y: 'focus', xLabel: 'sleep', yLabel: 'focus' },
  { key: 'energyVsScore', x: 'energy', y: 'score', xLabel: 'energy', yLabel: 'your daily score' },
  { key: 'sleepQualityVsScore', x: 'sleepQuality', y: 'score', xLabel: 'sleep quality', yLabel: 'your daily score' },
  { key: 'sleepQualityVsFocus', x: 'sleepQuality', y: 'focus', xLabel: 'sleep quality', yLabel: 'focus' },
  { key: 'screenVsFocus', x: 'screenHours', y: 'focus', xLabel: 'screen time', yLabel: 'focus' },
];

/**
 * Correlate each pair across the days that have BOTH values.
 *
 * Pairs below MIN_SAMPLE go to `withheld` with the count, so the UI can say
 * "we need 5 more days of sleep data" instead of drawing an empty chart or,
 * worse, a confident line through six points.
 */
export function computeCorrelations(days: LifeDay[], minSample = MIN_SAMPLE): CorrelationsResult {
  const correlations: Correlation[] = [];
  const withheld: CorrelationsResult['withheld'] = [];

  for (const spec of SPECS) {
    const pairs: [number, number][] = [];
    let identical = 0;
    for (const d of days) {
      const x = d[spec.x];
      const y = d[spec.y];
      if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
        pairs.push([x, y]);
        // Two columns that carry the same number every day are one column
        // wearing two names -- today that is study time and the daily score,
        // which is built partly from it. Correlating them would report a
        // tautology as a finding.
        if (x === y) identical += 1;
      }
    }
    if (pairs.length >= minSample && identical / pairs.length > 0.9) {
      withheld.push({
        key: spec.key,
        xLabel: spec.xLabel,
        yLabel: spec.yLabel,
        n: pairs.length,
        reason: 'the two measures carry the same values, so this would only restate one of them',
      });
      continue;
    }
    if (pairs.length < minSample) {
      withheld.push({
        key: spec.key,
        xLabel: spec.xLabel,
        yLabel: spec.yLabel,
        n: pairs.length,
        reason: `needs ${minSample} days with both values; ${pairs.length} so far`,
      });
      continue;
    }
    const r = pearson(pairs);
    correlations.push({
      key: spec.key,
      xLabel: spec.xLabel,
      yLabel: spec.yLabel,
      r: Math.round(r * 1000) / 1000,
      n: pairs.length,
      strength: strengthOf(r),
      sentence: sentenceFor(spec.xLabel, spec.yLabel, r, pairs.length),
    });
  }

  // Strongest first: that is the order a person would read them in.
  correlations.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  return { correlations, withheld, minSample };
}

// ─────────────────────────────────────────────────────────────
// Best-performing time
// ─────────────────────────────────────────────────────────────

export interface TimeBucket {
  /** 0-23 for hours, or 0-6 for weekdays. */
  index: number;
  label: string;
  completions: number;
  focusMinutes: number;
  /** How many distinct days fed this bucket. */
  days: number;
  /** Completions per active day — comparable across buckets. */
  perDay: number;
}

export interface BestTime {
  hour: TimeBucket | null;
  weekday: TimeBucket | null;
  /** True when the best bucket rests on too few days to trust. */
  lowConfidence: boolean;
  note: string;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function perDayOf(completions: number, days: number): number {
  return days ? Math.round((completions / days) * 100) / 100 : 0;
}

/**
 * "Your best hour" from a per-hour completion distribution.
 *
 * Guarded: an hour that saw 3 completions across 3 days must not be crowned
 * over one that saw 40 across 40 days. We rank by completions per active day,
 * require at least MIN_BUCKET_DAYS, and say so when we cannot.
 */
export const MIN_BUCKET_DAYS = 7;

export function bestTime(
  hourly: { hour: number; completions: number; focusMinutes: number }[],
  weekday: { day: string; completions: number; focusMinutes: number }[],
  daysPerBucket?: { hour: number; days: number }[],
): BestTime {
  const daysFor = new Map<number, number>();
  for (const d of daysPerBucket ?? []) daysFor.set(d.hour, d.days);

  const hourBuckets: TimeBucket[] = hourly
    .filter((h) => h.completions > 0 || h.focusMinutes > 0)
    .map((h) => {
      const days = daysFor.get(h.hour) ?? 1;
      return {
        index: h.hour,
        label: `${String(h.hour).padStart(2, '0')}:00`,
        completions: h.completions,
        focusMinutes: h.focusMinutes,
        days,
        perDay: perDayOf(h.completions, days),
      };
    })
    .sort((a, b) => b.perDay - a.perDay || b.focusMinutes - a.focusMinutes);

  const dayBuckets: TimeBucket[] = weekday
    .filter((d) => d.completions > 0 || d.focusMinutes > 0)
    .map((d, i) => ({
      index: i,
      label: d.day,
      completions: d.completions,
      focusMinutes: d.focusMinutes,
      days: 1,
      perDay: d.completions,
    }))
    .sort((a, b) => b.completions - a.completions || b.focusMinutes - a.focusMinutes);

  const hour = hourBuckets[0] ?? null;
  const day = dayBuckets[0] ?? null;
  const lowConfidence = hour !== null && hour.days < MIN_BUCKET_DAYS;

  let note: string;
  if (!hour && !day) {
    note = 'Not enough completed tasks or focus time yet to identify a best time.';
  } else if (lowConfidence) {
    note = `The ${hour!.label} hour looks strongest, but it rests on only ${hour!.days} ${hour!.days === 1 ? 'day' : 'days'} of data. Treat it as a hint, not a finding.`;
  } else {
    note = `Your strongest hour has been ${hour?.label ?? 'not yet clear'}${day ? `, and ${day.label} has been your strongest weekday` : ''}.`;
  }

  return { hour, weekday: day, lowConfidence, note };
}

// ─────────────────────────────────────────────────────────────
// Period comparison
// ─────────────────────────────────────────────────────────────

export interface Delta {
  key: string;
  label: string;
  current: number | null;
  previous: number | null;
  /** Absolute change, or null when either side is missing. */
  change: number | null;
  /** Percent change; null when previous is 0 or missing. */
  changePct: number | null;
  /** 'up' | 'down' | 'flat' | 'unknown' */
  direction: 'up' | 'down' | 'flat' | 'unknown';
  /** Whether "up" is good news for this metric. */
  higherIsBetter: boolean;
  /** True when the change is smaller than the noise floor we consider real. */
  withinNoise: boolean;
}

/** Changes under this fraction of the previous value are called flat. */
const FLAT_BAND = 0.05;

const DELTA_METRICS: { key: string; label: string; higherIsBetter: boolean }[] = [
  { key: 'score', label: 'Daily score', higherIsBetter: true },
  { key: 'tasksCompleted', label: 'Tasks completed', higherIsBetter: true },
  { key: 'focusMinutes', label: 'Focus minutes', higherIsBetter: true },
  { key: 'habitRate', label: 'Habit completion', higherIsBetter: true },
  { key: 'mood', label: 'Mood', higherIsBetter: true },
  { key: 'sleepHours', label: 'Sleep hours', higherIsBetter: true },
  { key: 'screenHours', label: 'Screen time', higherIsBetter: false },
  { key: 'stress', label: 'Stress', higherIsBetter: false },
  { key: 'energy', label: 'Energy', higherIsBetter: true },
  { key: 'sleepQuality', label: 'Sleep quality', higherIsBetter: true },
];

export interface PeriodSummary {
  days: number;
  daysWithData: number;
  score: number | null;
  tasksCompleted: number | null;
  focusMinutes: number | null;
  habitRate: number | null;
  mood: number | null;
  sleepHours: number | null;
  screenHours: number | null;
  stress: number | null;
  energy: number | null;
  sleepQuality: number | null;
  exerciseMinutes: number | null;
  /** How many days in the period recorded a mood, so the mean can be trusted. */
  moodDays: number;
  /** Days on which a habit was checked in, for consistency claims. */
  habitDays: number;
}

function avg(nums: (number | null)[]): number | null {
  const v = nums.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  if (!v.length) return null;
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100;
}

function sum(nums: (number | null)[]): number | null {
  const v = nums.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0);
}

export function summarisePeriod(days: LifeDay[]): PeriodSummary {
  return {
    days: days.length,
    daysWithData: days.filter(
      (d) =>
        (d.tasksCompleted ?? 0) > 0 ||
        (d.habitRate ?? 0) > 0 ||
        (d.studyMinutes ?? 0) > 0 ||
        d.mood !== null ||
        d.sleepHours !== null ||
        d.screenHours !== null ||
        d.exerciseMinutes !== null ||
        d.stress !== null ||
        d.energy !== null ||
        d.sleepQuality !== null,
    ).length,
    score: avg(days.map((d) => d.score)),
    tasksCompleted: sum(days.map((d) => d.tasksCompleted)),
    focusMinutes: sum(days.map((d) => d.studyMinutes)),
    habitRate: avg(days.map((d) => d.habitRate)),
    mood: avg(days.map((d) => d.mood)),
    sleepHours: avg(days.map((d) => d.sleepHours)),
    screenHours: avg(days.map((d) => d.screenHours)),
    stress: avg(days.map((d) => d.stress)),
    energy: avg(days.map((d) => d.energy)),
    sleepQuality: avg(days.map((d) => d.sleepQuality)),
    exerciseMinutes: avg(days.map((d) => d.exerciseMinutes)),
    moodDays: days.filter((d) => d.mood !== null).length,
    habitDays: days.filter((d) => (d.habitRate ?? 0) > 0).length,
  };
}

export function comparePeriods(current: PeriodSummary, previous: PeriodSummary): Delta[] {
  return DELTA_METRICS.map((m) => {
    const cur = current[m.key as keyof PeriodSummary] as number | null;
    const prev = previous[m.key as keyof PeriodSummary] as number | null;
    if (cur === null || prev === null) {
      return { ...m, current: cur, previous: prev, change: null, changePct: null, direction: 'unknown' as const, withinNoise: true };
    }
    const change = Math.round((cur - prev) * 100) / 100;
    const changePct = prev === 0 ? null : Math.round((change / Math.abs(prev)) * 1000) / 10;
    const withinNoise = prev !== 0 ? Math.abs(change / prev) < FLAT_BAND : change === 0;
    const direction = withinNoise ? ('flat' as const) : change > 0 ? ('up' as const) : ('down' as const);
    return { ...m, current: cur, previous: prev, change, changePct, direction, withinNoise };
  });
}

// ─────────────────────────────────────────────────────────────
// Areas needing improvement
// ─────────────────────────────────────────────────────────────

export interface ImprovementArea {
  key: string;
  title: string;
  /** What the numbers say. */
  detail: string;
  /** One thing to try. Small on purpose. */
  suggestion: string;
  severity: 'high' | 'medium' | 'low';
}

/**
 * Rank the domains by how far they are from the person's own recent norm,
 * never against a population benchmark we do not have.
 *
 * That distinction matters: "you slept 6.1h against your own 7.4h average"
 * is defensible. "You sleep less than average" is a claim about the world
 * we cannot make from this data.
 */
export function improvementAreas(days: LifeDay[], compare?: { current: PeriodSummary; previous: PeriodSummary }): ImprovementArea[] {
  const areas: ImprovementArea[] = [];
  const recent = days.slice(-14);
  const sleep = avg(recent.map((d) => d.sleepHours));
  const screen = avg(recent.map((d) => d.screenHours));
  const stress = avg(recent.map((d) => d.stress));
  const habit = avg(recent.map((d) => d.habitRate));
  const overdue = sum(recent.map((d) => d.tasksOverdue));

  if (sleep !== null && sleep < 7) {
    areas.push({
      key: 'sleep',
      title: 'Sleep is under 7 hours',
      detail: `You averaged ${sleep}h over the last ${recent.length} days.`,
      suggestion: 'Pick one fixed wake time for the next week. Fixed wake times move sleep earlier more reliably than fixed bedtimes.',
      severity: sleep < 6 ? 'high' : 'medium',
    });
  }
  if (screen !== null && screen > 5) {
    areas.push({
      key: 'screen',
      title: 'Screen time is high',
      detail: `You averaged ${screen}h of screen time over the last ${recent.length} days.`,
      suggestion: 'Try one screen-free block of 45 minutes on the days you intend to focus most. Track whether that day scores higher.',
      severity: screen > 7 ? 'high' : 'medium',
    });
  }
  if (stress !== null && stress >= 4) {
    areas.push({
      key: 'stress',
      title: 'Stress is running high',
      detail: `Your self-reported stress averaged ${stress} out of 5 over the last ${recent.length} days.`,
      suggestion: 'Name the single largest open commitment and decide this week whether to finish it, shrink it, or drop it.',
      severity: stress >= 4.5 ? 'high' : 'medium',
    });
  }
  const energy = avg(recent.map((d) => d.energy));
  const quality = avg(recent.map((d) => d.sleepQuality));
  const energyDays = recent.filter((d) => typeof d.energy === 'number').length;

  if (energy !== null && energyDays >= 3 && energy < 2.5) {
    areas.push({
      key: 'energy',
      title: 'Energy is running low',
      detail: `You reported energy at ${energy} out of 5 on ${energyDays} of the last ${recent.length} days.`,
      suggestion: 'Look at the nights that preceded your lowest-energy days rather than the days themselves. The cause is usually the night before.',
      severity: energy < 2 ? 'high' : 'medium',
    });
  }
  if (quality !== null && quality < 3) {
    areas.push({
      key: 'sleepQuality',
      title: 'Sleep is not restoring you',
      detail: `You rated sleep quality ${quality} out of 5 on average, while averaging ${sleep ?? '?'}h.`,
      suggestion: 'Duration and quality are separate problems. If hours look fine but quality does not, the variable is usually when you sleep, not how long.',
      severity: quality < 2 ? 'high' : 'medium',
    });
  }
  if (habit !== null && habit < 60) {
    areas.push({
      key: 'habits',
      title: 'Habits are being missed',
      detail: `Habit completion averaged ${habit}% over the last ${recent.length} days.`,
      suggestion: 'Reduce to the two habits that matter most until they clear 80% for two weeks. Add the rest back after.',
      severity: habit < 35 ? 'high' : 'medium',
    });
  }
  if (overdue !== null && overdue > 0) {
    areas.push({
      key: 'overdue',
      title: 'Tasks are slipping past their dates',
      detail: `${overdue} task${overdue === 1 ? '' : 's'} went overdue in the last ${recent.length} days.`,
      suggestion: 'Before adding anything new, clear or reschedule the overdue list. An overdue list longer than five items stops being a plan.',
      severity: overdue > 10 ? 'high' : 'low',
    });
  }
  if (compare) {
    const scoreDelta = comparePeriods(compare.current, compare.previous).find((d) => d.key === 'score');
    if (scoreDelta && scoreDelta.direction === 'down' && !scoreDelta.withinNoise) {
      areas.push({
        key: 'score',
        title: 'Your score dropped against last period',
        detail: `Daily score went from ${scoreDelta.previous} to ${scoreDelta.current} (${scoreDelta.changePct}%).`,
        suggestion: 'Compare which domain moved most — usually one does — rather than trying to lift everything at once.',
        severity: 'medium',
      });
    }
  }

  const rank = { high: 0, medium: 1, low: 2 };
  return areas.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 5);
}

// ─────────────────────────────────────────────────────────────
// Data sufficiency — the honest gate
// ─────────────────────────────────────────────────────────────

export interface Sufficiency {
  /** 0-100: how much of what a useful analysis needs is present. */
  completeness: number;
  daysTracked: number;
  daysNeeded: number;
  /** Domains with no data at all. */
  missing: string[];
  /** Domains with some data, but fewer days than a comparison needs. */
  thin: string[];
  /** Plain sentence for the UI. Never empty. */
  message: string;
  /** Whether trend-level claims are defensible. */
  trendsAvailable: boolean;
  /** Whether correlation-level claims are defensible. */
  correlationsAvailable: boolean;
}

export const DAYS_FOR_TRENDS = 7;
export const DAYS_FOR_CORRELATIONS = MIN_SAMPLE;

export function sufficiency(days: LifeDay[], domainsPresent: Record<string, boolean>): Sufficiency {
  // A day counts as tracked when the person recorded something on it. A
  // computed score is not evidence: scoreDay returns a number for every day in
  // the window, including the empty ones, so counting it here would report
  // "30 days tracked" to someone who had just signed up.
  const tracked = days.filter(
    (d) =>
      (d.tasksCompleted ?? 0) > 0 ||
      (d.habitRate ?? 0) > 0 ||
      (d.studyMinutes ?? 0) > 0 ||
      d.mood !== null ||
      d.sleepHours !== null ||
      d.screenHours !== null ||
      d.exerciseMinutes !== null ||
      d.stress !== null ||
      d.energy !== null ||
      d.sleepQuality !== null,
  ).length;
  const missing = Object.entries(domainsPresent)
    .filter(([, present]) => !present)
    .map(([name]) => name);
  // Domains that exist but on too few days to compare. Reported separately so
  // "not tracked" and "tracked a little" never read the same.
  const thin = Object.entries(domainsPresent)
    .filter(([, present]) => present)
    .map(([name]) => ({
      name,
      days: days.filter((d) => {
        switch (name) {
          case 'tasks':
            return (d.tasksCompleted ?? 0) > 0;
          case 'habits':
            return (d.habitRate ?? 0) > 0;
          case 'focus':
            return (d.studyMinutes ?? 0) > 0;
          case 'mood':
            return d.mood !== null;
          case 'wellness':
            return d.stress !== null || d.energy !== null || d.sleepQuality !== null;
          default:
            return false;
        }
      }).length,
    }))
    .filter((x) => x.days > 0 && x.days < DAYS_FOR_CORRELATIONS)
    .map((x) => `${x.name} (${x.days} days)`);

  const domainScore = Object.keys(domainsPresent).length
    ? (Object.keys(domainsPresent).length - missing.length) / Object.keys(domainsPresent).length
    : 0;
  const timeScore = Math.min(1, tracked / DAYS_FOR_CORRELATIONS);
  const completeness = Math.round((domainScore * 0.5 + timeScore * 0.5) * 100);

  const trendsAvailable = tracked >= DAYS_FOR_TRENDS;
  const correlationsAvailable = tracked >= DAYS_FOR_CORRELATIONS;

  let message: string;
  if (tracked === 0) {
    message = 'No activity has been recorded yet. Log a few days and the analysis will start here.';
  } else if (!trendsAvailable) {
    message = `${tracked} of ${DAYS_FOR_TRENDS} days recorded. Trends need at least a week before they mean anything.`;
  } else if (!correlationsAvailable) {
    message = `${tracked} days recorded. Trends are available; comparisons between two domains need ${DAYS_FOR_CORRELATIONS} days.`;
  } else if (missing.length || thin.length) {
    const parts: string[] = [];
    if (missing.length) parts.push(`not tracked yet: ${missing.join(', ')}`);
    if (thin.length) parts.push(`still too few days to compare: ${thin.join(', ')}`);
    message = `Enough data for trends. ${parts.join('; ')}.`;
  } else {
    message = `${tracked} days tracked across every domain. Trends and comparisons are both available.`;
  }

  return {
    completeness,
    daysTracked: tracked,
    daysNeeded: DAYS_FOR_CORRELATIONS,
    missing,
    thin,
    message,
    trendsAvailable,
    correlationsAvailable,
  };
}

// ─────────────────────────────────────────────────────────────
// The whole picture
// ─────────────────────────────────────────────────────────────

export interface LifeAnalysis {
  sufficiency: Sufficiency;
  correlations: CorrelationsResult;
  bestTime: BestTime;
  deltas: Delta[];
  improvements: ImprovementArea[];
  current: PeriodSummary;
  previous: PeriodSummary;
  /**
   * What is going well, stated only where a number supports it. The mirror of
   * `improvements`: the dashboard shows both, because a screen that only ever
   * points out weaknesses is a screen people stop opening.
   */
  strengths: StrengthArea[];
  /** Daily score across the window, for the trend line. */
  trend: { date: string; score: number | null; hasData: boolean }[];
  /** Habit consistency: the longest run of days with a check-in. */
  consistency: Consistency;
}

export function analyseLife(input: {
  days: LifeDay[];
  hourly: { hour: number; completions: number; focusMinutes: number }[];
  weekday: { day: string; completions: number; focusMinutes: number }[];
  daysPerHour?: { hour: number; days: number }[];
  domainsPresent: Record<string, boolean>;
}): LifeAnalysis {
  const { days } = input;
  const half = Math.floor(days.length / 2);
  const previous = summarisePeriod(days.slice(0, half));
  const current = summarisePeriod(days.slice(half));

  return {
    sufficiency: sufficiency(days, input.domainsPresent),
    correlations: computeCorrelations(days),
    bestTime: bestTime(input.hourly, input.weekday, input.daysPerHour),
    deltas: comparePeriods(current, previous),
    improvements: improvementAreas(days, { current, previous }),
    current,
    previous,
    strengths: strengthAreas(days, { current, previous }),
    trend: days.map((d) => ({
      date: d.date,
      score: d.score,
      hasData:
        (d.tasksCompleted ?? 0) > 0 ||
        (d.habitRate ?? 0) > 0 ||
        (d.studyMinutes ?? 0) > 0 ||
        d.mood !== null ||
        d.sleepHours !== null ||
        d.stress !== null ||
        d.energy !== null,
    })),
    consistency: habitConsistency(days),
  };
}

// ─────────────────────────────────────────────────────────────
// Strengths and consistency
// ─────────────────────────────────────────────────────────────

export interface StrengthArea {
  key: string;
  title: string;
  /** What the numbers say, in the user's own data. */
  detail: string;
  /** The evidence, named, so the claim can be checked. */
  evidence: string;
}

/**
 * The other half of `improvementAreas`.
 *
 * Every strength names the figures behind it, because "you're doing great" is
 * not a finding. A strength is only reported when the number is genuinely
 * better than the person's own baseline, not merely present.
 */
export function strengthAreas(days: LifeDay[], ctx: { current: PeriodSummary; previous: PeriodSummary }): StrengthArea[] {
  const out: StrengthArea[] = [];
  const { current, previous } = ctx;
  const recent = days.slice(Math.floor(days.length / 2));

  // 1. A domain that is holding up on its own terms.
  if (current.habitRate !== null && current.habitRate >= 70 && current.habitDays >= 5) {
    out.push({
      key: 'habits',
      title: 'Habits are holding',
      detail: `You completed ${current.habitRate}% of your habits across ${current.habitDays} days.`,
      evidence: `${current.habitRate}% habit completion over ${current.habitDays} days with a check-in.`,
    });
  }
  if (current.score !== null && current.score >= 65 && current.daysWithData >= 5) {
    out.push({
      key: 'score',
      title: 'Your daily score is strong',
      detail: `An average score of ${current.score} across ${current.daysWithData} recorded days.`,
      evidence: `Mean of the daily score over ${current.daysWithData} days: ${current.score}.`,
    });
  }

  // 2. A metric that improved on the previous period by more than noise.
  const improved = comparePeriods(current, previous).filter(
    (d) => d.direction !== 'unknown' && !d.withinNoise && d.change !== null && (d.higherIsBetter ? d.change > 0 : d.change < 0),
  );
  for (const d of improved.slice(0, 2)) {
    out.push({
      key: `up-${d.key}`,
      title: `${d.label} moved the right way`,
      detail: `${d.label} went from ${d.previous} to ${d.current}.`,
      evidence: `Previous period ${d.previous} → this period ${d.current}.`,
    });
  }

  // 3. Sleep that sits in a defensible band, only when enough nights exist.
  const nights = recent.filter((d) => d.sleepHours !== null);
  if (nights.length >= 5) {
    const mean = nights.reduce((a, d) => a + (d.sleepHours as number), 0) / nights.length;
    if (mean >= 7 && mean <= 9) {
      out.push({
        key: 'sleep',
        title: 'Sleep is in a good band',
        detail: `You averaged ${Math.round(mean * 10) / 10}h across ${nights.length} recorded nights.`,
        evidence: `${Math.round(mean * 10) / 10}h mean over ${nights.length} nights of sleep data.`,
      });
    }
  }

  return out.slice(0, 4);
}

export interface Consistency {
  /** Days in a row with at least one habit check-in, ending at the last day. */
  streak: number;
  /** Longest such run anywhere in the window. */
  bestStreak: number;
  /** Days with a check-in, out of the window. */
  daysWithCheckin: number;
  days: number;
  /** True when there is not enough history for the numbers to mean anything. */
  thin: boolean;
  note: string;
}

export function habitConsistency(days: LifeDay[]): Consistency {
  const has = days.map((d) => (d.habitRate ?? 0) > 0);
  const daysWithCheckin = has.filter(Boolean).length;

  let best = 0;
  let run = 0;
  for (const h of has) {
    run = h ? run + 1 : 0;
    if (run > best) best = run;
  }
  let streak = 0;
  for (let i = has.length - 1; i >= 0 && has[i]; i--) streak += 1;

  const thin = daysWithCheckin < 5;
  const note = thin
    ? `Only ${daysWithCheckin} ${daysWithCheckin === 1 ? 'day' : 'days'} with a habit check-in. Consistency needs a week before it reads as a pattern.`
    : streak > 0
      ? `${streak} day${streak === 1 ? '' : 's'} in a row. Best run in this window: ${best}.`
      : `No run going right now. Best run in this window: ${best} day${best === 1 ? '' : 's'}.`;

  return { streak, bestStreak: best, daysWithCheckin, days: days.length, thin, note };
}

/**
 * The compact text block the AI prompt receives. Numbers only, plus the
 * sample sizes, so the model cannot round a correlation into a fact.
 */
export function analysisForPrompt(a: LifeAnalysis): string {
  const lines: string[] = [];
  lines.push(`Data: ${a.sufficiency.daysTracked} days tracked. ${a.sufficiency.message}`);

  if (a.correlations.correlations.length) {
    lines.push('Correlations (state as tendencies only, always with n):');
    for (const c of a.correlations.correlations.slice(0, 6)) {
      lines.push(`  ${c.xLabel} vs ${c.yLabel}: r=${c.r}, n=${c.n} days, ${c.strength}`);
    }
  }
  if (a.correlations.withheld.length) {
    lines.push('Withheld for too little data (do not speculate about these):');
    for (const w of a.correlations.withheld.slice(0, 6)) {
      lines.push(`  ${w.xLabel} vs ${w.yLabel}: only ${w.n} days`);
    }
  }
  lines.push(`Best time: ${a.bestTime.note}`);

  const moved = a.deltas.filter((d) => d.direction !== 'unknown' && !d.withinNoise);
  if (moved.length) {
    lines.push('Changes against the previous period:');
    for (const d of moved) {
      lines.push(`  ${d.label}: ${d.previous} -> ${d.current} (${d.changePct}%)`);
    }
  }
  if (a.improvements.length) {
    lines.push('Areas flagged by the rules engine:');
    for (const i of a.improvements) lines.push(`  [${i.severity}] ${i.title} — ${i.detail}`);
  }
  if (a.strengths.length) {
    lines.push('Supported strengths (do not invent others):');
    for (const st of a.strengths) lines.push(`  ${st.title} — ${st.evidence}`);
  }
  lines.push(`Habit consistency: ${a.consistency.note}`);
  lines.push(
    'Rules: describe these as tendencies only, and name the figures you used. If a domain is withheld for too little data, say so rather than speculating about it.',
  );
  return lines.join('\n');
}
