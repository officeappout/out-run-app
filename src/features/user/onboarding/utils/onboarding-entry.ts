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
import { hasKnownIdentity as hasKnownIdentityFromCore } from '@/lib/identity';

export type OnboardingTrack = 'STRENGTH' | 'RUNNING';

/**
 * True when /onboarding-new/profile has nothing left to collect — name,
 * gender, and birthDate are exactly the 3 fields IdentityProfilePage gathers
 * (mirrors its own isFormComplete check, profile/page.tsx). Thin wrapper
 * around the shared core-level definition in @/lib/identity — that's the one
 * place this rule is actually defined; complete-profile/route.ts calls the
 * same function server-side rather than inventing its own check.
 */
export function hasKnownIdentity(profile: UserFullProfile | null | undefined): boolean {
  return hasKnownIdentityFromCore(profile?.core);
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
    // Mirrors useUserStore.ts's reviveDates handling exactly: core.birthDate is
    // typed as Date, but a raw Firestore Timestamp ({seconds, nanoseconds}) is
    // not `instanceof Date` and `new Date(timestamp)` silently produces Invalid
    // Date — the same failure mode reviveDates's own comment documents already
    // happened once for activePrograms.startDate ("turned Timestamps into
    // Invalid Date, which crashed toISOString()"). Check the {seconds} shape
    // first before falling back to the Date constructor.
    const raw = profile.core.birthDate as unknown;
    const date =
      typeof raw === 'object' && raw !== null && typeof (raw as { seconds?: unknown }).seconds === 'number'
        ? new Date((raw as { seconds: number }).seconds * 1000)
        : new Date(raw as string | number | Date);
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
