/**
 * Pure snap math for the summary drawer (SummaryDrawerShell → v2
 * DraggableSheet). No React — unit-tested in node.
 */

export type SummarySnap = 'peek' | 'full';

/** Visible height of the collapsed ("peek") drawer: handle + hero + tabs + pinned footer. */
export const SUMMARY_COLLAPSED_PX = 240;

/** Smallest open height we ever allow, so a tiny viewport still opens a usable sheet. */
const MIN_FULL_PX = 320;

export interface SummarySheetSnaps {
  /** Pixel snap points in [collapsed, full] order (DraggableSheet treats > 1 as px). */
  snapPoints: [number, number];
  /** Index into snapPoints for the requested initial snap. */
  initialIndex: 0 | 1;
}

/**
 * Snap points for the summary drawer.
 *
 * - full  = viewport minus the transparent top gap (`peekGap`) that lets the
 *   live map show above the open drawer (150 on /map, 0 on the history page).
 * - peek  = `collapsedPx`, clamped below full so the two never invert.
 */
export function summarySheetSnaps(
  viewportPx: number,
  peekGap: number,
  initial: SummarySnap = 'full',
  collapsedPx: number = SUMMARY_COLLAPSED_PX,
): SummarySheetSnaps {
  const vh = Number.isFinite(viewportPx) && viewportPx > 0 ? viewportPx : 800;
  const gap = Number.isFinite(peekGap) && peekGap > 0 ? peekGap : 0;
  const full = Math.max(MIN_FULL_PX, Math.round(vh - gap));
  const peek = Math.min(Math.max(2, Math.round(collapsedPx)), full - 1);
  return { snapPoints: [peek, full], initialIndex: initial === 'peek' ? 0 : 1 };
}
