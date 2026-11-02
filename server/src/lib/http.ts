import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodType } from 'zod';

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
