import { PrismaClient } from '@prisma/client';
import { config } from '../config.js';

/**
 * Single Prisma client for the process.
 *
 * Connection handling for managed Postgres (Neon):
 * - `DATABASE_URL` should be the *pooled* string (`-pooler` host, PgBouncer in
 *   transaction mode). Prisma then uses one connection per query and the pooler
 *   multiplexes them.
 * - `DIRECT_URL` is only used by Prisma Migrate (`migrate deploy`), which needs
 *   DDL and therefore a direct connection.
 * - Prisma's own pool is capped so a small instance cannot exhaust Neon's
 *   connection limit. Override with `PRISMA_CONNECTION_LIMIT`.
 */
const connectionLimit = Number(process.env.PRISMA_CONNECTION_LIMIT || (config.isProd ? 5 : 10));

function datasourceUrl(): string | undefined {
  const url = config.DATABASE_URL;
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has('connection_limit')) parsed.searchParams.set('connection_limit', String(connectionLimit));
    if (!parsed.searchParams.has('pool_timeout')) parsed.searchParams.set('pool_timeout', '20');
    if (!parsed.searchParams.has('connect_timeout')) parsed.searchParams.set('connect_timeout', '15');
    return parsed.toString();
  } catch {
    // Not a parseable URL (e.g. a socket path) - pass it through untouched.
    return url;
  }
}

export const prisma = new PrismaClient({
  log: config.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  datasources: { db: { url: datasourceUrl() } },
});

export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
