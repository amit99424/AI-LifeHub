import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

// Load secrets from `server/.env` (and `.env.local` which wins if present).
// The unit-test runner sets NODE_ENV=test *after* modules load, so this file is
// re-imported from the test entry point after that flag is set (see
// src/tests/setup.ts) - configuration is therefore always evaluated lazily
// through the `config` getter below.
const root = path.resolve(import.meta.dirname, '..');
for (const file of ['.env', '.env.local']) {
  const p = path.join(root, file);
  if (fs.existsSync(p)) dotenv.config({ path: p, override: file === '.env.local' });
}

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : v === 'true' || v === '1'));

const int = (def: number, min = 0) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : Number(v)))
    .pipe(z.number().int().min(min));

const csv = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? 'http://localhost:5173,http://127.0.0.1:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );


const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: int(4000, 1),
  HOST: z.string().default('0.0.0.0'),
  APP_URL: z.string().default('http://localhost:5173'),
  CORS_ORIGINS: csv,
  // Optional extra origins (e.g. a Vercel preview deployment URL).
  VERCEL_PROJECT_URL: z.string().optional().default(''),
  VERCEL_PREVIEW_PATTERN: z.string().optional().default(''),
  DATABASE_URL: z.string().optional().default('postgresql://postgres:postgres@127.0.0.1:5432/ai_lifehub_test?schema=public'),

  JWT_ACCESS_SECRET: z.string().optional().default(''),
  JWT_REFRESH_SECRET: z.string().optional().default(''),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: int(30, 1),
  COOKIE_SECURE: bool(false),
  COOKIE_DOMAIN: z.string().optional(),
  // SameSite policy for the auth cookies on a cross-site deployment.
  //   auto (default) - None unless the OAuth state cookie proved Lax works here
  //   none           - always None (required for Vercel frontend + Render API)
  //   lax            - always Lax (same-site setups, or a deliberate lockdown)
  AUTH_COOKIE_SAMESITE: z.enum(['auto', 'none', 'lax']).default('auto'),

  // ── Google OAuth 2.0 ──────────────────────────────────────────
  // Client ID is public (it appears in the consent-screen URL). The secret is
  // server-only and must never reach the frontend bundle.
  // Pasted values from a dashboard often carry a trailing newline or spaces;
  // a trailing "\n" inside a client id makes Google answer invalid_client.
  GOOGLE_CLIENT_ID: z.string().trim().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().trim().optional().default(''),
  // Must exactly match an "Authorized redirect URI" in Google Cloud Console.
  // The backend handles the callback and then redirects the browser onward.
  GOOGLE_REDIRECT_URI: z.string().trim().optional().default(''),
  // Where the backend sends the browser after a successful/failed sign-in.
  GOOGLE_SUCCESS_REDIRECT: z.string().trim().optional().default(''),
  GOOGLE_FAILURE_REDIRECT: z.string().trim().optional().default(''),
  GOOGLE_ALLOWED_DOMAINS: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? '')
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean),
    ),
  GOOGLE_AUTO_LINK: bool(true),
  // Which sign-in UI the frontend shows: 'google_only' (default) hides the
  // email/password forms; 'google_and_password' keeps both. Password login stays
  // available through the API either way, so existing accounts never lose access.
  AUTH_UI_MODE: z.enum(['google_only', 'google_and_password']).default('google_only'),

  AI_PROVIDER: z.enum(['gemini', 'openai', 'none']).default('none'),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  AI_MAX_CONTEXT_TOKENS: int(12000, 1000),
  AI_CHAT_DAILY_LIMIT: int(80, 1),
  AI_INSIGHT_DAILY_LIMIT: int(30, 1),
  AI_REQUEST_TIMEOUT_MS: int(90000, 5000),
  // 'thinking' models can take 30-60 s before emitting their first token, so the
  // default has to be generous. Configurable per deployment.
  AI_MODEL_FALLBACKS: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? 'gemini-3.8-flash,gemini-3.5-flash-lite,gemini-flash-latest,gemini-2.5-flash')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  AI_TEMPERATURE: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? 0.4 : Number(v))),

  RATE_LIMIT_WINDOW_MS: int(60000, 1000),
  RATE_LIMIT_MAX: int(240, 1),
  AUTH_RATE_LIMIT_MAX: int(20, 1),

  ALLOW_DEMO_DATA: bool(true),
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  isProd: boolean;
  aiConfigured: boolean;
  aiKey: string;
  aiModel: string;
  googleConfigured: boolean;
  /** Where the browser lands after the callback: defaults to APP_URL. */
  googleSuccessRedirect: string;
  googleFailureRedirect: string;
};

function load(): AppConfig {
  // Tests exercise pure helpers; they never open a database or call a provider.
  const isTest = process.env.NODE_ENV === 'test';
  if (isTest) {
    process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@127.0.0.1:5432/ai_lifehub_test?schema=public';
    process.env.JWT_ACCESS_SECRET ||= 'test_access_secret_0123456789';
    process.env.JWT_REFRESH_SECRET ||= 'test_refresh_secret_0123456789';
  }
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    console.error(`\n[config] Invalid environment configuration:\n${issues}\n`);
    process.exit(1);
  }
  const e = parsed.data;

  if (!isTest) {
    const problems: string[] = [];
    if (!process.env.DATABASE_URL) problems.push('DATABASE_URL is required');
    if ((e.JWT_ACCESS_SECRET ?? '').length < 16) problems.push('JWT_ACCESS_SECRET must be at least 16 chars');
    if ((e.JWT_REFRESH_SECRET ?? '').length < 16) problems.push('JWT_REFRESH_SECRET must be at least 16 chars');
    if (problems.length) {
      const detail = problems.map((p) => `  - ${p}`).join('\n');
      // eslint-disable-next-line no-console
      console.error(`\n[config] Invalid environment configuration:\n${detail}\nCopy server/env.example to server/.env and fill in the values.\n`);
      process.exit(1);
    }
  }
  if (isTest) {
    e.JWT_ACCESS_SECRET ||= 'test_access_secret_0123456789';
    e.JWT_REFRESH_SECRET ||= 'test_refresh_secret_0123456789';
  }

  const aiKey = e.AI_PROVIDER === 'openai' ? e.OPENAI_API_KEY : e.GEMINI_API_KEY;
  const aiModel = e.AI_PROVIDER === 'openai' ? e.OPENAI_MODEL : e.GEMINI_MODEL;
  const aiConfigured = e.AI_PROVIDER !== 'none' && Boolean(aiKey);

  if (e.NODE_ENV === 'production') {
    if (e.JWT_ACCESS_SECRET.includes('change_me') || e.JWT_REFRESH_SECRET.includes('change_me')) {
      // eslint-disable-next-line no-console
      console.error('[config] Refusing to start in production with default JWT secrets.');
      process.exit(1);
    }
    if (e.JWT_ACCESS_SECRET === e.JWT_REFRESH_SECRET) {
      // eslint-disable-next-line no-console
      console.error('[config] JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ.');
      process.exit(1);
    }
  }

  // ── Boot diagnostics ─────────────────────────────────────────
  // Presence only: whether each variable arrived, how long it is, and whether it
  // had to be trimmed. Never the value itself. This is the difference between
  // "the dashboard says it is set" and "this process received it", which is the
  // question every "credentials not configured" report actually asks.
  if (!isTest) {
    const names = [
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GOOGLE_REDIRECT_URI',
      'GOOGLE_SUCCESS_REDIRECT',
      'GOOGLE_FAILURE_REDIRECT',
      'DATABASE_URL',
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'APP_URL',
      'CORS_ORIGINS',
    ] as const;
    const report = names.map((n) => {
      const raw = process.env[n];
      const trimmed = (raw ?? '').trim();
      const state = raw === undefined ? 'absent' : trimmed === '' ? 'empty' : 'set';
      const padded = raw !== undefined && raw !== trimmed ? ' (had surrounding whitespace)' : '';
      return `${n}=${state}${state === 'set' ? ` len=${trimmed.length}${padded}` : ''}`;
    });
    // eslint-disable-next-line no-console
    console.log(`[config] env ${report.join(' ')}`);
  }

  const googleConfigured = Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET && e.GOOGLE_REDIRECT_URI);
  const appUrl = e.APP_URL.replace(/\/$/, '');
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(e.GOOGLE_REDIRECT_URI);
  if (!isTest && googleConfigured && !/^https:\/\//.test(e.GOOGLE_REDIRECT_URI) && !isLocalhost) {
    // Google requires https for every redirect URI except localhost (which it
    // allows over http for development).
    // eslint-disable-next-line no-console
    console.error('[config] GOOGLE_REDIRECT_URI must be an https:// URL (http is allowed only for localhost).');
    process.exit(1);
  }

  if (!isTest) {
    const missing = [
      ['GOOGLE_CLIENT_ID', e.GOOGLE_CLIENT_ID],
      ['GOOGLE_CLIENT_SECRET', e.GOOGLE_CLIENT_SECRET],
      ['GOOGLE_REDIRECT_URI', e.GOOGLE_REDIRECT_URI],
    ]
      .filter(([, v]) => !v)
      .map(([k]) => k);
    // eslint-disable-next-line no-console
    console.log(
      missing.length
        ? `[config] google OAuth DISABLED - missing: ${missing.join(', ')}`
        : `[config] google OAuth enabled - redirect_uri host=${((): string => {
            try {
              return new URL(e.GOOGLE_REDIRECT_URI).host;
            } catch {
              return '(not a valid URL)';
            }
          })()}`,
    );
  }

  return {
    ...e,
    isProd: e.NODE_ENV === 'production',
    aiConfigured,
    aiKey,
    aiModel,
    googleConfigured,
    googleSuccessRedirect: e.GOOGLE_SUCCESS_REDIRECT || `${appUrl}/auth/google/callback`,
    googleFailureRedirect: e.GOOGLE_FAILURE_REDIRECT || `${appUrl}/auth/google/callback`,
  };
}

let cached: AppConfig | null = null;

/** Test-only: forget the cached configuration so a changed env is re-read. */
export function __resetConfigCache() {
  cached = null;
}

/** Evaluated on first use so tests can set NODE_ENV before anything is read. */
export function getConfig(): AppConfig {
  if (!cached) cached = load();
  return cached;
}

export const config: AppConfig = new Proxy({} as AppConfig, {
  get: (_t, key) => getConfig()[key as keyof AppConfig],
  has: (_t, key) => key in getConfig(),
  ownKeys: () => Reflect.ownKeys(getConfig()),
  getOwnPropertyDescriptor: (_t, key) => ({ configurable: true, enumerable: true, value: getConfig()[key as keyof AppConfig] }),
});

export const AI_MODE: 'gemini' | 'openai' | 'unconfigured' = !getConfig().aiConfigured
  ? 'unconfigured'
  : getConfig().AI_PROVIDER === 'openai'
    ? 'openai'
    : 'gemini';
