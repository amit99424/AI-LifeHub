<div align="center">

# AI-LifeHub

**An AI-powered personal productivity companion that learns from the activity you already do — instead of asking you to log your whole life.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](#license)

</div>

---

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Screens & modules](#screens--modules)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [The AI pipeline](#the-ai-pipeline)
- [Repository structure](#repository-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Database setup & migrations](#database-setup--migrations)
- [Running the app](#running-the-app)
- [Testing](#testing)
- [Production deployment](#production-deployment)
- [Security & privacy](#security--privacy)
- [Design decisions & limitations](#design-decisions--limitations)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Overview

Most people run their lives across five disconnected apps: a to-do list, a habit tracker, a journal, a mood tracker and a stopwatch. None of them talk to each other, and almost none of them *learn* from the data they collect.

**AI-LifeHub** unifies those into one workspace and adds the missing layer: an analysis engine that reads the user's own historical records, computes real productivity features, and turns them into personalised insights and recommendations.

The core design principle is **low-friction data capture**:

> Don't ask users to record their entire lives. Learn from the activities they already perform.

Every signal in the app is a by-product of normal use — completing a task records a timestamp, ticking a habit writes a dated log, starting a timer records a session. The user never fills in a daily questionnaire.

**If the AI provider is not configured, the app still works.** Every non-AI feature functions normally, and the AI screens show an explicit "not configured" notice instead of inventing output.

---

## Features

### Task management
- Create, edit, delete, complete and archive tasks
- Four priorities (low → urgent) and four statuses (to-do → archived)
- Categories, descriptions, due dates, full-text search and filters
- **Automatic capture**: creation time, start time, completion time and time-to-complete are recorded server-side; overdue and on-time/late status are derived, never typed
- Grouped views for overdue / due-today / everything else

### Habit tracker
- Daily and weekly habits with targets
- **One-click check-in** (and one-click undo) — the dated log row is created automatically
- Current streak, longest streak, weekly rate, monthly rate, 30-day dot strip and 90-day history view
- Per-habit completion reports

### Mood tracker
- Five-level one-tap logging (great → terrible) with an optional note, focus and energy rating
- Weekly and monthly trends, distribution charts, full history
- Explicitly framed as **self-reported data**, never a clinical assessment

### Journal
- Private entries with titles, dates, search and month grouping
- **AI analysis per entry**: sentiment, sentiment score, 2–5 themes, a short summary and a productivity note
- Editing an entry invalidates its previous analysis so it can be re-run honestly
- Aggregate theme extraction across the whole journal

### Study / work session tracker
- Server-side timer with start / pause / resume / stop
- Pauses are excluded from the duration; the final duration is computed from timestamps, not typed
- Six categories, optional self-rated focus at the end, per-day and per-category charts
- Optional manual backfill for sessions tracked elsewhere

### Daily routine (optional context)
- Sleep, exercise, screen time, meditation, social time and steps
- Quick manual entry, or **CSV import** (`date,sleepHours,screenHours,exerciseMinutes,meditationMinutes,socialMinutes,steps`)
- Honest about platform limits: a browser **cannot** read phone screen-time or health data without a native integration, so the app never pretends it does

### Analytics
- Daily, weekly and monthly productivity trends
- Productivity score (0–100) with a documented weighting
- Task completion rate, overdue/late counts, habit consistency, focus minutes, mood distribution
- Hour-of-day and weekday patterns, activity heatmap, balance radar
- Date-range presets (7 / 30 / 90 days, this month, custom)

### AI assistant
- Conversational interface grounded in the user's own data
- Conversation history persisted in PostgreSQL
- Automatically adapts the data window to the question ("last 7 days" → 7-day window)
- States clearly when there is insufficient history to answer
- Daily usage caps and per-minute rate limiting

### AI insights
- Six insight types: productivity patterns, habit consistency, task overload, mood ↔ productivity, journal themes, routine signals, plus weekly summaries
- Each insight carries a confidence level derived from data volume, the feature snapshot that produced it, and 2–3 actionable recommendations
- Cache-aware: identical windows are not re-generated, saving tokens

### Platform
- Full authentication: register, login, logout, refresh-token rotation, forgot/reset password, session management
- Onboarding flow (goal → occupation → habit suggestions → preferences) with optional sample data
- Light/dark/system themes, responsive layout, loading / empty / error states throughout
- Data export (JSON) and account deletion
- Sample-data mode, clearly labelled everywhere

---

## Screens & modules

| Route | Module | Description |
|---|---|---|
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Auth | Split-panel auth with validation and password strength |
| `/onboarding` | Onboarding | 4-step setup, optional sample dataset |
| `/dashboard` | Dashboard | Score ring, KPI row, 14-day trend, AI insights, today's habits, mood, deadlines, heatmap |
| `/tasks` | Tasks | Quick-add, filters, grouped task list, edit/delete modals |
| `/habits` | Habits | Check-in cards with streaks and 30-day strips, 90-day history |
| `/mood` | Mood | Five-face picker, trend, distribution, history |
| `/journal` | Journal | Composer, reader with AI analysis panel, themes sidebar |
| `/sessions` | Sessions | Live timer, daily focus chart, category split, history |
| `/routine` | Routine | Manual routine entry, 30-day table, CSV import |
| `/assistant` | AI Assistant | Chat with persisted conversations and usage meter |
| `/analytics` | Analytics | Trend, radar, weekly/monthly rollups, heatmap, distributions |
| `/profile` | Profile | Lifetime stats, 90-day summary, milestones |
| `/settings` | Settings | Profile, appearance, AI preferences, sessions, sample data, privacy & data |

---

## Tech stack

**Frontend**
- React 19 + TypeScript 5.9, built with Vite 8
- Tailwind CSS 3 (custom design tokens, dark mode via class)
- TanStack Query 5 for server state, React Router 7
- Recharts 3 for all visualisations
- Lucide React icons, self-hosted Inter / Plus Jakarta Sans (no external font calls)

**Backend**
- Node.js 22, Express 4, TypeScript (ESM, `NodeNext`)
- Prisma ORM 6 with PostgreSQL
- Zod 4 validation on every request body, query and params
- JWT access tokens + rotating refresh tokens, bcrypt (12 rounds)
- Helmet, CORS allow-list, rate limiting, compression, cookie parsing

**AI**
- Provider-agnostic LLM client: **Google Gemini** (`generateContent`) or **OpenAI** (`chat/completions`)
- Deterministic feature engineering before any prompt is built
- JSON-mode responses, strict validation, timeouts, one retry on transient failures

**Tooling**
- In-process test runner (works even where `node:test` cannot spawn children)
- Prisma migrations, seed script, Docker support

---

## Architecture

```
┌────────────────────────────┐         ┌────────────────────────────────────┐
│  Browser (React 19 SPA)    │  HTTPS  │  Express API (TypeScript, ESM)     │
│  TanStack Query · Router   │ ──────► │  Zod → services → Prisma           │
│  Recharts · Tailwind       │ cookies │  JWT + rotating refresh tokens     │
└────────────────────────────┘         └───────────────┬────────────────────┘
                                                       │
                       ┌───────────────────────────────┼──────────────────────┐
                       │                               │                      │
              ┌────────▼────────┐            ┌─────────▼─────────┐   ┌────────▼────────┐
              │  PostgreSQL     │            │  Feature engine   │   │  LLM provider   │
              │  (Prisma, 15    │            │  (deterministic)  │   │  Gemini/OpenAI  │
              │   models)       │            │                   │   │                 │
              └─────────────────┘            └─────────┬─────────┘   └────────┬────────┘
                                                       │                      │
                                                       └──── compact JSON ────┘
                                                             (never raw tables)
```

**Request flow for an AI feature**

1. `requireAuth` resolves the user from the access token (or httpOnly cookie) and loads their timezone.
2. `aiLimiter` enforces per-user request limits.
3. `collectActivityData` fetches a **bounded** window (date filters + `take` limits) for that user only.
4. `computeFeatures` produces the feature bundle and a data-availability report.
5. `compactFeatures` prunes nulls and empty collections, then truncates to the token budget.
6. `complete()` calls the configured provider in JSON mode.
7. The response is parsed, validated and persisted (insight row or message row).
8. `UserUsage` is incremented for metering.

---

## The AI pipeline

The AI engine is the differentiating module. It is deliberately **not** a "dump the database into a prompt" implementation.

| Step | Where | What happens |
|---|---|---|
| 1. Collect | `services/collector.ts` | Bounded, user-scoped queries for tasks, habits, mood, journal, sessions, routine |
| 2. Clean | `services/features.ts` | Timezone-aware bucketing, dedupe, streak computation |
| 3. Engineer | `services/features.ts` | Completion rates, hour-bucket and weekday distributions, on-time/late split, streaks, averages, mood × productivity table, sleep × productivity table |
| 4. Assess | `services/features.ts` | `availability` block: days of activity, counts per source, `sufficientForPatterns`, `sufficientForMoodCorrelation`, `missing[]` |
| 5. Prompt | `services/ai.ts` | System rules (no fabrication, correlation ≠ causation, no medical advice) + compact JSON feature block |
| 6. Generate | `services/llm.ts` | Gemini or OpenAI, JSON mode, timeout, retry, error normalisation |
| 7. Validate | `services/ai.ts` | Schema-checked, length-capped, confidence derived from data volume |
| 8. Persist | `services/ai.ts` | `AIInsight` row with `dataPoints` (audit trail), provider and model |
| 9. Surface | `routes/analytics.ts` | Dashboard cards, analytics page, assistant |

**Guarantees built into the prompt and the code**

- The model only ever sees computed numbers; it is never asked to count or estimate.
- If `sufficientForPatterns` is false, generation is skipped with an explanatory reason instead of a guess.
- Mood analysis is labelled correlation-only and self-reported; no diagnosis is ever produced.
- Missing API key ⇒ a structured `ai_unconfigured` response, never a fake answer.

---

## Repository structure

```
AI-LifeHub/
├── package.json                 # root scripts (dev / build / db / test)
├── .gitignore                   # excludes env files, secrets, builds, deps
├── .editorconfig / .gitattributes
│
├── server/                      # ── Backend ─────────────────────────────
│   ├── .env.example             # every variable, placeholders only
│   ├── package.json
│   ├── tsconfig.json            # build config
│   ├── tsconfig.test.json       # test build config
│   ├── tsconfig.seed.json       # seed build config
│   ├── prisma/
│   │   ├── schema.prisma        # 15 models, enums, indexes, cascades
│   │   ├── migrations/          # SQL migration history
│   │   └── seed.ts              # demo account + 45 days of labelled sample data
│   └── src/
│       ├── index.ts             # server bootstrap
│       ├── app.ts               # Express app, middleware, routes, SPA fallback
│       ├── config.ts            # Zod-validated environment
│       ├── lib/                 # prisma, auth, dates, http helpers
│       ├── middleware/          # auth guard, rate limiters
│       ├── routes/              # auth, users, tasks, habits, moods, journal,
│       │                        #   sessions, activity, ai, analytics
│       ├── services/            # collector, features, llm, ai, analytics, demo
│       └── tests/               # unit tests + in-process runner
│
└── web/                         # ── Frontend ────────────────────────────
    ├── .env.example             # VITE_API_URL (optional)
    ├── index.html
    ├── vite.config.ts           # dev proxy → :4000
    ├── tailwind.config.js       # design tokens, animations
    ├── public/favicon.svg
    └── src/
        ├── main.tsx / App.tsx   # providers, routes, guards
        ├── index.css            # Tailwind layers, component classes
        ├── components/          # AppShell, ui kit, auth layout, AI banner
        ├── hooks/               # useAiStatus
        ├── lib/                 # api client, auth context, types, utils
        └── pages/               # 15 route components
```

---

## Getting started

### Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | **20+** (22 recommended) | `node --version` |
| npm | 10+ | ships with Node |
| PostgreSQL | **14+** (16/17/18 tested) | local server or Docker |
| AI provider key | optional | Gemini or OpenAI; the app runs without one |

### 1. Clone

```bash
git clone https://github.com/amit99424/AI-LifeHub.git
cd AI-LifeHub
```

### 2. Install dependencies

This project uses **two independent npm packages** (`server/` and `web/`), not npm workspaces:

```bash
npm install                 # root: concurrently
npm --prefix server install
npm --prefix web install
```

> If a sandboxed environment blocks npm lifecycle scripts, run the installs with
> `npm install --ignore-scripts` and then `npx prisma generate --schema server/prisma/schema.prisma`.

### 3. Create the database

```bash
# psql
createdb ai_lifehub

# or Docker
docker run --name lifehub-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
```

### 4. Configure the backend

```bash
cp server/.env.example server/.env
```

Edit `server/.env`:

```ini
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/ai_lifehub?schema=public"
JWT_ACCESS_SECRET=<64-char random hex>
JWT_REFRESH_SECRET=<a different 64-char random hex>
AI_PROVIDER=gemini          # or openai, or none
GEMINI_API_KEY=<your key>   # leave empty to run without AI
```

Generate the secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 5. Migrate, generate and seed

```bash
npm run db:deploy      # apply migrations from prisma/migrations
npm run db:generate    # generate the Prisma client
npm run db:seed        # optional: demo account + labelled sample data
```

### 6. Run

```bash
npm run build          # compile the API (TypeScript → server/dist)
npm run dev            # API on :4000 + Vite dev server on :5173
```

Open **http://localhost:5173**.

- Register a new account, **or**
- Sign in with the seeded demo account: **`demo@ai-lifehub.dev` / `DemoPass123`** (change or delete it before any real deployment).

---

## Environment variables

All backend variables live in `server/.env` (see `server/.env.example`).

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development` \| `test` \| `production` |
| `PORT` | no | `4000` | API port |
| `APP_URL` | no | `http://localhost:5173` | Frontend origin, used in reset links |
| `CORS_ORIGINS` | no | localhost pair | Comma-separated allow-list |
| `DATABASE_URL` | **yes** | — | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | **yes** | — | ≥16 chars; signs access tokens |
| `JWT_REFRESH_SECRET` | **yes** | — | ≥16 chars; hashes refresh tokens |
| `ACCESS_TOKEN_TTL` | no | `15m` | Access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | no | `30` | Refresh token lifetime |
| `COOKIE_SECURE` | no | `false` | `true` in production (HTTPS only) |
| `COOKIE_DOMAIN` | no | — | Optional cookie domain |
| `AI_PROVIDER` | no | `none` | `gemini` \| `openai` \| `none` |
| `GEMINI_API_KEY` | if gemini | — | Google AI Studio key |
| `GEMINI_MODEL` | no | `gemini-2.5-flash` | Model id |
| `OPENAI_API_KEY` | if openai | — | OpenAI key |
| `OPENAI_MODEL` | no | `gpt-4o-mini` | Model id |
| `OPENAI_BASE_URL` | no | `https://api.openai.com/v1` | For compatible gateways |
| `AI_MAX_CONTEXT_TOKENS` | no | `12000` | Prompt budget for the feature block |
| `AI_CHAT_DAILY_LIMIT` | no | `80` | Assistant messages per user per day |
| `AI_INSIGHT_DAILY_LIMIT` | no | `30` | Insight generations per user per day |
| `AI_REQUEST_TIMEOUT_MS` | no | `45000` | Per-request timeout |
| `AI_TEMPERATURE` | no | `0.4` | Sampling temperature |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | no | `60000` / `240` | Global API limit |
| `AUTH_RATE_LIMIT_MAX` | no | `20` | Auth attempts per 10 min |
| `ALLOW_DEMO_DATA` | no | `true` | Enable the sample-data endpoint |
| `SEED_*` | no | see example | Seed script overrides |

Frontend (`web/.env`, optional):

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | *(empty)* | Absolute API base URL. Empty = same-origin / dev proxy |

---

## Database setup & migrations

The schema (`server/prisma/schema.prisma`) defines **15 models**:

`User`, `Profile`, `UserSettings`, `Session`, `RefreshToken`, `PasswordResetToken`,
`AuditLog`, `Task`, `Habit`, `HabitLog`, `MoodLog`, `JournalEntry`, `WorkSession`,
`DailyActivity`, `AIInsight`, `Conversation`, `Message`, `UserUsage`.

Every user-owned table carries a `userId` foreign key with `onDelete: Cascade`, which is what enforces user-level isolation on read *and* guarantees complete deletion of an account.

### Common commands

```bash
npm run db:migrate        # create + apply a migration in development
npm run db:deploy         # apply committed migrations (CI / production)
npm run db:generate       # regenerate the Prisma client
npm run db:seed           # demo account + sample dataset (idempotent)
npm run db:studio         # Prisma Studio
```

### Migrating an existing database

```bash
# inspect drift first
npx prisma migrate status --schema server/prisma/schema.prisma

# if you are adopting an existing DB, baseline it once:
npx prisma migrate resolve --applied <migration_name> --schema server/prisma/schema.prisma
```

### Sample data

`npm run db:seed` creates `demo@ai-lifehub.dev` and 45 days of synthetic records
(tasks, habit logs, moods, focus sessions, routine rows, journal entries).
Every row is flagged `isDemo: true`, so the UI labels it **Sample** — synthetic
records are never presented as real history. Re-running the seed is safe; it
clears only this account's demo rows first.

---

## Running the app

| Command (from repo root) | What it does |
|---|---|
| `npm run build` | Compile the API and build the SPA |
| `npm run dev` | API (`server/dist`) + Vite dev server with HMR |
| `npm run dev:api` | API only |
| `npm run dev:web` | Vite only |
| `npm start` | Production API (serves `web/dist` when present) |
| `npm test` | Unit tests |
| `npm run seed` | Alias for `db:seed` |

**Health check**

```bash
curl http://localhost:4000/api/health
# {"ok":true,"service":"ai-lifehub-api","version":"1.0.0","db":"up",
#  "ai":{"configured":true,"provider":"gemini","model":"gemini-2.5-flash","missingEnv":[]}}
```

---

## Testing

```bash
npm test
```

Runs `server/src/tests/features.test.ts` through a small in-process runner
(`server/src/tests/run.ts`). It covers the deterministic core of the AI pipeline:

- timezone-aware date keys, hour bucketing, range helpers
- productivity-score weighting (including the habits-only and no-data cases)
- feature engineering over real-shaped rows (bucket counts, overdue detection, availability gating)
- prompt compaction (no nulls, bounded size)

The runner avoids `node:test`'s child-process spawning, which is blocked in some
sandboxed environments; it prints a TAP-style summary and exits non-zero on failure.

**Manual end-to-end checklist**

1. Register a new account → onboarding → dashboard shows empty states.
2. Create and complete a task → dashboard KPI and score update.
3. Check in a habit → streak appears.
4. Log a mood → distribution updates.
5. Start, pause, resume and stop a session → duration is recorded.
6. Add a journal entry → "Analyse with AI" returns sentiment, themes and summary.
7. Generate insights → cards appear with confidence labels.
8. Ask the assistant "Analyze my last 7 days" → answer references your numbers.
9. Settings → export data (JSON), then delete the account.

---

## Production deployment

### Option A — single container (API serves the SPA)

```dockerfile
# Dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY server/package*.json server/
COPY web/package*.json web/
RUN npm install && npm --prefix server install && npm --prefix web install
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 4000
CMD ["node", "server/dist/index.js"]
```

```bash
docker build -t ai-lifehub .
docker run -p 4000:4000 --env-file server/.env ai-lifehub
```

In production the API serves `web/dist` and falls back to `index.html` for
non-`/api` routes, so a single origin serves both.

### Option B — split deployment

- **API** on any Node host (Render, Railway, Fly.io, ECS). Set the variables from the table above with `NODE_ENV=production` and `COOKIE_SECURE=true`.
- **SPA** on a static host (Vercel, Netlify, Cloudflare Pages). Build with `npm --prefix web run build`, set `VITE_API_URL` to the API origin, and add the SPA origin to `CORS_ORIGINS`.
- Run `npm run db:deploy` as a release step against your managed Postgres.

### Production checklist

- [ ] `NODE_ENV=production`
- [ ] Unique, random `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (the server refuses to start with the example values)
- [ ] `COOKIE_SECURE=true` behind HTTPS
- [ ] `CORS_ORIGINS` restricted to your real frontend origin
- [ ] Managed Postgres with backups; migrations applied via `db:deploy`
- [ ] AI key stored in a secret manager, never in the image
- [ ] Reverse proxy with TLS, and a trusted proxy configured (`app.set('trust proxy', 1)`)
- [ ] Change or delete the seeded demo account

---

## Security & privacy

**Authentication**
- bcrypt password hashing (12 rounds)
- Short-lived JWT access tokens; refresh tokens stored **only as SHA-256 hashes**
- Refresh-token rotation with **reuse detection**: replaying a rotated token revokes the whole family and the session
- httpOnly, SameSite=Lax cookies (Secure in production)
- Password reset tokens are single-use, hashed, and expire in one hour; a successful reset signs out every session
- Session list with per-session revoke and "sign out everywhere"

**Authorisation & isolation**
- Every query is scoped by `userId` taken from the verified token, never from the request body
- Ownership checks on every single-resource route
- Cascading deletes mean account deletion removes all derived data

**Input & transport**
- Zod validation on bodies, queries and params; unknown fields are stripped
- Prototype-pollution keys and null bytes are rejected before handlers run
- Helmet security headers, CORS allow-list, compression, 1 MB body limit
- Rate limiting: global, stricter auth limiter, per-user AI limiter

**Secrets**
- No keys in source; everything comes from `server/.env` (git-ignored)
- `server/.env.example` contains placeholders only
- The server refuses to boot in production with placeholder JWT secrets or identical access/refresh secrets

**Privacy**
- Journal text and mood data stay scoped to the account; only the computed feature summary is sent to the LLM
- AI output is labelled correlation-based, never diagnostic
- Full JSON data export and permanent account deletion are available in Settings

---

## Design decisions & limitations

- **Two packages, not a workspace.** `server/` and `web/` install independently, which keeps the Docker build and CI simple and avoids symlink issues on Windows.
- **Productivity score is documented, not magic.** Tasks 40%, habits 30%, focus 20%, consistency 10%; components without data are dropped and the remaining weights re-normalised, so a habits-only user still gets a meaningful number.
- **`@db.Date` day keys.** Habit logs, moods and routine rows store midnight-UTC dates derived from the *user's* timezone, so "one check-in per day" is unambiguous.
- **No fabricated AI.** With no key, the API returns `ai_unconfigured` and the UI explains what to set. There is no mock branch.
- **No silent device access.** Screen time and health data require native platform permissions; the app offers manual entry and CSV import and says so in the UI.
- **Password reset email.** No mail provider is bundled. In development the reset link is returned in the response and logged; wire an SMTP/SES provider in `routes/auth.ts` for production.
- **Model availability changes.** Gemini model ids are retired over time; if AI calls return `404`, set `GEMINI_MODEL` (or `OPENAI_MODEL`) to a model your key can access.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `[config] Invalid environment configuration` | Missing `DATABASE_URL` or JWT secrets | Copy `server/.env.example` → `server/.env` and fill it in |
| `Can't reach database server` | Postgres not running / wrong URL | Start Postgres, verify the host, port and credentials |
| `Environment variable not found: DATABASE_URL` (Prisma CLI) | CLI does not read `.env` automatically here | Run Prisma with the env loaded, e.g. `DATABASE_URL=... npx prisma migrate deploy --schema server/prisma/schema.prisma` |
| `EPERM: operation not permitted, symlink` during install | Restricted sandbox / Windows policy | `npm install --ignore-scripts`, then `npx prisma generate` |
| Dashboard shows zeros | No activity logged yet | Add a task or tick a habit; or load sample data from Settings |
| "AI is not configured" banner | No provider key | Set `AI_PROVIDER` + the matching key and restart the API |
| AI returns `404 model not found` | Retired model id | Update `GEMINI_MODEL` / `OPENAI_MODEL` |
| 429 from the assistant | Daily cap or per-minute limit | Wait, or raise `AI_CHAT_DAILY_LIMIT` |

---

## License

Released under the MIT License. See [LICENSE](LICENSE).

---

<div align="center">

Built as a full-stack study in combining **low-friction behavioural data capture** with a **grounded, auditable AI analysis pipeline**.

</div>
