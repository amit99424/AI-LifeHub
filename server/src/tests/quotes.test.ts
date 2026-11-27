import assert from 'node:assert/strict';
import { QUOTES, QUOTE_CATEGORIES, attribution, nextQuote, poolFor, quoteOfTheDay, RECENT_AVOIDED } from '../services/quotes.js';

const register = (globalThis as unknown as { __lhTest: (name: string, fn: () => void | Promise<void>) => void }).__lhTest;

const USER = 'user-1';

// ── daily rotation ──────────────────────────────────────────

register('quoteOfTheDay: the same day and user always give the same quote', () => {
  const a = quoteOfTheDay('2026-06-17', USER);
  const b = quoteOfTheDay('2026-06-17', USER);
  assert.equal(a.id, b.id);
});

register('quoteOfTheDay: the quote changes the next day', () => {
  const today = quoteOfTheDay('2026-06-17', USER);
  const tomorrow = quoteOfTheDay('2026-06-18', USER);
  // Two adjacent days can collide by chance, but not across a whole week.
  const week = new Set(['2026-06-17', '2026-06-18', '2026-06-19', '2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23'].map((d) => quoteOfTheDay(d, USER).id));
  assert.ok(week.size >= 4, `expected variety across a week, got ${week.size}`);
  assert.ok(today.id && tomorrow.id);
});

register('quoteOfTheDay: two users are not locked to the same card', () => {
  const ids = new Set(['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'].map((u) => quoteOfTheDay('2026-06-17', u).id));
  assert.ok(ids.size >= 2, 'every user must not see the identical quote');
});

register('quoteOfTheDay: every quote in the pool can be reached', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 400; i += 1) {
    const day = `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;
    seen.add(quoteOfTheDay(day, `user-${i % 37}`).id);
  }
  assert.equal(seen.size, QUOTES.length, `only ${seen.size} of ${QUOTES.length} quotes were ever selected`);
});

// ── refresh ────────────────────────────────────────────────

register('nextQuote: a refresh never returns a quote already seen', () => {
  const first = quoteOfTheDay('2026-06-17', USER);
  const { quote } = nextQuote('2026-06-17', USER, [first.id]);
  assert.notEqual(quote.id, first.id);
});

register('nextQuote: refreshing through the pool returns every quote once', () => {
  const seen: string[] = [];
  for (let i = 0; i < QUOTES.length; i += 1) {
    const { quote, exhausted } = nextQuote('2026-06-17', USER, seen);
    assert.equal(exhausted, false);
    assert.ok(!seen.includes(quote.id), `${quote.id} repeated before the pool ran out`);
    seen.push(quote.id);
  }
  assert.equal(seen.length, QUOTES.length);
  assert.equal(new Set(seen).size, QUOTES.length);
});

register('nextQuote: once every quote is seen it answers again instead of failing', () => {
  const all = QUOTES.map((q) => q.id);
  const { quote, exhausted } = nextQuote('2026-06-17', USER, all);
  assert.equal(exhausted, true);
  assert.ok(QUOTES.some((q) => q.id === quote.id));
});

register('nextQuote: the recent-avoidance window is larger than a refresh burst', () => {
  assert.ok(RECENT_AVOIDED >= 5, 'the window must be big enough to matter');
});

// ── attribution ────────────────────────────────────────────

register('attribution: an unattributed quote shows its category, never a name', () => {
  const anonymous = QUOTES.find((q) => q.author === null)!;
  assert.ok(anonymous, 'the library must contain unattributed quotes');
  assert.equal(attribution(anonymous), anonymous.category);
  assert.ok(!/unknown|anon/i.test(attribution(anonymous)));
});

register('attribution: a named quote shows the author', () => {
  const named = QUOTES.find((q) => q.author !== null)!;
  assert.ok(attribution(named).startsWith(named.author!));
});

register('the library: every quote has text and a real category', () => {
  for (const q of QUOTES) {
    assert.ok(q.text.trim().length > 10, `${q.id} has no text`);
    assert.ok(QUOTE_CATEGORIES.includes(q.category), `${q.id} has category ${q.category}`);
    assert.equal(new Set(QUOTES.map((x) => x.id)).size, QUOTES.length, 'ids must be unique');
  }
});

register('the library: quotes whose author is disputed are left unattributed', () => {
  // These are commonly misattributed on the internet; naming them would be
  // inventing an author, which the feature forbids.
  const disputed = ['mot-2', 'suc-1', 'dis-1', 'gro-7'];
  for (const id of disputed) {
    const q = QUOTES.find((x) => x.id === id)!;
    assert.equal(q.author, null, `${id} must stay unattributed`);
  }
});

// ── fallback ───────────────────────────────────────────────

register('poolFor: an unknown category falls back to the whole pool', () => {
  assert.equal(poolFor('Nonsense').length, QUOTES.length);
  assert.equal(poolFor(null).length, QUOTES.length);
});

register('poolFor: a known category filters, case-insensitively', () => {
  const focus = poolFor('focus');
  assert.ok(focus.length > 0);
  assert.ok(focus.every((q) => q.category === 'Focus'));
});

register('quoteOfTheDay: an empty pool is an error rather than a blank card', () => {
  assert.throws(() => quoteOfTheDay('2026-06-17', USER, []), /empty/);
});
