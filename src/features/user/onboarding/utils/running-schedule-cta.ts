/**
 * The running schedule screen's CTA + success labels.
 *
 * In the lifestyle wizard (isJIT) the user may be choosing running days for
 * the FIRST time (still on the signup's system default). "שמירת שינויים" /
 * "לוח ריצה עודכן!" read wrong there (19.10.2026 audit fix §3.10), so a first
 * choice says "שמירה" / "לוח ריצה נשמר!". A user who already chose days keeps
 * the edit wording.
 */

export interface RunningScheduleCtaInput {
  isJIT: boolean | undefined;
  isLastStep: boolean | undefined;
  /** running.scheduleDaysSource on the profile. */
  scheduleDaysSource: unknown;
}

export interface RunningScheduleCta {
  label: string;
  successLabel: string | undefined;
}

export function resolveRunningScheduleCta(input: RunningScheduleCtaInput): RunningScheduleCta {
  if (!input.isJIT) {
    return { label: input.isLastStep ? 'בואו נרוץ!' : 'המשך', successLabel: undefined };
  }
  const isFirstChoice = input.scheduleDaysSource !== 'user-chosen';
  return isFirstChoice
    ? { label: 'שמירה', successLabel: 'לוח ריצה נשמר!' }
    : { label: 'שמירת שינויים', successLabel: 'לוח ריצה עודכן!' };
}
