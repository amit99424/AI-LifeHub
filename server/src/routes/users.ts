import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError, ah, validate } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import {
  OCCUPATION_PROFILES,
  OCCUPATION_TYPES,
  classifyOccupation,
  mergeWidgetOrder,
  occupationDisplayName,
  parseLayout,
  resolveOccupation,
  WIDGET_IDS,
  type OccupationType,
} from '../services/occupations.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

// ── occupation ───────────────────────────────────────────────
// Everything the client needs to personalise itself, resolved server-side so
// the rules live in exactly one place (services/occupations.ts).
async function occupationFor(userId: string) {
  const [profile, label] = await Promise.all([
    prisma.profile.findUnique({ where: { userId }, select: { occupation: true, occupationType: true } }),
    prisma.occupationLabel.findUnique({ where: { userId }, select: { label: true } }),
  ]);
  const resolved = resolveOccupation({
    occupationType: profile?.occupationType ?? null,
    occupation: profile?.occupation ?? null,
    customLabel: label?.label ?? null,
  });
  return {
    type: resolved.type,
    profile: resolved.profile,
    source: resolved.source,
    displayName: occupationDisplayName(resolved.profile, label?.label),
    customLabel: label?.label ?? null,
    /** True when we guessed from old free text — the UI should offer to confirm. */
    needsConfirmation: resolved.source !== 'typed',
  };
}

usersRouter.get(
  '/occupation',
  ah(async (req, res) => {
    res.json({
      occupation: await occupationFor(req.user!.id),
      options: OCCUPATION_TYPES.map((t) => OCCUPATION_PROFILES[t]),
    });
  }),
);

const occupationSchema = z.object({
  occupationType: z.enum(OCCUPATION_TYPES),
  // Only meaningful for OTHER, but accepted for any type so switching away and
  // back does not lose what the person typed.
  customLabel: z.string().trim().max(80).nullable().optional(),
  // Free-text display label. Optional; when absent we derive it.
  occupation: z.string().trim().max(80).nullable().optional(),
});

usersRouter.put(
  '/occupation',
  validate({ body: occupationSchema }),
  ah(async (req, res) => {
    const body = req.body as z.infer<typeof occupationSchema>;
    const userId = req.user!.id;

    const customLabel = body.customLabel?.trim() || null;
    const typedLabel = body.occupation?.trim() || null;
    // The human-readable string stored in the legacy column. For OTHER this is
    // the person's own words; otherwise it is the profile's label, so old code
    // that reads `occupation` still shows something sensible.
    const displayLabel =
      typedLabel ?? (body.occupationType === 'OTHER' ? customLabel : OCCUPATION_PROFILES[body.occupationType].label);

    // Interactive transaction: the spread above produced a union of tuple
    // shapes that Prisma's array overload cannot type. An explicit callback is
    // both clearer and correctly typed.
    await prisma.$transaction(async (tx) => {
      await tx.profile.upsert({
        where: { userId },
        create: { userId, occupationType: body.occupationType, occupation: displayLabel },
        update: { occupationType: body.occupationType, occupation: displayLabel },
      });
      if (customLabel) {
        await tx.occupationLabel.upsert({
          where: { userId },
          create: { userId, label: customLabel },
          update: { label: customLabel },
        });
      } else {
        await tx.occupationLabel.deleteMany({ where: { userId } });
      }
    });

    res.json({ occupation: await occupationFor(userId) });
  }),
);

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

// ── dashboard layout ─────────────────────────────────────────
// The widget order and visibility a person chose. Stored as JSON so it is one
// opaque value; validated here against the ids this build knows, so a stale
// tab cannot save a widget that no longer exists and break the next render.
const layoutSchema = z.object({
  order: z.array(z.enum(WIDGET_IDS)).max(WIDGET_IDS.length).optional(),
  hidden: z.array(z.enum(WIDGET_IDS)).max(WIDGET_IDS.length).optional(),
});

usersRouter.get(
  '/dashboard-layout',
  ah(async (req, res) => {
    const settings = await prisma.userSettings.findUnique({
      where: { userId: req.user!.id },
      select: { dashboardLayout: true },
    });
    res.json({ layout: parseLayout(settings?.dashboardLayout ?? null) });
  }),
);

usersRouter.put(
  '/dashboard-layout',
  validate({ body: layoutSchema }),
  ah(async (req, res) => {
    const body = req.body as z.infer<typeof layoutSchema>;
    const order = body.order ? mergeWidgetOrder(body.order, null) : undefined;
    const hidden = body.hidden ? Array.from(new Set(body.hidden)) : undefined;
    const value = JSON.stringify({ order: order ?? null, hidden: hidden ?? [] });
    await prisma.userSettings.upsert({
      where: { userId: req.user!.id },
      create: { userId: req.user!.id, dashboardLayout: value },
      update: { dashboardLayout: value },
    });
    res.json({ layout: parseLayout(value) });
  }),
);

// ── onboarding ───────────────────────────────────────────────
const onboardingSchema = z.object({
  occupation: z.string().trim().max(80).optional(),
  occupationType: z.enum(OCCUPATION_TYPES).optional(),
  customLabel: z.string().trim().max(80).nullable().optional(),
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

    // Resolve what to store: the typed enum if given, else classify whatever
    // free text arrived, so both the new client and any old one work.
    const typed = body.occupationType ?? classifyOccupation(body.customLabel) ?? classifyOccupation(body.occupation) ?? null;
    const customLabel = body.customLabel?.trim() || null;
    const displayOccupation =
      body.occupation?.trim() ||
      (typed === 'OTHER' ? customLabel : typed ? OCCUPATION_PROFILES[typed].label : null);

    const profile = await prisma.profile.upsert({
      where: { userId },
      create: {
        userId,
        occupationType: typed,
        occupation: displayOccupation,
        primaryGoal: body.primaryGoal,
        focusHours: body.focusHours ?? [],
        timezone: body.timezone,
        onboarded: body.complete ?? false,
        onboardingStep: body.complete ? 4 : 1,
      },
      update: {
        ...(body.occupation !== undefined || typed ? { occupationType: typed } : {}),
        occupation: displayOccupation,
        primaryGoal: body.primaryGoal,
        focusHours: body.focusHours,
        timezone: body.timezone,
        onboarded: body.complete ?? false,
        onboardingStep: body.complete ? 4 : 1,
      },
    });

    if (customLabel) {
      await prisma.occupationLabel.upsert({
        where: { userId },
        create: { userId, label: customLabel },
        update: { label: customLabel },
      });
    }

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
