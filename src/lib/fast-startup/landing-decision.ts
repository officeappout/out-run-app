/**
 * Where `/` sends a signed-in user whose users/{uid} doc exists — the ONE copy of that
 * decision. src/app/page.tsx (the authoritative server-checked path), the fast path that
 * runs from the persisted profile before auth restores, and the home guard that re-checks
 * the fast path all call this, so they can never disagree.
 *
 * Pure: no Firebase, no browser APIs. The doc-missing branch (MAP_ONLY recovery / gateway, or
 * the quick-signup scaffold with enable_landing_real_fallback) stays in page.tsx — it needs async
 * prefs and a write.
 *
 * enable_landing_real_fallback (opts.realFallback, default off): the old '/gateway' branch —
 * unknown / missing status, and 'ONBOARDING' (written mid running questionnaire and by
 * firestore.service's self-heal) — becomes resolveFallbackLanding: a program → /home, else
 * /explorer. ONBOARDING is checked before the MAP_ONLY path so a MAP_ONLY user who already has a
 * program goes home. Off = exactly the old order and '/gateway'.
 */
import { resolveFallbackLanding } from '@/lib/landing-fallback/fallback-routes';

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
  /** Only read with opts.realFallback (has a program?). */
  progression?: unknown;
  running?: unknown;
}

export interface LandingDecisionOptions {
  /** enable_landing_real_fallback — never land on /gateway. */
  realFallback?: boolean;
}

/** Mirrors the branch order page.tsx has always used — order matters (IN_PROGRESS first). */
export function decideLandingRoute(
  data: LandingUserFields | null | undefined,
  opts: LandingDecisionOptions = {},
): LandingRoute {
  const status = data?.onboardingStatus;
  const step = data?.onboardingStep;
  const path = data?.onboardingPath;

  if (status === 'IN_PROGRESS' && step === 'IDENTITY') return '/onboarding-new/profile';
  if (status === 'IN_PROGRESS' && step === 'ASSESSMENT') return '/onboarding-new/assessment-visual';
  if (status === 'IN_PROGRESS' && step === 'VISUAL_ASSESSMENT_COMPLETE') return '/onboarding-new/health';
  if (status === 'IN_PROGRESS' && step === 'HEALTH') return '/onboarding-new/health';
  if (status === 'PENDING_LIFESTYLE') return '/home';
  if (status === 'COMPLETED' || data?.onboardingComplete) return '/home';
  if (opts.realFallback && status === 'ONBOARDING') return resolveFallbackLanding(data);
  if (path === 'MAP_ONLY' || status === 'MAP_ONLY') return '/explorer';
  return opts.realFallback ? resolveFallbackLanding(data) : '/gateway';
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
  // Deliberately without enable_landing_real_fallback: only the classic "done" states skip
  // the server check; an ONBOARDING / unknown-status user with a program takes the slow path.
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
  /** enable_landing_real_fallback — same option page.tsx passes to decideLandingRoute. */
  realFallback?: boolean;
}): LandingRoute | '/' | null {
  if (!input.authUid || input.authUid !== input.expectedUid) return '/';
  if (input.doc === 'unknown') return null;
  if (input.doc === 'missing') return '/';
  const route = decideLandingRoute(input.doc, { realFallback: input.realFallback });
  return route === '/home' ? null : route;
}
