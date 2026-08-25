/**
 * onboarding-entry.ts
 *
 * Shared "add/complete a track" entry-point resolution for surfaces outside
 * the primary onboarding flow (ConsistencyWidget, ProgramProgressRow) — a
 * returning user with a known identity skips the shared identity form
 * (/onboarding-new/profile) and lands directly on the next real step, the
 * same way ProfileProgressBar's jitPath already does for running completion
 * items. Both call sites must go through this single function — see the
 * sessionStorage backfill below for why duplicating this logic is unsafe.
 */

import type { UserFullProfile } from '@/features/user/core/types/user.types';
import { setOnboardingPref } from '@/lib/onboardingPrefs';

export type OnboardingTrack = 'STRENGTH' | 'RUNNING';

/**
 * True when /onboarding-new/profile has nothing left to collect — name,
 * gender, and birthDate are exactly the 3 fields IdentityProfilePage gathers
 * (mirrors its own isFormComplete check, profile/page.tsx).
 */
export function hasKnownIdentity(profile: UserFullProfile | null | undefined): boolean {
  return !!(profile?.core?.name && profile?.core?.gender && profile?.core?.birthDate);
}

/**
 * Backfills the onboarding_personal_* sessionStorage keys from the profile —
 * same pattern already established at home/page.tsx's handleHeroPress (only
 * fills a key that isn't already set). Both tracks' screens read these
 * directly downstream (HealthDeclarationStep, PersonaStep, dynamic/page.tsx's
 * own gender-personalized copy and engine.initialize() gender arg, etc.) —
 * skipping the identity form means nothing else ever seeds them for a
 * bypassed user, and several of those readers default to 'male' when the key
 * is missing, silently breaking Hebrew grammar for anyone else.
 */
function backfillPersonalSessionStorage(profile: UserFullProfile | null | undefined): void {
  if (typeof window === 'undefined') return;

  if (profile?.core?.name && !sessionStorage.getItem('onboarding_personal_name')) {
    sessionStorage.setItem('onboarding_personal_name', profile.core.name);
  }
  if (profile?.core?.gender && !sessionStorage.getItem('onboarding_personal_gender')) {
    sessionStorage.setItem('onboarding_personal_gender', profile.core.gender);
  }
  if (profile?.core?.birthDate && !sessionStorage.getItem('onboarding_personal_dob')) {
    const bd = profile.core.birthDate;
    const date = bd instanceof Date ? bd : new Date(bd as unknown as string);
    if (!isNaN(date.getTime())) {
      sessionStorage.setItem('onboarding_personal_dob', date.toISOString().split('T')[0]);
    }
  }
}

/**
 * Seeds gateway_track and backfills the sessionStorage identity fields for a
 * caller that already navigates to a fixed target (a static href or a known
 * route) rather than needing one resolved — RunForecastWidget,
 * StrengthVolumeWidget, PerformanceMetricsRow, StatsOverview's Reset/Rebuild.
 * These surfaces only render for a user with an already-established program
 * (dashboardMode/hasStrengthSurvey/hasRunSurvey gates upstream), so identity
 * is always known in practice — this just prepares the same side effects
 * resolveOnboardingEntryHref would, without the href-resolution branch.
 */
export function seedOnboardingTrackEntry(
  profile: UserFullProfile | null | undefined,
  track: OnboardingTrack,
): void {
  setOnboardingPref('gateway_track', track);
  backfillPersonalSessionStorage(profile);
}

/**
 * Resolves where an "add/complete a track" CTA should navigate, seeding
 * gateway_track (the signal program-path/dynamic read to pick a branch) as a
 * side effect. Known identity → skip straight to the track's next step
 * (program-path for strength, dynamic for running), backfilling the
 * sessionStorage identity fields those screens read. Unknown identity →
 * today's behavior: the shared identity form.
 */
export function resolveOnboardingEntryHref(
  profile: UserFullProfile | null | undefined,
  track: OnboardingTrack,
): string {
  seedOnboardingTrackEntry(profile, track);

  if (!hasKnownIdentity(profile)) {
    return '/onboarding-new/profile';
  }

  return track === 'RUNNING' ? '/onboarding-new/dynamic' : '/onboarding-new/program-path';
}
