/**
 * The 5-segment barrier ring's geometry (enable_entry_intro_v1) — same layout as
 * the website's BarrierRing: five arcs, the first one at the top-right, clockwise,
 * with a small gap on each side of a segment. Pure math, no React.
 */

export const RING_SEGMENTS = 5;
const SPAN = 360 / RING_SEGMENTS;

/** SVG arc from angle a0 to a1 (degrees, 0 = top, clockwise) around (cx, cy). */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const rad = (a: number) => (a * Math.PI) / 180;
  const x0 = cx + r * Math.sin(rad(a0));
  const y0 = cy - r * Math.cos(rad(a0));
  const x1 = cx + r * Math.sin(rad(a1));
  const y1 = cy - r * Math.cos(rad(a1));
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** The path of segment i (0..4) for a ring of radius r centred in a `size` box. */
export function segmentPath(i: number, size: number, r: number, padDeg = 8): string {
  const c = size / 2;
  return arcPath(c, c, r, i * SPAN + padDeg, (i + 1) * SPAN - padDeg);
}

/** Centre of segment i's label, `radius` from the ring centre (box coordinates). */
export function labelCenter(i: number, size: number, radius: number): { x: number; y: number } {
  const a = ((i * SPAN + SPAN / 2) * Math.PI) / 180;
  const c = size / 2;
  return { x: c + radius * Math.sin(a), y: c - radius * Math.cos(a) };
}
