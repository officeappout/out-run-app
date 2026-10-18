import { pickRunDaysAvoidingStrength } from './running-schedule-smart-defaults';

/**
 * 2a (idempotent-booping-sunrise.md) — the silent system-default a first-
 * time signup writes now that the day-question moved out of the running
 * onboarding flow (RunningScheduleStep.tsx is a pass-through in signup
 * mode; the real first choice happens later, in LifestyleWizard via
 * commit 3's completeRunningScheduleFirstChoice).
 *
 * `profile` (18.10.2026, owner): its existing STRENGTH days are now read
 * (lifestyle.scheduleDays — the same field RunningScheduleStep shows as
 * "ימי הכוח שלך" — plus lifestyle.recurringTemplate days that carry at
 * least one program) and the run days are picked to avoid them where
 * possible (pickRunDaysAvoidingStrength). Frequency is unchanged: still
 * the same recommended value for everyone. No strength days -> exactly the
 * previous getSmartDefaultDays(frequency) result.
 *
 * RECOMMENDED_FREQUENCY here is a separate constant from
 * RunningScheduleStep.tsx's own same-valued one (used there for its
 * "recommended" badge and JIT-mode initial-value fallback) — same number
 * today by coincidence, not architecturally linked. If they ever need to
 * diverge (e.g. a different recommended value for the JIT picker vs. the
 * silent signup default), nothing here assumes they stay equal.
 */
const RECOMMENDED_FREQUENCY = 3;

const DAYS_HEBREW = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

/** The slice of UserProfile this default reads — structurally compatible with the store profile. */
export interface RunningScheduleSeedProfile {
  lifestyle?: {
    scheduleDays?: string[] | null;
    recurringTemplate?: Record<string, string[] | null | undefined> | null;
  } | null;
}

/** Strength-day indices (0=Sun..6=Sat) known from the profile, deduped and sorted. */
export function strengthDayIndicesFromProfile(
  profile?: RunningScheduleSeedProfile | null,
  extraStrengthDays: string[] = [],
): number[] {
  const letters = new Set<string>(extraStrengthDays);
  for (const d of profile?.lifestyle?.scheduleDays ?? []) letters.add(d);
  const tpl = profile?.lifestyle?.recurringTemplate ?? {};
  for (const [day, programs] of Object.entries(tpl)) {
    if (Array.isArray(programs) && programs.length > 0) letters.add(day);
  }
  return Array.from(letters)
    .map((l) => DAYS_HEBREW.indexOf(l))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
}

export function resolveDefaultRunningSchedule(
  profile?: RunningScheduleSeedProfile | null,
  /** Strength days (Hebrew letters) the caller already knows, merged with the profile's. */
  extraStrengthDays: string[] = [],
): { frequency: number; dayIndices: number[] } {
  const frequency = RECOMMENDED_FREQUENCY;
  const strength = strengthDayIndicesFromProfile(profile, extraStrengthDays);
  return { frequency, dayIndices: pickRunDaysAvoidingStrength(frequency, strength) };
}
