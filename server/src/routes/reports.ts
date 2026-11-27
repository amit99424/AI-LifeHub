import { Router } from 'express';
import { z } from 'zod';
import { ah, validate } from '../lib/http.js';
import { requireAuth, userTz } from '../middleware/auth.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { buildReport, reportToCsv, type ReportPeriod } from '../services/reports.js';
import { generateMonthlyReview } from '../services/monthlyReview.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

const periodEnum = z.enum(['day', 'week', 'month']);

// GET /api/reports/:period — the figures. No model call, so it always answers.
reportsRouter.get(
  '/:period',
  validate({ params: z.object({ period: periodEnum }) }),
  ah(async (req, res) => {
    const { period } = req.params as { period: ReportPeriod };
    res.json({ report: await buildReport(req.user!.id, userTz(req), period) });
  }),
);

// GET /api/reports/:period/csv — the same figures as a file.
// A download, not JSON: the browser saves it, and only this user's rows are in it.
reportsRouter.get(
  '/:period/csv',
  validate({ params: z.object({ period: periodEnum }) }),
  ah(async (req, res) => {
    const { period } = req.params as { period: ReportPeriod };
    const report = await buildReport(req.user!.id, userTz(req), period);
    const csv = reportToCsv(report);
    const name = `ai-lifehub-${period}-${report.range.from}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    // CSV is opened by spreadsheets, which will happily execute a leading "=".
    // A BOM keeps Excel's UTF-8 reading correct; the escaping in reportToCsv
    // keeps commas and quotes intact.
    res.send(`\uFEFF${csv}`);
  }),
);

// POST /api/reports/monthly-review — the written monthly review (AI, or the
// same figures summarised and labelled when no model is available).
reportsRouter.post(
  '/monthly-review',
  aiLimiter,
  ah(async (req, res) => {
    const report = await buildReport(req.user!.id, userTz(req), 'month');
    const review = await generateMonthlyReview(report);
    res.json({ review, range: report.range });
  }),
);
