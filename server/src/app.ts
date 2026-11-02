import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './lib/http.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { tasksRouter } from './routes/tasks.js';
import { habitsRouter } from './routes/habits.js';
import { moodsRouter } from './routes/moods.js';
import { journalRouter } from './routes/journal.js';
import { sessionsRouter } from './routes/sessions.js';
import { activityRouter } from './routes/activity.js';
import { aiRouter } from './routes/ai.js';
import { analyticsRouter } from './routes/analytics.js';
import { prisma } from './lib/prisma.js';
import { aiStatus } from './services/llm.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // CSP is only needed when this service also serves the SPA (single-container
      // mode). On Render it is a JSON API behind Vercel, where Helmet's default CSP
      // would only add noise; the API response is not rendered as a document.
      contentSecurityPolicy: config.isProd && !process.env.DISABLE_CSP ? undefined : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // Allow the SPA on another origin to read responses.
      crossOriginEmbedderPolicy: false,
    }),
  );
  // ── CORS ──────────────────────────────────────────────────
  // Production origins come from CORS_ORIGINS (comma separated). Any Vercel
  // deployment of this project is additionally allowed via VERCEL_PROJECT_URL /
  // VERCEL_PREVIEW_PATTERN so preview builds work without hardcoding a URL.
  const allowed = new Set(config.CORS_ORIGINS.map((o) => o.replace(/\/$/, '')));
  if (config.VERCEL_PROJECT_URL) allowed.add(config.VERCEL_PROJECT_URL.replace(/\/$/, ''));
  const previewPattern = config.VERCEL_PREVIEW_PATTERN || '^https://[a-z0-9-]+\\.vercel\\.app$';

  function isAllowedOrigin(origin: string): boolean {
    const clean = origin.replace(/\/$/, '');
    if (allowed.has(clean)) return true;
    try {
      if (new RegExp(previewPattern, 'i').test(clean)) return true;
    } catch {
      /* invalid pattern - ignore */
    }
    if (!config.isProd && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(clean)) return true;
    return false;
  }

  app.use(
    cors({
      origin(origin, cb) {
        // No Origin header: same-origin request, curl, server-to-server, health checks.
        if (!origin) return cb(null, true);
        if (isAllowedOrigin(origin)) return cb(null, true);
        // Reject without throwing: a CORS failure must not become a 500.
        return cb(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['Content-Disposition'],
      maxAge: 86_400,
    }),
  );

  // Preflight is handled by the CORS middleware above. A bare `cors()` fallback
  // would answer disallowed origins with `Access-Control-Allow-Origin: *`, so we
  // answer preflight ourselves and only ever echo an allowed origin.
  app.options('*', (req, res) => {
    const origin = req.headers.origin;
    if (origin && isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.setHeader('Access-Control-Max-Age', '86400');
      res.setHeader('Vary', 'Origin');
    }
    res.status(204).end();
  });
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());

  // Basic input hardening: strip null bytes and reject prototype-pollution keys.
  app.use((req, _res, next) => {
    if (req.body && typeof req.body === 'object') {
      const seen = new Set<unknown>();
      const walk = (obj: Record<string, unknown>) => {
        if (seen.has(obj)) return;
        seen.add(obj);
        for (const key of Object.keys(obj)) {
          if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            delete obj[key];
            continue;
          }
          const v = obj[key];
          if (typeof v === 'string') obj[key] = v.replace(/\u0000/g, '');
          else if (v && typeof v === 'object') walk(v as Record<string, unknown>);
        }
      };
      walk(req.body as Record<string, unknown>);
    }
    next();
  });

  // Liveness — cheap, no dependencies. Used by the platform to know the process
  // is up (Render health check path).
  app.get('/api/health/live', (_req, res) => {
    res.status(200).json({ ok: true, status: 'live', uptime: Math.round(process.uptime()), time: new Date().toISOString() });
  });

  // Readiness — verifies the database. Returns 503 when the DB is unreachable so
  // a rolling deploy never routes traffic to an instance that cannot serve it.
  app.get('/api/health', async (_req, res) => {
    const started = Date.now();
    let db: 'up' | 'down' = 'down';
    let dbError: string | undefined;
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch (err) {
      dbError = (err as Error).message?.slice(0, 200);
    }
    const ai = aiStatus();
    const ready = db === 'up';
    res.status(ready ? 200 : 503).json({
      ok: ready,
      status: ready ? 'ready' : 'degraded',
      service: 'ai-lifehub-api',
      version: process.env.APP_VERSION ?? '1.0.0',
      env: config.NODE_ENV,
      time: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      latencyMs: Date.now() - started,
      db,
      ...(dbError ? { dbError } : {}),
      ai: { configured: ai.configured, provider: ai.provider, model: ai.model },
    });
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/habits', habitsRouter);
  app.use('/api/moods', moodsRouter);
  app.use('/api/journal', journalRouter);
  app.use('/api/sessions', sessionsRouter);
  app.use('/api/activity', activityRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/analytics', analyticsRouter);

  // Serve the built SPA when it is bundled with the API (single-container
  // deployment). On Render this path is skipped: Vercel serves the frontend and
  // the API is a pure JSON service.
  const webDist = path.resolve(import.meta.dirname, '../../web/dist');
  if (config.isProd && fs.existsSync(webDist)) {
    app.use(
      express.static(webDist, {
        maxAge: '1h',
        index: false,
        setHeaders(res, filePath) {
          // Hashed assets are immutable; the HTML shell must never be cached.
          if (/[\\/]assets[\\/]/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
