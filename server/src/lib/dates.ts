/**
 * All date math is done in the *user's* timezone (profile.timezone) and stored
 * as a normalized `@db.Date` value (midnight UTC of that calendar day). That
 * keeps "one habit log per day" and day-bucketed analytics unambiguous.
 */

export function tzOffsetMs(tz: string, at: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = dtf.formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
    return asUTC - at.getTime();
  } catch {
    return 0;
  }
}

/** Local calendar date (YYYY-MM-DD) for `at` in `tz`. */
export function localDateKey(at: Date, tz = 'UTC'): string {
  const shifted = new Date(at.getTime() + tzOffsetMs(tz, at));
  return shifted.toISOString().slice(0, 10);
}

/** Local hour (0-23) for `at` in `tz`. */
export function localHour(at: Date, tz = 'UTC'): number {
  const shifted = new Date(at.getTime() + tzOffsetMs(tz, at));
  return shifted.getUTCHours();
}

/** Midnight-UTC Date for a YYYY-MM-DD key — what we store in @db.Date columns. */
export function dateKeyToDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's date-key in the user's timezone. */
export function todayKey(tz = 'UTC'): string {
  return localDateKey(new Date(), tz);
}

export function addDaysKey(key: string, days: number): string {
  const d = dateKeyToDate(key);
  d.setUTCDate(d.getUTCDate() + days);
  return dateKey(d);
}

export function rangeKeys(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  let cur = fromKey;
  // guard against runaway ranges
  for (let i = 0; i < 800 && cur <= toKey; i++) {
    out.push(cur);
    cur = addDaysKey(cur, 1);
  }
  return out;
}

export function daysBetweenKeys(a: string, b: string): number {
  return Math.round((dateKeyToDate(b).getTime() - dateKeyToDate(a).getTime()) / 86_400_000);
}

export function startOfWeekKey(key: string, weekStartsOn = 1): string {
  const d = dateKeyToDate(key);
  const dow = d.getUTCDay(); // 0=Sun
  const diff = (dow - weekStartsOn + 7) % 7;
  return addDaysKey(key, -diff);
}

export function startOfMonthKey(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

export function endOfMonthKey(key: string): string {
  const d = dateKeyToDate(`${key.slice(0, 7)}-01`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return dateKey(d);
}

export function weekdayName(key: string): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dateKeyToDate(key).getUTCDay()];
}

export function isWeekendKey(key: string): boolean {
  const dow = dateKeyToDate(key).getUTCDay();
  return dow === 0 || dow === 6;
}

export const HOUR_BUCKETS = ['night', 'morning', 'afternoon', 'evening'] as const;
export type HourBucket = (typeof HOUR_BUCKETS)[number];

export function hourBucket(hour: number): HourBucket {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}
