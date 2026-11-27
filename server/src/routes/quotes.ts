import { Router } from 'express';
import { z } from 'zod';
import { ah, validate } from '../lib/http.js';
import { requireAuth, userTz } from '../middleware/auth.js';
import { todayKey } from '../lib/dates.js';
import { QUOTES, QUOTE_CATEGORIES, attribution, nextQuote, poolFor, quoteOfTheDay } from '../services/quotes.js';

export const quotesRouter = Router();
quotesRouter.use(requireAuth);

function dto(q: (typeof QUOTES)[number], date: string) {
  return {
    id: q.id,
    text: q.text,
    // The attribution string is built server-side so the rule "no author unless
    // verified" has exactly one implementation.
    attribution: attribution(q),
    author: q.author,
    source: q.source,
    category: q.category,
    date,
  };
}

// GET /api/quotes/daily — the same quote all day, in every tab and on every device
quotesRouter.get(
  '/daily',
  validate({ query: z.object({ category: z.string().max(40).optional() }) }),
  ah(async (req, res) => {
    const { category } = req.query as { category?: string };
    const date = todayKey(userTz(req));
    const pool = poolFor(category);
    const quote = quoteOfTheDay(date, req.user!.id, pool);
    res.json({ quote: dto(quote, date), categories: QUOTE_CATEGORIES });
  }),
);

// GET /api/quotes/next?seen=a,b,c — a different quote for the same day
quotesRouter.get(
  '/next',
  validate({ query: z.object({ seen: z.string().max(600).optional(), category: z.string().max(40).optional() }) }),
  ah(async (req, res) => {
    const { seen, category } = req.query as { seen?: string; category?: string };
    const date = todayKey(userTz(req));
    const pool = poolFor(category);
    const seenIds = (seen ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const { quote, exhausted } = nextQuote(date, req.user!.id, seenIds, pool);
    res.json({ quote: dto(quote, date), exhausted, categories: QUOTE_CATEGORIES });
  }),
);
