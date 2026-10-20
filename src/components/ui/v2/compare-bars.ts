/**
 * Pure geometry for the comparison bars (progress tab P-1d / P-1e):
 *   splitWidths  — one bar split by share (minutes per activity), in %.
 *   pairedWidths — "this period vs the previous one": both bars scaled to the larger.
 */

export interface SplitShare {
  key: string;
  /** Share of the total, 0–100 (one decimal). */
  pct: number;
}

/** Shares of a total, biggest-last-fix so they always sum to exactly 100. Non-positive values are dropped. */
export function splitWidths(segments: { key: string; value: number }[]): SplitShare[] {
  const parts = segments.filter((s) => Number.isFinite(s.value) && s.value > 0);
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return [];
  const out = parts.map((p) => ({ key: p.key, pct: Math.round((p.value / total) * 1000) / 10 }));
  const drift = Math.round((100 - out.reduce((s, p) => s + p.pct, 0)) * 10) / 10;
  if (drift !== 0) {
    let big = 0;
    out.forEach((p, i) => { if (p.pct > out[big].pct) big = i; });
    out[big] = { ...out[big], pct: Math.round((out[big].pct + drift) * 10) / 10 };
  }
  return out;
}

/** Bar widths (0–100 %) of a current/previous pair; the larger one fills the track. */
export function pairedWidths(current: number, previous: number): { current: number; previous: number } {
  const c = Number.isFinite(current) && current > 0 ? current : 0;
  const p = Number.isFinite(previous) && previous > 0 ? previous : 0;
  const max = Math.max(c, p);
  if (max <= 0) return { current: 0, previous: 0 };
  return { current: Math.round((c / max) * 100), previous: Math.round((p / max) * 100) };
}
