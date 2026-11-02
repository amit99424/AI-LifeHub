import { createApp } from './app.js';
import { config, AI_MODE } from './config.js';
import { prisma } from './lib/prisma.js';

const app = createApp();

// Bind to 0.0.0.0 so the process is reachable from outside the container / PaaS
// router (Render, Docker, Fly, ECS). Binding to localhost would make the service
// unreachable behind a reverse proxy.
const HOST = config.HOST || '0.0.0.0';

const server = app.listen(config.PORT, HOST, () => {
  const ai =
    AI_MODE === 'unconfigured'
      ? 'NOT CONFIGURED (set AI_PROVIDER + API key in server/.env)'
      : `${AI_MODE} · ${config.aiModel}`;
  const dbHost = config.DATABASE_URL.replace(/\/\/[^@]*@/, '//***@');
  // eslint-disable-next-line no-console
  console.log(`
  AI-LifeHub API
  ─────────────────────────────────────────
  env      ${config.NODE_ENV}
  bind     ${HOST}:${config.PORT}
  web      ${config.APP_URL}
  cors     ${config.CORS_ORIGINS.join(', ')}
  ai       ${ai}
  db       ${dbHost}
  `);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  // eslint-disable-next-line no-console
  console.error(`[server] failed to bind ${HOST}:${config.PORT} - ${err.message}`);
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 10);
});

/**
 * Graceful shutdown. Render sends SIGTERM before replacing an instance; we stop
 * accepting connections, let in-flight requests finish, then close the pool.
 */
let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log(`\n[server] ${signal} received, draining connections...`);

  const forceTimer = setTimeout(() => {
    // eslint-disable-next-line no-console
    console.error('[server] graceful shutdown timed out, exiting');
    process.exit(1);
  }, 15_000);
  forceTimer.unref();

  server.close(() => {
    prisma
      .$disconnect()
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(forceTimer);
        process.exit(0);
      });
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[server] unhandled rejection', reason);
});
