/**
 * enable_landing_real_fallback, readable outside React (native deep links, the push tap
 * handler, home's fast-start guard). Same pattern as src/lib/fast-startup/flag.ts: it reads
 * the last-known flags cache useFeatureFlags writes (FLAGS_CACHE_KEY, mirrored here so this
 * module stays import-free — a test pins the two together). The flag has no super-admin
 * override, so the raw cached value is exactly what the hook (useLandingRealFallback) sees.
 *
 * SSR / tests / private mode / no cache yet → false (fail-closed = today's /gateway routing).
 */
export const LANDING_FLAGS_CACHE_KEY_MIRROR = 'out-feature-flags-v1';

export function isLandingRealFallbackOn(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const raw = window.localStorage.getItem(LANDING_FLAGS_CACHE_KEY_MIRROR);
    if (!raw) return false;
    const data = JSON.parse(raw) as Record<string, unknown>;
    return data.enableLandingRealFallback === true;
  } catch {
    return false;
  }
}
