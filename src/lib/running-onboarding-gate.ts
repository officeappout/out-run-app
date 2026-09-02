import { hasAnsweredPersona } from './persona-declaration';
import { isRunningScheduleUserConfirmed } from './running-schedule-source';
import { hasRunningTrack } from './track-ownership';

type GateProfile = {
  running?: { isUnlocked?: unknown; scheduleDaysSource?: unknown };
  // Shaped to satisfy hasAnsweredPersona's own parameter type
  // (persona-declaration.ts, owned by a different, separately-in-flight
  // piece of work) — not restated/asserted here as this function's own
  // concept. Do not widen this back into a fallback chain of specific
  // field names (personaId / lifestyle.personaAnsweredAt /
  // onboardingAnswers.persona all died in the 01.09.2026 military-persona
  // redefinition) — this gate depends only on hasAnsweredPersona(profile)'s
  // *return value*, never on which field produced it.
  personas?: unknown[];
};

/**
 * The pure decision behind 2b's home-page schedule-card gate
 * (idempotent-booping-sunrise.md) — extracted out of `home/page.tsx` so
 * it's unit-testable (that file has no jsdom coverage). The
 * `localStorage`-reading runtime override
 * (`isRunningOnboardingGateEnabled()`, home/page.tsx) stays there — it
 * can't be tested without `window` anyway, and resolving `gateEnabled`
 * to a plain boolean before calling this keeps this function pure.
 *
 * `gateEnabled=false` returns `hasSchedule` untouched — byte-identical to
 * today for every user, running or not, regardless of profile shape.
 *
 * `gateEnabled=true`:
 *   running track (hasRunningTrack — has running unlocked at all, not
 *   "is running the active dashboard mode right now"):
 *     hasAnsweredPersona(profile) && isRunningScheduleUserConfirmed(profile)
 *   otherwise:
 *     hasSchedule && hasAnsweredPersona(profile)
 *
 * The persona half of both branches is exactly what `hasAnsweredPersona`
 * returns — nothing here reads a specific Firestore field, and this file
 * has no opinion on which forms that function recognizes underneath.
 */
export function resolveCardHasScheduleAndPersona(
  profile: GateProfile | null | undefined,
  hasSchedule: boolean,
  gateEnabled: boolean,
): boolean {
  if (!gateEnabled) return hasSchedule;
  return hasRunningTrack(profile)
    ? hasAnsweredPersona(profile) && isRunningScheduleUserConfirmed(profile)
    : hasSchedule && hasAnsweredPersona(profile);
}
