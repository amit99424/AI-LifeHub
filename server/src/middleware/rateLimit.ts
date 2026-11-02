import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

const skipInTest = () => config.NODE_ENV === 'test';

/** Global API limiter. */
export const apiLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  limit: config.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: { code: 'rate_limited', message: 'Too many requests, slow down a little.' } },
});

/** Stricter limiter for login / register / password reset. */
export const authLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: config.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: { code: 'rate_limited', message: 'Too many attempts. Try again in a few minutes.' } },
});

/** AI endpoints are expensive — limit per user per minute. */
export const aiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 12,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anon',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: { code: 'rate_limited', message: 'The assistant needs a short break. Try again in a minute.' } },
});
