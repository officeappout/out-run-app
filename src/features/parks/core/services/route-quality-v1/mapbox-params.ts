/**
 * Mapbox Directions params for a v1 loop call: prefer walkways, and pin each
 * snapped waypoint to its street (radius) + travel direction (bearing) so the
 * router passes THROUGH the street instead of driving to the point and
 * U-turning. The loop visits waypoints in increasing compass bearing around
 * the user (clockwise), so the wanted direction at a waypoint is its azimuth
 * from the user + 90°; the street orientation closest to that is used, and a
 * street that runs radially (no good orientation) gets no bearing at all.
 *
 * alley_bias is left at Mapbox's default: Israeli "alleys" are mostly quiet
 * service lanes, and pushing away from them pushes toward main roads.
 */
import type { MapboxDirectionsExtraParams } from '../mapbox.service';
import { compassBearing } from './segment-anchor';

export const WAYPOINT_RADIUS_M = 25;
const BEARING_RANGE_DEG = 45;
const MAX_ALIGN_DEG = 50;

export interface LoopWaypoint { lat: number; lng: number; bearingDeg?: number; snapped?: boolean }

const angDiff = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/** Travel bearing for a waypoint on a clockwise sweep, or null when the street doesn't run that way. */
export function travelBearing(user: { lat: number; lng: number }, wp: LoopWaypoint): number | null {
  if (wp.bearingDeg == null || !wp.snapped) return null;
  const want = (compassBearing(user, wp) + 90) % 360;
  const fwd = ((wp.bearingDeg % 360) + 360) % 360;
  const back = (fwd + 180) % 360;
  const pick = angDiff(fwd, want) <= angDiff(back, want) ? fwd : back;
  return angDiff(pick, want) <= MAX_ALIGN_DEG ? Math.round(pick) : null;
}

export function buildLoopDirectionsParams(
  user: { lat: number; lng: number },
  waypoints: LoopWaypoint[],
  profile: 'walking' | 'cycling',
  opts: { pinWaypoints: boolean } = { pinWaypoints: true },
): MapboxDirectionsExtraParams {
  const params: MapboxDirectionsExtraParams = { continue_straight: 'true', alternatives: 'false' };
  if (profile === 'walking') params.walkway_bias = '1';
  if (!opts.pinWaypoints) return params;
  const radiuses = ['unlimited', ...waypoints.map(w => (w.snapped ? String(WAYPOINT_RADIUS_M) : 'unlimited')), 'unlimited'];
  const bearings = ['', ...waypoints.map(w => { const b = travelBearing(user, w); return b == null ? '' : `${b},${BEARING_RANGE_DEG}`; }), ''];
  params.radiuses = radiuses.join(';');
  if (bearings.some(Boolean)) params.bearings = bearings.join(';');
  return params;
}
