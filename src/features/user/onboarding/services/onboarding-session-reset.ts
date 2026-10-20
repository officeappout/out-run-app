/**
 * Per-user onboarding state that must not outlive the account it belongs to.
 *
 * Signing out (or switching accounts in the same session) used to leave the
 * previous user's onboarding store data (e.g. healthDeclarationAccepted — which
 * /onboarding-new/health trusts to auto-skip), the gateway identity
 * (`gateway_uid`, used by the profile page as a uid fallback), the chosen track
 * and the in-progress sessionStorage answers in place for the next account.
 *
 * Device-level preferences (language, last GPS fix, audio, …) are deliberately
 * kept. Cold starts never reset anything — see shouldResetOnboardingSession.
 */
import { useOnboardingStore } from '../store/useOnboardingStore';
import { removeOnboardingPref } from '@/lib/onboardingPrefs';

/** Durable prefs (localStorage + native Preferences) that identify the onboarding user. */
export const PER_USER_ONBOARDING_PREFS = ['gateway_uid', 'gateway_track', 'onboarding_path'] as const;

/** sessionStorage keys outside the `onboarding_` prefix that are per-user. */
export const PER_USER_SESSION_KEYS = [
  'gateway_uid',
  'gateway_track',
  'jit_return_to',
  'selected_authority_id',
  'selected_neighborhood_id',
  'selected_anchor_lat',
  'selected_anchor_lng',
] as const;

/** `onboarding_*` sessionStorage keys that are device/UI preferences, not user data. */
const KEPT_SESSION_KEYS = new Set(['onboarding_language']);

export function isPerUserSessionKey(key: string): boolean {
  if (KEPT_SESSION_KEYS.has(key)) return false;
  return key.startsWith('onboarding_') || (PER_USER_SESSION_KEYS as readonly string[]).includes(key);
}

/**
 * Reset only on a transition observed in THIS session from a known user to
 * nobody (sign-out) or to a different user (account switch). The first auth
 * emission (cold start: prev undefined) and null → user (sign-in) never reset —
 * MAP_ONLY recovery and the gateway → profile hand-off rely on those prefs.
 */
export function shouldResetOnboardingSession(
  prevUid: string | null | undefined,
  nextUid: string | null,
): boolean {
  if (!prevUid) return false;
  return prevUid !== nextUid;
}

function clearPerUserSessionStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const store = window.sessionStorage;
    const keys: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key && isPerUserSessionKey(key)) keys.push(key);
    }
    keys.forEach((key) => store.removeItem(key));
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

/** Wipe the previous account's onboarding state. Safe to call more than once. */
export function resetOnboardingSession(): void {
  useOnboardingStore.getState().reset();
  clearPerUserSessionStorage();
  PER_USER_ONBOARDING_PREFS.forEach((key) => removeOnboardingPref(key));
}
