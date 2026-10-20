/**
 * Entry flow v2 step bar — pure state (no React). Shared by the location step
 * (C1, step 1) and the "what now" step (C2, steps 2–3).
 */

export type StepBarState = 'done' | 'current' | 'future';

export interface StepBarSegment {
  /** 1-based step number. */
  step: number;
  label: string;
  state: StepBarState;
}

/** The entry flow's three steps (Hebrew copy, verbatim from the design). */
export const ENTRY_STEP_LABELS = ['1. האזור שלך', '2. מה בא לך', '3. מתאימים לך'] as const;

export interface BuildStepBarOptions {
  /** 1-based current step; values outside 1..n are clamped. */
  current: number;
  labels?: readonly string[];
  /** Appended to the LAST label, e.g. " · רשות". */
  lastLabelSuffix?: string;
}

export function buildStepBarSegments({
  current,
  labels = ENTRY_STEP_LABELS,
  lastLabelSuffix,
}: BuildStepBarOptions): StepBarSegment[] {
  const n = labels.length;
  if (n === 0) return [];
  const cur = Math.min(Math.max(Math.round(Number.isFinite(current) ? current : 1), 1), n);
  return labels.map((label, i) => {
    const step = i + 1;
    const state: StepBarState = step < cur ? 'done' : step === cur ? 'current' : 'future';
    const text = i === n - 1 && lastLabelSuffix ? `${label}${lastLabelSuffix}` : label;
    return { step, label: text, state };
  });
}
