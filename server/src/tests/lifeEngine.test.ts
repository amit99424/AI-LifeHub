/**
 * Unit tests for the life engine.
 *
 * These are the tests that matter most in this codebase, because the engine's
 * whole purpose is to stop us making claims the data cannot support. Each test
 * below pins one of those promises:
 *   - a correlation below the sample floor is withheld, never printed
 *   - no sentence ever says "causes"
 *   - an empty account gets an explanation, not a chart
 *   - a single good hour does not become "your best hour"
 */
const register = (globalThis as unknown as { __lhTest: (name: string, fn: () => void | Promise<void>) => void }).__lhTest;

import assert from 'node:assert/strict';
import {
  MIN_SAMPLE,
  analyseLife,
  analysisForPrompt,
  bestTime,
  comparePeriods,
  computeCorrelations,
  improvementAreas,
  sufficiency,
  summarisePeriod,
  type LifeDay,
} from '../services/lifeEngine.js';

function day(i: number, over: Partial<LifeDay> = {}): LifeDay {
  const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
  return {
    date: d,
    score: null,
    sleepHours: null,
    screenHours: null,
    exerciseMinutes: null,
    studyMinutes: null,
    mood: null,
    stress: null,
    focus: null,
    habitRate: null,
    tasksCompleted: null,
    tasksOverdue: null,
    ...over,
  };
}

/** Days where y rises with x — r should come out strongly positive. */
function correlatedDays(n: number, fn: (i: number) => number): LifeDay[] {
  return Array.from({ length: n }, (_, i) => {
    const x = 4 + (i % 10) * 0.5;
    return day(i, { sleepHours: x, score: fn(x) });
  });
}

register('lifeEngine: a correlation below MIN_SAMPLE is withheld, not reported', () => {
  const days = correlatedDays(MIN_SAMPLE - 1, (x) => x * 10);
  const res = computeCorrelations(days);
  assert.equal(res.correlations.find((c) => c.key === 'sleepVsScore'), undefined);
  const w = res.withheld.find((c) => c.key === 'sleepVsScore');
  assert.ok(w, 'the pair must appear in withheld');
  assert.equal(w!.n, MIN_SAMPLE - 1);
  assert.match(w!.reason, new RegExp(`needs ${MIN_SAMPLE} days`));
});

register('lifeEngine: at MIN_SAMPLE the correlation is reported with its n', () => {
  const days = correlatedDays(MIN_SAMPLE, (x) => x * 10);
  const res = computeCorrelations(days);
  const c = res.correlations.find((x) => x.key === 'sleepVsScore');
  assert.ok(c, 'expected a reported correlation');
  assert.equal(c!.n, MIN_SAMPLE);
  assert.ok(c!.r > 0.9, `expected a strong positive r, got ${c!.r}`);
  assert.equal(c!.strength, 'strong');
});

register('lifeEngine: no generated sentence ever claims causation', () => {
  const days = correlatedDays(30, (x) => x * 10);
  const res = computeCorrelations(days);
  assert.ok(res.correlations.length > 0);
  for (const c of res.correlations) {
    // Strip the disclaimer first: it contains the word "cause" precisely to
    // deny causation, so matching against the whole sentence is a false hit.
    const claim = c.sentence.split('. This is a correlation')[0];
    assert.doesNotMatch(claim, /caus|proves|because of|leads to|results in/i);
    assert.match(c.sentence, /correlation, not a cause|no clear relationship/);
  }
});

register('lifeEngine: a negative relationship reads as "lower", not "higher"', () => {
  const days = Array.from({ length: 30 }, (_, i) => {
    const screen = 2 + (i % 10) * 0.8;
    return day(i, { screenHours: screen, score: 90 - screen * 8 });
  });
  const res = computeCorrelations(days);
  const c = res.correlations.find((x) => x.key === 'screenVsScore');
  assert.ok(c);
  assert.ok(c!.r < -0.9);
  assert.match(c!.sentence, /tended to be lower/);
});

register('lifeEngine: pairs missing one side are not counted as observations', () => {
  // 20 days of sleep, only 5 of which also have a score.
  const days = Array.from({ length: 20 }, (_, i) => day(i, { sleepHours: 7, score: i < 5 ? 50 : null }));
  const res = computeCorrelations(days);
  const c = res.correlations.find((x) => x.key === 'sleepVsScore');
  assert.equal(c, undefined);
  assert.equal(res.withheld.find((x) => x.key === 'sleepVsScore')!.n, 5);
});

register('lifeEngine: bestTime refuses to crown an hour with too few days', () => {
  const hourly = [
    { hour: 9, completions: 6, focusMinutes: 60 }, // 6 in 1 day
    { hour: 14, completions: 20, focusMinutes: 300 }, // 20 across 12 days
  ];
  const res = bestTime(hourly, [], [{ hour: 9, days: 1 }, { hour: 14, days: 12 }]);
  assert.equal(res.lowConfidence, true);
  assert.match(res.note, /only 1 day/);
  // It still reports which is strongest, but flags it.
  assert.equal(res.hour!.label, '09:00');
});

register('lifeEngine: bestTime is confident once a bucket has MIN_BUCKET_DAYS', () => {
  const hourly = [{ hour: 14, completions: 20, focusMinutes: 300 }];
  const res = bestTime(hourly, [], [{ hour: 14, days: 12 }]);
  assert.equal(res.lowConfidence, false);
  assert.match(res.note, /14:00/);
});

register('lifeEngine: bestTime with no data says so instead of inventing one', () => {
  const res = bestTime([], []);
  assert.equal(res.hour, null);
  assert.equal(res.weekday, null);
  assert.match(res.note, /Not enough/);
});

register('lifeEngine: a change under the noise band is reported as flat', () => {
  const cur = { ...summarisePeriod([]), score: 62 };
  const prev = { ...summarisePeriod([]), score: 61 };
  const d = comparePeriods(cur, prev).find((x) => x.key === 'score')!;
  assert.equal(d.direction, 'flat');
  assert.equal(d.withinNoise, true);
});

register('lifeEngine: a real change reports direction and percent', () => {
  const cur = { ...summarisePeriod([]), score: 80 };
  const prev = { ...summarisePeriod([]), score: 50 };
  const d = comparePeriods(cur, prev).find((x) => x.key === 'score')!;
  assert.equal(d.direction, 'up');
  assert.equal(d.changePct, 60);
  assert.equal(d.withinNoise, false);
});

register('lifeEngine: a metric missing on one side reports unknown, not zero', () => {
  const cur = { ...summarisePeriod([]), score: 80 };
  const prev = { ...summarisePeriod([]), score: null };
  const d = comparePeriods(cur, prev).find((x) => x.key === 'score')!;
  assert.equal(d.direction, 'unknown');
  assert.equal(d.change, null);
});

register('lifeEngine: screen time going up is not good news', () => {
  const cur = { ...summarisePeriod([]), screenHours: 8 };
  const prev = { ...summarisePeriod([]), screenHours: 4 };
  const d = comparePeriods(cur, prev).find((x) => x.key === 'screenHours')!;
  assert.equal(d.direction, 'up');
  assert.equal(d.higherIsBetter, false);
});

register('lifeEngine: an empty account gets an explanation, not a fabricated trend', () => {
  const s = sufficiency([], { tasks: false, habits: false, sleep: false });
  assert.equal(s.daysTracked, 0);
  assert.equal(s.trendsAvailable, false);
  assert.equal(s.correlationsAvailable, false);
  assert.match(s.message, /No activity has been recorded/);
  assert.deepEqual(s.missing.sort(), ['habits', 'sleep', 'tasks']);
});

register('lifeEngine: three days of data is enough for neither trends nor correlations', () => {
  const days = [0, 1, 2].map((i) => day(i, { score: 50, tasksCompleted: 2 }));
  const s = sufficiency(days, { tasks: true });
  assert.equal(s.trendsAvailable, false);
  assert.match(s.message, /3 of 7 days/);
});

register('lifeEngine: improvements are measured against the user, not a benchmark', () => {
  const days = Array.from({ length: 14 }, (_, i) => day(i, { sleepHours: 5.5, score: 40 }));
  const areas = improvementAreas(days);
  const sleep = areas.find((a) => a.key === 'sleep');
  assert.ok(sleep);
  assert.match(sleep!.detail, /averaged 5.5h/);
  assert.doesNotMatch(sleep!.detail, /average person|than average/);
});

register('lifeEngine: analyseLife wires the pieces and keeps prior period separate', () => {
  const days = Array.from({ length: 28 }, (_, i) =>
    day(i, {
      sleepHours: 7,
      score: i < 14 ? 40 : 70,
      tasksCompleted: 2,
      habitRate: 50,
    }),
  );
  const a = analyseLife({
    days,
    hourly: [{ hour: 10, completions: 10, focusMinutes: 120 }],
    weekday: [{ day: 'Monday', completions: 10, focusMinutes: 120 }],
    domainsPresent: { tasks: true, sleep: true },
  });
  assert.equal(a.current.score, 70);
  assert.equal(a.previous.score, 40);
  assert.equal(a.deltas.find((d) => d.key === 'score')!.direction, 'up');
});

register('lifeEngine: the prompt block carries sample sizes and hides withheld pairs', () => {
  const days = correlatedDays(MIN_SAMPLE, (x) => x * 10);
  const a = analyseLife({
    days,
    hourly: [],
    weekday: [],
    domainsPresent: { sleep: true },
  });
  const text = analysisForPrompt(a);
  assert.match(text, /n=14/);
  assert.match(text, /do not speculate/i);
  assert.doesNotMatch(text, /causes/);
});
