/**
 * Safe-area TOP inset, measured once in JS — for layouts that do their own
 * px math (e.g. bottom-sheet snap heights) and so can't just use
 * `env(safe-area-inset-top)` in CSS.
 *
 * Android: MainActivity sets `setDecorFitsSystemWindows(false)` (edge-to-edge),
 * so the WebView draws under the status bar — but older Android System WebView
 * builds report `env(safe-area-inset-top)` as 0 there. When the probe reads 0
 * on Android we fall back to the standard 24dp status bar so nothing sits
 * under it. (A precise per-device value would need the native inset injected
 * into the web layer; there is no StatusBar/SafeArea plugin installed today.)
 */

/** Standard Android status-bar height (dp == CSS px in the WebView). */
export const ANDROID_STATUS_BAR_FALLBACK_PX = 24;

export type SafeAreaPlatform = 'ios' | 'android' | 'web';

/** Pure: pick the inset to use from the CSS probe reading + platform. */
export function resolveSafeAreaTop(envPx: number, platform: SafeAreaPlatform): number {
  if (Number.isFinite(envPx) && envPx > 0) return Math.round(envPx);
  return platform === 'android' ? ANDROID_STATUS_BAR_FALLBACK_PX : 0;
}

/** Capacitor platform via the global bridge (no import — safe on web/SSR). */
export function readPlatform(): SafeAreaPlatform {
  if (typeof window === 'undefined') return 'web';
  const p = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
  return p === 'ios' || p === 'android' ? p : 'web';
}

/** Hidden fixed probe → computed px of `env(safe-area-inset-top)` (0 on SSR / unsupported). */
export function readEnvSafeAreaTopPx(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !document.body) return 0;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top)';
  document.body.appendChild(probe);
  const px = parseFloat(window.getComputedStyle(probe).paddingTop);
  document.body.removeChild(probe);
  return Number.isFinite(px) && px > 0 ? px : 0;
}

/** Measured safe-area top in px, with the Android edge-to-edge fallback. */
export function readSafeAreaTopPx(): number {
  return resolveSafeAreaTop(readEnvSafeAreaTopPx(), readPlatform());
}
