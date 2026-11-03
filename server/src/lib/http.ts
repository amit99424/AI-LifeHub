import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodType } from 'zod';
import { AIProviderError, AIUnconfiguredError } from '../services/llm.js';

/** Thrown by route handlers; converted into a JSON error by errorHandler. */
export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = 'error', details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(msg = 'Invalid request', details?: unknown) {
    return new ApiError(400, msg, 'bad_request', details);
  }
  static unauthorized(msg = 'Not authenticated') {
    return new ApiError(401, msg, 'unauthorized');
  }
  static forbidden(msg = 'Not allowed') {
    return new ApiError(403, msg, 'forbidden');
  }
  static notFound(msg = 'Not found') {
    return new ApiError(404, msg, 'not_found');
  }
  static conflict(msg = 'Already exists') {
    return new ApiError(409, msg, 'conflict');
  }
  static tooMany(msg = 'Too many requests') {
    return new ApiError(429, msg, 'rate_limited');
  }
  static upstream(msg = 'Upstream service failed') {
    return new ApiError(502, msg, 'upstream_error');
  }
}

/** Wraps an async handler so rejected promises reach the error middleware. */
export function ah<T extends Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req as T, res, next).catch(next);
  };
}

/** Validates and replaces req.body / req.query / req.params with parsed data. */
export function validate<TBody, TQuery = unknown, TParams = unknown>(schema: {
  body?: ZodType<TBody>;
  query?: ZodType<TQuery>;
  params?: ZodType<TParams>;
}) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schema.params) req.params = schema.params.parse(req.params) as Request['params'];
      if (schema.query) {
        Object.defineProperty(req, 'query', {
          value: schema.query.parse(req.query),
          writable: true,
          configurable: true,
        });
      }
      if (schema.body) req.body = schema.body.parse(req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'Validation failed',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }
  // AI provider failures must reach the user as a real message, never a generic 500.
  if (err instanceof AIUnconfiguredError) {
    return res.status(503).json({
      error: {
        code: 'ai_unconfigured',
        message: err.message,
        details: { hint: 'Set AI_PROVIDER and the matching API key on the server.' },
      },
    });
  }
  if (err instanceof AIProviderError) {
    const upstream = err.status ?? 502;
    // Map provider status codes to something actionable for the client.
    const mapped =
      upstream === 400 || upstream === 401 || upstream === 403
        ? 502 // bad key / bad request upstream - our fault, not the user's
        : upstream === 404
          ? 502 // model not available to this key
          : upstream === 429
            ? 429 // provider quota / rate limit
            : 504; // everything else (timeouts, 5xx, network)
    const code =
      upstream === 404
        ? 'ai_model_unavailable'
        : upstream === 429
          ? 'ai_quota_exceeded'
          : upstream === 401 || upstream === 403
            ? 'ai_auth_failed'
            : 'ai_provider_error';
    // eslint-disable-next-line no-console
    console.error(`[ai] provider failure ${upstream} on ${req.method} ${req.originalUrl}: ${err.message}`);
    return res.status(mapped).json({
      error: {
        code,
        message:
          upstream === 404
            ? `The configured AI model is not available to this API key. ${err.message}`
            : upstream === 429
              ? 'The AI provider quota or rate limit was hit. Try again shortly.'
              : err.message,
        details: { providerStatus: upstream },
      },
    });
  }

  // Prisma known errors
  const anyErr = err as { code?: string; meta?: { target?: string[] } };
  if (anyErr?.code === 'P2002') {
    return res.status(409).json({
      error: {
        code: 'conflict',
        message: `A record with this ${anyErr.meta?.target?.join(', ') ?? 'value'} already exists`,
      },
    });
  }
  if (anyErr?.code === 'P2025') {
    return res.status(404).json({ error: { code: 'not_found', message: 'Record not found' } });
  }

  // eslint-disable-next-line no-console
  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  return res.status(500).json({
    error: { code: 'internal_error', message: 'Something went wrong on our side' },
  });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'not_found', message: 'Endpoint not found' } });
}
