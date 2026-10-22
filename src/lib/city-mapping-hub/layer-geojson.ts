/**
 * city-mapping-hub/layer-geojson.ts — Firestore doc data → small GeoJSON for
 * the hub map (CITY-MAPPING-HUB-DESIGN.md §4.2 / §5). Pure; the server reader
 * (layers.server.ts) feeds it Admin-SDK docs. Properties are kept minimal
 * (id, status, name …) and lines are simplified (~5 m) on the server.
 */
import { normalizeStoredRoutePath, type LngLat } from '@/features/parks/core/utils/routePath';
import { simplifyLineM } from '@/lib/routing/our-routes/simplify';
import { parseBoundaryGeoJSON } from '@/lib/route-collections/authority-resolution';
import { capped, type HubLayerPayload } from './layer-payload';
import { isPendingRoute } from './rows';

export type HubRouteStatus = 'approved' | 'pending';

const ROUTE_SIMPLIFY_M = 5;
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** approved = published; pending = the approval center's rule; archived / rejected ⇒ null (hidden). */
export function routeStatus(d: Record<string, unknown>): HubRouteStatus | null {
  if (d.published === true) return 'approved';
  return isPendingRoute(d) ? 'pending' : null;
}

export function routeFeature(id: string, d: Record<string, unknown>): GeoJSON.Feature<GeoJSON.LineString, Record<string, unknown>> | null {
  const status = routeStatus(d);
  if (!status) return null;
  const path: LngLat[] = simplifyLineM(normalizeStoredRoutePath(d.path), ROUTE_SIMPLIFY_M);
  if (path.length < 2) return null;
  return {
    type: 'Feature',
    id,
    properties: {
      id,
      kind: 'route',
      status,
      name: str(d.name) ?? '(ללא שם)',
      distanceKm: num(d.distance),
      origin: str(d.origin),
      activityType: str(d.activityType) ?? str(d.type),
      city: str(d.city),
    },
    geometry: { type: 'LineString', coordinates: path },
  };
}

/** Docs from several queries (authorityId + legacy city names) → one collection, de-duplicated by id, capped. */
export function routesPayload(docs: Array<{ id: string; data: Record<string, unknown> }>): HubLayerPayload {
  const seen = new Set<string>();
  const features: GeoJSON.Feature[] = [];
  for (const { id, data } of docs) {
    if (seen.has(id)) continue;
    seen.add(id);
    const f = routeFeature(id, data);
    if (f) features.push(f);
  }
  return capped(features);
}

export function boundaryPayload(raw: unknown): HubLayerPayload {
  const f = parseBoundaryGeoJSON(raw);
  return capped(f ? [{ ...f, properties: { kind: 'boundary' } }] : []);
}
