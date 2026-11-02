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
  Moon,
  Palette,
  PenLine,
  Rocket,
  Sparkles,
  Target,
  Timer,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth, useUpdateProfile } from '@/lib/auth';
import { Badge, Button, Card, Input, Label, ProgressBar, toast } from '@/components/ui';
import { cn } from '@/lib/utils';

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

const OCCUPATIONS = [
  { label: 'Student', icon: GraduationCap },
  { label: 'Software Engineer', icon: Code2 },
  { label: 'Designer', icon: Palette },
  { label: 'Freelancer', icon: Rocket },
  { label: 'Manager', icon: Briefcase },
  { label: 'Researcher', icon: BookOpen },
  { label: 'Other', icon: Users },
];

const GOALS = [
  { label: 'Get more done', detail: 'Turn intentions into finished tasks', icon: Target },
  { label: 'Build consistency', detail: 'Keep habits alive day after day', icon: Activity },
  { label: 'Deep focus', detail: 'Protect longer blocks of concentration', icon: Timer },
  { label: 'Better wellbeing', detail: 'Notice how routine and mood interact', icon: Brain },
];

const STEP_LABELS = ['Goal', 'Occupation', 'Habits', 'Preferences'];

export default function Onboarding() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const updateProfile = useUpdateProfile();

  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState(user?.profile.primaryGoal ?? '');
  const [occupation, setOccupation] = useState(user?.profile.occupation ?? '');
  const [habits, setHabits] = useState<string[]>(['Exercise', 'Read 20 minutes']);
  const [focusHours, setFocusHours] = useState<string[]>(['morning']);
  const [customHabit, setCustomHabit] = useState('');

  const save = useMutation({
    mutationFn: (complete: boolean) =>
      api.post('/api/users/onboarding', {
        primaryGoal: goal,
        occupation,
        focusHours,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        habits: habits.map((name) => {
          const meta = HABIT_SUGGESTIONS.find((h) => h.name === name);
          return { name, icon: meta?.icon ?? 'Sparkles', color: meta?.color ?? 'violet', frequency: 'DAILY' as const };
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

  const canNext = step === 0 ? Boolean(goal) : step === 1 ? Boolean(occupation) : true;

  return (
    <div className="min-h-screen bg-[rgb(var(--bg))]">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-5 py-8 sm:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-blue-500 shadow-glow">
              <Sparkles className="h-4.5 w-4.5 text-white" />
            </div>
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
              <h2 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">What best describes you?</h2>
              <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">Used only to tailor wording, never shared.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {OCCUPATIONS.map((o) => (
                  <button
                    key={o.label}
                    onClick={() => setOccupation(o.label)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[13px] font-semibold transition',
                      occupation === o.label
                        ? 'border-brand-400 bg-brand-600 text-white'
                        : 'border-[rgb(var(--border))] text-ink-600 hover:border-brand-300 hover:bg-brand-50/50 dark:text-ink-300 dark:hover:bg-brand-500/5',
                    )}
                  >
                    <o.icon className="h-4 w-4" /> {o.label}
                  </button>
                ))}
              </div>
              <div className="mt-5 max-w-sm">
                <Label>Or type your own</Label>
                <Input placeholder="e.g. Medical student" value={occupation} onChange={(e) => setOccupation(e.target.value)} />
              </div>
            </Card>
          )}

          {step === 2 && (
            <Card className="p-6">
              <h2 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">Pick a few habits to start</h2>
              <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">One click a day is all the tracking these need.</p>
              <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                {HABIT_SUGGESTIONS.map((h) => {
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
