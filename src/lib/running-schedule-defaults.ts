import { getSmartDefaultDays } from './running-schedule-smart-defaults';

/**
 * 2a (idempotent-booping-sunrise.md) — the silent system-default a first-
 * time signup writes now that the day-question moved out of the running
 * onboarding flow (RunningScheduleStep.tsx is a pass-through in signup
 * mode; the real first choice happens later, in LifestyleWizard via
 * commit 3's completeRunningScheduleFirstChoice).
 *
 * `profile` is accepted but currently ignored — a deliberate, documented
 * extension point (David): a future pass could tailor the default by
 * running history/ability instead of always the same recommended
 * frequency, without changing every call site's signature.
 *
 * RECOMMENDED_FREQUENCY here is a separate constant from
 * RunningScheduleStep.tsx's own same-valued one (used there for its
 * "recommended" badge and JIT-mode initial-value fallback) — same number
 * today by coincidence, not architecturally linked. If they ever need to
 * diverge (e.g. a different recommended value for the JIT picker vs. the
 * silent signup default), nothing here assumes they stay equal.
 */
const RECOMMENDED_FREQUENCY = 3;

export interface RunningScheduleSeedProfile {
  // Reserved for future profile-aware defaults — unused today.
}

export function resolveDefaultRunningSchedule(
  profile?: RunningScheduleSeedProfile | null,
): { frequency: number; dayIndices: number[] } {
  const frequency = RECOMMENDED_FREQUENCY;
  return { frequency, dayIndices: getSmartDefaultDays(frequency) };
}
