/**
 * Native bootstrap (Native Phase, Apr 2026).
 *
 * Wires Capacitor lifecycle events into the rest of the app:
 *
 *   • App.appStateChange (active=true)  → OutboxFlusher.flushNow('app-active')
 *                                       → HealthBridge.syncSinceLastFlush()
 *   • App.resume                         → same as appStateChange.active
 *   • App.backButton (Android)           → routed to history.back() so the
 *                                          web router handles it.
 *
 * SSR-safe — no-op when `window` is undefined or when not running inside
 * the Capacitor native shell. Importing this module from server components
 * has no side effects.
 *
 * The implementation deliberately uses dynamic `import()` so the
 * Capacitor packages are only loaded inside the native WebView; the
 * pure-web Vercel build will tree-shake them out (they sit behind
 * `isNativePlatform()` which is false on the web).
 */

import { OutboxFlusher } from '@/lib/outbox/OutboxFlusher';

let installed = false;

function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  return Boolean(w.Capacitor?.isNativePlatform?.());
}

/**
 * Initialise the native shell. Idempotent — safe to call from multiple
 * client components (NativeBootstrap, etc.).
 */
export async function initNativeShell(): Promise<void> {
  if (installed) return;
  installed = true;

  if (typeof window === 'undefined') return;
  if (!isNative()) {
    // Pure web: nothing to do. OutboxFlusher.install() handles its own
    // window/online listeners and is invoked by the OfflineBanner mount.
    return;
  }

  try {
    const [{ App }] = await Promise.all([import('@capacitor/app')]);

    // 1. App lifecycle → flush + health re-sync on resume
    App.addListener('appStateChange', async ({ isActive }) => {
      if (!isActive) return;
      try {
        OutboxFlusher.flushNow('app-active');
      } catch (err) {
        console.warn('[native] flushNow on appStateChange failed:', err);
      }
      try {
        // Pull anything HealthKit / Health Connect collected while we
        // were backgrounded. The HealthBridge module schedules its own
        // background workers too — this is just the foreground "catch-
        // up" path.
        const { healthBridgeSyncNow } = await import('@/lib/healthBridge/init');
        await healthBridgeSyncNow('app-active');
      } catch (err) {
        // Health bridge may not be initialised yet (first launch, no
        // permission) — that's fine.
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[native] healthBridgeSyncNow skipped:', err);
        }
      }
    });

    // 2. Android back-button → web router. Without this the WebView pops
    //    out of the app instead of navigating back through Next.js
    //    history.
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        // Only minimise on Android home screen; on iOS this never fires.
        App.minimizeApp().catch(() => {
          /* ignore — iOS does not implement minimise */
        });
      }
    });

    // 3. Initialise the HealthBridge plugin lazily. We don't request
    //    permissions automatically here — the user must opt-in from the
    //    profile settings screen — but we register the event listener
    //    so that if permissions were granted on a previous launch, live
    //    samples flow into the Activity Rings immediately.
    try {
      const { initHealthBridge } = await import('@/lib/healthBridge/init');
      await initHealthBridge();
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[native] HealthBridge init skipped:', err);
      }
    }
  } catch (err) {
    console.warn('[native] initNativeShell failed:', err);
  }
}
