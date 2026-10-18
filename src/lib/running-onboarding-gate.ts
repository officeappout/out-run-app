import { hasAnsweredPersona } from './persona-declaration';
import { isRunningScheduleUserConfirmed } from './running-schedule-source';
import { hasRunningTrack, hasStrengthTrack } from './track-ownership';
import { countStrengthTemplateDays, type ResolveSlug } from '@/features/schedule/engine/strengthVocabulary';

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

// ── Second track → the schedule-builder drawer, not the wizard ─────────────
// Owner decision 01.09.2026 (+ schedule-builder-drawer-spec.md ת6): the FIRST
// registration (one track) keeps the blurred card + LifestyleWizard exactly as
// today. A user who ADDS a second track (a strength user who adds running, or a
// runner who adds strength) is sent to ScheduleBuilderDrawer instead, and is never
// asked the persona question again ("מה שכבר עניתי עליו פעם אחת — לא שואלים אותי שוב").
//
// The signal is the one the spec itself names (ת6: "two domains via two separate
// events"; "there is no state of picking two tracks in one registration"): the user
// owns BOTH tracks (track-ownership.ts's hasStrengthTrack + hasRunningTrack — the same
// predicates resolveTabLocks / the weaver gate on) AND already answered persona. No new
// field, no stored isHybrid (the spec forbids one) — the decision is computed.
//
// "Done arranging" for a second-track user = both halves are real choices:
//   running  — isRunningScheduleUserConfirmed (running.scheduleDaysSource === 'user-chosen')
//   strength — the recurring template carries at least one strength id
//              (countStrengthTemplateDays, the one strength vocabulary). A runner who
//              added strength never went through ScheduleStep, so their template only
//              holds running ids until the drawer saves.

export type ScheduleCardCtaTarget = 'wizard' | 'drawer';

export interface ScheduleCardDecision {
  /** The value for SmartWeeklySchedule's hasSchedule prop (false = blurred card + CTA). */
  hasScheduleAndPersona: boolean;
  /** Where the card's CTA (and the ?openWizard=true deep link) leads. */
  ctaTarget: ScheduleCardCtaTarget;
}

type SecondTrackProfile = GateProfile & {
  progression?: {
    domains?: Record<string, { currentLevel?: number; level?: number } | null | undefined>;
    tracks?: Record<string, { currentLevel?: number; level?: number } | null | undefined>;
  };
  lifestyle?: { recurringTemplate?: Partial<Record<string, string[] | undefined>> | null } | null;
};

/** Owns both tracks and already answered persona — the second-track case. */
export function isSecondTrackUser(profile: SecondTrackProfile | null | undefined): boolean {
  return hasAnsweredPersona(profile) && hasStrengthTrack(profile) && hasRunningTrack(profile);
}

/**
 * @param opts.gateEnabled        RUNNING_ONBOARDING_GATE_ENABLED (resolved, incl. its localStorage override)
 * @param opts.secondTrackDrawer  SCHEDULE_BUILDER_SAVE_V1 && SCHEDULE_BUILDER_DRAWER_ENABLED (resolved)
 *
 * Either flag off → byte-identical to resolveCardHasScheduleAndPersona + the wizard.
 */
export function resolveScheduleCardDecision(
  profile: SecondTrackProfile | null | undefined,
  hasSchedule: boolean,
  opts: { gateEnabled: boolean; secondTrackDrawer: boolean; resolveSlug?: ResolveSlug },
): ScheduleCardDecision {
  const legacy: ScheduleCardDecision = {
    hasScheduleAndPersona: resolveCardHasScheduleAndPersona(profile, hasSchedule, opts.gateEnabled),
    ctaTarget: 'wizard',
  };
  if (!opts.gateEnabled || !opts.secondTrackDrawer || !isSecondTrackUser(profile)) return legacy;
  const strengthArranged = (countStrengthTemplateDays(profile?.lifestyle?.recurringTemplate, opts.resolveSlug) ?? 0) > 0;
  return {
    hasScheduleAndPersona: strengthArranged && isRunningScheduleUserConfirmed(profile),
    ctaTarget: 'drawer',
  };
}
