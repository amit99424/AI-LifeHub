import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError, ah, validate } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

// ── profile ──────────────────────────────────────────────────
usersRouter.get(
  '/profile',
  ah(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        lastLoginAt: true,
        profile: true,
        settings: true,
        _count: {
          select: {
            tasks: true,
            habits: true,
            habitLogs: true,
            moodLogs: true,
            journalEntries: true,
            workSessions: true,
          },
        },
      },
    });
    res.json({ profile: user.profile, settings: user.settings, user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt }, counts: user._count });
  }),
);

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  occupation: z.string().trim().max(80).nullable().optional(),
  primaryGoal: z.string().trim().max(120).nullable().optional(),
  timezone: z.string().trim().max(64).optional(),
  weekStart: z.number().int().min(0).max(6).optional(),
  focusHours: z.array(z.string().max(20)).max(6).optional(),
  bio: z.string().trim().max(500).nullable().optional(),
  avatarUrl: z.string().url().max(500).nullable().optional().or(z.literal('').transform(() => null)),
});

usersRouter.patch(
  '/profile',
  validate({ body: profileSchema }),
  ah(async (req, res) => {
    const { name, ...profileData } = req.body as z.infer<typeof profileSchema>;
    if (profileData.timezone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: profileData.timezone });
      } catch {
        throw ApiError.badRequest('Unknown timezone');
      }
    }
    const [profile] = await prisma.$transaction([
      prisma.profile.upsert({
        where: { userId: req.user!.id },
        create: { userId: req.user!.id, ...profileData },
        update: profileData,
      }),
      ...(name ? [prisma.user.update({ where: { id: req.user!.id }, data: { name } })] : []),
    ]);
    res.json({ profile, ...(name ? { name } : {}) });
  }),
);

const settingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  accent: z.string().max(20).optional(),
  aiEnabled: z.boolean().optional(),
  aiAutoInsights: z.boolean().optional(),
  weeklyEmailDigest: z.boolean().optional(),
  moodTrackingOptIn: z.boolean().optional(),
});

usersRouter.patch(
  '/settings',
  validate({ body: settingsSchema }),
  ah(async (req, res) => {
    const data = req.body as z.infer<typeof settingsSchema>;
    const settings = await prisma.userSettings.upsert({
      where: { userId: req.user!.id },
      create: { userId: req.user!.id, ...data },
      update: data,
    });
    res.json({ settings });
  }),
);

// ── onboarding ───────────────────────────────────────────────
const onboardingSchema = z.object({
  occupation: z.string().trim().max(80).optional(),
  primaryGoal: z.string().trim().max(120).optional(),
  focusHours: z.array(z.string().max(20)).max(6).optional(),
  timezone: z.string().trim().max(64).optional(),
  habits: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        icon: z.string().max(40).optional(),
        color: z.string().max(20).optional(),
        frequency: z.enum(['DAILY', 'WEEKLY']).optional(),
      }),
    )
    .max(15)
    .optional(),
  complete: z.boolean().optional(),
});

usersRouter.post(
  '/onboarding',
  validate({ body: onboardingSchema }),
  ah(async (req, res) => {
    const body = req.body as z.infer<typeof onboardingSchema>;
    const userId = req.user!.id;

    const profile = await prisma.profile.upsert({
      where: { userId },
      create: {
        userId,
        occupation: body.occupation,
        primaryGoal: body.primaryGoal,
        focusHours: body.focusHours ?? [],
        timezone: body.timezone,
        onboarded: body.complete ?? false,
        onboardingStep: body.complete ? 4 : 1,
      },
      update: {
        occupation: body.occupation,
        primaryGoal: body.primaryGoal,
        focusHours: body.focusHours,
        timezone: body.timezone,
        onboarded: body.complete ?? false,
        onboardingStep: body.complete ? 4 : 1,
      },
    });

    let created = 0;
    if (body.habits?.length) {
      for (const h of body.habits) {
        const exists = await prisma.habit.findFirst({ where: { userId, name: h.name } });
        if (exists) continue;
        await prisma.habit.create({
          data: {
            userId,
            name: h.name,
            icon: h.icon ?? 'Sparkles',
            color: h.color ?? 'violet',
            frequency: h.frequency ?? 'DAILY',
          },
        });
        created += 1;
      }
    }

    res.json({ profile, habitsCreated: created });
  }),
);

// ── data export ──────────────────────────────────────────────
usersRouter.get(
  '/export',
  ah(async (req, res) => {
    const userId = req.user!.id;
    const [user, tasks, habits, habitLogs, moodLogs, journalEntries, workSessions, dailyActivities, insights, conversations, messages] =
      await Promise.all([
        prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { id: true, name: true, email: true, createdAt: true, profile: true, settings: true },
        }),
        prisma.task.findMany({ where: { userId } }),
        prisma.habit.findMany({ where: { userId } }),
        prisma.habitLog.findMany({ where: { userId } }),
        prisma.moodLog.findMany({ where: { userId } }),
        prisma.journalEntry.findMany({ where: { userId } }),
        prisma.workSession.findMany({ where: { userId } }),
        prisma.dailyActivity.findMany({ where: { userId } }),
        prisma.aIInsight.findMany({ where: { userId } }),
        prisma.conversation.findMany({ where: { userId } }),
        prisma.message.findMany({ where: { userId } }),
      ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      account: user,
      tasks,
      habits,
      habitLogs,
      moodLogs,
      journalEntries,
      workSessions,
      dailyActivities,
      aiInsights: insights,
      conversations,
      messages,
    };
    await prisma.auditLog.create({ data: { userId, action: 'account.export', ip: req.ip } });
    res.setHeader('Content-Disposition', `attachment; filename="ai-lifehub-export-${new Date().toISOString().slice(0, 10)}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(payload, null, 2));
  }),
);

// ── account deletion (soft delete + hard purge) ───────────────
usersRouter.delete(
  '/account',
  validate({ body: z.object({ confirm: z.literal('DELETE') }) }),
  ah(async (req, res) => {
    const userId = req.user!.id;
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } }),
      prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
      prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    // Cascade deletes every user-owned row.
    await prisma.user.delete({ where: { id: userId } });
    res.json({ ok: true, message: 'Your account and all associated data have been deleted.' });
  }),
);

// ── demo data ────────────────────────────────────────────────
usersRouter.post(
  '/demo-data',
  ah(async (req, res) => {
    if (!config.ALLOW_DEMO_DATA) throw ApiError.forbidden('Demo data is disabled');
    const { generateDemoData } = await import('../services/demo.js');
    const result = await generateDemoData(req.user!.id, req.user!.timezone);
    res.status(201).json(result);
  }),
);

usersRouter.delete(
  '/demo-data',
  ah(async (req, res) => {
    const userId = req.user!.id;
    const [tasks, habitLogs, moodLogs, journal, sessions, activities, insights] = await prisma.$transaction([
      prisma.task.deleteMany({ where: { userId, isDemo: true } }),
      prisma.habitLog.deleteMany({ where: { userId, isDemo: true } }),
      prisma.moodLog.deleteMany({ where: { userId, isDemo: true } }),
      prisma.journalEntry.deleteMany({ where: { userId, isDemo: true } }),
      prisma.workSession.deleteMany({ where: { userId, isDemo: true } }),
      prisma.dailyActivity.deleteMany({ where: { userId, isDemo: true } }),
      prisma.aIInsight.deleteMany({ where: { userId, isDemo: true } }),
    ]);
    await prisma.habit.deleteMany({ where: { userId, isDemo: true } });
    await prisma.userSettings.updateMany({ where: { userId }, data: { demoDataLoaded: false } });
    res.json({
      ok: true,
      removed: {
        tasks: tasks.count,
        habitLogs: habitLogs.count,
        moodLogs: moodLogs.count,
        journal: journal.count,
        sessions: sessions.count,
        activities: activities.count,
        insights: insights.count,
      },
    });
  }),
);
