import { createApp } from './app.js';
import { config, AI_MODE } from './config.js';
import { prisma } from './lib/prisma.js';

const app = createApp();

const server = app.listen(config.PORT, () => {
  const ai =
    AI_MODE === 'unconfigured'
      ? 'NOT CONFIGURED (set AI_PROVIDER + API key in server/.env)'
      : `${AI_MODE} · ${config.aiModel}`;
  // eslint-disable-next-line no-console
  console.log(`
  AI-LifeHub API
  ─────────────────────────────────────────
  env      ${config.NODE_ENV}
  url      http://localhost:${config.PORT}
  web      ${config.APP_URL}
  ai       ${ai}
  `);
});

async function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`\n[server] ${signal} received, shutting down…`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[server] unhandled rejection', reason);
});
