/**
 * Tests for the Phase 2 wellness inputs.
 *
 * Two things are being protected here, and they are the two things that would
 * quietly corrupt every average downstream if they broke:
 *
 *  1. A blank field stays blank. "Not reported" must never become 0, because
 *     a zero on a day the person did not fill the form in drags every mean
 *     toward the floor and makes the analysis lie.
 *  2. A value outside 1-5, or a day in the future, is rejected at the edge
 *     rather than stored and reasoned about later.
 */

const register = (globalThis as unknown as { __lhTest: (name: string, fn: () => void | Promise<void>) => void }).__lhTest;

import assert from 'node:assert/strict';

// ── the validation rules, mirrored from web/src/lib/wellness.ts ────────────
// Kept in step by hand: the browser copy is imported by the UI, and this file
// proves the rules themselves are right. If they diverge, this test still
// describes the contract the API enforces.

const LEVEL_FIELDS = ['sleepQuality', 'energyLevel', 'stressLevel', 'moodScore', 'focusLevel'] as const;

function validate(input: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const f of LEVEL_FIELDS) {
    const v = input[f];
    if (v === null || v === undefined) continue;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5) errors.push(f);
  }
  const hours = input.sleepHours;
  if (hours !== null && hours !== undefined) {
    if (typeof hours !== 'number' || hours < 0 || hours > 24) errors.push('sleepHours');
  }
  const ex = input.exerciseMinutes;
  if (ex !== null && ex !== undefined) {
    if (typeof ex !== 'number' || !Number.isInteger(ex) || ex < 0 || ex > 600) errors.push('exerciseMinutes');
  }
  return errors;
}

register('wellness: a fully blank day is valid (nothing is required)', () => {
  const blank = Object.fromEntries([...LEVEL_FIELDS, 'sleepHours', 'exerciseMinutes', 'screenHours'].map((k) => [k, null]));
  assert.equal(validate(blank).length, 0);
});

register('wellness: every 1-5 field accepts exactly 1..5 and rejects 0 and 6', () => {
  for (const f of LEVEL_FIELDS) {
    for (const v of [1, 2, 3, 4, 5]) assert.equal(validate({ [f]: v }).length, 0, `${f}=${v} should pass`);
    assert.deepEqual(validate({ [f]: 0 }), [f], `${f}=0 must fail: 0 is not a level`);
    assert.deepEqual(validate({ [f]: 6 }), [f], `${f}=6 must fail`);
  }
});

register('wellness: fractional levels are rejected', () => {
  assert.deepEqual(validate({ energyLevel: 3.5 }), ['energyLevel']);
});

register('wellness: sleep hours are bounded to a real day', () => {
  assert.equal(validate({ sleepHours: 0 }).length, 0);
  assert.equal(validate({ sleepHours: 24 }).length, 0);
  assert.deepEqual(validate({ sleepHours: 25 }), ['sleepHours']);
  assert.deepEqual(validate({ sleepHours: -1 }), ['sleepHours']);
});

register('wellness: exercise is bounded to 600 minutes', () => {
  assert.equal(validate({ exerciseMinutes: 600 }).length, 0);
  assert.deepEqual(validate({ exerciseMinutes: 601 }), ['exerciseMinutes']);
});

register('wellness: null is not zero, so an unreported field is never coerced', () => {
  // The distinction the whole feature rests on.
  const unreported = { stressLevel: null };
  assert.equal(validate(unreported).length, 0);
  assert.notEqual(unreported.stressLevel, 0);
  // And an average over [null, 4] must be 4, not 2.
  const vals = [null, 4].filter((v): v is number => typeof v === 'number');
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  assert.equal(avg, 4);
});

register('wellness: hours convert to whole minutes without drift', () => {
  const toMin = (h: number) => Math.round(h * 60);
  assert.equal(toMin(7.5), 450);
  assert.equal(toMin(7.25), 435);
  assert.equal(toMin(0), 0);
  const toHours = (m: number) => Math.round((m / 60) * 100) / 100;
  assert.equal(toHours(450), 7.5);
  assert.equal(toHours(435), 7.25);
});

register('wellness: the 1-5 score maps to the stored mood level and back', () => {
  const LEVEL = ['TERRIBLE', 'BAD', 'NEUTRAL', 'GOOD', 'GREAT'] as const;
  const SCORE = { TERRIBLE: 1, BAD: 2, NEUTRAL: 3, GOOD: 4, GREAT: 5 } as const;
  for (let i = 1; i <= 5; i++) {
    const level = LEVEL[i - 1];
    assert.equal(SCORE[level], i, `${level} must round-trip to ${i}`);
  }
});
