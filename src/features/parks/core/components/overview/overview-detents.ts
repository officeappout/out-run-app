/**
 * Overview drawer detents (pure) — moved verbatim from HybridOverviewScreen
 * (19.10.2026) so every overview consumer (route + stops, plain route, …)
 * shares one geometry.
 *
 * Three detents as a fraction of the viewport that stays VISIBLE above the map.
 * half/full are fractions of the viewport; peek is a FIXED px height (point 9).
 * A fraction collapses the peek content on short screens (iPhone SE) — a fixed px
 * (MetricsDrawer's PEEK_CARD_H pattern) keeps grabber + summary + the enlarged
 * strip + CTA visible at peek on every device.
 */

import type { SheetAnchor, SheetMeasurements } from '@/features/workout-engine/shared/hooks/useSheetDrag';

export const DETENT_FRAC = { half: 0.55, full: 0.90 } as const;
export const PEEK_PX = 220; // grabber(~17) + summary(~40) + enlarged strip(~55) + CTA(~62) + pad(~46)
export type DetentId = 'peek' | 'half' | 'full';
export const DETENT_ORDER: DetentId[] = ['peek', 'half', 'full']; // ascending size / descending Y

/** Visible card height (px) at a detent — the single source for all detent geometry. */
export function detentHeightPx(id: DetentId, vh: number): number {
  if (id === 'peek') return Math.min(PEEK_PX, Math.round(vh * 0.5)); // never exceed half the screen on tiny devices
  return Math.round(vh * DETENT_FRAC[id]);
}
/** Card top Y (from screen top) = vh − visible height. */
export function detentTopY(id: DetentId, vh: number): number {
  return vh - detentHeightPx(id, vh);
}

export function buildAnchors(m: SheetMeasurements): SheetAnchor[] {
  return DETENT_ORDER.map((id) => ({
    id,
    yPx: detentTopY(id, m.vh),
    heightPx: detentHeightPx(id, m.vh),
  }));
}

export const STRONG_FLICK = 900; // px/s — above this, a flick may skip straight to the far detent
export const MOVE_MIN = 24; // px — below this net travel, treat as a nudge → snap back

/**
 * Point 14: directional-step snap (variant B). A short pull steps ONE detent
 * toward the drag direction (half is always reachable, and it always locks); a
 * strong flick may jump straight to the far detent; a tiny nudge snaps back.
 */
export function nextDetent(current: string | null | undefined, velocityY: number, offsetY: number): DetentId {
  const found = DETENT_ORDER.indexOf(current as DetentId);
  const cur = found >= 0 ? found : 1; // default to 'half'
  let idx = cur;
  if (velocityY < -STRONG_FLICK) idx = DETENT_ORDER.length - 1;               // strong up → full
  else if (velocityY > STRONG_FLICK) idx = 0;                                 // strong down → peek
  else if (offsetY < -MOVE_MIN) idx = Math.min(cur + 1, DETENT_ORDER.length - 1); // pull up → +1
  else if (offsetY > MOVE_MIN) idx = Math.max(cur - 1, 0);                    // pull down → -1
  // else: nudge → stay (idx = cur) → springs back to where it was
  return DETENT_ORDER[idx];
}
