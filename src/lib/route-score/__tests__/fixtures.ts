import type { LngLat } from '../types';

const M_PER_DEG_LAT = 111_320;
const mPerDegLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

/** Closed rectangle loop (w × h metres) starting at the SW corner, ~25 m vertex spacing. */
export function rectLoop(lng: number, lat: number, wM: number, hM: number): LngLat[] {
  const dx = wM / mPerDegLng(lat);
  const dy = hM / M_PER_DEG_LAT;
  const corners: LngLat[] = [[lng, lat], [lng + dx, lat], [lng + dx, lat + dy], [lng, lat + dy], [lng, lat]];
  const out: LngLat[] = [];
  for (let k = 0; k < corners.length - 1; k++) {
    const [a, b] = [corners[k], corners[k + 1]];
    const lenM = Math.hypot((b[0] - a[0]) * mPerDegLng(lat), (b[1] - a[1]) * M_PER_DEG_LAT);
    const n = Math.max(1, Math.round(lenM / 25));
    for (let s = 0; s < n; s++) out.push([a[0] + ((b[0] - a[0]) * s) / n, a[1] + ((b[1] - a[1]) * s) / n]);
  }
  out.push(corners[corners.length - 1]);
  return out;
}

/** Straight line eastwards, lenM metres. */
export function line(lng: number, lat: number, lenM: number): LngLat[] {
  const n = Math.max(2, Math.round(lenM / 25));
  const dx = lenM / mPerDegLng(lat);
  return Array.from({ length: n + 1 }, (_, k) => [lng + (dx * k) / n, lat] as LngLat);
}

/** "הקפת פארק המסילה" (official_routes/CY5KMrNMD90UAyuU3wom) — the calibration anchor, NATIONWIDE-PLAN.md §1.4. */
export function parkHaMesilaDoc(): Record<string, any> {
  return {
    name: 'הקפת פארק המסילה',
    city: 'תל אביב-יפו',
    authorityId: 'tlv',
    activityType: 'running',
    distance: 2.3,
    routeShape: 'loop',
    path: rectLoop(34.78, 32.06, 1000, 150).map(([lng, lat]) => ({ lng, lat })),
    source: { type: 'official_api', name: 'OSM Geo-Discovery', externalId: 'osm:way/123' },
    qualitySignals: {
      composition: { genuinePct: 88.6, sidewalkPct: 5, ordinaryPct: 6.4, otherPct: 0 },
      lighting: { status: 'computed', litCoveragePct: 90, isLit: true },
      source: 'osm_overpass_v1',
    },
  };
}
