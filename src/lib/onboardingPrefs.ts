/**
 * onboardingPrefs.ts
 *
 * Durable key/value storage for the small set of onboarding & gateway flags
 * that MUST survive a hard close on iOS (where WKWebView can evict both
 * sessionStorage AND localStorage between launches when the app is loaded
 * from a remote origin via `server.url`).
 *
 * Strategy
 * ────────
 *   Web (Vercel browser)  → localStorage only (sync, simple)
 *   Native iOS/Android    → localStorage (fast sync cache) + @capacitor/preferences
 *                           (NSUserDefaults / SharedPreferences — survives hard close)
 *
 * The localStorage write is synchronous so callers that read the value back
 * immediately on the same tick (e.g. the OnboardingWizard during init)
 * always see it. The Preferences write is fire-and-forget; on the next cold
 * start, `getOnboardingPref` reads localStorage first and falls back to
 * Preferences only if the fast cache is empty.
 *
 * Scope
 * ─────
 * Use this helper ONLY for the keys that should outlive a hard close
 * (e.g. `onboarding_language`, `onboarding_path`, `gateway_uid`,
 * `gateway_track`, the map-arrival location answer `map_authority_id` /
 * `map_anchor_lat` / `map_anchor_lng`, and `last_gps_lat` / `last_gps_lng` /
 * `last_gps_at` — the user's own last real GPS fix + when it was taken
 * (epoch ms), written by useGPS.ts on every accepted fix (throttled) so
 * MapShell can seed the map (and the location marker) near their ACTUAL
 * last position on cold launch, not just their onboarding-time home anchor
 * — see MapShell.tsx's initialMapCenter, mobile map default->jump fix,
 * 18.08.2026; `last_gps_at` also gates a staleness check so a days-old fix
 * is never used as if it were fresh — round 7, 18.08.2026). Short-lived UI
 * navigation hints like `jit_return_to` and
 * `show_gear_toast` should remain in plain sessionStorage so they don't
 * leak across launches.
 */

function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/**
 * Synchronous read from localStorage. Returns `null` when the key is
 * missing, when running on the server, or when localStorage throws
 * (private mode / quota).
 *
 * For native cold-start scenarios where localStorage may have been
 * evicted by WKWebView, prefer `getOnboardingPrefAsync` which falls
 * back to @capacitor/preferences.
 */
export function getOnboardingPref(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Async read with native fallback. Use this when the value is critical
 * for the flow (e.g. resuming onboarding after a hard close) and the
 * caller can `await`. On web this is identical to the sync version.
 */
export async function getOnboardingPrefAsync(key: string): Promise<string | null> {
  const cached = getOnboardingPref(key);
  if (cached !== null) return cached;

  if (!isNativePlatform()) return null;

  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key });
    if (value !== null && value !== undefined) {
      // Re-prime the fast cache so subsequent sync reads hit localStorage.
      try { window.localStorage.setItem(key, value); } catch { /* quota */ }
      return value;
    }
  } catch {
    /* plugin / I/O failure — treat as missing */
  }
  return null;
}

/**
 * Synchronous write to localStorage; fires a parallel best-effort write
 * to @capacitor/preferences on native so the value survives a hard close.
 */
export function setOnboardingPref(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(key, value); } catch { /* quota / private mode */ }

  if (!isNativePlatform()) return;

  // Fire-and-forget — the localStorage write above is the source of
  // truth for the current session; Preferences is a durability mirror.
  void import('@capacitor/preferences')
    .then(({ Preferences }) => Preferences.set({ key, value }))
    .catch(() => { /* non-fatal */ });
}

/**
 * Removes the key from BOTH localStorage and @capacitor/preferences
 * (on native) so onboarding/gateway flow resets are complete.
 */
export function removeOnboardingPref(key: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(key); } catch { /* quota */ }

  if (!isNativePlatform()) return;

  void import('@capacitor/preferences')
    .then(({ Preferences }) => Preferences.remove({ key }))
    .catch(() => { /* non-fatal */ });
}
