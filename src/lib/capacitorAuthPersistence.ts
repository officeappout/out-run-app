/**
 * capacitorAuthPersistence.ts
 *
 * Firebase Auth persistence adapter backed by @capacitor/preferences.
 *
 * WHY THIS EXISTS
 * ──────────────
 * The app loads from a remote `server.url` (Vercel). Firebase Auth's default
 * persistence (IndexedDB / localStorage) lives inside the WKWebView's storage
 * partition for that origin. iOS can evict this storage under memory pressure
 * or after a hard close, forcing a new anonymous sign-in and a different uid —
 * which means Firestore sees a brand-new user and redirects back to onboarding.
 *
 * @capacitor/preferences writes to NSUserDefaults (iOS) and SharedPreferences
 * (Android). Both are stored in the app's sandboxed data container and survive
 * hard closes, OS restarts, and WebView storage eviction. This adapter wraps
 * those native stores so Firebase Auth keeps its token in truly persistent
 * native storage instead of the fragile WebView partition.
 *
 * MIGRATION
 * ─────────
 * `_shouldAllowMigration: true` tells Firebase to automatically copy any
 * existing token from IndexedDB / localStorage into this adapter on first run,
 * so users who are already signed in are not signed out on update.
 *
 * FIREBASE 12.x API CHANGE
 * ────────────────────────
 * Starting with @firebase/auth@1.12.0 (firebase@12.x), initializeAuth() expects
 * persistence entries to be CLASS CONSTRUCTORS (not instances). It internally
 * calls `_getInstance(cls)` which asserts `cls instanceof Function`. Passing a
 * plain object (POJO) used to work in older versions but now throws:
 *   "INTERNAL ASSERTION FAILED: Expected a class definition"
 *
 * Fix: export the CLASS itself as `capacitorPreferencesPersistence`, not an
 * instance of it. Firebase will call `new CapacitorPreferencesPersistence()`
 * and cache the resulting instance.
 *
 * USAGE
 * ─────
 * Pass as the first entry in initializeAuth({ persistence: [...] }).
 * Firebase tries adapters in order and uses the first available one, so
 * put IndexedDB / localStorage as fallbacks for pure-web environments.
 */

import type { Persistence } from 'firebase/auth';

type PersistenceValue = string | { [key: string]: PersistenceValue };
type StorageEventListener = (value: PersistenceValue | null) => void;

const KEY_PREFIX = 'cap_fb_auth_';

/**
 * Max ms to wait for the native @capacitor/preferences bridge before giving
 * up. Firebase Auth's init sequence calls _isAvailable()/_get() before the
 * first onAuthStateChanged emit — if the native bridge stalls (WKWebView
 * bridge not ready, native runtime pressure), those calls never resolved on
 * their own and auth state stayed 'restoring' forever (splash screen stuck).
 */
const PREFERENCES_TIMEOUT_MS = 5_000;

/**
 * Races a native Preferences call against a timeout. On timeout, logs
 * clearly (this signals the native bridge itself is unhealthy, a distinct
 * condition from a normal rejected/failed call) and resolves with
 * `fallback` instead of leaving the caller pending indefinitely.
 */
function withPreferencesTimeout<T>(
  promise: Promise<T>,
  opName: string,
  fallback: T,
): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.warn(
        `[capacitorAuthPersistence] TIMEOUT on ${opName} after ${PREFERENCES_TIMEOUT_MS}ms — ` +
        `native Preferences bridge did not respond. Falling back to ${JSON.stringify(fallback)}.`,
      );
      resolve(fallback);
    }, PREFERENCES_TIMEOUT_MS);

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        console.warn(`[capacitorAuthPersistence] ${opName} rejected:`, err);
        resolve(fallback);
      },
    );
  });
}

/**
 * Internal Firebase Auth persistence interface.
 * Firebase reads these underscore-prefixed methods at runtime; they extend
 * the public `Persistence` type which only carries `type`.
 */
interface InternalPersistence extends Persistence {
  _isAvailable(): Promise<boolean>;
  _set(key: string, value: PersistenceValue): Promise<void>;
  _get(key: string): Promise<PersistenceValue | null>;
  _remove(key: string): Promise<void>;
  _addListener(key: string, listener: StorageEventListener): void;
  _removeListener(key: string, listener: StorageEventListener): void;
  _shouldAllowMigration: boolean;
}

/**
 * Firebase Auth persistence adapter backed by @capacitor/preferences.
 *
 * Exported as the CLASS ITSELF (not an instance) because firebase@12.x
 * expects class constructors in the initializeAuth persistence array.
 * Firebase internally calls `new CapacitorPreferencesPersistence()` and
 * caches the instance via its `_getInstance` helper.
 */
class CapacitorPreferencesPersistence implements InternalPersistence {
  readonly type = 'LOCAL' as const;

  /**
   * Allow Firebase to migrate an existing token from IndexedDB / localStorage
   * into this adapter automatically on first run after updating.
   */
  readonly _shouldAllowMigration = true;

  async _isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    return withPreferencesTimeout(
      (async () => {
        const { Preferences } = await import('@capacitor/preferences');
        await Preferences.set({ key: `${KEY_PREFIX}__avail_test`, value: '1' });
        await Preferences.remove({ key: `${KEY_PREFIX}__avail_test` });
        return true;
      })(),
      '_isAvailable',
      false,
    );
  }

  async _set(key: string, value: PersistenceValue): Promise<void> {
    return withPreferencesTimeout(
      (async () => {
        const { Preferences } = await import('@capacitor/preferences');
        await Preferences.set({
          key: `${KEY_PREFIX}${key}`,
          value: JSON.stringify(value),
        });
      })(),
      `_set(${key})`,
      undefined,
    );
  }

  async _get(key: string): Promise<PersistenceValue | null> {
    return withPreferencesTimeout(
      (async () => {
        const { Preferences } = await import('@capacitor/preferences');
        const { value } = await Preferences.get({ key: `${KEY_PREFIX}${key}` });
        if (value === null || value === undefined) return null;
        try {
          return JSON.parse(value) as PersistenceValue;
        } catch {
          return null;
        }
      })(),
      `_get(${key})`,
      null,
    );
  }

  async _remove(key: string): Promise<void> {
    return withPreferencesTimeout(
      (async () => {
        const { Preferences } = await import('@capacitor/preferences');
        await Preferences.remove({ key: `${KEY_PREFIX}${key}` });
      })(),
      `_remove(${key})`,
      undefined,
    );
  }

  // Cross-process storage change listeners are not applicable to
  // NSUserDefaults / SharedPreferences — Firebase falls back to polling
  // internally when no listener is registered.
  _addListener(_key: string, _listener: StorageEventListener): void {
    // intentionally no-op
  }

  _removeListener(_key: string, _listener: StorageEventListener): void {
    // intentionally no-op
  }
}

/**
 * The class constructor exported for use in initializeAuth({ persistence: [...] }).
 *
 * Firebase@12.x maps this through `_getInstance(cls)` which:
 *   1. asserts `cls instanceof Function` — passes because this is a class ✓
 *   2. calls `new cls()` and caches the resulting instance ✓
 *
 * Do NOT instantiate this yourself — pass the class reference directly.
 */
export const capacitorPreferencesPersistence =
  CapacitorPreferencesPersistence as unknown as Persistence;
