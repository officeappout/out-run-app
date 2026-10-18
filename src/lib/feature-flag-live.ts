/**
 * feature-flag-live — a SYNCHRONOUS read of one panel flag for plain (non-React) modules
 * that run on the device: the home workout pipeline and the activity store's streak logic.
 *
 * Reads this device's last-known flags — the cache useFeatureFlags writes on EVERY
 * Firestore snapshot (FLAGS_CACHE_KEY there; the same key here, asserted by a test). No
 * Firebase import, no React: safe inside the hermetic invariants runner, where there is no
 * window and every flag reads as its FLAG_DEFS default (fail-closed).
 *
 * Live values only — no super-admin override (services don't know the viewer). Flags read
 * this way should have superAdminValue false so admins and users see the same thing.
 */
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';

/** Must equal useFeatureFlags.ts's FLAGS_CACHE_KEY (feature-flag-live.test.ts checks it). */
export const LIVE_FLAGS_CACHE_KEY = 'out-feature-flags-v1';

type FlagKey = (typeof FLAG_DEFS)[number]['key'];

export function readLiveFlag(key: FlagKey): boolean {
  const fallback = FLAG_DEFS.find((d) => d.key === key)?.defaultValue ?? false;
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback;
    const raw = window.localStorage.getItem(LIVE_FLAGS_CACHE_KEY);
    if (!raw) return fallback;
    const value = (JSON.parse(raw) as Record<string, unknown>)[key];
    return typeof value === 'boolean' ? value : fallback;
  } catch {
    return fallback;
  }
}
