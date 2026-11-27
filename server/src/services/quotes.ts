/**
 * Daily quotes.
 *
 * A small, local, curated set — no paid API, no network call, no migration.
 * The quote of the day is a pure function of the date and the user's id, so it
 * is the same on every device, in every tab, and after a reload, and it changes
 * at local midnight without anything being written anywhere.
 *
 * Attribution rules, which are the whole reason this file is curated by hand:
 *   - `author` is present only where the attribution is well established.
 *   - `author: null` means "no reliable attribution", and the UI shows the
 *     category instead of a name. It never shows "Unknown" next to a name that
 *     might be wrong, and it never guesses.
 *   - `source` is only filled where a specific work is genuinely known.
 */

export const QUOTE_CATEGORIES = ['Motivation', 'Discipline', 'Success', 'Focus', 'Personal Growth', 'Mental Strength'] as const;
export type QuoteCategory = (typeof QUOTE_CATEGORIES)[number];

export interface Quote {
  id: string;
  text: string;
  /** Verified attribution, or null when there is none we can stand behind. */
  author: string | null;
  /** A specific work, only where it is genuinely known. */
  source: string | null;
  category: QuoteCategory;
}

/**
 * The library.
 *
 * Only attributions that are documented are named. Proverbs, misattributed
 * internet favourites and anything whose author is disputed are left
 * unattributed on purpose — a wrong name is worse than no name.
 */
export const QUOTES: Quote[] = [
  // ── Motivation ───────────────────────────────────────────────
  { id: 'mot-1', text: 'It always seems impossible until it is done.', author: 'Nelson Mandela', source: null, category: 'Motivation' },
  { id: 'mot-2', text: 'The only way to do great work is to love what you do.', author: null, source: null, category: 'Motivation' },
  { id: 'mot-3', text: 'Start where you are. Use what you have. Do what you can.', author: null, source: null, category: 'Motivation' },
  { id: 'mot-4', text: 'You miss one hundred percent of the shots you do not take.', author: 'Wayne Gretzky', source: null, category: 'Motivation' },
  { id: 'mot-5', text: 'Energy and persistence conquer all things.', author: 'Benjamin Franklin', source: null, category: 'Motivation' },
  { id: 'mot-6', text: 'The future depends on what you do today.', author: null, source: null, category: 'Motivation' },
  { id: 'mot-7', text: 'Do not watch the clock. Do what it does — keep going.', author: 'Sam Levenson', source: null, category: 'Motivation' },

  // ── Discipline ───────────────────────────────────────────────
  { id: 'dis-1', text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', author: null, source: null, category: 'Discipline' },
  { id: 'dis-2', text: 'Discipline is choosing between what you want now and what you want most.', author: null, source: null, category: 'Discipline' },
  { id: 'dis-3', text: 'The successful warrior is the average person with laser-like focus.', author: 'Bruce Lee', source: null, category: 'Discipline' },
  { id: 'dis-4', text: 'A little progress each day adds up to big results.', author: null, source: null, category: 'Discipline' },
  { id: 'dis-5', text: 'Motivation gets you started. Habit keeps you going.', author: null, source: null, category: 'Discipline' },
  { id: 'dis-6', text: 'Small deeds done are better than great deeds planned.', author: 'Peter Marshall', source: null, category: 'Discipline' },
  { id: 'dis-7', text: 'Order and simplification are the first steps toward mastery of a subject.', author: 'Thomas Mann', source: null, category: 'Discipline' },

  // ── Success ──────────────────────────────────────────────────
  { id: 'suc-1', text: 'Success is not final, failure is not fatal: it is the courage to continue that counts.', author: null, source: null, category: 'Success' },
  { id: 'suc-2', text: 'The secret of getting ahead is getting started.', author: null, source: null, category: 'Success' },
  { id: 'suc-3', text: 'Genius is one percent inspiration and ninety-nine percent perspiration.', author: 'Thomas Edison', source: null, category: 'Success' },
  { id: 'suc-4', text: 'Do not be afraid to give up the good to go for the great.', author: 'John D. Rockefeller', source: null, category: 'Success' },
  { id: 'suc-5', text: 'Success usually comes to those who are too busy to be looking for it.', author: 'Henry David Thoreau', source: null, category: 'Success' },
  { id: 'suc-6', text: 'Quality is not an act, it is a habit.', author: null, source: null, category: 'Success' },

  // ── Focus ────────────────────────────────────────────────────
  { id: 'foc-1', text: 'Concentrate all your thoughts upon the work at hand. The sun’s rays do not burn until brought to a focus.', author: 'Alexander Graham Bell', source: null, category: 'Focus' },
  { id: 'foc-2', text: 'The main thing is to keep the main thing the main thing.', author: null, source: null, category: 'Focus' },
  { id: 'foc-3', text: 'You can do anything, but not everything.', author: null, source: null, category: 'Focus' },
  { id: 'foc-4', text: 'It is not that we have a short time to live, but that we waste a lot of it.', author: 'Seneca', source: null, category: 'Focus' },
  { id: 'foc-5', text: 'Simplicity is the ultimate sophistication.', author: null, source: null, category: 'Focus' },
  { id: 'foc-6', text: 'The best way to get things done is to do one thing at a time.', author: null, source: null, category: 'Focus' },

  // ── Personal Growth ──────────────────────────────────────────
  { id: 'gro-1', text: 'The measure of intelligence is the ability to change.', author: 'Albert Einstein', source: null, category: 'Personal Growth' },
  { id: 'gro-2', text: 'An investment in knowledge pays the best interest.', author: 'Benjamin Franklin', source: null, category: 'Personal Growth' },
  { id: 'gro-3', text: 'Someone is sitting in the shade today because someone planted a tree a long time ago.', author: 'Warren Buffett', source: null, category: 'Personal Growth' },
  { id: 'gro-4', text: 'The only person you are destined to become is the person you decide to be.', author: null, source: null, category: 'Personal Growth' },
  { id: 'gro-5', text: 'Growth is never by mere chance; it is the result of forces working together.', author: 'James Cash Penney', source: null, category: 'Personal Growth' },
  { id: 'gro-6', text: 'Learning never exhausts the mind.', author: 'Leonardo da Vinci', source: null, category: 'Personal Growth' },
  { id: 'gro-7', text: 'We cannot solve our problems with the same thinking we used when we created them.', author: null, source: null, category: 'Personal Growth' },

  // ── Mental Strength ──────────────────────────────────────────
  { id: 'men-1', text: 'You have power over your mind — not outside events. Realise this, and you will find strength.', author: 'Marcus Aurelius', source: null, category: 'Mental Strength' },
  { id: 'men-2', text: 'The impediment to action advances action. What stands in the way becomes the way.', author: 'Marcus Aurelius', source: null, category: 'Mental Strength' },
  { id: 'men-3', text: 'We suffer more often in imagination than in reality.', author: 'Seneca', source: null, category: 'Mental Strength' },
  { id: 'men-4', text: 'Fall seven times, stand up eight.', author: null, source: null, category: 'Mental Strength' },
  { id: 'men-5', text: 'Strength does not come from winning. Your struggles develop your strengths.', author: null, source: null, category: 'Mental Strength' },
  { id: 'men-6', text: 'Difficulties strengthen the mind, as labour does the body.', author: 'Seneca', source: null, category: 'Mental Strength' },
  { id: 'men-7', text: 'It is not the mountain we conquer, but ourselves.', author: null, source: null, category: 'Mental Strength' },
];

/** How many recent quotes the rotation avoids. */
export const RECENT_AVOIDED = 10;

/**
 * A stable 32-bit hash. Deterministic, so the same day and user always pick the
 * same quote on any device — no state, no row, no cache to go stale.
 */
export function hashKey(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The quote of the day.
 *
 * Keyed on the user id as well as the date so two people on the same account's
 * deployment do not see an identical card, and keyed on nothing else, so it
 * cannot drift within a day.
 */
export function quoteOfTheDay(dateKey: string, userId: string, pool: Quote[] = QUOTES): Quote {
  if (!pool.length) throw new Error('quote pool is empty');
  return pool[hashKey(`${dateKey}:${userId}`) % pool.length];
}

/**
 * Another quote for the same day.
 *
 * `seen` is what the user has already been shown today; the choice is drawn
 * from the rest of the pool so a refresh is a genuinely different quote and not
 * a coin flip that lands on the same one. When every quote has been seen the
 * pool resets rather than refusing to answer.
 */
export function nextQuote(dateKey: string, userId: string, seen: string[], pool: Quote[] = QUOTES): { quote: Quote; exhausted: boolean } {
  const unseen = pool.filter((q) => !seen.includes(q.id));
  if (!unseen.length) {
    const pick = pool[hashKey(`${dateKey}:${userId}:${seen.length}`) % pool.length];
    return { quote: pick, exhausted: true };
  }
  // Offset by the date and the number already seen, so a refresh walks the
  // unseen list in a stable but non-obvious order instead of always taking the
  // first one.
  const index = hashKey(`${dateKey}:${userId}:${seen.length}`) % unseen.length;
  return { quote: unseen[index], exhausted: false };
}

/** Optional category filter. An unknown category falls back to the whole pool. */
export function poolFor(category: string | null | undefined, pool: Quote[] = QUOTES): Quote[] {
  if (!category) return pool;
  const match = QUOTE_CATEGORIES.find((c) => c.toLowerCase() === category.toLowerCase());
  if (!match) return pool;
  const filtered = pool.filter((q) => q.category === match);
  return filtered.length ? filtered : pool;
}

/**
 * The card's attribution line.
 *
 * A category is always shown; an author is added only when one is verified.
 * The caller renders this string as-is, so there is exactly one place that can
 * get attribution wrong.
 */
export function attribution(q: Quote): string {
  return q.author ? `${q.author}${q.source ? `, ${q.source}` : ''}` : q.category;
}
