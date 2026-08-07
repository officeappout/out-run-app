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
export const PREF_KEY_PERMISSIONS = 'outrun.healthBridge.permissionsGranted';
/** Set before the OS permission sheet fires so denied + killed-mid-dialog both record "asked". */
export const PREF_KEY_ASKED = 'outrun.healthBridge.permissionsAsked';

let installed = false;
let bridgePromise: Promise<{ plugin: unknown }> | null = null;

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

/**
 * Loads the native plugin proxy — SAFELY.
 *
 * The obvious `import('health-bridge').then((m) => m.HealthBridge)` pattern
 * (what used to be here, with a comment claiming it avoided the Android
 * `.then()`-not-implemented crash) does NOT actually avoid it. Capacitor's
 * plugin proxy is a `Proxy` whose `get` trap returns a callable "method
 * wrapper" for *any* unrecognized property (@capacitor/core dist/index.js,
 * the `default:` branch of the Proxy `get` trap) — including `then`. Per the
 * ECMAScript Promise resolution spec, ANY time a promise settles with a
 * value that has a callable `.then` — whether returned from a `.then()`
 * callback, returned from an async function, passed to `Promise.resolve()`,
 * etc. — the engine treats that value as a thenable and calls `value.then(...)`
 * on it to chain through. The plugin proxy satisfies that check, so the
 * moment it becomes a promise's fulfillment value (which the old pattern did,
 * immediately, via the `.then()` callback's return), the engine invokes
 * `HealthBridge.then(resolve, reject)` — a real bridge call for a method
 * literally named "then", which no native plugin implements. Hence:
 * `Error: "HealthBridge.then()" is not implemented on android`.
 *
 * The fix: never let the bare proxy be a promise's resolution value. Wrap it
 * in a plain object (`{ plugin }`) — a fresh object literal has no `.then`
 * of its own, so it is never mistaken for a thenable, and the proxy inside
 * is only ever reached via a synchronous property read (`.plugin`), which
 * involves no promise machinery at all. Every call site destructures
 * `{ plugin: HealthBridge }` instead of taking the return value directly.
 */
async function loadPlugin(): Promise<{ plugin: unknown }> {
  if (!bridgePromise) {
    bridgePromise = import('health-bridge').then((m) => ({ plugin: m.HealthBridge }));
  }
  return bridgePromise;
}

/**
 * Public: drains every sample reported by the OS since the persisted
 * cursor. Safe to call multiple times in parallel — concurrent calls
 * coalesce because OutboxFlusher is itself coalescing and the cursor
 * is only advanced after a successful sync.
 */
export async function healthBridgeSyncNow(
  reason: 'app-active' | 'observer' | 'manual' | 'background' | 'login' = 'manual',
): Promise<void> {
  if (!isNative()) return;
  try {
    const { plugin: HealthBridge } = await loadPlugin();
    const sinceISO = (await readCursor()) ?? undefined;
    console.log(`[healthBridge][flow] sync(${reason}): querying native store (first data query)`);
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
    console.log(`[healthBridge][flow] sync(${reason}): ${samples.length} raw samples returned`);
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
    const { plugin: HealthBridge } = await loadPlugin();
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
 * Public: check whether Health Connect is available on this device.
 * Returns the SDK status without touching the PREF_KEY_ASKED flag.
 */
export async function checkHealthAvailability(): Promise<{
  available: boolean;
  reason?: 'sdk-unavailable' | 'provider-update-required';
}> {
  if (!isNative()) return { available: false };
  try {
    const { plugin: HealthBridge } = await loadPlugin();
    // 2.5 s guard — on iOS the native call can hang if the bridge dispatch
    // races with the HealthKit framework init. The catch below turns any
    // error / timeout into { available: true } on iOS so the flow proceeds.
    const result = await withTimeout(
      (HealthBridge as any).isAvailable() as Promise<{ available: boolean; reason?: string }>,
      2500,
      'isAvailable',
    );
    return {
      available: Boolean(result?.available),
      reason: result?.reason as 'sdk-unavailable' | 'provider-update-required' | undefined,
    };
  } catch (err) {
    console.warn('[healthBridge] checkHealthAvailability error:', err);
    // On iOS, HealthKit is always present on real devices. If the bridge
    // fails (e.g. UNIMPLEMENTED from a stale build / missing native plugin),
    // assume available so the disclosure → permission flow still proceeds.
    if (platformIsIOS()) return { available: true };
    return { available: false };
  }
}

/**
 * Public: read today's step count from the hardware step counter sensor,
 * bypassing Health Connect entirely. Works on all Android 4.4+ devices
 * that have a step counter chip, regardless of HC availability.
 */
export async function readStepsFromSensorFallback(): Promise<{
  available: boolean;
  stepsToday: number;
}> {
  if (!isNative()) return { available: false, stepsToday: 0 };
  try {
    const { plugin: HealthBridge } = await loadPlugin();
    const result = await (HealthBridge as any).readStepsFromSensor();
    return {
      available: Boolean(result?.available),
      stepsToday: Number(result?.stepsToday ?? 0),
    };
  } catch {
    return { available: false, stepsToday: 0 };
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
    const { plugin: HealthBridge } = await loadPlugin();
    const { available } = await (HealthBridge as any).isAvailable();
    if (!available) {
      // On Android, emit a one-shot sensor reading so the step tile has data
      // even without Health Connect installed.
      if (!platformIsIOS()) {
        try {
          const { available: sensorOk, stepsToday } = await readStepsFromSensorFallback();
          if (sensorOk && stepsToday > 0) {
            const today = new Date().toISOString().slice(0, 10);
            pushSample({ type: 'steps', value: stepsToday, date: today, startDate: today, endDate: today });
          }
        } catch { /* sensor absent — silently skip */ }
      }
      return;
    }

    // Subscribe — fires on observer queries (iOS) and the WorkManager
    // worker (Android), as well as foreground sync triggers.
    await (HealthBridge as any).addListener('samplesAvailable', (e: { reason?: string }) => {
      void healthBridgeSyncNow(
        (e?.reason as 'observer' | 'background' | 'manual') ?? 'observer',
      );
    });

    // Android-only: fired by onAppResumed() (HealthBridgePlugin.kt) when the
    // user granted/revoked Health Connect permissions from the OS settings
    // screen directly, outside our own requestPermissions() flow, while the
    // app was backgrounded. Keeps healthBridgeEnabled truthful without
    // requiring the user to re-open the connect flow.
    await (HealthBridge as any).addListener('permissionsChanged', (e: { granted?: boolean }) => {
      const granted = Boolean(e?.granted);
      console.log('[healthBridge][flow] permissionsChanged event: granted=', granted);
      void (async () => {
        const Preferences = await getPrefs();
        if (granted) {
          await Preferences.set({ key: PREF_KEY_PERMISSIONS, value: '1' });
        } else {
          await Preferences.remove({ key: PREF_KEY_PERMISSIONS });
        }
        const { useSettingsStore } = await import('@/features/home/store/useSettingsStore');
        useSettingsStore.getState().patch({ healthBridgeEnabled: granted });
        if (granted) void healthBridgeSyncNow('manual');
      })();
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
 * Safety-net upper bound on how long we will wait for the native
 * permission flow to resolve. Both platforms now resolve `requestPermissions`
 * directly from the OS grant dialog's own result — Android via the
 * ActivityResultContract callback (HealthBridgePlugin.kt handlePermissionsResult),
 * iOS via requestAuthorization's completion handler — so this is no longer
 * covering an open-ended "user wandered into Settings" wait. It only
 * guards against a genuinely stuck native bridge call, e.g. the app
 * process being killed while the Health Connect grant screen is on
 * screen (Capacitor then can't restore the saved call and our activity
 * callback never fires). 60 s leaves plenty of room for the user to
 * actually read and decide on the dialog.
 */
const PERMISSION_TIMEOUT_MS = 60_000;

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
 * A single native `requestPermissions` call now resolves with the real
 * granted state directly — Android via the ActivityResultContract
 * callback, iOS by delegating internally to its own read-access probe
 * inside the `requestAuthorization` completion handler (see
 * HealthBridgePlugin.kt / HealthBridgePlugin.swift). The previous
 * separate follow-up `hasPermissions()` round-trip is redundant and has
 * been removed. The call is wrapped in `withTimeout` purely as a safety
 * net (see PERMISSION_TIMEOUT_MS doc) — on timeout we return
 * `{ granted: false, timedOut: true }` and the UI spinner clears.
 */
export async function requestHealthPermissions(): Promise<{
  granted: boolean;
  timedOut?: boolean;
  reason?: 'sdk-unavailable' | 'provider-update-required';
}> {
  if (!isNative()) return { granted: false };
  console.log('[healthBridge][flow] requestHealthPermissions: start');
  try {
    const { plugin: HealthBridge } = await loadPlugin();
    // Guard: check HC availability BEFORE setting PREF_KEY_ASKED.
    // If HC is absent we never show an OS dialog, so marking "asked" would
    // permanently suppress the auto-request on future sessions.
    let availResult: { available: boolean; reason?: string } | null = null;
    try {
      availResult = await withTimeout(
        (HealthBridge as any).isAvailable() as Promise<{ available: boolean; reason?: string }>,
        2500,
        'isAvailable',
      );
    } catch {
      // Bridge call failed or timed out. On iOS, HealthKit is always present
      // on real devices — proceed to requestPermissions.
      if (!platformIsIOS()) {
        console.warn('[healthBridge][flow] requestHealthPermissions: isAvailable check failed on Android — aborting');
        return { granted: false };
      }
    }
    if (availResult != null && !availResult.available) {
      console.log('[healthBridge][flow] requestHealthPermissions: unavailable, reason=', availResult.reason);
      return {
        granted: false,
        reason: availResult?.reason as 'sdk-unavailable' | 'provider-update-required' | undefined,
      };
    }
    // Persist "asked" before the OS sheet so a deny or mid-dialog kill still
    // records that the user was prompted and we don't ask again on next login.
    const Preferences = await getPrefs();
    await Preferences.set({ key: PREF_KEY_ASKED, value: '1' });
    console.log('[healthBridge][flow] requestHealthPermissions: OS dialog requested');
    const result = await withTimeout(
      (HealthBridge as any).requestPermissions({
        permissions: ['steps', 'activeEnergy', 'exerciseTime'],
      }) as Promise<{ granted?: boolean; reason?: string }>,
      PERMISSION_TIMEOUT_MS,
      'requestPermissions',
    );
    const granted = Boolean(result?.granted);
    console.log('[healthBridge][flow] requestHealthPermissions: OS dialog resolved, granted=', granted, 'reason=', result?.reason);
    if (granted) {
      await Preferences.set({ key: PREF_KEY_PERMISSIONS, value: '1' });
      try {
        await (HealthBridge as any).enableBackgroundDelivery();
      } catch (err) {
        console.warn('[healthBridge] enableBackgroundDelivery failed:', err);
      }
      void healthBridgeSyncNow('manual');
    }
    return {
      granted,
      reason: result?.reason as 'sdk-unavailable' | 'provider-update-required' | undefined,
    };
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    if (msg.endsWith(':timeout')) {
      console.warn('[healthBridge][flow] requestHealthPermissions: timed out:', msg);
      return { granted: false, timedOut: true };
    }
    console.warn('[healthBridge][flow] requestHealthPermissions: failed:', err);
    return { granted: false };
  }
}

/**
 * Public: called by the native shell on every app-resume. On Android this
 * triggers a re-probe of the current Health Connect grant state and, if it
 * changed since we last observed it (user granted/revoked from OS settings
 * directly), fires the `permissionsChanged` event handled in
 * initHealthBridge(). No longer resolves a parked `requestPermissions()`
 * call — that call now resolves synchronously from its own OS dialog
 * result (see PERMISSION_TIMEOUT_MS doc above). On iOS this is a no-op
 * (no `onAppResumed` native method is registered).
 *
 * Uses the shared `loadPlugin()` singleton (see its doc comment for why
 * the proxy is wrapped in `{ plugin }` rather than returned directly).
 */
export async function notifyAppResumed(): Promise<void> {
  if (!isNative()) return;
  try {
    const { plugin: HealthBridge } = await loadPlugin();
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
    const { plugin: HealthBridge } = await loadPlugin();
    await (HealthBridge as any).disableBackgroundDelivery();
    const Preferences = await getPrefs();
    await Preferences.remove({ key: PREF_KEY_PERMISSIONS });
  } catch (err) {
    console.warn('[healthBridge] disconnect failed:', err);
  }
}
