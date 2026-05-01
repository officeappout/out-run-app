/**
 * Analytics consent — GDPR / Israeli Privacy Law (Compliance Phase 5.1).
 *
 * Two layers, both gated by the same per-user boolean
 * `users/{uid}.core.analyticsOptOut` (default false → analytics ON):
 *
 *   1. Custom event telemetry (AnalyticsService → analytics_events)
 *      `isCustomAnalyticsAllowed()` checks the Zustand user store and is
 *      called from `AnalyticsService.logEvent` before any Firestore write.
 *
 *   2. Firebase Analytics (GA4) collection
 *      `applyAnalyticsConsent(optOut)` toggles
 *      `setAnalyticsCollectionEnabled(analytics, !optOut)` on the GA SDK
 *      instance initialised in `lib/firebase.ts`. Call it whenever the
 *      toggle changes AND once at login/hydration time so the user's
 *      preference persists across sessions.
 *
 * Failure modes are intentionally fail-OPEN for analytics (i.e. if the
 * store is not available, default to allowing analytics) so a bug here
 * never silently breaks our funnels. The Firestore field is the source
 * of truth — once it's read by the app, the gate engages.
 */

import { setAnalyticsCollectionEnabled } from 'firebase/analytics';
import { analytics } from '@/lib/firebase';

/**
 * Toggle the Firebase Analytics SDK collection state.
 * Safe to call from anywhere; no-op on the server or when GA is unavailable.
 */
export function applyAnalyticsConsent(optOut: boolean): void {
  if (typeof window === 'undefined') return;
  if (!analytics) return;
  try {
    setAnalyticsCollectionEnabled(analytics, !optOut);
  } catch (e) {
    console.warn('[analytics-consent] setAnalyticsCollectionEnabled failed:', e);
  }
}

/**
 * Read the current opt-out state from the user store. Returns `true`
 * (allowed) if the store is empty / not yet hydrated — so we never
 * accidentally suppress events during boot. Once a logged-in user with
 * `analyticsOptOut: true` is loaded, subsequent calls return `false`.
 */
export function isCustomAnalyticsAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // Lazy require to avoid a circular dep with AnalyticsService → user store.
    const mod = require('@/features/user/identity/store/useUserStore');
    const state = mod.useUserStore?.getState?.();
    return !state?.profile?.core?.analyticsOptOut;
  } catch {
    return true;
  }
}
