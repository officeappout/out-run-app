/**
 * enable_fast_startup_v1, readable BEFORE the feature-flags snapshot lands.
 *
 * The startup code this flag gates runs on `/` while auth is still restoring and inside
 * isomorphic generator services — neither can wait for useFeatureFlags. It reads the same
 * last-known flags cache useFeatureFlags writes (FLAGS_CACHE_KEY in src/hooks/useFeatureFlags.ts,
 * mirrored here so this module stays import-free — a test pins the two together). The cache holds
 * the RAW panel values (no super-admin override), which is what this flag wants.
 *
 * SSR / tests / private mode / no cache yet → false (fail-closed). A panel change reaches a
 * device on its next launch (the cache is refreshed by the live snapshot during this one).
 */
export const FLAGS_CACHE_KEY_MIRROR = 'out-feature-flags-v1';

export function isFastStartupOn(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const raw = window.localStorage.getItem(FLAGS_CACHE_KEY_MIRROR);
    if (!raw) return false;
    const data = JSON.parse(raw) as Record<string, unknown>;
    return data.enableFastStartupV1 === true;
  } catch {
    return false;
  }
}
