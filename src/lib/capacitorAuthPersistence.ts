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

const impl: InternalPersistence = {
  type: 'LOCAL',

  /**
   * Allow Firebase to migrate an existing token from IndexedDB / localStorage
   * into this adapter automatically on first run after updating.
   */
  _shouldAllowMigration: true,

  async _isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.set({ key: `${KEY_PREFIX}__avail_test`, value: '1' });
      await Preferences.remove({ key: `${KEY_PREFIX}__avail_test` });
      return true;
    } catch {
      return false;
    }
  },

  async _set(key: string, value: PersistenceValue): Promise<void> {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({
      key: `${KEY_PREFIX}${key}`,
      value: JSON.stringify(value),
    });
  },

  async _get(key: string): Promise<PersistenceValue | null> {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key: `${KEY_PREFIX}${key}` });
    if (value === null || value === undefined) return null;
    try {
      return JSON.parse(value) as PersistenceValue;
    } catch {
      return null;
    }
  },

  async _remove(key: string): Promise<void> {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key: `${KEY_PREFIX}${key}` });
  },

  // Cross-process storage change listeners are not applicable to
  // NSUserDefaults / SharedPreferences — Firebase falls back to polling
  // internally when no listener is registered.
  _addListener(_key: string, _listener: StorageEventListener): void {
    // intentionally no-op
  },
  _removeListener(_key: string, _listener: StorageEventListener): void {
    // intentionally no-op
  },
};

/**
 * Ready-to-use adapter. Cast to the public `Persistence` type so it can be
 * passed directly to `initializeAuth({ persistence: [...] })`.
 * Firebase reads the underscore methods from this object at runtime.
 */
export const capacitorPreferencesPersistence = impl as unknown as Persistence;
