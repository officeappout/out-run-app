/**
 * Workout Exit Guard — native-readable flags (Capacitor Preferences mirror).
 *
 * `ViewController.swift`'s `WKNavigationDelegate.decidePolicyFor` cannot read
 * `useSessionStore` or `feature-flags.ts` directly: it is a synchronous
 * native Swift callback fired off the edge-swipe-back gesture, with no JS
 * bridge round-trip available at decision time. It CAN read
 * `@capacitor/preferences`' underlying storage directly and synchronously —
 * confirmed by reading the installed plugin source
 * (`node_modules/@capacitor/preferences/ios/Sources/PreferencesPlugin/
 * Preferences.swift`): every key is stored as a plain string in
 * `UserDefaults.standard`, prefixed with the plugin's default group name —
 * `"CapacitorStorage." + key`. No encryption, no async I/O, no bridge hop.
 * `ViewController.swift` reads that exact same `UserDefaults` key directly.
 *
 * Two flags are mirrored here, both plain `"1"` / `"0"` strings:
 *
 *   • `EXIT_HARD_BLOCK_PREF_KEY` — mirrors `WORKOUT_EXIT_HARD_BLOCK_ENABLED`
 *     (`src/config/feature-flags.ts`). This app loads its JS bundle from a
 *     remote origin (`server.url`), so once the native Swift code that reads
 *     this key exists on-device (which DOES need its own one-time Xcode
 *     rebuild + TestFlight build to ship), toggling the flag afterwards is a
 *     normal web deploy — no further native rebuild needed to flip it.
 *
 *   • `AEROBIC_SESSION_ACTIVE_PREF_KEY` — reflects whether `useSessionStore`
 *     currently holds an active/paused running|walking|hybrid session, so
 *     `ViewController.swift` can tell an in-progress aerobic session on
 *     `/map` apart from plain map browsing.
 *
 * Both keys are written fire-and-forget by `WorkoutExitGuardTracker`
 * (mounted once in `ClientLayout`). No-op on web / non-native platforms —
 * Android does not need either key: `src/lib/native/init.ts`'s `backButton`
 * handler runs in plain JS and reads `useSessionStore.getState()` +
 * `WORKOUT_EXIT_HARD_BLOCK_ENABLED` directly, no mirror required.
 */

export const EXIT_HARD_BLOCK_PREF_KEY = 'workout_exit_hard_block_enabled';
export const AEROBIC_SESSION_ACTIVE_PREF_KEY = 'aerobic_session_active';

function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  return Boolean(w.Capacitor?.isNativePlatform?.());
}

/**
 * Fire-and-forget write of a boolean flag into `@capacitor/preferences`, as
 * a plain `"1"` / `"0"` string. No-op on web / non-native. See the module
 * doc above for why this exists — it's the only synchronous-from-native
 * channel available to `ViewController.swift`'s `decidePolicyFor`.
 *
 * A failed write (plugin unavailable, I/O error) is swallowed on purpose:
 * the native side treats a missing/unreadable key as `false` (nil !== "1"),
 * which is the fail-open direction for both flags — no hard-block, no
 * silent-block on `/map` — so a write failure degrades to legacy behaviour
 * rather than an unexpectedly stuck block.
 */
export function writeNativeFlag(key: string, value: boolean): void {
  if (!isNativePlatform()) return;
  void import('@capacitor/preferences')
    .then(({ Preferences }) => Preferences.set({ key, value: value ? '1' : '0' }))
    .catch(() => { /* non-fatal — see doc comment above */ });
}
