/**
 * Pure snap math for the summary drawer (SummaryDrawerShell → v2
 * DraggableSheet). No React — unit-tested in node.
 */

export type SummarySnap = 'peek' | 'full';

/** Visible height of the collapsed ("peek") drawer: handle + hero + tabs + pinned footer. */
export const SUMMARY_COLLAPSED_PX = 240;

/** Smallest open height we ever allow, so a tiny viewport still opens a usable sheet. */
const MIN_FULL_PX = 320;

/** Breathing room kept between the status bar / notch and the open sheet's top edge. */
export const SUMMARY_SAFE_TOP_MARGIN_PX = 8;

export interface SummarySheetSnaps {
  /** Pixel snap points in [collapsed, full] order (DraggableSheet treats > 1 as px). */
  snapPoints: [number, number];
  /** Index into snapPoints for the requested initial snap. */
  initialIndex: 0 | 1;
}

/**
 * Snap points for the summary drawer.
 *
 * - full  = viewport minus the top gap: the larger of the transparent
 *   `peekGap` that lets the live map show above the open drawer (150 on /map,
 *   0 on the history page) and `safeTopPx + 8`, so the handle/hero never
 *   slide under the status bar / notch (the history route used to open at a
 *   0 gap → cut-off top).
 * - peek  = `collapsedPx`, clamped below full so the two never invert.
 */
export function summarySheetSnaps(
  viewportPx: number,
  peekGap: number,
  initial: SummarySnap = 'full',
  collapsedPx: number = SUMMARY_COLLAPSED_PX,
  safeTopPx: number = 0,
): SummarySheetSnaps {
  const vh = Number.isFinite(viewportPx) && viewportPx > 0 ? viewportPx : 800;
  const peekGapPx = Number.isFinite(peekGap) && peekGap > 0 ? peekGap : 0;
  const safeTop = Number.isFinite(safeTopPx) && safeTopPx > 0 ? safeTopPx : 0;
  const gap = Math.max(peekGapPx, safeTop + SUMMARY_SAFE_TOP_MARGIN_PX);
  const full = Math.max(MIN_FULL_PX, Math.round(vh - gap));
  const peek = Math.min(Math.max(2, Math.round(collapsedPx)), full - 1);
  return { snapPoints: [peek, full], initialIndex: initial === 'peek' ? 0 : 1 };
}
