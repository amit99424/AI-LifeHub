/**
 * Synthetic demo data for trying the product.
 *
 * Every row created here is flagged `isDemo: true` and surfaced in the UI with
 * a "Sample data" badge — synthetic records are never presented as real history
 * and are excluded from nothing silently: they are real rows, just labelled.
 */
import { prisma } from '../lib/prisma.js';
import { addDaysKey, dateKeyToDate, localDateKey, todayKey } from '../lib/dates.js';

const TASK_POOL: { title: string; category: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' }[] = [
  { title: 'Finish project proposal', category: 'Work', priority: 'HIGH' },
  { title: 'Review pull requests', category: 'Work', priority: 'MEDIUM' },
  { title: 'Prepare sprint planning notes', category: 'Work', priority: 'MEDIUM' },
  { title: 'Write documentation for auth module', category: 'Work', priority: 'LOW' },
  { title: 'Study linear algebra chapter 4', category: 'Study', priority: 'HIGH' },
  { title: 'Revise React performance patterns', category: 'Study', priority: 'MEDIUM' },
  { title: 'Practice DSA problems', category: 'Study', priority: 'URGENT' },
  { title: '30 min run', category: 'Health', priority: 'MEDIUM' },
  { title: 'Grocery run', category: 'Personal', priority: 'LOW' },
  { title: 'Call family', category: 'Personal', priority: 'MEDIUM' },
  { title: 'Plan weekend trip', category: 'Personal', priority: 'LOW' },
  { title: 'Update portfolio site', category: 'Side Project', priority: 'MEDIUM' },
  { title: 'Read 20 pages of Deep Work', category: 'Reading', priority: 'LOW' },
  { title: 'Fix login bug', category: 'Work', priority: 'URGENT' },
  { title: 'Refactor analytics service', category: 'Side Project', priority: 'HIGH' },
];

const HABITS = [
  { name: 'Exercise', icon: 'Dumbbell', color: 'emerald', rate: 0.62 },
  { name: 'Read 20 minutes', icon: 'BookOpen', color: 'blue', rate: 0.74 },
  { name: 'Meditate', icon: 'Brain', color: 'violet', rate: 0.48 },
  { name: 'Code for 1 hour', icon: 'Code2', color: 'indigo', rate: 0.8 },
  { name: 'Drink 3L water', icon: 'Droplets', color: 'cyan', rate: 0.88 },
];

const MOODS = ['GREAT', 'GOOD', 'NEUTRAL', 'BAD', 'TERRIBLE'] as const;
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
    title: 'Focused but tired',
    content:
      'Good focus session in the morning, but by 4pm my energy dropped. Skipped the gym. Screen time crept up. Tomorrow I want to start earlier and keep the phone out of the room.',
  },
  {
    title: 'Consistent week',
    content:
      'Five days of coding in a row now. Streak feels motivating. Sleep has been around 7 hours, exercise three times this week. Work feels lighter when I plan the night before.',
  },
];

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Converts a local wall-clock hour/minute on a given calendar day into a real UTC instant. */
function localInstant(key: string, hour: number, minute: number, tz: string): Date {
  let guess = new Date(`${key}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`);
  // Two passes settle DST/offset: guess → offset of that instant → corrected instant.
  for (let i = 0; i < 2; i++) {
    const seenKey = localDateKey(guess, tz);
    const seenHour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(guess),
    );
    const diffHours = (hour - seenHour) + (seenKey === key ? 0 : (new Date(`${key}T00:00:00Z`).getTime() - new Date(`${seenKey}T00:00:00Z`).getTime()) / 3_600_000);
    guess = new Date(guess.getTime() + diffHours * 3_600_000);
  }
  return guess;
}

export async function generateDemoData(userId: string, tz: string) {
  const today = todayKey(tz);
  const rand = rng(20261101);
  const days = 45;

  // Clean any previous demo rows so re-running is idempotent.
  await prisma.task.deleteMany({ where: { userId, isDemo: true } });
  await prisma.habitLog.deleteMany({ where: { userId, isDemo: true } });
  await prisma.moodLog.deleteMany({ where: { userId, isDemo: true } });
  await prisma.journalEntry.deleteMany({ where: { userId, isDemo: true } });
  await prisma.workSession.deleteMany({ where: { userId, isDemo: true } });
  await prisma.dailyActivity.deleteMany({ where: { userId, isDemo: true } });
  await prisma.aIInsight.deleteMany({ where: { userId, isDemo: true } });
  await prisma.habit.deleteMany({ where: { userId, isDemo: true } });

  // Habits
  const habits = [];
  for (const h of HABITS) {
    const existing = await prisma.habit.findFirst({ where: { userId, name: h.name } });
    if (existing) {
      habits.push({ id: existing.id, rate: h.rate });
      continue;
    }
    const created = await prisma.habit.create({
      data: { userId, name: h.name, icon: h.icon, color: h.color, frequency: 'DAILY', isDemo: true },
    });
    habits.push({ id: created.id, rate: h.rate });
  }

  let tasks = 0;
  let habitLogs = 0;
  let moods = 0;
  let sessions = 0;
  let activities = 0;
  let journal = 0;

  for (let i = days - 1; i >= 0; i--) {
    const key = addDaysKey(today, -i);
    const date = dateKeyToDate(key);
    const dow = new Date(`${key}T00:00:00Z`).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    // Simulated "real" behaviour: more output Tue-Thu, dip on Mondays.
    const energy = dow === 1 ? 0.55 : weekend ? 0.6 : 0.9;

    // Tasks: 2-4 created per day, most completed
    const count = 2 + Math.floor(rand() * 3);
    for (let t = 0; t < count; t++) {
      const spec = TASK_POOL[Math.floor(rand() * TASK_POOL.length)];
      const createdHour = 8 + Math.floor(rand() * 10);
      const createdAt = localInstant(key, createdHour, Math.floor(rand() * 60), tz);
      const complete = rand() < 0.55 + energy * 0.3;
      const dueOffset = Math.floor(rand() * 4) - 1;
      const dueDate = localInstant(addDaysKey(key, dueOffset), 23, 59, tz);
      // completions cluster in the afternoon for this persona
      const completedHour = 14 + Math.floor(rand() * 6);
      const completedAt = complete ? localInstant(key, completedHour, Math.floor(rand() * 60), tz) : null;
      const timeTaken = completedAt ? Math.max(1800, Math.round((completedAt.getTime() - createdAt.getTime()) / 1000)) : null;
      await prisma.task.create({
        data: {
          userId,
          title: spec.title,
          description: rand() > 0.7 ? 'Added from the demo dataset so analytics have something to chew on.' : null,
          category: spec.category,
          priority: spec.priority,
          status: complete ? 'COMPLETED' : i < 3 ? 'IN_PROGRESS' : 'TODO',
          dueDate,
          createdAt,
          startedAt: createdAt,
          completedAt,
          timeTakenSec: timeTaken,
          isDemo: true,
        },
      });
      tasks += 1;
    }

    // Habit check-ins
    for (const h of habits) {
      if (rand() < h.rate * (weekend ? 0.85 : 1)) {
        await prisma.habitLog.create({ data: { userId, habitId: h.id, date, isDemo: true } }).catch(() => undefined);
        habitLogs += 1;
      }
    }

    // Mood (mostly good, dips on Mondays)
    if (rand() < 0.85) {
      const level = dow === 1 ? (rand() < 0.5 ? 'BAD' : 'NEUTRAL') : rand() < 0.45 ? 'GOOD' : rand() < 0.75 ? 'GREAT' : 'NEUTRAL';
      await prisma.moodLog
        .create({
          data: {
            userId,
            level,
            score: MOOD_SCORE[level as keyof typeof MOOD_SCORE],
            energy: Math.max(1, Math.min(5, Math.round(energy * 4 + rand() * 2 - 1))),
            focus: Math.max(1, Math.min(5, Math.round(energy * 4 + rand() * 2 - 1))),
            note: rand() > 0.8 ? 'Sample note from the demo dataset.' : null,
            date,
            isDemo: true,
          },
        })
        .catch(() => undefined);
      moods += 1;
    }

    // Focus sessions: 1-3 per day, mostly afternoons/evenings
    const sessionCount = weekend ? Math.floor(rand() * 2) : 1 + Math.floor(rand() * 3);
    for (let s = 0; s < sessionCount; s++) {
      const startHour = [9, 11, 14, 16, 19][Math.floor(rand() * 5)];
      const minutes = 25 + Math.floor(rand() * 70);
      const startedAt = localInstant(key, startHour, 0, tz);
      const category = ['STUDYING', 'CODING', 'OFFICE_WORK', 'READING', 'PERSONAL_PROJECTS'][Math.floor(rand() * 5)];
      await prisma.workSession.create({
        data: {
          userId,
          category: category as 'STUDYING',
          startedAt,
          endedAt: new Date(startedAt.getTime() + minutes * 60_000),
          durationSec: minutes * 60,
          status: 'COMPLETED',
          focusScore: Math.max(1, Math.min(5, Math.round(energy * 5 - rand()))),
          date,
          isDemo: true,
        },
      });
      sessions += 1;
    }

    // Routine data
    if (rand() < 0.9) {
      await prisma.dailyActivity
        .create({
          data: {
            userId,
            date,
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
      activities += 1;
    }
  }

  // Journal entries spread over the window
  for (let i = 0; i < JOURNAL.length; i++) {
    const key = addDaysKey(today, -(i * 6 + 1));
    const entry = JOURNAL[i];
    await prisma.journalEntry.create({
      data: {
        userId,
        title: entry.title,
        content: entry.content,
        date: dateKeyToDate(key),
        wordCount: entry.content.split(/\s+/).length,
        isDemo: true,
      },
    });
    journal += 1;
  }

  await prisma.userSettings.updateMany({ where: { userId }, data: { demoDataLoaded: true } });
  await prisma.auditLog.create({ data: { userId, action: 'demo.load' } });

  return {
    ok: true,
    isDemo: true,
    message: 'Sample data loaded. Everything created here is labelled "Sample data".',
    created: { tasks, habits: habits.length, habitLogs, moods, sessions, activities, journal },
  };
}
