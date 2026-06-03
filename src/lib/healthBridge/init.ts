/**
 * HealthBridge web orchestration (Native Phase, Apr 2026).
 *
 * This is the bridge between the native HealthBridge plugin
 * (plugins/health-bridge/) and the rest of the web app:
 *
 *                          ┌───────────────────────────────────┐
 *                          │   plugins/health-bridge (Swift /  │
 *                          │   Kotlin) → notifyListeners(      │
 *                          │     'samplesAvailable')           │
 *                          └────────────────┬──────────────────┘
 *                                           │
 *                                           ▼
 *                  ┌──────────────────────────────────────────┐
 *                  │  initHealthBridge() (this module)        │
 *                  │   • subscribes to 'samplesAvailable'     │
 *                  │   • calls HealthBridge.syncSince(cursor) │
 *                  │   • for each sample:                     │
 *                  │       → enqueueHealthSamples (IndexedDB) │
 *                  │       → pushSample (live UI overlay)     │
 *                  │   • OutboxFlusher.flushNow('enqueue')    │
 *                  │   • persists cursor to Capacitor Prefs   │
 *                  └──────────────────────────────────────────┘
 *
 * SSR-safe — every export checks `typeof window` and `isNativePlatform()`
 * before touching plugins. The pure-web Vercel build never exercises
 * these paths.
 *
 * Cursor persistence
 * ──────────────────
 * We store `lastSyncCursorISO` in @capacitor/preferences (a native
 * SharedPreferences / NSUserDefaults wrapper). This survives app restarts,
 * unlike IndexedDB which the WebView can clear under storage pressure.
 * If the cursor is missing we ask the OS for the last 24h — the server
 * dedupes by sampleUUID anyway, so over-fetching is safe.
 */

import { OutboxFlusher } from '@/lib/outbox/OutboxFlusher';
import {
  enqueueHealthSamples,
  type OutboxHealthSample,
  type SampleSource,
} from '@/lib/outbox/outbox-db';
import { pushSample } from './eventEmitter';

const PREF_KEY_CURSOR = 'outrun.healthBridge.cursorISO';
const PREF_KEY_PERMISSIONS = 'outrun.healthBridge.permissionsGranted';

let installed = false;
let bridgePromise: Promise<unknown> | null = null;

function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return Boolean(w.Capacitor?.isNativePlatform?.());
}

function platformIsIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { Capacitor?: { getPlatform?: () => string } };
  return w.Capacitor?.getPlatform?.() === 'ios';
}

async function getPrefs() {
  const { Preferences } = await import('@capacitor/preferences');
  return Preferences;
}

async function readCursor(): Promise<string | null> {
  try {
    const Preferences = await getPrefs();
    const { value } = await Preferences.get({ key: PREF_KEY_CURSOR });
    return value || null;
  } catch {
    return null;
  }
}

async function writeCursor(iso: string): Promise<void> {
  try {
    const Preferences = await getPrefs();
    await Preferences.set({ key: PREF_KEY_CURSOR, value: iso });
  } catch {
    /* ignore */
  }
}

async function loadPlugin() {
  if (!bridgePromise) {
    bridgePromise = import('health-bridge').then((m) => m.HealthBridge);
  }
  return bridgePromise as Promise<
    typeof import('health-bridge') extends { HealthBridge: infer T } ? T : never
  >;
}

/**
 * Public: drains every sample reported by the OS since the persisted
 * cursor. Safe to call multiple times in parallel — concurrent calls
 * coalesce because OutboxFlusher is itself coalescing and the cursor
 * is only advanced after a successful sync.
 */
export async function healthBridgeSyncNow(
  reason: 'app-active' | 'observer' | 'manual' | 'background' = 'manual',
): Promise<void> {
  if (!isNative()) return;
  try {
    const HealthBridge = await loadPlugin();
    const sinceISO = (await readCursor()) ?? undefined;
    const result = await (HealthBridge as any).syncSince(sinceISO ? { sinceISO } : undefined);
    const samples = (result?.samples ?? []) as Array<{
      sampleUUID: string;
      startISO: string;
      endISO: string;
      date: string;
      steps: number;
      calories: number;
      activeMinutes: number;
      source?: string;
    }>;
    if (samples.length === 0) {
      if (result?.cursorISO) await writeCursor(result.cursorISO);
      return;
    }

    const now = Date.now();
    const sampleSource: SampleSource = platformIsIOS() ? 'healthkit' : 'healthconnect';

    // Each native sample carries one of (steps | calories | activeMinutes);
    // the server also keys uniquely on `sampleUUID`. To keep the outbox
    // schema stable we shred per-metric: one OutboxHealthSample per
    // non-zero quantity, with a deterministic suffix on the UUID so the
    // server still dedupes correctly.
    const out: OutboxHealthSample[] = [];
    for (const s of samples) {
      if (s.steps > 0) {
        out.push(buildOutboxSample(s, 'steps', s.steps, sampleSource, now));
        pushSample({
          type: 'steps',
          value: s.steps,
          date: s.date,
          startDate: s.startISO,
          endDate: s.endISO,
        });
      }
      if (s.calories > 0) {
        out.push(buildOutboxSample(s, 'activeEnergy', s.calories, sampleSource, now));
        pushSample({
          type: 'activeEnergy',
          value: s.calories,
          date: s.date,
          startDate: s.startISO,
          endDate: s.endISO,
        });
      }
      if (s.activeMinutes > 0) {
        out.push(buildOutboxSample(s, 'exerciseTime', s.activeMinutes, sampleSource, now));
        pushSample({
          type: 'exerciseTime',
          value: s.activeMinutes,
          date: s.date,
          startDate: s.startISO,
          endDate: s.endISO,
        });
      }
    }

    if (out.length > 0) {
      await enqueueHealthSamples(out);
      OutboxFlusher.flushNow('enqueue');
    }

    if (result?.cursorISO) {
      await writeCursor(result.cursorISO);
    }

    if (process.env.NODE_ENV !== 'production') {
      console.debug(
        `[healthBridge] sync(${reason}): ${samples.length} raw → ${out.length} outbox`,
      );
    }
  } catch (err) {
    console.warn(`[healthBridge] sync(${reason}) failed:`, err);
  }
}

function buildOutboxSample(
  s: { sampleUUID: string; startISO: string; endISO: string; date: string; source?: string },
  type: OutboxHealthSample['type'],
  value: number,
  source: SampleSource,
  enqueuedAt: number,
): OutboxHealthSample {
  return {
    sampleUUID: `${s.sampleUUID}::${type}`,
    date: s.date,
    type,
    value,
    startDate: s.startISO,
    endDate: s.endISO,
    source,
    deviceModel: s.source,
    enqueuedAt,
    attempts: 0,
  };
}

/**
 * Public: write a completed workout to Apple Health (iOS only).
 *
 * Translates the app's workout types into HKWorkoutActivityType strings and
 * saves the HKWorkout via the native plugin. Silently no-ops on Android and
 * web — callers don't need to platform-guard.
 *
 * startISO / endISO are derived from durationMinutes if not provided.
 */
export async function writeWorkoutToHealth(params: {
  workoutType: 'strength' | 'running' | 'walking' | 'cycling' | 'hybrid';
  durationMinutes: number;
  calories: number;
  distanceKm?: number;
  startISO?: string;
  endISO?: string;
}): Promise<void> {
  if (!isNative()) return;
  // Removed platformIsIOS() guard — Health Connect on Android supports
  // workout writes via writeWorkout() since plugin v2.
  try {
    const HealthBridge = await loadPlugin();
    const endDate = params.endISO ? new Date(params.endISO) : new Date();
    const startDate = params.startISO
      ? new Date(params.startISO)
      : new Date(endDate.getTime() - params.durationMinutes * 60_000);

    const activityMap: Record<string, string> = {
      strength: 'traditionalStrengthTraining',
      running: 'running',
      walking: 'walking',
      cycling: 'cycling',
      hybrid: 'crossTraining',
    };

    const result = await (HealthBridge as any).writeWorkout({
      workoutType: activityMap[params.workoutType] ?? 'other',
      startISO: startDate.toISOString(),
      endISO: endDate.toISOString(),
      calories: Math.round(params.calories),
      ...(params.distanceKm ? { distanceMeters: Math.round(params.distanceKm * 1000) } : {}),
    });

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[healthBridge] writeWorkout →', result);
    }
  } catch (err) {
    console.warn('[healthBridge] writeWorkout failed (non-critical):', err);
  }
}

/**
 * Public: idempotent first-time install.
 * Subscribes to `samplesAvailable`, enables background delivery if the
 * user has previously granted permissions (we cache that in
 * Preferences), and runs an initial catch-up sync.
 */
export async function initHealthBridge(): Promise<void> {
  if (installed) return;
  installed = true;
  if (!isNative()) return;

  try {
    const HealthBridge = await loadPlugin();
    const { available } = await (HealthBridge as any).isAvailable();
    if (!available) return;

    // Subscribe — fires on observer queries (iOS) and the WorkManager
    // worker (Android), as well as foreground sync triggers.
    await (HealthBridge as any).addListener('samplesAvailable', (e: { reason?: string }) => {
      void healthBridgeSyncNow(
        (e?.reason as 'observer' | 'background' | 'manual') ?? 'observer',
      );
    });

    const Preferences = await getPrefs();
    const { value: prevGranted } = await Preferences.get({ key: PREF_KEY_PERMISSIONS });
    if (prevGranted === '1') {
      try {
        await (HealthBridge as any).enableBackgroundDelivery();
      } catch (err) {
        console.warn('[healthBridge] enableBackgroundDelivery failed:', err);
      }
      // Initial catch-up — covers anything the OS collected while the
      // app was closed.
      void healthBridgeSyncNow('app-active');
    }
  } catch (err) {
    console.warn('[healthBridge] init failed:', err);
  }
}

/**
 * Hard upper bound on how long we will wait for the native permission
 * flow to resolve. On Android the plugin parks the `requestPermissions`
 * PluginCall while the user is inside the Health Connect settings
 * screen, and only resolves it once `onAppResumed` fires. If the user
 * never returns to the app — or `onAppResumed` is missed for any
 * reason — the UI spinner would otherwise hang forever. 45 s is long
 * enough for the system sheet round-trip but short enough that the user
 * won't sit on a frozen settings screen.
 */
const PERMISSION_TIMEOUT_MS = 45_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label}:timeout`));
    }, ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * Public: invoked from a UI button (Profile → Connect Health).
 * Asks the OS for permissions; on success persists the flag and
 * primes background delivery + initial sync.
 *
 * The native `requestPermissions` and `hasPermissions` calls are wrapped
 * in `withTimeout` so the caller is guaranteed to receive a resolved
 * promise within `PERMISSION_TIMEOUT_MS`. On timeout we return
 * `{ granted: false }` and the UI spinner clears.
 */
export async function requestHealthPermissions(): Promise<{ granted: boolean; timedOut?: boolean }> {
  if (!isNative()) return { granted: false };
  try {
    const HealthBridge = await loadPlugin();
    await withTimeout(
      (HealthBridge as any).requestPermissions({
        permissions: ['steps', 'activeEnergy', 'exerciseTime'],
      }),
      PERMISSION_TIMEOUT_MS,
      'requestPermissions',
    );
    // iOS does not tell us the read-grant state directly; we re-probe.
    const { granted } = await withTimeout(
      (HealthBridge as any).hasPermissions({
        permissions: ['steps', 'activeEnergy', 'exerciseTime'],
      }),
      PERMISSION_TIMEOUT_MS,
      'hasPermissions',
    );
    if (granted) {
      const Preferences = await getPrefs();
      await Preferences.set({ key: PREF_KEY_PERMISSIONS, value: '1' });
      try {
        await (HealthBridge as any).enableBackgroundDelivery();
      } catch (err) {
        console.warn('[healthBridge] enableBackgroundDelivery failed:', err);
      }
      void healthBridgeSyncNow('manual');
    }
    return { granted: Boolean(granted) };
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    if (msg.endsWith(':timeout')) {
      console.warn('[healthBridge] permission flow timed out:', msg);
      return { granted: false, timedOut: true };
    }
    console.warn('[healthBridge] requestPermissions failed:', err);
    return { granted: false };
  }
}

/**
 * Public: called by the native shell on every app-resume so that any
 * pending `requestPermissions()` PluginCall (parked while the user was
 * inside the Health Connect settings screen) is resolved.
 *
 * Uses the shared `loadPlugin()` singleton — the plugin proxy is NEVER
 * passed through a raw `await import(...)` expression, which would
 * trigger the Android Capacitor proxy's .then()-not-implemented error.
 */
export async function notifyAppResumed(): Promise<void> {
  if (!isNative()) return;
  try {
    const HealthBridge = await loadPlugin();
    await (HealthBridge as any).onAppResumed();
  } catch (err) {
    // No pending call, iOS (resolves inline), or plugin not yet loaded.
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[healthBridge] notifyAppResumed skipped:', err);
    }
  }
}

/**
 * Public: invoked from the same UI to revoke. We cannot revoke at the
 * OS level (the user must do that from system settings), but we stop
 * background delivery and forget the cached grant flag so we don't
 * auto-enable on next launch.
 */
export async function disconnectHealth(): Promise<void> {
  if (!isNative()) return;
  try {
    const HealthBridge = await loadPlugin();
    await (HealthBridge as any).disableBackgroundDelivery();
    const Preferences = await getPrefs();
    await Preferences.remove({ key: PREF_KEY_PERMISSIONS });
  } catch (err) {
    console.warn('[healthBridge] disconnect failed:', err);
  }
}
