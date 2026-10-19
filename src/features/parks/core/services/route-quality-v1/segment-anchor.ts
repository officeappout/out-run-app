/**
 * A waypoint ON a street segment: the point halfway along the segment's own
 * geometry (not the stored midpoint/centroid, which can sit off the street on
 * a bent way) and the street's compass bearing there — so Mapbox can be told
 * to pass THROUGH the street in a given direction instead of U-turning at a
 * snapped point.
 */
type P = { lat: number; lng: number };

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

function distM(a: P, b: P): number {
  const x = rad(b.lng - a.lng) * Math.cos(rad((a.lat + b.lat) / 2));
  const y = rad(b.lat - a.lat);
  return Math.hypot(x, y) * R;
}

/** Compass bearing a→b in degrees, 0..360. */
export function compassBearing(a: P, b: P): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export interface SegmentAnchor { lat: number; lng: number; bearingDeg: number; lengthM: number }

export function anchorOnSegment(path: P[] | undefined | null): SegmentAnchor | null {
  if (!path || path.length < 2) return null;
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + distM(path[i - 1], path[i]));
  const total = cum[cum.length - 1];
  if (!(total > 0)) return null;
  const half = total / 2;
  let i = 1;
  while (i < path.length - 1 && cum[i] < half) i++;
  const a = path[i - 1], b = path[i];
  const seg = cum[i] - cum[i - 1] || 1;
  const t = (half - cum[i - 1]) / seg;
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
    bearingDeg: compassBearing(a, b),
    lengthM: total,
  };
}
