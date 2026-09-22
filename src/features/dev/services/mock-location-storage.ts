/**
 * mock-location-storage — durable persistence for the super-admin-only
 * MockLocationPanel override (David, 22.09.2026, field-test doc 37).
 *
 * Mirrors src/lib/onboardingPrefs.ts's dual-write technique (localStorage
 * for fast sync reads + @capacitor/preferences so the value survives a
 * hard close on iOS, where WKWebView can evict localStorage between
 * launches) — kept as its OWN small module rather than added to
 * onboardingPrefs.ts, whose own doc comment scopes it to onboarding/gateway
 * flags specifically, not unrelated dev-tool state.
 *
 * Only the STATIC override (enabled? which fixed point?) persists — never
 * the ephemeral route-walkthrough simulation (isSimulating/simulatedPath),
 * which wouldn't make sense to resume across a reload anyway.
 */
const STORAGE_KEY = 'dev_mock_location_state';

export interface StoredMockLocationState {
  isMockEnabled: boolean;
  mockLocation: { lat: number; lng: number } | null;
  selectedCity: string | null;
}

function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

function parse(raw: string | null): StoredMockLocationState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.isMockEnabled === 'boolean' &&
      (parsed.mockLocation === null ||
        (typeof parsed.mockLocation?.lat === 'number' && typeof parsed.mockLocation?.lng === 'number')) &&
      (parsed.selectedCity === null || typeof parsed.selectedCity === 'string')
    ) {
      return parsed as StoredMockLocationState;
    }
  } catch {
    /* corrupt value — treat as absent */
  }
  return null;
}

/** Synchronous read from localStorage — use for immediate init on mount. */
export function loadMockLocationState(): StoredMockLocationState | null {
  if (typeof window === 'undefined') return null;
  try {
    return parse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * Async read with a native (@capacitor/preferences) fallback for the cold-
 * start case where WKWebView evicted localStorage since the last launch.
 * On web this is identical to loadMockLocationState.
 */
export async function loadMockLocationStateAsync(): Promise<StoredMockLocationState | null> {
  const cached = loadMockLocationState();
  if (cached !== null) return cached;
  if (!isNativePlatform()) return null;

  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    const parsed = parse(value ?? null);
    if (parsed && typeof window !== 'undefined') {
      try { window.localStorage.setItem(STORAGE_KEY, value as string); } catch { /* quota */ }
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Synchronous write to localStorage; fires a parallel best-effort write to
 *  @capacitor/preferences on native so the value survives a hard close. */
export function saveMockLocationState(state: StoredMockLocationState): void {
  if (typeof window === 'undefined') return;
  const raw = JSON.stringify(state);
  try { window.localStorage.setItem(STORAGE_KEY, raw); } catch { /* quota / private mode */ }

  if (!isNativePlatform()) return;
  void import('@capacitor/preferences')
    .then(({ Preferences }) => Preferences.set({ key: STORAGE_KEY, value: raw }))
    .catch(() => { /* non-fatal */ });
}

/** Removes the persisted override from both localStorage and (on native)
 *  @capacitor/preferences — used when the panel is turned off. */
export function clearMockLocationState(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* quota */ }

  if (!isNativePlatform()) return;
  void import('@capacitor/preferences')
    .then(({ Preferences }) => Preferences.remove({ key: STORAGE_KEY }))
    .catch(() => { /* non-fatal */ });
}
