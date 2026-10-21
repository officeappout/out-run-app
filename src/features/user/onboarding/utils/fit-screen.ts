/**
 * Onboarding v2 (enable_home_v2) — "one screen, no dancing" layout rules,
 * kept pure so they're unit-tested. Legacy values are returned unchanged.
 *
 * The owner's report (21.10.2026): swiping up/down on the signup questionnaire
 * makes the screen jump — the content was a few px taller than its scroll area,
 * so it scrolled a little and rubber-banded back. Three causes, one rule each:
 *
 *  1. Rubber band. `overscroll-contain` stops scroll chaining but KEEPS the
 *     element's own iOS bounce; `overscroll-none` removes it. A v2 step's
 *     scroll area therefore uses none — when the content truly overflows it
 *     still scrolls, it just doesn't bounce.
 *  2. A doubled safe-area inset. <main> (ClientLayout) already pads the top
 *     inset on /onboarding-new/*; a screen that pads it again loses ~47 px of
 *     its viewport, which is exactly what pushes a fitting screen into scroll.
 *  3. Mount shift. An entry animation that translates the content DOWN grows
 *     the scroll area while it plays (transforms count toward scrollable
 *     overflow) — on a screen that just fits, it scrolls and then snaps back.
 */

/** overscroll-behavior class for a step's own scroll area. */
export function stepScrollOverscroll(v2: boolean): 'overscroll-none' | 'overscroll-contain' {
  return v2 ? 'overscroll-none' : 'overscroll-contain';
}

/**
 * Top padding of a screen header that sits directly in <main>.
 * hostPadsTop: the host already reserves env(safe-area-inset-top) — the
 * /onboarding-new routes (ClientLayout's <main>) do; the fixed full-screen
 * overlays (JIT identity gate on /map, /home) don't.
 */
export function headerSafeTop(v2: boolean, hostPadsTop: boolean): string {
  if (!v2) return 'env(safe-area-inset-top, 0px)';
  return hostPadsTop ? '4px' : 'calc(env(safe-area-inset-top, 0px) + 4px)';
}

/** framer-motion props for a screen's content entry. v2: fade only (no layout-growing translate). */
export function contentEntryMotion(v2: boolean): {
  initial: { opacity: number; y?: number };
  animate: { opacity: number; y?: number };
} {
  return v2
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } };
}

/**
 * Height of the running-goal hero photo (first running question).
 * Was clamp(140px, 24vh, 230px): with the first-question welcome line, the
 * goal cards and the pinned Continue, that overflowed short phones (iPhone SE
 * / mini) by a few dozen px. Now the hero also yields to the space the rest of
 * the screen needs (GOAL_HERO_RESERVE_PX ≈ chrome + title + 3 cards + CTA),
 * never below 120 px and never above 230 px. vh, not dvh: in the app's
 * WKWebView they're equal, and vh never invalidates the whole declaration on
 * an older browser.
 */
export const GOAL_HERO_RESERVE_PX = 540;
export const GOAL_HERO_HEIGHT =
  `clamp(120px, min(24vh, calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - ${GOAL_HERO_RESERVE_PX}px)), 230px)`;

/** Pure mirror of GOAL_HERO_HEIGHT for tests (insets in px). */
export function goalHeroHeightPx(viewportH: number, safeTop = 0, safeBottom = 0): number {
  const fit = viewportH - safeTop - safeBottom - GOAL_HERO_RESERVE_PX;
  return Math.min(230, Math.max(120, Math.min(viewportH * 0.24, fit)));
}
