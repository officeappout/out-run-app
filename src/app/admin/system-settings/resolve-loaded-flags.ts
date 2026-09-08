/**
 * resolve-loaded-flags — pure logic for turning a system_config/feature_flags read
 * attempt into form state, kept separate from page.tsx (and free of any Firebase/Next
 * import) so it's unit-testable without a browser/jsdom — this repo's vitest config is
 * node-only, unit-tests-only (see vitest.config.ts).
 *
 * Encodes the one rule that matters here: a FAILED read must never produce form state
 * that looks like a real, save-safe value. On success (doc exists, or doesn't yet —
 * both are legitimate, non-error outcomes), missing individual keys fall back to
 * FIRESTORE_FLAG_DEFAULTS (feature-flag-defs.ts — the SAME defaults useFeatureFlags.ts
 * uses for real users, not a separately-hardcoded copy). On a genuine read error
 * (network/permission/etc.), `loadFailed: true` is returned so the caller can block
 * Save — the resulting `flags` are defaults-only and must not be written to Firestore
 * as if they were a real read.
 */

export type LoadResult =
  | { status: 'ok'; data: Record<string, unknown> | undefined }
  | { status: 'error' };

export function resolveLoadedFlags<K extends string>(
  result: LoadResult,
  keys: readonly K[],
  defaults: Record<K, boolean>,
): { flags: Record<K, boolean>; loadFailed: boolean } {
  if (result.status === 'error') {
    return {
      flags: Object.fromEntries(keys.map((k) => [k, defaults[k]])) as Record<K, boolean>,
      loadFailed: true,
    };
  }

  const data = result.data ?? {};
  return {
    flags: Object.fromEntries(
      keys.map((k) => [k, (data[k] as boolean | undefined) ?? defaults[k]]),
    ) as Record<K, boolean>,
    loadFailed: false,
  };
}
