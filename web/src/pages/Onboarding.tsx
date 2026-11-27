import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Brain,
  Briefcase,
  Check,
  Code2,
  Droplets,
  Dumbbell,
  GraduationCap,
  Laptop,
  Moon,
  PenLine,
  Presentation,
  Rocket,
  Search,
  Sparkles,
  Store,
  Target,
  Timer,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth, useUpdateProfile } from '@/lib/auth';
import { Badge, Button, Card, Input, Label, ProgressBar, toast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { LogoMark } from '@/components/Logo';
import { useOccupation } from '@/lib/occupation';
import type { OccupationType } from '@/lib/types';

const HABIT_SUGGESTIONS = [
  { name: 'Exercise', icon: 'Dumbbell', color: 'emerald', Icon: Dumbbell },
  { name: 'Read 20 minutes', icon: 'BookOpen', color: 'blue', Icon: BookOpen },
  { name: 'Meditate', icon: 'Brain', color: 'violet', Icon: Brain },
  { name: 'Code for 1 hour', icon: 'Code2', color: 'indigo', Icon: Code2 },
  { name: 'Drink 3L water', icon: 'Droplets', color: 'cyan', Icon: Droplets },
  { name: 'Write journal', icon: 'PenLine', color: 'amber', Icon: PenLine },
  { name: 'Walk 20 minutes', icon: 'Activity', color: 'rose', Icon: Activity },
  { name: 'Sleep before 11pm', icon: 'Moon', color: 'indigo', Icon: Moon },
];

// The eight occupation types. Labels and descriptions come from the server so
// onboarding can never drift from what the app actually personalises; these
// entries only carry the client-side icon.
const OCCUPATION_ICONS: Record<OccupationType, LucideIcon> = {
  STUDENT: GraduationCap,
  WORKING_PROFESSIONAL: Briefcase,
  FREELANCER: Laptop,
  BUSINESS_OWNER: Store,
  ENTREPRENEUR: Rocket,
  JOB_SEEKER: Search,
  TEACHER: Presentation,
  OTHER: Users,
};

const OCCUPATION_FALLBACK: { type: OccupationType; label: string; description: string }[] = [
  { type: 'STUDENT', label: 'Student', description: 'Subjects, assignments and exam preparation.' },
  { type: 'WORKING_PROFESSIONAL', label: 'Working professional', description: 'Work projects, deadlines and a life outside them.' },
  { type: 'FREELANCER', label: 'Freelancer', description: 'Client projects, deadlines and billable hours.' },
  { type: 'BUSINESS_OWNER', label: 'Business owner', description: 'Operations, priorities and the health of the business.' },
  { type: 'ENTREPRENEUR', label: 'Entrepreneur', description: 'Building something new, one priority at a time.' },
  { type: 'JOB_SEEKER', label: 'Job seeker', description: 'Applications, interviews and keeping momentum.' },
  { type: 'TEACHER', label: 'Teacher', description: 'Lessons, marking and the energy it takes.' },
  { type: 'OTHER', label: 'Something else', description: 'Tell us what you do and we will use your words.' },
];

const GOALS = [
  { label: 'Get more done', detail: 'Turn intentions into finished tasks', icon: Target },
  { label: 'Build consistency', detail: 'Keep habits alive day after day', icon: Activity },
  { label: 'Deep focus', detail: 'Protect longer blocks of concentration', icon: Timer },
  { label: 'Better wellbeing', detail: 'Notice how routine and mood interact', icon: Brain },
];

const STEP_LABELS = ['Goal', 'Occupation', 'Habits', 'Preferences'];

/**
 * Occupation-suggested habits are plain strings from the server, so they need
 * an icon. Match on keywords rather than shipping an icon name per habit; the
 * fallback is neutral and never wrong, only generic.
 */
function HABIT_ICON_FOR(name: string): { icon: string; color: string } {
  const n = name.toLowerCase();
  if (/sleep|rest|bed/.test(n)) return { icon: 'Moon', color: 'indigo' };
  if (/read|book|revise|study/.test(n)) return { icon: 'BookOpen', color: 'blue' };
  if (/walk|exercise|move|gym|run/.test(n)) return { icon: 'Dumbbell', color: 'emerald' };
  if (/water|drink/.test(n)) return { icon: 'Droplets', color: 'cyan' };
  if (/journal|write|reflect/.test(n)) return { icon: 'PenLine', color: 'amber' };
  if (/meditat|breath|calm/.test(n)) return { icon: 'Brain', color: 'violet' };
  if (/plan|review|log|track/.test(n)) return { icon: 'Target', color: 'brand' };
  return { icon: 'Sparkles', color: 'violet' };
}

export default function Onboarding() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const updateProfile = useUpdateProfile();

  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState(user?.profile.primaryGoal ?? '');
  const occupationQuery = useOccupation();
  const [occupationType, setOccupationType] = useState<OccupationType | null>(
    occupationQuery.data?.occupation.source === 'typed' ? occupationQuery.data.occupation.type : null,
  );
  const [customLabel, setCustomLabel] = useState(occupationQuery.data?.occupation.customLabel ?? '');
  const [habits, setHabits] = useState<string[]>(['Exercise', 'Read 20 minutes']);
  const [focusHours, setFocusHours] = useState<string[]>(['morning']);
  const [customHabit, setCustomHabit] = useState('');

  const save = useMutation({
    mutationFn: (complete: boolean) =>
      api.post('/api/users/onboarding', {
        primaryGoal: goal,
        occupationType: occupationType ?? undefined,
        customLabel: occupationType === 'OTHER' ? customLabel.trim() || null : null,
        focusHours,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        habits: habits.map((name) => {
          const meta = HABIT_SUGGESTIONS.find((h) => h.name === name);
          // Occupation-suggested habits reuse the nearest icon by keyword.
          const guess = HABIT_ICON_FOR(name);
          return { name, icon: meta?.icon ?? guess.icon, color: meta?.color ?? guess.color, frequency: 'DAILY' as const };
        }),
        complete,
      }),
  });

  async function finish(withDemo: boolean) {
    await save.mutateAsync(true);
    if (withDemo) {
      try {
        await api.post('/api/users/demo-data');
        toast('Sample data added — every record is labelled “Sample data”.', 'success');
      } catch {
        toast('Sample data could not be added, but your account is ready.', 'error');
      }
    }
    await refreshUser();
    await qc.invalidateQueries();
    navigate('/dashboard', { replace: true });
  }

  async function skipAll() {
    await updateProfile.mutateAsync({});
    await api.post('/api/users/onboarding', { complete: true });
    await refreshUser();
    navigate('/dashboard', { replace: true });
  }

  const canNext =
    step === 0
      ? Boolean(goal)
      : step === 1
        ? Boolean(occupationType) && (occupationType !== 'OTHER' || customLabel.trim().length > 1)
        : true;

  const options = occupationQuery.data?.options ?? OCCUPATION_FALLBACK.map((o) => ({ ...o, icon: '', nouns: null }));

  // Habits offered in step 3: the chosen occupation's suggestions first, then
  // anything the person already picked, so switching occupation never wipes a
  // choice they made.
  const suggestedHabits = (() => {
    const profile = options.find((o) => o.type === occupationType) as { suggestedHabits?: string[] } | undefined;
    const names = profile?.suggestedHabits ?? HABIT_SUGGESTIONS.map((h) => h.name);
    const all = [...names];
    for (const h of habits) if (!all.includes(h)) all.push(h);
    return all.map((name) => {
      const meta = HABIT_SUGGESTIONS.find((h) => h.name === name);
      return { name, Icon: meta?.Icon ?? (Sparkles as LucideIcon) };
    });
  })();

  return (
    <div className="min-h-screen bg-[rgb(var(--bg))]">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-5 py-8 sm:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#0B1020] ring-1 ring-inset ring-blue-400/40">
              <LogoMark size={30} gradient />
            </span>
            <span className="font-display text-base font-extrabold tracking-tight text-ink-900 dark:text-white">
              AI-Life<span className="gradient-text">Hub</span>
            </span>
          </div>
          <button onClick={() => void skipAll()} className="text-xs font-semibold text-ink-500 hover:text-ink-800 dark:hover:text-ink-200">
            Skip for now
          </button>
        </div>

        <div className="mt-8">
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            <span>
              Step {step + 1} of 4 · {STEP_LABELS[step]}
            </span>
            <span>{Math.round(((step + 1) / 4) * 100)}%</span>
          </div>
          <ProgressBar value={((step + 1) / 4) * 100} />
        </div>

        <div className="mt-6 flex-1">
          {step === 0 && (
            <Card className="p-6">
              <h2 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">What are you here to improve?</h2>
              <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">This shapes the language of your insights. You can change it later.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {GOALS.map((g) => (
                  <button
                    key={g.label}
                    onClick={() => setGoal(g.label)}
                    className={cn(
                      'group flex items-start gap-3 rounded-xl border p-4 text-left transition',
                      goal === g.label
                        ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-500/20 dark:border-brand-500/50 dark:bg-brand-500/10'
                        : 'border-[rgb(var(--border))] hover:border-brand-300 hover:bg-brand-50/40 dark:hover:bg-brand-500/5',
                    )}
                  >
                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', goal === g.label ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300')}>
                      <g.icon className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-ink-900 dark:text-white">{g.label}</p>
                      <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{g.detail}</p>
                    </div>
                    {goal === g.label && <Check className="ml-auto h-4 w-4 shrink-0 text-brand-600" />}
                  </button>
                ))}
              </div>
            </Card>
          )}

          {step === 1 && (
            <Card className="p-6">
              <h2 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">What best describes your days?</h2>
              <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
                This changes the words and the starting setup, not what you can do. Your data stays the same shape.
              </p>

              <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                {options.map((o) => {
                  const Icon = OCCUPATION_ICONS[o.type as OccupationType] ?? Users;
                  const active = occupationType === o.type;
                  return (
                    <button
                      key={o.type}
                      type="button"
                      onClick={() => setOccupationType(o.type as OccupationType)}
                      aria-pressed={active}
                      className={cn(
                        'flex items-start gap-3 rounded-xl border p-3.5 text-left transition',
                        active
                          ? 'border-brand-400 bg-brand-50 dark:border-brand-500/50 dark:bg-brand-500/10'
                          : 'border-[rgb(var(--border))] hover:border-brand-300 hover:bg-ink-50 dark:hover:bg-ink-800/60',
                      )}
                    >
                      <div
                        className={cn(
                          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                          active
                            ? 'bg-brand-600 text-white'
                            : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold text-ink-900 dark:text-white">{o.label}</p>
                        <p className="mt-0.5 text-xs leading-snug text-ink-500 dark:text-ink-400">{o.description}</p>
                      </div>
                      {active && <Check className="mt-1 h-4 w-4 shrink-0 text-brand-600" />}
                    </button>
                  );
                })}
              </div>

              {occupationType === 'OTHER' && (
                <div className="mt-4 max-w-sm">
                  <Label>What do you do?</Label>
                  <Input
                    autoFocus
                    placeholder="e.g. Medical student, Farmer, Chef"
                    value={customLabel}
                    maxLength={80}
                    onChange={(e) => setCustomLabel(e.target.value)}
                  />
                  <p className="mt-1.5 text-xs text-ink-400">We use your words everywhere the app names your work.</p>
                </div>
              )}

              {occupationType && occupationType !== 'OTHER' && (
                <p className="mt-4 text-xs text-ink-400">
                  We will start you with these task categories:{' '}
                  <span className="text-ink-600 dark:text-ink-300">
                    {(options.find((o) => o.type === occupationType) as { taskCategories?: string[] } | undefined)?.taskCategories?.join(', ') ??
                      'Work, Personal, Learning'}
                  </span>
                  . You can change them any time.
                </p>
              )}
            </Card>
          )}

          {step === 2 && (
            <Card className="p-6">
              <h2 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">Pick a few habits to start</h2>
              <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">One click a day is all the tracking these need.</p>
              <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                {suggestedHabits.map((h) => {
                  const active = habits.includes(h.name);
                  return (
                    <button
                      key={h.name}
                      onClick={() => setHabits((prev) => (active ? prev.filter((x) => x !== h.name) : [...prev, h.name]))}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border p-3 text-left transition',
                        active ? 'border-brand-400 bg-brand-50 dark:border-brand-500/50 dark:bg-brand-500/10' : 'border-[rgb(var(--border))] hover:bg-ink-50 dark:hover:bg-ink-800/60',
                      )}
                    >
                      <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', active ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300')}>
                        <h.Icon className="h-4 w-4" />
                      </div>
                      <span className="flex-1 text-[13px] font-semibold text-ink-800 dark:text-ink-100">{h.name}</span>
                      {active && <Check className="h-4 w-4 text-brand-600" />}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex gap-2">
                <Input
                  placeholder="Add your own habit"
                  value={customHabit}
                  onChange={(e) => setCustomHabit(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customHabit.trim()) {
                      e.preventDefault();
                      setHabits((prev) => [...prev, customHabit.trim()]);
                      setCustomHabit('');
                    }
                  }}
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!customHabit.trim()) return;
                    setHabits((prev) => [...prev, customHabit.trim()]);
                    setCustomHabit('');
                  }}
                >
                  Add
                </Button>
              </div>
              {habits.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {habits.map((h) => (
                    <Badge key={h} tone="brand">
                      {h}
                    </Badge>
                  ))}
                </div>
              )}
            </Card>
          )}

          {step === 3 && (
            <Card className="p-6">
              <h2 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">When do you usually work best?</h2>
              <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">A starting guess — your real pattern will replace it once there is data.</p>
              <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {['morning', 'afternoon', 'evening', 'night'].map((slot) => {
                  const active = focusHours.includes(slot);
                  return (
                    <button
                      key={slot}
                      onClick={() => setFocusHours((prev) => (active ? prev.filter((x) => x !== slot) : [...prev, slot]))}
                      className={cn(
                        'rounded-xl border px-3 py-3 text-center text-[13px] font-semibold capitalize transition',
                        active ? 'border-brand-400 bg-brand-600 text-white' : 'border-[rgb(var(--border))] text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800/60',
                      )}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 rounded-xl border border-[rgb(var(--border))] bg-ink-50/70 p-4 dark:bg-ink-800/40">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                  <div>
                    <p className="text-[13px] font-bold text-ink-900 dark:text-white">Want to see the AI features right away?</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                      Load a sample dataset (tasks, habits, moods, sessions and journal entries from the last 45 days). It is clearly labelled “Sample data” everywhere and you can remove it in one click from Settings.
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => (step === 0 ? void skipAll() : setStep((s) => s - 1))}
            icon={<ArrowLeft className="h-4 w-4" />}
          >
            {step === 0 ? 'Skip' : 'Back'}
          </Button>

          {step < 3 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext} icon={<ArrowRight className="h-4 w-4" />}>
              Continue
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="secondary" loading={save.isPending} onClick={() => void finish(false)}>
                Finish setup
              </Button>
              <Button loading={save.isPending} onClick={() => void finish(true)} icon={<Sparkles className="h-4 w-4" />}>
                Finish with sample data
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
