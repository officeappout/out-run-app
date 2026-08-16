import { Route } from '../types/route.types';

export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return Infinity;
  if (!isFinite(lat1) || !isFinite(lng1) || !isFinite(lat2) || !isFinite(lng2)) return Infinity;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const DEFAULT_PROXIMITY_RADIUS_KM = 10;

export function isRouteNearby(
  route: Route,
  userPos: { lat: number; lng: number },
  radiusKm = DEFAULT_PROXIMITY_RADIUS_KM,
): boolean {
  if (!userPos || userPos.lat == null || userPos.lng == null) return false;
  if (!route.path || route.path.length === 0) return false;
  const mid = route.path[Math.floor(route.path.length / 2)];
  if (!mid || mid[0] == null || mid[1] == null) return false;
  return haversineKm(userPos.lat, userPos.lng, mid[1], mid[0]) <= radiusKm;
}

/**
 * Returns true when a route's midpoint lies within the given bounding box.
 * Path coordinates follow the project-wide [lng, lat] Mapbox convention.
 * Used by the "חפש באזור זה" flow as an alternative to isRouteNearby.
 */
export function isRouteInBounds(
  route: Route,
  bounds: { neLng: number; neLat: number; swLng: number; swLat: number },
): boolean {
  if (!route.path || route.path.length === 0) return false;
  const mid = route.path[Math.floor(route.path.length / 2)];
  if (!mid || mid[0] == null || mid[1] == null) return false;
  const [lng, lat] = mid;
  return lng >= bounds.swLng && lng <= bounds.neLng &&
         lat >= bounds.swLat && lat <= bounds.neLat;
}

/** Distance (km) from a position to the first coordinate of a route's path. */
export function distanceToRouteStart(
  route: Route,
  userPos: { lat: number; lng: number },
): number {
  if (!route.path || route.path.length === 0) return Infinity;
  const start = route.path[0];
  if (!start || start[0] == null || start[1] == null) return Infinity;
  return haversineKm(userPos.lat, userPos.lng, start[1], start[0]);
}

// ── Point-to-polyline (cross-track) distance ─────────────────────────────────
//
// The map polyline is `[[lng, lat], ...]` (Mapbox/GeoJSON convention). The
// route-deviation detector in useRunningPlayer needs the SHORTEST distance
// from the user's GPS sample to the nearest point on this polyline — not just
// the nearest vertex. Cheap nearest-vertex picks (TurnCarousel's
// Manhattan trick) miss the case where the user is perpendicular to a long
// segment between two faraway vertices, and the deviation threshold (40m)
// would never trigger.
//
// Implementation strategy:
//   1. For each polyline segment (A→B), project the user point onto the
//      segment using a flat-earth (equirectangular) approximation centred at
//      the user's latitude. Over urban segment lengths (<1km) the error is
//      under 0.5%, well below the 40m detection threshold's tolerance.
//   2. Convert the projected residual back to metres via 1° lat ≈ 111,320 m
//      and 1° lng ≈ 111,320 × cos(lat).
//   3. Take the minimum across all segments.
//
// Returns Infinity when the path is too short to define a segment, so
// callers can treat "no path" identically to "very far away".

const METERS_PER_DEGREE_LAT = 111_320;

/**
 * Squared distance, in metres-equivalent, from point P to segment A→B,
 * computed in a local equirectangular projection centred at P's latitude.
 *
 * Returns the SQUARED distance (saves the sqrt for the hot loop — only the
 * minimum branch needs the actual metres). All inputs are degrees.
 */
function squaredDistanceToSegmentMeters(
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): number {
  const cosLat = Math.cos((pLat * Math.PI) / 180);
  const mPerDegLng = METERS_PER_DEGREE_LAT * cosLat;

  // Project A, B, P into a flat (x = east-metres, y = north-metres) plane
  // centred at P. P itself lands at the origin.
  const ax = (aLng - pLng) * mPerDegLng;
  const ay = (aLat - pLat) * METERS_PER_DEGREE_LAT;
  const bx = (bLng - pLng) * mPerDegLng;
  const by = (bLat - pLat) * METERS_PER_DEGREE_LAT;

  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;

  // Degenerate segment: A and B are the same point. Distance is just |PA|.
  if (lenSq === 0) return ax * ax + ay * ay;

  // Parametric projection of P onto AB: t = -PA · AB / |AB|² (PA = A - P)
  // P is the origin in our local frame, so PA = (ax, ay).
  // Clamp to [0,1] so the foot of the perpendicular lies within the segment.
  let t = -(ax * abx + ay * aby) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;

  const fx = ax + t * abx;
  const fy = ay + t * aby;
  return fx * fx + fy * fy;
}

/**
 * Shortest distance, in metres, from a `{lat, lng}` point to a polyline
 * stored as an array of `[lng, lat]` pairs (the project-wide convention used
 * by Mapbox, AppMap, focusedRoute.path and useRunningPlayer.activeRoutePath).
 *
 * Returns `Infinity` when `path.length < 2` so callers can use it as a
 * sentinel for "no comparable route" without a separate guard.
 *
 * O(n) over the polyline. Cheap enough to call on every GPS tick (≤1 Hz) for
 * paths of a few thousand vertices.
 */
export function crossTrackDistanceMeters(
  pos: { lat: number; lng: number },
  path: number[][],
): number {
  if (!path || path.length < 2) return Infinity;
  if (pos == null || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) {
    return Infinity;
  }

  let minSq = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (
      !a || !b ||
      typeof a[0] !== 'number' || typeof a[1] !== 'number' ||
      typeof b[0] !== 'number' || typeof b[1] !== 'number'
    ) continue;

    const dSq = squaredDistanceToSegmentMeters(
      pos.lat, pos.lng,
      a[1], a[0],
      b[1], b[0],
    );
    if (dSq < minSq) minSq = dSq;
  }

  return minSq === Infinity ? Infinity : Math.sqrt(minSq);
}

/**
 * Split a coordinate array into GeoJSON segments wherever the zone label
 * changes — used for multi-color live-path rendering on the map.
 */
export function segmentPathByZone(
  coords: [number, number][],
  zones: (string | null)[],
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  if (coords.length < 2) return { type: 'FeatureCollection', features };

  let segStart = 0;
  let currentZone = zones[0] ?? '_default';

  for (let i = 1; i < coords.length; i++) {
    const zone = zones[i] ?? '_default';
    if (zone !== currentZone) {
      features.push({
        type: 'Feature',
        properties: { zoneType: currentZone },
        geometry: {
          type: 'LineString',
          coordinates: coords.slice(segStart, i + 1),
        },
      });
      segStart = i;
      currentZone = zone;
    }
  }

  features.push({
    type: 'Feature',
    properties: { zoneType: currentZone },
    geometry: {
      type: 'LineString',
      coordinates: coords.slice(segStart),
    },
  });

  return { type: 'FeatureCollection', features };
}

/**
 * Compass bearing (0–360°) from point A to point B.
 * 0° = north, 90° = east, 180° = south, 270° = west.
 * Arguments follow the same (lat, lng) order as haversineKm.
 */
export function bearingBetween(
  fromLat: number, fromLng: number,
  toLat: number,   toLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLng = toRad(toLng - fromLng);
  const y = Math.sin(dLng) * Math.cos(toRad(toLat));
  const x =
    Math.cos(toRad(fromLat)) * Math.sin(toRad(toLat)) -
    Math.sin(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

const EARTH_RADIUS_METERS = 6371000;

/**
 * Standard spherical "destination point given distance and bearing" formula
 * (the inverse of `bearingBetween`). Used only for DISPLAY-layer geometry
 * (out-and-back lane offsetting, see `buildLaneOffsetPath`) — never for
 * navigation/distance logic, which always uses the real, un-offset path.
 */
export function destinationPoint(
  lat: number, lng: number,
  distanceMeters: number, bearingDeg: number,
): [number, number] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const delta = distanceMeters / EARTH_RADIUS_METERS;
  const theta = toRad(bearingDeg);
  const phi1 = toRad(lat);
  const lambda1 = toRad(lng);

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta),
  );
  const lambda2 = lambda1 + Math.atan2(
    Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
    Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2),
  );

  return [toDeg(lambda2), toDeg(phi2)]; // [lng, lat]
}

/**
 * Structural detection of an out-and-back ("palindrome") path: does the
 * second half exactly mirror the first half, as produced by
 * `buildOutAndBackPath`? Pure geometry check — doesn't care whether the
 * route is hybrid, short-route-mode, or anything else; any path built that
 * way (`[...outbound, ...outbound.slice(0,-1).reverse()]`) qualifies.
 * `epsilonDeg` is a tiny coordinate-equality tolerance (default ~1cm) to
 * absorb float round-trip noise, not real geometric difference.
 */
export function isOutAndBackPath(
  path: [number, number][],
  epsilonDeg: number = 1e-7,
): boolean {
  if (path.length < 3 || path.length % 2 === 0) return false; // 2n-1 is always odd
  const n = path.length;
  for (let i = 0; i < n; i++) {
    const mirrorIdx = n - 1 - i;
    if (mirrorIdx <= i) break; // reached the middle
    const [lngA, latA] = path[i];
    const [lngB, latB] = path[mirrorIdx];
    if (Math.abs(lngA - lngB) > epsilonDeg || Math.abs(latA - latB) > epsilonDeg) return false;
  }
  return true;
}

/**
 * DISPLAY-ONLY: offsets an out-and-back path's outbound and return legs
 * into two parallel "lanes" so they don't visually overlap on the map —
 * lets direction arrows (Mapbox's automatic line-tangent rotation under
 * symbol-placement:'line') resolve to one correct-per-lane direction
 * instead of two opposite-bearing candidates competing for the same pixel
 * on shared streets (the root cause of "arrows point the wrong way" on
 * out-and-back routes). Each point is offset perpendicular to the path's
 * LOCAL bearing at that point, so the offset follows curves reasonably —
 * not a full cartographic miter-join offset (no new geometry dependency
 * needed for this display-polish use case), but adequate at typical route
 * zoom levels for a few-meter separation.
 *
 * No-op (returns the input unchanged) if the path isn't structurally an
 * out-and-back — safe to call unconditionally.
 */
export function buildLaneOffsetPath(
  path: [number, number][],
  laneOffsetMeters: number = 3,
): [number, number][] {
  if (!isOutAndBackPath(path)) return path;
  const n = path.length;
  const turnaroundIdx = (n - 1) / 2;

  // Smooth taper (4t(1-t), a parabola: 0 at each leg's ends, peak=1 at its
  // midpoint) instead of a constant offset — so the two lanes meet EXACTLY
  // at the true start and the true turnaround (no stitching seam/jump) and
  // only visually separate in the middle of each leg, where separation
  // actually matters for arrow legibility.
  //
  // 15.08.2026 correctness fix: the offset side must be CONSTANT (always
  // "+90° from this point's own local direction of travel", i.e. always
  // keep-right relative to travel direction), NOT flipped by leg. The
  // return leg's local bearing at any point is already ~180° reversed from
  // the outbound leg's (same physical street, opposite direction of
  // travel) — flipping the sign ALSO by leg cancels that reversal back
  // out, so both legs ended up offset to the SAME compass side and the
  // "two lanes" coincided (off by only sub-meter spherical noise, not the
  // intended separation). Caught by a unit test using a straight-line path
  // (where the bug's effect is unmasked instead of hidden in float noise).
  return path.map((point, i) => {
    const prev = path[Math.max(0, i - 1)];
    const next = path[Math.min(n - 1, i + 1)];
    const bearing = bearingBetween(prev[1], prev[0], next[1], next[0]);

    const isOutbound = i <= turnaroundIdx;
    // t: 0 at each leg's TRUE (shared) endpoint, 1 at the OTHER end. Outbound:
    // t=0 at the true start (i=0), t=1 at the turnaround. Return: t=0 at the
    // true end (i=n-1), t=1 at the turnaround. The ramp below (4t(1-t)) is
    // symmetric, so both legs land at ramp=0 on their true/shared points and
    // peak in the middle regardless of which direction t runs.
    const t = isOutbound ? i / turnaroundIdx : (n - 1 - i) / turnaroundIdx;
    const ramp = 4 * t * (1 - t); // 0 → 1 → 0 across the leg
    const perpBearing = (bearing + 90 + 360) % 360;
    const [lng, lat] = destinationPoint(point[1], point[0], laneOffsetMeters * ramp, perpBearing);
    return [lng, lat] as [number, number];
  });
}

/** Linear interpolation between two [lng, lat] points. */
export function interpolatePath(
  p1: [number, number],
  p2: [number, number],
  t: number,
): [number, number] {
  return [
    p1[0] + (p2[0] - p1[0]) * t,
    p1[1] + (p2[1] - p1[1]) * t,
  ];
}

/**
 * True if two [lng, lat] points are the same real-world location within
 * `toleranceMeters` (default 5m — GPS/float slack, not "roughly nearby").
 * Used (15.08.2026) to decide whether a route's start and end are the SAME
 * point (loop / out-and-back → one combined start/finish marker) or
 * genuinely different (point-to-point → a distinct finish marker too).
 */
export function isSameCoord(
  a: [number, number],
  b: [number, number],
  toleranceMeters: number = 5,
): boolean {
  return haversineMeters(a[1], a[0], b[1], b[0]) <= toleranceMeters;
}

/**
 * Total real-world length of a path (sum of consecutive haversine
 * distances), in meters. Pure. Returns 0 for paths shorter than 2 points.
 */
export function pathLengthMeters(path: [number, number][]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    total += haversineMeters(path[i][1], path[i][0], path[i + 1][1], path[i + 1][0]);
  }
  return total;
}

/**
 * Walks `path` and returns the point at `targetMeters` along it (clamped to
 * [0, pathLength]), linearly interpolating within whichever segment
 * contains that distance. Returns null for paths shorter than 2 points.
 */
export function pointAtDistanceAlongPath(
  path: [number, number][],
  targetMeters: number,
): [number, number] | null {
  if (path.length < 2) return null;
  if (targetMeters <= 0) return path[0];
  let accumulated = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const segLen = haversineMeters(path[i][1], path[i][0], path[i + 1][1], path[i + 1][0]);
    if (accumulated + segLen >= targetMeters) {
      const t = segLen > 0 ? (targetMeters - accumulated) / segLen : 0;
      return interpolatePath(path[i], path[i + 1], t);
    }
    accumulated += segLen;
  }
  return path[path.length - 1]; // targetMeters >= total length (float slack)
}

/**
 * Truncates `path` to exactly `targetMeters` of real walked distance,
 * appending the precise interpolated endpoint (via `interpolatePath`)
 * rather than snapping to the nearest vertex — the counterpart to
 * `pointAtDistanceAlongPath` (16.08.2026, user-anchored corridor-flow
 * build): that function returns a single point at a given distance; this
 * one returns the whole path UP TO that point. Returns `path` unchanged
 * when `targetMeters` is >= the path's total real length (nothing to
 * trim) or the path has under 2 points. `targetMeters <= 0` returns a
 * degenerate 1-point path at `path[0]`.
 */
export function sliceFlowPathToDistance(path: [number, number][], targetMeters: number): [number, number][] {
  if (path.length === 0) return path;
  if (targetMeters <= 0) return [path[0]];
  if (path.length < 2) return path;

  // Tiny epsilon (1mm) so a target that lands almost exactly on a vertex
  // (float accumulation error from repeated haversine sums) doesn't overshoot
  // into the NEXT segment and produce a redundant near-duplicate final point.
  const EPSILON_METERS = 0.001;
  let accumulated = 0;
  const result: [number, number][] = [path[0]];
  for (let i = 0; i < path.length - 1; i++) {
    const segLen = haversineMeters(path[i][1], path[i][0], path[i + 1][1], path[i + 1][0]);
    if (accumulated + segLen >= targetMeters - EPSILON_METERS) {
      const t = segLen > 0 ? Math.min(1, (targetMeters - accumulated) / segLen) : 0;
      result.push(interpolatePath(path[i], path[i + 1], t));
      return result;
    }
    result.push(path[i + 1]);
    accumulated += segLen;
  }
  return path; // targetMeters >= total length — nothing to trim
}

export interface DirectionMarker {
  lng: number;
  lat: number;
  /** Compass bearing (0-360°) of net travel direction at this point. */
  bearing: number;
}

// Route-direction-marker placement (15.08.2026 redesign, refined
// 15.08.2026). Constant on-screen density, not scaling with route length:
// short routes taper below the target so they don't look crowded; anything
// ~4km+ is capped at maxCount rather than growing more markers as the
// route gets longer.
const DIRECTION_MARKER_MIN_COUNT = 4;
const DIRECTION_MARKER_MAX_COUNT = 9;
const DIRECTION_MARKER_TARGET_SPACING_METERS = 500;
// Bearing is computed from a window around each marker (before→after, NOT
// the raw bearing of one path segment) so it reads as the net travel
// direction, not a jittery micro-segment on a windy street.
const DIRECTION_MARKER_BEARING_WINDOW_METERS = 30;
// How far in from the TRUE start the dedicated "which way to set off"
// marker sits — close enough to read as "right at the start", far enough
// not to visually collide with the start/finish marker itself.
const DIRECTION_MARKER_START_ANCHOR_METERS = 20;

/**
 * Computes a single marker's position + windowed, seam-aware bearing at
 * `targetMeters` along `path`. Shared by both the start-anchor marker and
 * the regular evenly-spaced interior markers in `buildDirectionMarkers` so
 * the seam-avoidance logic exists in exactly one place. Returns null if
 * the position or window collapses to a degenerate (zero-length) sample.
 */
function markerAtDistance(
  path: [number, number][],
  targetMeters: number,
  totalLength: number,
  bearingWindow: number,
  seams: number[],
): DirectionMarker | null {
  const point = pointAtDistanceAlongPath(path, targetMeters);
  if (!point) return null;

  const halfWindow = bearingWindow / 2;
  let beforeMeters = Math.max(0, targetMeters - halfWindow);
  let afterMeters = Math.min(totalLength, targetMeters + halfWindow);

  // A seam inside this window means the "before" and "after" samples
  // would land on opposite sides of a direction reversal — collapse to
  // a one-sided window (whichever side has more room) instead.
  const straddlesSeam = seams.some((s) => s > beforeMeters && s < afterMeters);
  if (straddlesSeam) {
    const roomBefore = targetMeters - beforeMeters;
    const roomAfter = afterMeters - targetMeters;
    if (roomBefore >= roomAfter) {
      afterMeters = targetMeters;
      beforeMeters = Math.max(0, targetMeters - bearingWindow);
    } else {
      beforeMeters = targetMeters;
      afterMeters = Math.min(totalLength, targetMeters + bearingWindow);
    }
  }

  const before = pointAtDistanceAlongPath(path, beforeMeters);
  const after = pointAtDistanceAlongPath(path, afterMeters);
  if (!before || !after || (before[0] === after[0] && before[1] === after[1])) return null;

  const bearing = bearingBetween(before[1], before[0], after[1], after[0]);
  return { lng: point[0], lat: point[1], bearing };
}

/**
 * Places evenly-spaced direction markers along `path`, by real distance
 * (not vertex count), each with a bearing computed over a short window
 * around its position — see DIRECTION_MARKER_BEARING_WINDOW_METERS. The
 * regular (interior) markers sit in the open interval between the true
 * start and true end (fractions 1/(n+1) .. n/(n+1) of total length) so
 * they never crash into the start marker or look clustered at either end.
 *
 * When `startAnchorMeters` is set (default on — see
 * DIRECTION_MARKER_START_ANCHOR_METERS), ONE extra marker is prepended a
 * short, fixed distance from the true start, pointing the initial travel
 * direction — "which way do I go" was the one position users actually
 * needed an arrow and the regular even-spacing formula doesn't guarantee
 * one lands there. This is IN ADDITION to the regular count, not carved
 * out of it. Not an absolute guarantee: on a loop/out-and-back shorter than
 * ~20m (the anchor distance + half the bearing window), the anchor's
 * before/after window collapses onto the same point as the true start
 * (loops return to it) and the degenerate-sample guard drops it silently —
 * no real route is anywhere near this short, so not worth a fallback path.
 *
 * Call this AFTER any display-only path transform (e.g. buildLaneOffsetPath)
 * — markers placed on an out-and-back's lane-offset path automatically land
 * on the correct lane with the correct per-lane direction (outbound and
 * return legs are roughly equal length, so the count splits ~evenly
 * between them), no special-casing needed.
 */
export function buildDirectionMarkers(
  path: [number, number][],
  opts: {
    minCount?: number;
    maxCount?: number;
    targetSpacingMeters?: number;
    bearingWindowMeters?: number;
    /**
     * Distances-along-path (meters) where the path reverses direction —
     * e.g. an out-and-back turnaround. The windowed bearing sample below
     * NEVER straddles one of these: a marker whose window would cross a
     * seam falls back to a one-sided window (the approach direction only)
     * instead of averaging two opposite travel directions into a
     * near-meaningless, roughly-perpendicular bearing. Found live
     * (15.08.2026): with an odd marker count, one marker always lands
     * EXACTLY at totalLength/2 — the out-and-back turnaround — where a
     * symmetric window samples the outbound lane on one side and the
     * return lane (physically ~the same spot, opposite direction) on the
     * other.
     */
    seamDistances?: number[];
    /**
     * Distance (meters) from the true start for the dedicated "which way
     * to set off" marker. Pass 0/null to disable it entirely. Clamped to
     * at most 30% of total route length so it doesn't push past a
     * meaningful chunk of a very short route.
     */
    startAnchorMeters?: number | null;
  } = {},
): DirectionMarker[] {
  if (path.length < 2) return [];
  const minCount = opts.minCount ?? DIRECTION_MARKER_MIN_COUNT;
  const maxCount = opts.maxCount ?? DIRECTION_MARKER_MAX_COUNT;
  const targetSpacing = opts.targetSpacingMeters ?? DIRECTION_MARKER_TARGET_SPACING_METERS;
  const bearingWindow = opts.bearingWindowMeters ?? DIRECTION_MARKER_BEARING_WINDOW_METERS;
  const seams = opts.seamDistances ?? [];
  const startAnchorMeters = opts.startAnchorMeters === undefined
    ? DIRECTION_MARKER_START_ANCHOR_METERS
    : opts.startAnchorMeters;

  const totalLength = pathLengthMeters(path);
  if (totalLength <= 0) return [];

  const markers: DirectionMarker[] = [];

  if (startAnchorMeters) {
    const anchorMeters = Math.min(startAnchorMeters, totalLength * 0.3);
    const startMarker = markerAtDistance(path, anchorMeters, totalLength, bearingWindow, seams);
    if (startMarker) markers.push(startMarker);
  }

  const rawCount = Math.round(totalLength / targetSpacing);
  const count = Math.min(maxCount, Math.max(minCount, rawCount));

  for (let i = 1; i <= count; i++) {
    const targetMeters = (totalLength * i) / (count + 1);
    const marker = markerAtDistance(path, targetMeters, totalLength, bearingWindow, seams);
    if (marker) markers.push(marker);
  }
  return markers;
}

/**
 * Append the reversed outbound leg so a one-way A→B path becomes a full
 * out-and-back A→B→A. The turnaround vertex (last of `outbound`) is NOT
 * duplicated. Pure. Inputs shorter than 2 vertices are returned unchanged.
 *
 *   [A,B,C] → [A,B,C,B,A]   ·   [A,B] → [A,B,A]   ·   [A] → [A]   ·   [] → []
 *
 * For any input of length n ≥ 2 the result length is 2n − 1.
 */
export function buildOutAndBackPath(outbound: [number, number][]): [number, number][] {
  if (outbound.length < 2) return [...outbound];
  const returnLeg = outbound.slice(0, -1).reverse();
  return [...outbound, ...returnLeg];
}

// ── Route turns (bearing-change derived) ───────────────────────────
//
// Lightweight pre-computation of the maneuver list along a route's
// geometry. Mirrors the same heuristic the retired NavigationHUD used
// (30° threshold, same Hebrew labels) but returns a static array so
// the RouteDetailSheet timeline can render the full upcoming sequence
// without spinning up the navigation engine.
//
// `distanceMeters` is the leg length walked BEFORE arriving at this
// turn — i.e. distance from the previous turn (or the route start, for
// the first turn). This matches Mapbox `step.distance` semantics.

/** 30° matches the heuristic of the retired NavigationHUD. */
const ROUTE_TURN_BEARING_THRESHOLD = 30;

export interface RouteTurn {
  /** Hebrew maneuver label: `ישר` / `ימינה קל` / `שמאלה קל` / `פנה ימינה` / `פנה שמאלה`. */
  instruction: string;
  /** Leg length leading up to this turn, in meters. */
  distanceMeters: number;
  /** Latitude of the turn vertex. */
  lat: number;
  /** Longitude of the turn vertex. */
  lng: number;
  /** Compass bearing (0–360°) of the outgoing segment after the turn. */
  bearingAfter: number;
  /** Index of the turn vertex in the original route path array. */
  pathIndex: number;
  /**
   * Optional street name (e.g. "רחוב הרצל") that the maneuver lands on,
   * resolved by reverse-geocoding the turn vertex. Populated lazily by
   * `TurnCarousel` once the card scrolls near the viewport — undefined
   * until the geocoder responds, `null` if Mapbox returned no match.
   *
   * Why optional: `computeRouteTurns` runs synchronously off the path
   * geometry and has no network access. The street name enrichment is a
   * UI concern (carousel only), so it stays out of the core type's
   * required fields and any consumer that doesn't care (e.g. the
   * legacy NavigationHUD or RouteDetailSheet) keeps working unchanged.
   */
  streetName?: string | null;

  /**
   * True when this "turn" is actually a near-total reversal (~180°) — e.g.
   * the strength-station turnaround vertex on an out-and-back route
   * (15.08.2026 fix). Before this field existed, a genuine U-turn fell
   * through to the same `Math.abs(n) >= 70` bucket as an ordinary sharp
   * turn and was mislabeled "turn left" — see `turnLabelFromDiff`. Consumers
   * that render a curve-following arrow (`turnArrowGeoJSON` in AppMap.tsx)
   * should treat this case specially: the path is symmetric around this
   * vertex (outbound and return legs are the same coordinates reversed), so
   * there is no real "continue in this direction" geometry past it — slice
   * up TO the vertex, not past it.
   */
  isTurnaround?: boolean;
}

/** Near-180° bearing changes are a reversal, not an ordinary sharp turn. */
const ROUTE_TURNAROUND_BEARING_THRESHOLD = 150;

/**
 * Convert a signed bearing-difference (-180..+180) into a Hebrew
 * maneuver label. Identical to the heuristic used by the retired
 * NavigationHUD so the pre-computed timeline reads consistently.
 *
 * Convention: positive diff = clockwise = right turn.
 */
function turnLabelFromDiff(diff: number): string {
  const n = ((diff + 540) % 360) - 180;
  if (Math.abs(n) < 20) return 'ישר';
  if (Math.abs(n) >= ROUTE_TURNAROUND_BEARING_THRESHOLD) return 'פנה לאחור';
  if (n > 0 && n < 70) return 'ימינה קל';
  if (n < 0 && n > -70) return 'שמאלה קל';
  if (n >= 70) return 'פנה ימינה';
  if (n <= -70) return 'פנה שמאלה';
  return 'ישר';
}

/**
 * Walk a `[lng, lat][]` path and emit a turn whenever the bearing
 * change between consecutive segments exceeds the threshold.
 *
 * Returns an empty array for paths shorter than 3 points (no turn
 * possible) so callers can safely render a flat list.
 */
export function computeRouteTurns(path: [number, number][]): RouteTurn[] {
  if (!path || path.length < 3) return [];
  const turns: RouteTurn[] = [];

  let prevBearing = bearingBetween(
    path[0][1], path[0][0],
    path[1][1], path[1][0],
  );
  // Distance accumulator since the last emitted turn (or start).
  let segmentDistance = haversineMeters(
    path[0][1], path[0][0],
    path[1][1], path[1][0],
  );

  for (let i = 1; i < path.length - 1; i++) {
    const segBearing = bearingBetween(
      path[i][1], path[i][0],
      path[i + 1][1], path[i + 1][0],
    );
    const diff = ((segBearing - prevBearing + 540) % 360) - 180;
    const segLen = haversineMeters(
      path[i][1], path[i][0],
      path[i + 1][1], path[i + 1][0],
    );

    if (Math.abs(diff) > ROUTE_TURN_BEARING_THRESHOLD) {
      // `diff` is already normalized to [-180, 180) above — no need to
      // re-normalize before comparing against the turnaround threshold.
      turns.push({
        instruction: turnLabelFromDiff(diff),
        distanceMeters: Math.round(segmentDistance),
        lat: path[i][1],
        lng: path[i][0],
        bearingAfter: segBearing,
        pathIndex: i,
        isTurnaround: Math.abs(diff) >= ROUTE_TURNAROUND_BEARING_THRESHOLD,
      });
      segmentDistance = segLen;
    } else {
      segmentDistance += segLen;
    }
    prevBearing = segBearing;
  }

  return turns;
}
