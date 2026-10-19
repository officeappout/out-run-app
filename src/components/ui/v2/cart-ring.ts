/**
 * "Shopping cart" progress ring — pure geometry, zero React.
 *
 * The list button on live workout screens sits inside a ring with one
 * segment per session-list item (block / set / station), coloured by the
 * item's type. Done items are solid, the rest a 22 % tint. Segments run
 * COUNTER-clockwise from 12 o'clock so they read in the same direction as
 * the RTL story bars (approved boards F-1c / F-1d / A-2b, runcanvas NOTES).
 */

export interface CartRingItem {
  color: string;
  done: boolean;
}

export interface CartRingSegment {
  /** SVG path ("M x y A r r 0 large 0 x y"). */
  d: string;
  color: string;
  /** 1 for done items, DONE_TINT for the rest. */
  opacity: number;
}

/** Opacity of a not-yet-done segment. */
export const CART_TINT_OPACITY = 0.22;

const f = (n: number) => n.toFixed(2);

/**
 * One arc per item around a circle of radius `r` centred in a `size` box.
 * `gapDeg` is the empty angle between neighbours (ignored for a single
 * item, which draws an almost-full circle). Returns [] for no items.
 */
export function cartRingSegments(
  items: readonly CartRingItem[],
  { size = 54, stroke = 4.5, gapDeg }: { size?: number; stroke?: number; gapDeg?: number } = {},
): CartRingSegment[] {
  const n = items.length;
  if (n === 0) return [];
  const c = size / 2;
  const r = c - stroke / 2 - 1.25; // F-1c: r 23.5 in a 54 px box
  // Many items → thinner gaps so the colours still read.
  const gap = n === 1 ? 0 : (gapDeg ?? (n > 24 ? 4 : n > 12 ? 7 : 9));
  const span = 360 / n;
  const arc = n === 1 ? 359.9 : Math.max(0.5, span - gap);

  return items.map((it, i) => {
    // Angle measured counter-clockwise from 12 o'clock.
    const a0 = i * span + gap / 2;
    const a1 = a0 + arc;
    const p = (deg: number) => {
      const rad = (deg * Math.PI) / 180;
      // CCW from the top: x goes LEFT as the angle grows.
      return { x: c - r * Math.sin(rad), y: c - r * Math.cos(rad) };
    };
    const s = p(a0);
    const e = p(a1);
    const large = arc > 180 ? 1 : 0;
    // sweep-flag 0 = counter-clockwise in SVG's y-down space.
    return {
      d: `M${f(s.x)} ${f(s.y)} A${f(r)} ${f(r)} 0 ${large} 0 ${f(e.x)} ${f(e.y)}`,
      color: it.color,
      opacity: it.done ? 1 : CART_TINT_OPACITY,
    };
  });
}

/** Count of done items (the badge number). */
export function cartDoneCount(items: readonly CartRingItem[]): number {
  return items.reduce((a, it) => a + (it.done ? 1 : 0), 0);
}
