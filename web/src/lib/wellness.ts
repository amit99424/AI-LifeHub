/**
 * Wellness input validation, shared by the API and the daily form.
 *
 * The rules live here so the browser and the server cannot disagree about what
 * counts as a valid day. The browser uses them for inline messages and to
 * disable the save button; the server uses them as the actual gate.
 *
 * The one decision worth stating: an empty field is NOT zero. Null means "not
 * reported", and every average and correlation downstream filters nulls out
 * rather than treating them as a zero, which would drag every mean toward the
 * floor on a day the person simply did not fill the form in.
 */

export interface WellnessInput {
  sleepHours: number | null;
  exerciseMinutes: number | null;
  screenHours: number | null;
  stressLevel: number | null;
  energyLevel: number | null;
  sleepQuality: number | null;
  moodScore: number | null;
  focusLevel: number | null;
}

export type WellnessField = keyof WellnessInput;

export interface FieldSpec {
  key: WellnessField;
  label: string;
  /** What the number means, in one line, for the hint under the input. */
  hint: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  /** 1-5 self-reports get a scale widget; hours and minutes get a number input. */
  kind: 'hours' | 'minutes' | 'scale';
  /** Labels for the ends of a 1-5 scale. */
  scaleLabels?: [string, string];
  /** Whether a lower number is better (stress), used for the colour of the chip. */
  lowerIsBetter?: boolean;
}

export const WELLNESS_FIELDS: FieldSpec[] = [
  {
    key: 'sleepHours',
    label: 'Sleep',
    hint: 'Hours slept last night. Count from when you actually fell asleep.',
    unit: 'h',
    min: 0,
    max: 24,
    step: 0.25,
    kind: 'hours',
  },
  {
    key: 'sleepQuality',
    label: 'Sleep quality',
    hint: 'How rested did you wake up?',
    unit: '/5',
    min: 1,
    max: 5,
    step: 1,
    kind: 'scale',
    scaleLabels: ['Restless', 'Deeply rested'],
  },
  {
    key: 'energyLevel',
    label: 'Energy',
    hint: 'How much energy did you have through the day?',
    unit: '/5',
    min: 1,
    max: 5,
    step: 1,
    kind: 'scale',
    scaleLabels: ['Drained', 'Full of energy'],
  },
  {
    key: 'stressLevel',
    label: 'Stress',
    hint: 'How pressured did the day feel?',
    unit: '/5',
    min: 1,
    max: 5,
    step: 1,
    kind: 'scale',
    scaleLabels: ['Calm', 'Overwhelmed'],
    lowerIsBetter: true,
  },
  {
    key: 'moodScore',
    label: 'Mood',
    hint: 'Your overall mood for the day.',
    unit: '/5',
    min: 1,
    max: 5,
    step: 1,
    kind: 'scale',
    scaleLabels: ['Low', 'Great'],
  },
  {
    key: 'focusLevel',
    label: 'Focus',
    hint: 'How well could you concentrate?',
    unit: '/5',
    min: 1,
    max: 5,
    step: 1,
    kind: 'scale',
    scaleLabels: ['Scattered', 'Locked in'],
  },
  {
    key: 'exerciseMinutes',
    label: 'Exercise',
    hint: 'Any movement that raised your heart rate.',
    unit: 'min',
    min: 0,
    max: 600,
    step: 5,
    kind: 'minutes',
  },
  {
    key: 'screenHours',
    label: 'Screen time',
    hint: 'Non-work scrolling and watching. Best guess is fine.',
    unit: 'h',
    min: 0,
    max: 24,
    step: 0.5,
    kind: 'hours',
  },
];

/** The subset that a single wellness form submits. */
export const WELLNESS_FORM_FIELDS = WELLNESS_FIELDS;

export interface FieldError {
  key: WellnessField;
  message: string;
}

/**
 * Validate one day's entry.
 *
 * Returns errors keyed by field so the form can show each one in place. A null
 * is always valid: leaving a field blank is a legitimate answer and must never
 * block a save.
 */
export function validateWellness(input: Partial<Record<WellnessField, unknown>>): FieldError[] {
  const errors: FieldError[] = [];
  for (const spec of WELLNESS_FIELDS) {
    const raw = input[spec.key];
    if (raw === null || raw === undefined || raw === '') continue;
    const value = typeof raw === 'string' ? Number(raw) : raw;
    if (typeof value !== 'number' || Number.isNaN(value)) {
      errors.push({ key: spec.key, message: `${spec.label} must be a number.` });
      continue;
    }
    if (!Number.isFinite(value)) {
      errors.push({ key: spec.key, message: `${spec.label} is not a valid number.` });
      continue;
    }
    if (value < spec.min || value > spec.max) {
      errors.push({
        key: spec.key,
        message:
          spec.kind === 'scale'
            ? `${spec.label} must be between ${spec.min} and ${spec.max}.`
            : `${spec.label} must be between ${spec.min} and ${spec.max} ${spec.unit}.`,
      });
      continue;
    }
    if (spec.kind === 'scale' && !Number.isInteger(value)) {
      errors.push({ key: spec.key, message: `${spec.label} must be a whole number.` });
      continue;
    }
    if (spec.kind === 'hours' && Math.round(value / spec.step) * spec.step !== value) {
      errors.push({ key: spec.key, message: `${spec.label} is recorded in steps of ${spec.step}h.` });
    }
  }
  return errors;
}

/** True when the form has at least one value to save. */
export function hasAnyValue(input: Partial<Record<WellnessField, unknown>>): boolean {
  return WELLNESS_FIELDS.some((f) => {
    const v = input[f.key];
    return v !== null && v !== undefined && v !== '';
  });
}

/**
 * How complete a day is, 0-1, used for the "you have filled 5 of 8" line and
 * for the empty-state copy. Counts fields the person actually reported.
 */
export function completionOf(input: Partial<Record<WellnessField, unknown>>): number {
  const filled = WELLNESS_FIELDS.filter((f) => {
    const v = input[f.key];
    return v !== null && v !== undefined && v !== '';
  }).length;
  return filled / WELLNESS_FIELDS.length;
}
