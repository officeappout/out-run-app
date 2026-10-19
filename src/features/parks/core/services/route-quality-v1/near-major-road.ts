import type { OsmRoadLayer } from '@/lib/route-quality';

/** A segment anchor this close to a tertiary+ centerline is that road's sidewalk, not a quiet street. */
const NEAR_M = 18;

/** True when (lat,lng) is within NEAR_M of any tertiary+ road in the layer (bbox-prefiltered scan). */
export function nearMajorRoad(osm: OsmRoadLayer, lat: number, lng: number): boolean {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180), ky = 110574;
  const padLat = NEAR_M / ky, padLng = NEAR_M / kx;
  for (const r of osm.roads) {
    for (let i = 1; i < r.coords.length; i++) {
      const [x0, y0] = r.coords[i - 1], [x1, y1] = r.coords[i];
      if (lng < Math.min(x0, x1) - padLng || lng > Math.max(x0, x1) + padLng) continue;
      if (lat < Math.min(y0, y1) - padLat || lat > Math.max(y0, y1) + padLat) continue;
      const ax = (x0 - lng) * kx, ay = (y0 - lat) * ky, bx = (x1 - lng) * kx, by = (y1 - lat) * ky;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
      if (Math.hypot(ax + t * dx, ay + t * dy) <= NEAR_M) return true;
    }
  }
  return false;
}
