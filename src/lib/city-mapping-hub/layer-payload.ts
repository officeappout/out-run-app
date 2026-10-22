/**
 * city-mapping-hub/layer-payload.ts — the wire shape of one hub map layer
 * (GeoJSON + truncation), shared by the server builders and the client
 * loader. Pure, dependency-free (safe for the browser bundle).
 */
import { HUB_LAYER_FEATURE_CAP } from './layers';

export type FC = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>;

export interface HubLayerPayload {
  featureCollection: FC;
  /** More than HUB_LAYER_FEATURE_CAP features existed; only the first N are here. */
  truncated: boolean;
  /** Features before the cap. */
  total: number;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const emptyFC = (): FC => ({ type: 'FeatureCollection', features: [] });

export function capped(features: GeoJSON.Feature[]): HubLayerPayload {
  return {
    featureCollection: { type: 'FeatureCollection', features: features.slice(0, HUB_LAYER_FEATURE_CAP) as FC['features'] },
    truncated: features.length > HUB_LAYER_FEATURE_CAP,
    total: features.length,
  };
}


/** [minLng, minLat, maxLng, maxLat] over every coordinate, or null for an empty collection. */
export function bboxOf(...fcs: Array<FC | null | undefined>): [number, number, number, number] | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const visit = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number' && typeof c[1] === 'number') {
      const [x, y] = c as number[];
      if (Number.isFinite(x) && Number.isFinite(y)) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      return;
    }
    for (const x of c) visit(x);
  };
  for (const fc of fcs) for (const f of fc?.features ?? []) {
    const g = f.geometry as { coordinates?: unknown } | null;
    if (g && 'coordinates' in g) visit(g.coordinates);
  }
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

/** Wire → payload, re-guarded (the client never trusts the JSON shape). */
export function parseLayerPayload(o: unknown): HubLayerPayload {
  const r = o && typeof o === 'object' ? (o as Record<string, unknown>) : {};
  const fc = r.featureCollection as FC | undefined;
  const features = fc && fc.type === 'FeatureCollection' && Array.isArray(fc.features)
    ? fc.features.filter((f) => f && f.type === 'Feature' && f.geometry)
    : [];
  return {
    featureCollection: { type: 'FeatureCollection', features },
    truncated: r.truncated === true,
    total: num(r.total) ?? features.length,
  };
}
