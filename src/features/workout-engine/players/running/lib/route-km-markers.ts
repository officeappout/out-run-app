/**
 * route-km-markers — where the "1, 2, 3 …" kilometre badges sit along a
 * route line on the live map (home v2, board R3-prop-route-live).
 *
 * Pure. Arc length comes from route-progress.buildCumulativeMeters (the same
 * metres the progress split and NavBannerV2's % use), so the badge for km 2
 * is exactly where the banner flips past 2.0 km along the route.
 */

import { buildCumulativeMeters, type LngLat } from '@/features/parks/core/services/route-progress';

export interface KmMarker {
  km: number;
  /** [lng, lat] */
  point: LngLat;
}

/** Point at `alongM` metres along `path` (linear between vertices). */
export function pointAtMeters(path: readonly LngLat[], cum: readonly number[], alongM: number): LngLat | null {
  if (path.length < 2 || cum.length !== path.length) return null;
  const total = cum[cum.length - 1];
  if (!Number.isFinite(alongM) || alongM < 0 || alongM > total) return null;
  let i = 0;
  while (i < path.length - 2 && cum[i + 1] < alongM) i++;
  const seg = cum[i + 1] - cum[i];
  const t = seg > 0 ? (alongM - cum[i]) / seg : 0;
  const a = path[i];
  const b = path[i + 1];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * One marker per whole kilometre strictly inside the route. A marker closer
 * than `minGapToEndM` to the finish is dropped (it would sit on the finish
 * flag); `maxMarkers` caps very long routes (a 60 km trail needs no 60 badges
 * at running zoom — every n-th km is kept instead).
 */
export function buildKmMarkers(
  path: readonly LngLat[],
  opts: { minGapToEndM?: number; maxMarkers?: number } = {},
): KmMarker[] {
  if (!Array.isArray(path) || path.length < 2) return [];
  const minGap = opts.minGapToEndM ?? 150;
  const maxMarkers = Math.max(1, opts.maxMarkers ?? 30);
  const cum = buildCumulativeMeters(path);
  const total = cum[cum.length - 1];
  if (!Number.isFinite(total) || total <= 1000) return [];
  const whole = Math.floor((total - minGap) / 1000);
  if (whole < 1) return [];
  const every = Math.ceil(whole / maxMarkers);
  const out: KmMarker[] = [];
  for (let km = every; km <= whole; km += every) {
    const p = pointAtMeters(path, cum, km * 1000);
    if (p) out.push({ km, point: p });
  }
  return out;
}

export function kmMarkersFeatureCollection(markers: readonly KmMarker[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: markers.map((m) => ({
      type: 'Feature',
      properties: { km: m.km, label: String(m.km) },
      geometry: { type: 'Point', coordinates: [m.point[0], m.point[1]] },
    })),
  };
}
