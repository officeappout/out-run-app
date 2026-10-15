/**
 * route-direction — which way along a planned LOOP the user is actually walking (G3.2, Sderot
 * pilot, behind `enable_route_direction_adapt`). Pure; useRouteDirectionAdapt applies it.
 *
 * Scope (investigated before building): a LOOP route's stop order can be flipped by reversing
 * the already-composed lists at the live layer — same stops, same legs, same totals — with no
 * call to the hybrid composer. A one_way route cannot (the "backward" stops were never composed;
 * flipping it would need planFromPoint 'backward' + a new compose → out of scope, not touched),
 * and an out-and-back palindrome reads the same both ways (nothing to flip). So: loops only.
 *
 * Rule: once the user is ≥ DECIDE_MIN_M from the route start (path[0] = the entry point) and on
 * the line, compare their position with the point that far along the route FORWARD vs REVERSED.
 * Clearly closer to the reversed one → 'reverse'. Decided once.
 */
export type LngLat = [number, number];
export type DirectionVerdict = 'forward' | 'reverse' | 'undecided';

export const DIRECTION_RULES = {
  /** Distance from the route start before deciding (m) — inside the brief's 50–100 m. */
  decideMinM: 60,
  /** Stop trying after this far from the start (m); the plan stays as-is. */
  giveUpM: 150,
  /** The matching point must be this close to the user (m). */
  onLineM: 35,
  /** The winning side must be at least this much closer than the other (ratio). */
  clearRatio: 0.5,
} as const;

const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;
export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
const ll = (p: LngLat) => ({ lat: p[1], lng: p[0] });

export function pathLengthM(path: readonly LngLat[]): number {
  let m = 0;
  for (let i = 1; i < path.length; i++) m += haversineM(ll(path[i - 1]), ll(path[i]));
  return m;
}

/** The point `meters` along the path (clamped to its ends). */
export function pointAlong(path: readonly LngLat[], meters: number): { lat: number; lng: number } {
  if (path.length === 0) return { lat: 0, lng: 0 };
  let left = Math.max(0, meters);
  for (let i = 1; i < path.length; i++) {
    const seg = haversineM(ll(path[i - 1]), ll(path[i]));
    if (left <= seg && seg > 0) {
      const t = left / seg;
      return {
        lat: path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t,
        lng: path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t,
      };
    }
    left -= seg;
  }
  return ll(path[path.length - 1]);
}

/** A closed loop (start ≈ end) that is NOT an out-and-back palindrome — the only shape we flip. */
export function isFlippableLoop(path: readonly LngLat[]): boolean {
  if (path.length < 4) return false;
  if (haversineM(ll(path[0]), ll(path[path.length - 1])) > 30) return false;
  // Out-and-back palindrome: the second half mirrors the first → reads the same both ways.
  const n = path.length;
  let mirrored = true;
  for (let i = 0; i < Math.floor(n / 2); i++) {
    if (haversineM(ll(path[i]), ll(path[n - 1 - i])) > 5) { mirrored = false; break; }
  }
  return !mirrored;
}

export function detectWalkDirection(path: readonly LngLat[], pos: { lat: number; lng: number }): DirectionVerdict {
  if (path.length < 2) return 'forward';
  const fromStart = haversineM(ll(path[0]), pos);
  if (fromStart < DIRECTION_RULES.decideMinM) return 'undecided';
  const reversed = [...path].reverse();
  const dF = haversineM(pos, pointAlong(path, fromStart));
  const dR = haversineM(pos, pointAlong(reversed, fromStart));
  if (dR <= DIRECTION_RULES.onLineM && dR < dF * DIRECTION_RULES.clearRatio) return 'reverse';
  if (dF <= DIRECTION_RULES.onLineM && dF < dR * DIRECTION_RULES.clearRatio) return 'forward';
  if (fromStart >= DIRECTION_RULES.giveUpM && (dF <= DIRECTION_RULES.onLineM || dR <= DIRECTION_RULES.onLineM)) {
    return 'forward'; // ambiguous on the line far enough out → keep the plan
  }
  return 'undecided';
}

/** Where a point sits along the path: nearest point on any segment, with its along-path distance. */
export function projectOnPath(path: readonly LngLat[], pos: { lat: number; lng: number }): { alongM: number; distM: number } {
  const kx = Math.cos(toRad(pos.lat)) * 111_320;
  const ky = 110_540;
  let best = { alongM: 0, distM: Infinity };
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    const ax = (path[i - 1][0] - pos.lng) * kx, ay = (path[i - 1][1] - pos.lat) * ky;
    const bx = (path[i][0] - pos.lng) * kx, by = (path[i][1] - pos.lat) * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const d = Math.hypot(ax + dx * t, ay + dy * t);
    const seg = Math.sqrt(len2);
    // Strictly closer wins → on a loop's closing point (start ≈ end) the START is kept.
    if (d < best.distM) best = { alongM: walked + seg * t, distM: d };
    walked += seg;
  }
  return best;
}

function bearingDeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat))
    - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Look-ahead for the start arrow's bearing (m) — a net direction, not one jittery micro-segment. */
const START_ARROW_WINDOW_M = 25;

/**
 * G3.2 start arrow, for EVERY route shape (one_way included — those are never flipped): anchored
 * where the user joins the line (their start position projected onto it; path[0] when unknown),
 * pointing along the line TOWARD THE FIRST STOP. Stop behind the anchor (a one_way joined past
 * it) → the arrow points back along the line; no stop coordinates (full-park) → forward.
 */
export function computeStartArrow(
  path: readonly LngLat[],
  start: { lat: number; lng: number } | null | undefined,
  firstStop: { lat: number; lng: number } | null | undefined,
): { lat: number; lng: number; bearing: number } | null {
  if (path.length < 2) return null;
  const total = pathLengthM(path);
  if (total <= 0) return null;
  const anchorM = start ? projectOnPath(path, start).alongM : 0;
  const stopM = firstStop ? projectOnPath(path, firstStop).alongM : null;
  const forward = stopM == null || stopM >= anchorM;
  const anchor = pointAlong(path, anchorM);
  const aheadM = forward
    ? Math.min(total, anchorM + START_ARROW_WINDOW_M)
    : Math.max(0, anchorM - START_ARROW_WINDOW_M);
  if (Math.abs(aheadM - anchorM) < 1) return null;
  return { ...anchor, bearing: bearingDeg(anchor, pointAlong(path, aheadM)) };
}
