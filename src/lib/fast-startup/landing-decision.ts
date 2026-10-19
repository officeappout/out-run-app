/**
 * Where `/` sends a signed-in user whose users/{uid} doc exists — the ONE copy of that
 * decision. src/app/page.tsx (the authoritative server-checked path), the fast path that
 * runs from the persisted profile before auth restores, and the home guard that re-checks
 * the fast path all call this, so they can never disagree.
 *
 * Pure: no Firebase, no browser APIs. The doc-missing branch (MAP_ONLY recovery / gateway)
 * stays in page.tsx — it needs async prefs and a write.
 */
export type LandingRoute =
  | '/onboarding-new/profile'
  | '/onboarding-new/assessment-visual'
  | '/onboarding-new/health'
  | '/home'
  | '/explorer'
  | '/gateway';

export interface LandingUserFields {
  onboardingStatus?: unknown;
  onboardingStep?: unknown;
  onboardingPath?: unknown;
  onboardingComplete?: unknown;
}

/** Mirrors the branch order page.tsx has always used — order matters (IN_PROGRESS first). */
export function decideLandingRoute(data: LandingUserFields | null | undefined): LandingRoute {
  const status = data?.onboardingStatus;
  const step = data?.onboardingStep;
  const path = data?.onboardingPath;

  if (status === 'IN_PROGRESS' && step === 'IDENTITY') return '/onboarding-new/profile';
  if (status === 'IN_PROGRESS' && step === 'ASSESSMENT') return '/onboarding-new/assessment-visual';
  if (status === 'IN_PROGRESS' && step === 'VISUAL_ASSESSMENT_COMPLETE') return '/onboarding-new/health';
  if (status === 'IN_PROGRESS' && step === 'HEALTH') return '/onboarding-new/health';
  if (status === 'PENDING_LIFESTYLE') return '/home';
  if (status === 'COMPLETED' || data?.onboardingComplete) return '/home';
  if (path === 'MAP_ONLY' || status === 'MAP_ONLY') return '/explorer';
  return '/gateway';
}

export interface FastPathInput {
  /** out:has-session === '1' (set on sign-in, cleared only by signOutUser). */
  hasSessionHint: boolean;
  /** uid this device last saw Firebase restore (session-uid.ts). */
  lastAuthUid: string | null;
  /** The persisted zustand profile (out-user-storage), or null. */
  persistedProfile: (LandingUserFields & { id?: unknown }) | null;
}

/**
 * True only when every local signal agrees this is a returning, fully-onboarded user whose
 * persisted profile belongs to the account Firebase last restored. Anything missing or
 * mismatched → false → the normal wait-for-auth + server getDoc path.
 */
export function canFastPathToHome(input: FastPathInput): boolean {
  const { hasSessionHint, lastAuthUid, persistedProfile } = input;
  if (!hasSessionHint || !lastAuthUid || !persistedProfile) return false;
  if (typeof persistedProfile.id !== 'string' || persistedProfile.id !== lastAuthUid) return false;
  return decideLandingRoute(persistedProfile) === '/home';
}

/**
 * Home's re-check after a fast path (useFastStartGuard): where to go, or null to stay.
 *   authUid       — who Firebase restored (null = nobody);
 *   doc           — 'missing' | the users doc data | 'unknown' (timeout / offline / error).
 */
export function fastStartGuardTarget(input: {
  expectedUid: string;
  authUid: string | null;
  doc: 'missing' | 'unknown' | LandingUserFields;
}): LandingRoute | '/' | null {
  if (!input.authUid || input.authUid !== input.expectedUid) return '/';
  if (input.doc === 'unknown') return null;
  if (input.doc === 'missing') return '/';
  const route = decideLandingRoute(input.doc);
  return route === '/home' ? null : route;
}
