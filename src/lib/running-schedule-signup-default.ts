import { resolveDefaultRunningSchedule, type RunningScheduleSeedProfile } from './running-schedule-defaults';

const DAYS_HEBREW = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

export interface ResolveSignupDefaultWriteInput {
  isJIT: boolean | undefined;
  /** useUserStore's `_hasHydrated` — profile is async, must not be trusted before this is true. */
  hasHydrated: boolean;
  /** profile?.lifestyle?.scheduleDays ?? [] at call time. */
  strengthDays: string[];
  profile?: RunningScheduleSeedProfile | null;
}

export interface SignupDefaultWritePayload {
  runningWeeklyFrequency: number;
  runningScheduleDays: string[];
  runningScheduleDayIndices: number[];
  runningScheduleTime: string;
  scheduleDays: string[];
  runningScheduleDaysSource: 'system-default';
}

/**
 * 2a's signup pass-through, pure decision half — extracted out of
 * RunningScheduleStep.tsx (David, 02.09.2026 review) so the hydration-
 * gating bug that motivated it is actually testable: this repo's vitest
 * has no jsdom, so a component-level effect can't be exercised directly.
 *
 * Returns `null` when nothing should be written yet — either a JIT entry
 * (the interactive picker owns that case entirely) or `!hasHydrated`.
 * The hasHydrated gate is not cosmetic: `profile` is useUserStore-async
 * and can still be null on this component's very first mount, which would
 * otherwise compute `strengthDays` as `[]` and silently merge a default
 * that's missing the user's real strength days into `scheduleDays` — see
 * this file's caller (RunningScheduleStep.tsx) for the full incident this
 * closes, and parking-lot.md for why it's not yet visible in production
 * (onboarding-sync.service.ts:570's separate, still-open gate).
 *
 * The caller (the component's effect) is responsible for the write-once
 * ref, calling persistOnboardingData with the returned payload, and
 * calling onNext() — this function only decides whether to write and,
 * if so, exactly what.
 */
export function resolveSignupDefaultWrite(
  input: ResolveSignupDefaultWriteInput,
): SignupDefaultWritePayload | null {
  if (input.isJIT || !input.hasHydrated) return null;

  const { frequency, dayIndices } = resolveDefaultRunningSchedule(input.profile);
  const runningScheduleDays = dayIndices.map((i) => DAYS_HEBREW[i]).sort();
  const scheduleDays = Array.from(new Set([...input.strengthDays, ...runningScheduleDays]));

  return {
    runningWeeklyFrequency: frequency,
    runningScheduleDays,
    runningScheduleDayIndices: dayIndices,
    runningScheduleTime: '07:00',
    scheduleDays,
    runningScheduleDaysSource: 'system-default',
  };
}
