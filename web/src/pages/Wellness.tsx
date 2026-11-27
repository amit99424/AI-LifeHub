import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Battery,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  HeartPulse,
  Moon,
  Monitor,
  Smile,
  Target,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  WELLNESS_FIELDS,
  completionOf,
  hasAnyValue,
  validateWellness,
  type FieldSpec,
  type WellnessField,
  type WellnessInput,
} from '@/lib/wellness';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, Skeleton, Textarea, toast } from '@/components/ui';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// Wellness: one screen that records how a day actually went.
// ─────────────────────────────────────────────────────────────
// Design rules this screen follows:
//  - one day at a time, never a table of days to fill in
//  - every field optional, because a half-remembered day is still worth
//    recording and a form that refuses a partial answer gets abandoned
//  - blank means "not reported", never zero, and the copy says so
//  - historical days are one tap away, because the useful entry is usually
//    yesterday's

interface WellnessDay {
  date: string;
  sleepHours: number | null;
  sleepQuality: number | null;
  energyLevel: number | null;
  stressLevel: number | null;
  exerciseMinutes: number | null;
  screenHours: number | null;
  moodScore: number | null;
  focusLevel: number | null;
  notes: string | null;
  hasEntry: boolean;
}

interface WellnessResponse {
  today: WellnessDay;
  series: WellnessDay[];
  entries: WellnessDay[];
  averages: Record<string, number | null>;
  coverage: { logged: number; of: number; lastDayFields: number; fieldsPerDay: number };
}

const FIELD_ICONS: Record<WellnessField, typeof Moon> = {
  sleepHours: Moon,
  sleepQuality: Moon,
  energyLevel: Battery,
  stressLevel: HeartPulse,
  moodScore: Smile,
  focusLevel: Target,
  exerciseMinutes: Activity,
  screenHours: Monitor,
};

const EMPTY_FORM: WellnessInput = {
  sleepHours: null,
  sleepQuality: null,
  energyLevel: null,
  stressLevel: null,
  moodScore: null,
  focusLevel: null,
  exerciseMinutes: null,
  screenHours: null,
};

function toForm(day: WellnessDay | undefined): WellnessInput {
  if (!day) return { ...EMPTY_FORM };
  return {
    sleepHours: day.sleepHours,
    sleepQuality: day.sleepQuality,
    energyLevel: day.energyLevel,
    stressLevel: day.stressLevel,
    moodScore: day.moodScore,
    focusLevel: day.focusLevel,
    exerciseMinutes: day.exerciseMinutes,
    screenHours: day.screenHours,
  };
}

function dayLabel(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  const today = new Date();
  const todayKey = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())).toISOString().slice(0, 10);
  if (key === todayKey) return 'Today';
  const yesterday = new Date(`${todayKey}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (key === yesterday.toISOString().slice(0, 10)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** A 1-5 segmented control. Big tap targets, works with a thumb. */
function ScaleInput({
  spec,
  value,
  onChange,
  error,
}: {
  spec: FieldSpec;
  value: number | null;
  onChange: (v: number | null) => void;
  error?: string;
}) {
  const Icon = FIELD_ICONS[spec.key];
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-800 dark:text-ink-100">
          <Icon className="h-3.5 w-3.5 text-ink-400" />
          {spec.label}
        </label>
        {value !== null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[11px] font-medium text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
          >
            Clear
          </button>
        )}
      </div>
      <div className="mt-1.5 grid grid-cols-5 gap-1.5" role="group" aria-label={spec.label}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(active ? null : n)}
              aria-pressed={active}
              className={cn(
                'h-9 rounded-lg border text-[13px] font-bold tabular-nums transition',
                active
                  ? 'border-brand-400 bg-brand-600 text-white'
                  : 'border-[rgb(var(--border))] text-ink-500 hover:border-brand-300 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800/60',
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink-400">
        <span>{spec.scaleLabels?.[0]}</span>
        <span>{spec.scaleLabels?.[1]}</span>
      </div>
      {error && <p className="mt-1 text-[11px] font-medium text-rose-600">{error}</p>}
    </div>
  );
}

export default function Wellness() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<WellnessInput>({ ...EMPTY_FORM });
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState(false);

  const query = useQuery({
    queryKey: ['wellness'],
    queryFn: () => api.get<WellnessResponse>('/api/wellness?days=60'),
  });

  const todayKey = query.data?.today.date ?? null;
  const activeDate = selected ?? todayKey;

  // Load the selected day into the form whenever the selection or the data
  // changes. A day with no record starts blank rather than inheriting the
  // previous day's numbers, which would record a fiction.
  useEffect(() => {
    if (!query.data || !activeDate) return;
    const day = query.data.series.find((d) => d.date === activeDate);
    setForm(toForm(day));
    setNotes(day?.notes ?? '');
    setTouched(false);
  }, [query.data, activeDate]);

  const errors = useMemo(() => validateWellness(form), [form]);
  const errorFor = (key: WellnessField) => errors.find((e) => e.key === key)?.message;
  const filled = useMemo(() => completionOf(form), [form]);

  const save = useMutation({
    mutationFn: () =>
      api.put('/api/wellness', {
        date: activeDate,
        ...form,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wellness'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['activity'] });
      toast(activeDate === todayKey ? 'Today’s wellness saved.' : `${dayLabel(activeDate!)} saved.`, 'success');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />;
  }

  const data = query.data!;
  const canSave = hasAnyValue(form) || Boolean(notes.trim());
  const noneEverLogged = data.coverage.logged === 0;

  const moveDay = (delta: number) => {
    if (!activeDate) return;
    const d = new Date(`${activeDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    const key = d.toISOString().slice(0, 10);
    if (key > (todayKey ?? '')) return;
    setSelected(key);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">Wellness</h1>
          <p className="mt-0.5 text-xs text-ink-500">
            Sleep, energy, stress and screen time. Everything is optional — a half-remembered day still counts.
          </p>
        </div>
        <Badge tone={data.coverage.logged >= 7 ? 'success' : 'neutral'}>
          {data.coverage.logged} of {data.coverage.of} days recorded
        </Badge>
      </div>

      {noneEverLogged && (
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
              <Flame className="h-4 w-4" />
            </div>
            <div className="text-[13px] leading-relaxed text-ink-600 dark:text-ink-300">
              <span className="font-semibold text-ink-900 dark:text-white">Nothing recorded yet.</span> Fill in today below
              and the analysis starts working. Comparisons between sleep, focus and screen time need about two weeks of
              days before they mean anything — until then this page will say so rather than draw a line through four
              points.
            </div>
          </div>
        </Card>
      )}

      {/* ── day picker ─────────────────────────────────────────── */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => moveDay(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[rgb(var(--border))] text-ink-500 transition hover:bg-ink-50 dark:hover:bg-ink-800/60"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="min-w-0 flex-1 text-center">
            <p className="text-[13px] font-bold text-ink-900 dark:text-white">{activeDate ? dayLabel(activeDate) : '—'}</p>
            <p className="text-[11px] text-ink-400">{activeDate}</p>
          </div>

          <button
            type="button"
            onClick={() => moveDay(1)}
            disabled={activeDate === todayKey}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[rgb(var(--border))] text-ink-500 transition hover:bg-ink-50 disabled:opacity-30 dark:hover:bg-ink-800/60"
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Last two weeks, one dot per day, so a missed day is visible. */}
        <div className="mt-3 flex flex-wrap gap-1">
          {data.series
            .slice(0, 14)
            .reverse()
            .map((d) => (
              <button
                key={d.date}
                type="button"
                onClick={() => setSelected(d.date)}
                title={`${d.date}${d.hasEntry ? ' — recorded' : ' — not recorded'}`}
                aria-label={`${d.date}${d.hasEntry ? ', recorded' : ', not recorded'}`}
                className={cn(
                  'h-6 w-6 rounded-md border text-[10px] font-semibold transition',
                  d.date === activeDate
                    ? 'border-brand-400 bg-brand-600 text-white'
                    : d.hasEntry
                      ? 'border-[rgb(var(--border))] bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-200'
                      : 'border-dashed border-[rgb(var(--border))] text-ink-300',
                )}
              >
                {d.date.slice(-2)}
              </button>
            ))}
        </div>
      </Card>

      {/* ── the form ───────────────────────────────────────────── */}
      <Card className="p-4 sm:p-5">
        <CardHeader
          title={activeDate === todayKey ? 'How is today going?' : `How was ${dayLabel(activeDate!)}?`}
          subtitle="Blank fields are simply not recorded. They are never counted as zero."
          icon={<HeartPulse className="h-4 w-4" />}
          action={<span className="text-[11px] font-semibold text-ink-400">{Math.round(filled * 100)}% filled</span>}
        />

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {WELLNESS_FIELDS.map((spec) => {
            if (spec.kind === 'scale') {
              return (
                <ScaleInput
                  key={spec.key}
                  spec={spec}
                  value={form[spec.key]}
                  onChange={(v) => {
                    setTouched(true);
                    setForm((f) => ({ ...f, [spec.key]: v }));
                  }}
                  error={touched ? errorFor(spec.key) : undefined}
                />
              );
            }
            const Icon = FIELD_ICONS[spec.key];
            return (
              <Field
                key={spec.key}
                label={
                  <span className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-ink-400" />
                    {spec.label}
                    <span className="font-normal text-ink-400">({spec.unit})</span>
                  </span>
                }
                hint={spec.hint}
                error={touched ? errorFor(spec.key) : undefined}
              >
                <Input
                  type="number"
                  inputMode="decimal"
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  placeholder="—"
                  value={form[spec.key] ?? ''}
                  onChange={(e) => {
                    setTouched(true);
                    const raw = e.target.value;
                    setForm((f) => ({ ...f, [spec.key]: raw === '' ? null : Number(raw) }));
                  }}
                />
              </Field>
            );
          })}
        </div>

        <div className="mt-4">
          <Field label="Notes (optional)" hint="Anything worth remembering about the day.">
            <Textarea rows={2} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder="Slept badly, big deadline, long walk…" />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-ink-400">
            {errors.length > 0
              ? `${errors.length} field${errors.length === 1 ? '' : 's'} need attention.`
              : canSave
                ? 'Saves over this day if it already had a record.'
                : 'Enter at least one value to save.'}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setForm({ ...EMPTY_FORM });
                setNotes('');
                setTouched(false);
              }}
            >
              Clear
            </Button>
            <Button
              onClick={() => {
                setTouched(true);
                if (errors.length) return;
                save.mutate();
              }}
              loading={save.isPending}
              disabled={!canSave || errors.length > 0}
              icon={<Check className="h-4 w-4" />}
            >
              Save {activeDate === todayKey ? 'today' : 'day'}
            </Button>
          </div>
        </div>
      </Card>

      {/* ── averages, only once there is something to average ───── */}
      <Card className="p-4 sm:p-5">
        <CardHeader title="Your averages" subtitle="Across the days you have recorded, not all days." icon={<Clock className="h-4 w-4" />} />
        {data.coverage.logged === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon={<Activity className="h-5 w-5" />}
              title="No averages yet"
              description="Averages appear once you have recorded at least one day. They are computed only from days you filled in, so a missed day never drags them down."
            />
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { key: 'sleepHours', label: 'Sleep', unit: 'h' },
              { key: 'sleepQuality', label: 'Sleep quality', unit: '/5' },
              { key: 'energyLevel', label: 'Energy', unit: '/5' },
              { key: 'stressLevel', label: 'Stress', unit: '/5' },
              { key: 'exerciseMinutes', label: 'Exercise', unit: 'min' },
              { key: 'screenHours', label: 'Screen', unit: 'h' },
              { key: 'moodScore', label: 'Mood', unit: '/5' },
              { key: 'focusLevel', label: 'Focus', unit: '/5' },
            ].map((m) => (
              <div key={m.key} className="rounded-xl border border-[rgb(var(--border))] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">{m.label}</p>
                <p className="mt-1 font-display text-lg font-extrabold tabular-nums text-ink-900 dark:text-white">
                  {data.averages[m.key] ?? '—'}
                  {data.averages[m.key] !== null && <span className="ml-0.5 text-[11px] font-semibold text-ink-400">{m.unit}</span>}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
