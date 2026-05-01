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
}

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
      turns.push({
        instruction: turnLabelFromDiff(diff),
        distanceMeters: Math.round(segmentDistance),
        lat: path[i][1],
        lng: path[i][0],
        bearingAfter: segBearing,
        pathIndex: i,
      });
      segmentDistance = segLen;
    } else {
      segmentDistance += segLen;
    }
    prevBearing = segBearing;
  }

  return turns;
}
