/**
 * route-progress — where along a planned route the user is, for the live map's walked/ahead
 * split (G3.4, Sderot pilot: "the walked part of the line is eaten with lag and jumps").
 *
 * Root causes this replaces (AppMap.tsx's old ghost/passed memos):
 *   1. The split snapped to the nearest route VERTEX (degree-space |Δlat|+|Δlng|). Generated
 *      routes are RDP-thinned, so a straight street is one long segment — the split jumped a whole
 *      segment at once, and past mid-segment it sat AHEAD of the user.
 *   2. It only recomputed when a GPS point was ADDED to the recorded trail (4–5 m filter, accuracy
 *      ≤ 40 m, drift resets) — so it stepped, and froze during poor-accuracy stretches.
 *   3. The scan wasn't really windowed and had no off-route limit — far from the line it could
 *      lock onto a later pass (a loop's closing end, an out-and-back's return leg) and never recover.
 *
 * This module: project onto SEGMENTS (true arc length in metres), search a forward window around
 * the last progress, ignore fixes far from the line, and never decrease. `easeAlong` smooths the
 * displayed value between fixes. Pure — AppMap applies it imperatively (no React re-render per frame).
 */

export type LngLat = [number, number];

const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;

function haversine(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Cumulative distance (m) to each vertex. cum[0] = 0, cum[n-1] = route length. */
export function buildCumulativeMeters(path: readonly LngLat[]): number[] {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversine(path[i - 1], path[i]));
  return cum;
}

/** Project p onto segment a→b in a local metric frame: t ∈ [0,1] + cross-track distance (m). */
function projectOnSegment(p: { lat: number; lng: number }, a: LngLat, b: LngLat): { t: number; dist: number } {
  const kx = Math.cos(toRad(a[1])) * (Math.PI / 180) * R; // metres per degree lng
  const ky = (Math.PI / 180) * R;                           // metres per degree lat
  const bx = (b[0] - a[0]) * kx, by = (b[1] - a[1]) * ky;
  const px = (p.lng - a[0]) * kx, py = (p.lat - a[1]) * ky;
  const len2 = bx * bx + by * by;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (px * bx + py * by) / len2)) : 0;
  const dx = px - t * bx, dy = py - t * by;
  return { t, dist: Math.sqrt(dx * dx + dy * dy) };
}

export interface ProgressOpts {
  /** Ignore fixes farther than this from the line (m) — same value as the deviation threshold. */
  maxCrossTrackM?: number;
  /** How far behind the last progress a segment may start (m) — tolerates noise; never lowers progress. */
  backTolM?: number;
  /** Normal forward search window (m). */
  aheadM?: number;
  /** Catch-up window after a GPS gap (m) — forward-only, nearest pass first. */
  catchUpAheadM?: number;
  /** Beyond the windows, a fix must be this close to the line to count (m): the user is
   *  unmistakably ON a later stretch (e.g. took a shortcut) — a forward jump, never backward. */
  onLineM?: number;
  /** First fix: prefer the route's first stretch (a loop's start = its end). */
  firstWindowM?: number;
}

const DEFAULTS: Required<ProgressOpts> = {
  maxCrossTrackM: 40, backTolM: 15, aheadM: 100, catchUpAheadM: 250, onLineM: 12, firstWindowM: 150,
};

/**
 * Projection among segments overlapping [fromM, toM] within maxCross; null if none.
 * 'closest' = smallest cross-track distance; 'first' = smallest along (the nearest pass ahead).
 */
function bestInRange(
  pos: { lat: number; lng: number }, path: readonly LngLat[], cum: readonly number[],
  fromM: number, toM: number, maxCross: number, pick: 'closest' | 'first' = 'closest',
): number | null {
  let best: { along: number; dist: number } | null = null;
  for (let i = 0; i < path.length - 1; i++) {
    if (cum[i + 1] < fromM) continue;
    if (cum[i] > toM) break;
    const { t, dist } = projectOnSegment(pos, path[i], path[i + 1]);
    if (dist > maxCross) continue;
    const along = cum[i] + t * (cum[i + 1] - cum[i]);
    // Outside the window → not a candidate (never clamp it in: on an out-and-back the outbound
    // mirror would then tie with the real return-leg position).
    if (along < fromM || along > toM) continue;
    if (!best || (pick === 'closest' ? dist < best.dist : along < best.along)) best = { along, dist };
    if (pick === 'first') break;
  }
  return best ? best.along : null;
}

/**
 * Advance progress for one fix. Returns the new progress (m along the route; never < prev), or
 * `prev` unchanged when the fix is off the line / behind. `null` only while no fix has matched yet.
 */
export function advanceRouteProgress(
  prev: number | null,
  pos: { lat: number; lng: number },
  path: readonly LngLat[],
  cum: readonly number[],
  opts: ProgressOpts = {},
): number | null {
  if (path.length < 2 || cum.length !== path.length) return prev;
  const o = { ...DEFAULTS, ...opts };
  const total = cum[cum.length - 1];
  let found: number | null;
  if (prev == null) {
    // First fix: the route's first stretch; elsewhere only if unmistakably ON the line (so a
    // user walking up to a loop from the side where it closes doesn't grey the whole route).
    found = bestInRange(pos, path, cum, 0, o.firstWindowM, o.maxCrossTrackM)
      ?? bestInRange(pos, path, cum, 0, total, o.onLineM, 'first');
  } else {
    found = bestInRange(pos, path, cum, prev - o.backTolM, prev + o.aheadM, o.maxCrossTrackM)
      ?? bestInRange(pos, path, cum, prev, prev + o.catchUpAheadM, o.maxCrossTrackM, 'first')
      ?? bestInRange(pos, path, cum, prev, total, o.onLineM, 'first');
  }
  if (found == null) return prev;
  return prev == null ? found : Math.max(prev, found);
}

/** Split the route at `alongM`, sharing one interpolated point so the halves meet exactly. */
export function splitPathAtMeters(
  path: readonly LngLat[], cum: readonly number[], alongM: number,
): { passed: LngLat[]; ahead: LngLat[] } {
  const total = cum[cum.length - 1] ?? 0;
  const s = Math.max(0, Math.min(total, alongM));
  let i = 0;
  while (i < path.length - 2 && cum[i + 1] < s) i++;
  const segLen = cum[i + 1] - cum[i];
  const t = segLen > 0 ? (s - cum[i]) / segLen : 0;
  const a = path[i], b = path[i + 1];
  const p: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return {
    passed: [...path.slice(0, i + 1), p],
    ahead: [p, ...path.slice(i + 1)],
  };
}

/** Ease the displayed progress toward the target: never decreases, never overshoots. */
export function easeAlong(displayed: number, target: number, dtMs: number, tauMs = 700): number {
  if (target <= displayed) return displayed;
  const k = 1 - Math.exp(-Math.max(0, dtMs) / tauMs);
  const next = displayed + (target - displayed) * k;
  return target - next < 0.2 ? target : next;
}
