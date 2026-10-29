/**
 * Direction-aware positioning for hand-drawn range sliders. A native <input type="range" dir={direction}> runs
 * start-to-end, so the fill bar and floating value label must be anchored from the same edge. In RTL (Hebrew)
 * this returns exactly the physical values the sliders always used (right:/left:, translateX(50%)).
 */
const pctOf = (n: number): string | number => (n === 0 ? 0 : `${n}%`);

/** Anchor a point `pct`% along the track from its start edge, with the centering transform for a label. */
export function sliderPointStyle(isRtl: boolean, pct: number) {
  return isRtl
    ? { right: `${pct}%`, transform: 'translateX(50%)' }
    : { left: `${pct}%`, transform: 'translateX(-50%)' };
}

/** Fill between `fromPct` and `toPct` (both measured from the start edge). */
export function sliderFillStyle(isRtl: boolean, fromPct: number, toPct: number) {
  return isRtl
    ? { right: pctOf(fromPct), left: `${100 - toPct}%` }
    : { left: pctOf(fromPct), right: `${100 - toPct}%` };
}
