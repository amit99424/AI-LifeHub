/**
 * AI-LifeHub seed script.
 *
 * Creates one demo account so the app can be explored immediately:
 *   email: demo@ai-lifehub.dev
 *   password: DemoPass123
 *
 * Every synthetic record it inserts is flagged `isDemo: true`, so the UI shows
 * it with a "Sample" badge and it is never presented as real user history.
 * Safe to re-run: it upserts the user and regenerates the sample dataset.
 *
 * Run:  npm run db:seed      (from the repository root)
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_EMAIL = process.env.SEED_EMAIL ?? 'demo@ai-lifehub.dev';
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'DemoPass123';
const DEMO_NAME = process.env.SEED_NAME ?? 'Demo User';

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return dateKey(d);
}

function todayKey(tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Local wall-clock instant on a calendar day, as a real UTC Date. */
function localInstant(key: string, hour: number, minute: number, tz: string): Date {
  let guess = new Date(`${key}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`);
  for (let i = 0; i < 2; i++) {
    const seenHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(guess));
    const seenKey = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(guess);
    const dayShift = seenKey === key ? 0 : (new Date(`${key}T00:00:00Z`).getTime() - new Date(`${seenKey}T00:00:00Z`).getTime()) / 3_600_000;
    guess = new Date(guess.getTime() + (hour - seenHour + dayShift) * 3_600_000);
  }
  return guess;
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const TASKS = [
  { title: 'Finish project proposal', category: 'Work', priority: 'HIGH' as const },
  { title: 'Review pull requests', category: 'Work', priority: 'MEDIUM' as const },
  { title: 'Prepare sprint planning notes', category: 'Work', priority: 'MEDIUM' as const },
  { title: 'Study linear algebra chapter 4', category: 'Study', priority: 'HIGH' as const },
  { title: 'Practice DSA problems', category: 'Study', priority: 'URGENT' as const },
  { title: '30 min run', category: 'Health', priority: 'MEDIUM' as const },
  { title: 'Call family', category: 'Personal', priority: 'MEDIUM' as const },
  { title: 'Update portfolio site', category: 'Side Project', priority: 'MEDIUM' as const },
  { title: 'Read 20 pages of Deep Work', category: 'Reading', priority: 'LOW' as const },
  { title: 'Refactor analytics service', category: 'Side Project', priority: 'HIGH' as const },
];

const HABITS = [
  { name: 'Exercise', icon: 'Dumbbell', color: 'emerald', rate: 0.62 },
  { name: 'Read 20 minutes', icon: 'BookOpen', color: 'blue', rate: 0.74 },
  { name: 'Meditate', icon: 'Brain', color: 'violet', rate: 0.48 },
  { name: 'Code for 1 hour', icon: 'Code2', color: 'indigo', rate: 0.8 },
  { name: 'Drink 3L water', icon: 'Droplets', color: 'cyan', rate: 0.88 },
];

const MOOD_SCORE = { GREAT: 5, GOOD: 4, NEUTRAL: 3, BAD: 2, TERRIBLE: 1 } as const;

const JOURNAL = [
  {
    title: 'Slow start, good finish',
    content:
      'Woke up late and the morning felt scattered. Once I blocked out an hour in the afternoon I got through the proposal draft and two code reviews. Noticing that my mornings are often wasted on email and scrolling, and that my best work happens between 3pm and 6pm.',
  },
  {
    title: 'Deep work day',
    content:
      'Two uninterrupted focus sessions today, 50 minutes each. Finished the auth refactor and wrote tests. I slept about 7.5 hours and did not open social apps until lunch. Energy was steady, mood good. This is the routine I want to repeat.',
  },
  {
    title: 'Overloaded',
    content:
      'Too many things on the list. I bounced between tasks and finished almost nothing. Feeling tired and a bit anxious about the deadline on Friday. Screen time was high, mostly YouTube breaks between work.',
  },
  {
    title: 'Quiet recovery',
    content:
      'Took a rest day. Walked for 40 minutes, read a chapter, called my sister. Productivity was low but mood improved in the evening. Realising rest days are not wasted days when I plan them.',
  },
  {
    title: 'Consistent week',
    content:
      'Five days of coding in a row now. Streak feels motivating. Sleep has been around 7 hours, exercise three times this week. Work feels lighter when I plan the night before.',
  },
];

async function main() {
  const tz = process.env.SEED_TIMEZONE ?? 'Asia/Kolkata';
  console.log(`[seed] preparing demo account ${DEMO_EMAIL}`);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash },
    create: {
      email: DEMO_EMAIL,
      name: DEMO_NAME,
      passwordHash,
      profile: {
        create: {
          timezone: tz,
          occupation: 'Software Engineer',
          primaryGoal: 'Get more done',
          focusHours: ['afternoon', 'evening'],
          onboarded: true,
          onboardingStep: 4,
        },
      },
      settings: { create: { demoDataLoaded: true } },
    },
  });

  // Idempotent: clear previous sample rows for this account only.
  await prisma.task.deleteMany({ where: { userId: user.id, isDemo: true } });
  await prisma.habitLog.deleteMany({ where: { userId: user.id, isDemo: true } });
  await prisma.moodLog.deleteMany({ where: { userId: user.id, isDemo: true } });
  await prisma.journalEntry.deleteMany({ where: { userId: user.id, isDemo: true } });
  await prisma.workSession.deleteMany({ where: { userId: user.id, isDemo: true } });
  await prisma.dailyActivity.deleteMany({ where: { userId: user.id, isDemo: true } });
  await prisma.aIInsight.deleteMany({ where: { userId: user.id, isDemo: true } });
  await prisma.habit.deleteMany({ where: { userId: user.id, isDemo: true } });

  const habits: { id: string; rate: number }[] = [];
  for (const h of HABITS) {
    const created = await prisma.habit.create({
      data: { userId: user.id, name: h.name, icon: h.icon, color: h.color, frequency: 'DAILY', isDemo: true },
    });
    habits.push({ id: created.id, rate: h.rate });
  }

  const today = todayKey(tz);
  const rand = rng(20260101);
  const counts = { tasks: 0, habitLogs: 0, moods: 0, sessions: 0, activities: 0 };

  for (let i = 44; i >= 0; i--) {
    const key = addDays(today, -i);
    const dow = new Date(`${key}T00:00:00Z`).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const energy = dow === 1 ? 0.55 : weekend ? 0.6 : 0.9;

    const taskCount = 2 + Math.floor(rand() * 3);
    for (let t = 0; t < taskCount; t++) {
      const spec = TASKS[Math.floor(rand() * TASKS.length)]!;
      const createdAt = localInstant(key, 8 + Math.floor(rand() * 10), Math.floor(rand() * 60), tz);
      const complete = rand() < 0.55 + energy * 0.3;
      const dueDate = localInstant(addDays(key, Math.floor(rand() * 4) - 1), 23, 59, tz);
      const completedAt = complete ? localInstant(key, 14 + Math.floor(rand() * 6), Math.floor(rand() * 60), tz) : null;
      await prisma.task.create({
        data: {
          userId: user.id,
          title: spec.title,
          category: spec.category,
          priority: spec.priority,
          status: complete ? 'COMPLETED' : i < 3 ? 'IN_PROGRESS' : 'TODO',
          dueDate,
          createdAt,
          startedAt: createdAt,
          completedAt,
          timeTakenSec: completedAt ? Math.max(1800, Math.round((completedAt.getTime() - createdAt.getTime()) / 1000)) : null,
          isDemo: true,
        },
      });
      counts.tasks += 1;
    }

    for (const h of habits) {
      if (rand() < h.rate * (weekend ? 0.85 : 1)) {
        await prisma.habitLog
          .create({ data: { userId: user.id, habitId: h.id, date: new Date(`${key}T00:00:00.000Z`), isDemo: true } })
          .catch(() => undefined);
        counts.habitLogs += 1;
      }
    }

    if (rand() < 0.85) {
      const level = dow === 1 ? (rand() < 0.5 ? 'BAD' : 'NEUTRAL') : rand() < 0.45 ? 'GOOD' : rand() < 0.75 ? 'GREAT' : 'NEUTRAL';
      await prisma.moodLog
        .create({
          data: {
            userId: user.id,
            level,
            score: MOOD_SCORE[level as keyof typeof MOOD_SCORE],
            energy: Math.max(1, Math.min(5, Math.round(energy * 4 + rand() * 2 - 1))),
            focus: Math.max(1, Math.min(5, Math.round(energy * 4 + rand() * 2 - 1))),
            date: new Date(`${key}T00:00:00.000Z`),
            isDemo: true,
          },
        })
        .catch(() => undefined);
      counts.moods += 1;
    }

    const sessionCount = weekend ? Math.floor(rand() * 2) : 1 + Math.floor(rand() * 3);
    for (let s = 0; s < sessionCount; s++) {
      const hour = [9, 11, 14, 16, 19][Math.floor(rand() * 5)]!;
      const minutes = 25 + Math.floor(rand() * 70);
      const startedAt = localInstant(key, hour, 0, tz);
      const category = (['STUDYING', 'CODING', 'OFFICE_WORK', 'READING', 'PERSONAL_PROJECTS'] as const)[Math.floor(rand() * 5)]!;
      await prisma.workSession.create({
        data: {
          userId: user.id,
          category,
          startedAt,
          endedAt: new Date(startedAt.getTime() + minutes * 60_000),
          durationSec: minutes * 60,
          status: 'COMPLETED',
          focusScore: Math.max(1, Math.min(5, Math.round(energy * 5 - rand()))),
          date: new Date(`${key}T00:00:00.000Z`),
          isDemo: true,
        },
      });
      counts.sessions += 1;
    }

    if (rand() < 0.9) {
      await prisma.dailyActivity
        .create({
          data: {
            userId: user.id,
            date: new Date(`${key}T00:00:00.000Z`),
            sleepMinutes: Math.round((6.2 + rand() * 1.9) * 60),
            exerciseMinutes: rand() < 0.55 ? 20 + Math.floor(rand() * 40) : null,
            screenMinutes: Math.round((2.5 + rand() * 4.5) * 60),
            meditationMinutes: rand() < 0.4 ? 10 + Math.floor(rand() * 15) : null,
            socialMinutes: Math.round(rand() * 120),
            source: 'manual',
            isDemo: true,
          },
        })
        .catch(() => undefined);
      counts.activities += 1;
    }
  }

  for (let i = 0; i < JOURNAL.length; i++) {
    const entry = JOURNAL[i]!;
    await prisma.journalEntry.create({
      data: {
        userId: user.id,
        title: entry.title,
        content: entry.content,
        date: new Date(`${addDays(today, -(i * 6 + 1))}T00:00:00.000Z`),
        wordCount: entry.content.split(/\s+/).length,
        isDemo: true,
      },
    });
  }

  console.log('[seed] done:', counts);
  console.log(`[seed] sign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log('[seed] run "Analyse with AI" on a journal entry or generate insights to exercise the AI pipeline.');
}

main()
  .catch((err) => {
    console.error('[seed] failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
