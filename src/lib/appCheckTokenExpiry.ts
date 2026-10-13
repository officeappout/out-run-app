/**
 * appCheckTokenExpiry.ts — pure helpers for the native App Check CustomProvider
 * in firebase.ts. Kept pure so the loop-safety invariant is unit-tested.
 *
 * THE BUG (hypothesis from code, 13.10.2026; confirmed or refuted by the
 * temporary `appCheckTelemetry` events): the CustomProvider used to report a
 * FIXED `now + 50 min` expiry for whatever token the native plugin handed
 * over — but `getToken({forceRefresh:false})` returns the native SDK's CACHED
 * token, whose real remaining life can be anywhere from ~0 to the full TTL.
 * The web SDK trusted the 50-min claim, kept sending a token that had already
 * expired natively, and Google classified those requests as Invalid.
 *
 * THE FIX: report the plugin's real `expireTimeMillis` (minus a small safety
 * margin), and if the cached token is nearly dead, fetch one fresh token.
 *
 * LOOP SAFETY (why the numbers are what they are): the web SDK schedules its
 * next refresh at  max(0, min(issued + 50%·life + 5 min, expiry − 5 min) − now)
 * (@firebase/app-check, proactive refresh). If we ever reported an expiry
 * less than ~5 min away, that wait becomes 0 and the SDK would call
 * getToken() again immediately, forever — a tight loop on a rate-limited
 * attestation API. Hence MIN_REPORTED_LIFE_MS (> the SDK's 5-min offset) is a
 * hard floor on what we report, and FORCE_REFRESH_BELOW_MS (> the floor)
 * means a token we hand over has comfortably more life than the floor
 * whenever a forced refresh succeeded.
 */

/** The web SDK refreshes this long before the expiry we report. */
export const SDK_REFRESH_OFFSET_MS = 5 * 60 * 1_000;
/** Fetch a fresh token when the cached one has less than this left. */
export const FORCE_REFRESH_BELOW_MS = 10 * 60 * 1_000;
/** Don't force-refresh more often than this (attestation APIs are rate-limited). */
export const MIN_FORCE_REFRESH_INTERVAL_MS = 2 * 60 * 1_000;
/** Reported expiry = real expiry − this, to absorb clock skew. */
export const SAFETY_MARGIN_MS = 60 * 1_000;
/** Never report less life than this (must exceed SDK_REFRESH_OFFSET_MS). */
export const MIN_REPORTED_LIFE_MS = 6 * 60 * 1_000;
/** Previous behaviour — still used if the plugin gives no usable expiry. */
export const LEGACY_REPORTED_TTL_MS = 50 * 60 * 1_000;

function isUsable(nativeExpireMs: number | undefined): nativeExpireMs is number {
  return typeof nativeExpireMs === 'number' && Number.isFinite(nativeExpireMs) && nativeExpireMs > 0;
}

/**
 * True when the cached native token is close to expiry AND we haven't
 * force-refreshed too recently. Unknown expiry => false (keep old behaviour).
 */
export function shouldForceRefresh(
  nowMs: number,
  nativeExpireMs: number | undefined,
  lastForcedAtMs: number | null,
): boolean {
  if (!isUsable(nativeExpireMs)) return false;
  if (nativeExpireMs - nowMs >= FORCE_REFRESH_BELOW_MS) return false;
  return lastForcedAtMs === null || nowMs - lastForcedAtMs >= MIN_FORCE_REFRESH_INTERVAL_MS;
}

/**
 * The `expireTimeMillis` to hand to the web SDK. Real expiry minus the safety
 * margin, floored so the SDK can never schedule an immediate refresh loop.
 * No usable native expiry => the legacy fixed TTL.
 */
export function reportedExpiry(nowMs: number, nativeExpireMs: number | undefined): number {
  if (!isUsable(nativeExpireMs)) return nowMs + LEGACY_REPORTED_TTL_MS;
  return Math.max(nativeExpireMs - SAFETY_MARGIN_MS, nowMs + MIN_REPORTED_LIFE_MS);
}
