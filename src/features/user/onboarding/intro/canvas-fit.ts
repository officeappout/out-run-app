/**
 * How big the intro canvas may be drawn (enable_entry_intro_v1, owner note 21.10 #1:
 * "the first screens must never scroll, on every phone"). Pure — unit-tested.
 *
 * The canvas is the owner's 390 × 800 mockup frame. Its CONTENT zone is the top
 * 650 units (the mockup's CTA band starts at y 694 of 844, i.e. canvas y 650);
 * that zone must fit the box between the safe-area top and the CTA bar. The rest
 * runs on under the bar's white fade, as designed.
 */
export const CANVAS_FIT_W = 390;
/** Canvas y where the mockup's CTA band begins. */
export const CANVAS_CONTENT_H = 650;
/** Never blow the composition up past this on big phones / tablets. */
export const CANVAS_MAX_SCALE = 1.12;

export function fitCanvasScale(boxWidth: number, boxHeight: number): number {
  if (!(boxWidth > 0) || !(boxHeight > 0)) return 0;
  return Math.min(boxWidth / CANVAS_FIT_W, boxHeight / CANVAS_CONTENT_H, CANVAS_MAX_SCALE);
}

/** The CTA bar's height (CSS) — shared by IntroShell (the bar) and IntroCanvas (the box above it). */
export const INTRO_BAR_CSS = 'calc(clamp(104px, 17dvh, 150px) + env(safe-area-inset-bottom, 0px))';
