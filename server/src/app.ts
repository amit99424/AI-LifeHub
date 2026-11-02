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
      contentSecurityPolicy: config.isProd ? undefined : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true); // same-origin / curl / SSR
        if (config.CORS_ORIGINS.includes(origin)) return cb(null, true);
        if (!config.isProd && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return cb(null, true);
        return cb(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    }),
  );
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

  app.get('/api/health', async (_req, res) => {
    let db = 'down';
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }
    res.status(db === 'up' ? 200 : 503).json({
      ok: db === 'up',
      service: 'ai-lifehub-api',
      version: '1.0.0',
      time: new Date().toISOString(),
      db,
      ai: aiStatus(),
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

  // Serve the built SPA in production (single-container deployment).
  const webDist = path.resolve(import.meta.dirname, '../../web/dist');
  if (config.isProd && fs.existsSync(webDist)) {
    app.use(express.static(webDist, { maxAge: '1h', index: false }));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
