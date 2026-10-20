/**
 * SegmentedRing geometry — pure. Turns values into dash arcs around a circle,
 * clockwise from 12 o'clock, with a small gap between segments.
 */
export interface RingArc {
  key: string;
  color: string;
  /** Visible arc length. */
  length: number;
  /** Distance from the start of the circle (for stroke-dashoffset = -offset). */
  offset: number;
}

export function ringArcs(
  segments: { key: string; value: number; color: string }[],
  circumference: number,
  gap: number,
): RingArc[] {
  const parts = segments.filter((s) => Number.isFinite(s.value) && s.value > 0);
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return [];
  const g = parts.length > 1 ? gap : 0;
  let offset = 0;
  return parts.map((p) => {
    const share = (circumference * p.value) / total;
    const arc = { key: p.key, color: p.color, length: Math.max(0.5, share - g), offset: offset + g / 2 };
    offset += share;
    return arc;
  });
}
