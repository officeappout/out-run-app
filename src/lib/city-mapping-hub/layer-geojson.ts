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
import { isPendingPark, isPendingRoute } from './rows';

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

// ── Points (H2) ─────────────────────────────────────────────────────────────

export type HubPointStatus = 'approved' | 'pending';
type PointFeature = GeoJSON.Feature<GeoJSON.Point, Record<string, unknown>>;

/** {lat,lng} (or legacy top-level lat/lng) → [lng, lat] inside Israel's rough box, else null. */
export function pointOf(d: Record<string, unknown>): [number, number] | null {
  const loc = d.location && typeof d.location === 'object' ? (d.location as Record<string, unknown>) : d;
  const lat = num(loc.lat), lng = num(loc.lng);
  if (lat == null || lng == null || lat < 29 || lat > 34 || lng < 33.5 || lng > 36.5) return null;
  return [lng, lat];
}

const point = (id: string, c: [number, number], properties: Record<string, unknown>): PointFeature =>
  ({ type: 'Feature', id, properties: { id, ...properties }, geometry: { type: 'Point', coordinates: c } });

const httpsUrl = (v: unknown) => (typeof v === 'string' && /^https:\/\//.test(v) ? v : null);
const isoOf = (v: unknown): string | null => {
  const d = v && typeof (v as { toDate?: unknown }).toDate === 'function' ? (v as { toDate: () => Date }).toDate() : v instanceof Date ? v : null;
  return d && Number.isFinite(d.getTime()) ? d.toISOString() : null;
};

/** A park the owner / admins entered: approved = published; pending = the approval center's rule. */
export function parkFeature(id: string, d: Record<string, unknown>): PointFeature | null {
  const status: HubPointStatus | null = d.published === true ? 'approved' : isPendingPark(d) ? 'pending' : null;
  const c = pointOf(d);
  if (!status || !c) return null;
  const images = Array.isArray(d.images) ? d.images.map(httpsUrl).filter((u): u is string => !!u) : [];
  const cover = images[0] ?? httpsUrl(d.image);
  return point(id, c, {
    kind: 'park',
    status,
    name: str(d.name) ?? '(ללא שם)',
    facilityType: str(d.facilityType),
    photo: cover,
    photoCount: images.length || (cover ? 1 : 0),
    equipmentCount: Array.isArray(d.gymEquipment) ? d.gymEquipment.length : 0,
    origin: str(d.origin),
  });
}

/** osm_amenities: published / pending (rejected hidden). */
export function amenityFeature(id: string, d: Record<string, unknown>): PointFeature | null {
  const status: HubPointStatus | null = d.status === 'published' ? 'approved' : d.status === 'pending' ? 'pending' : null;
  const c = pointOf(d);
  if (!status || !c) return null;
  return point(id, c, { kind: 'amenity', status, category: str(d.category), name: str(d.name), sport: str(d.sport) });
}

/**
 * user_contributions (pending): "there's a park here" (new_location), photos,
 * equipment / detail edits (suggest_edit), reports, reviews. No user id or
 * free-text PII on the wire — the panel shows what the moderator needs.
 */
export function contributionFeature(id: string, d: Record<string, unknown>): PointFeature | null {
  if (d.status !== 'pending') return null;
  const c = pointOf(d);
  if (!c) return null;
  return point(id, c, {
    kind: 'contribution',
    status: 'pending',
    type: str(d.type),
    name: str(d.parkName),
    facilityType: str(d.facilityType),
    photo: httpsUrl(d.photoUrl),
    equipmentCount: Array.isArray(d.gymEquipment) ? d.gymEquipment.length : 0,
    editSummary: str(d.editSummary),
    issueType: str(d.issueType),
    rating: num(d.rating),
    linkedParkId: str(d.linkedParkId),
    createdAt: isoOf(d.createdAt),
  });
}

export function pointsPayload(docs: Array<{ id: string; data: Record<string, unknown> }>, build: (id: string, d: Record<string, unknown>) => PointFeature | null): HubLayerPayload {
  const seen = new Set<string>();
  const out: GeoJSON.Feature[] = [];
  for (const { id, data } of docs) {
    if (seen.has(id)) continue;
    seen.add(id);
    const f = build(id, data);
    if (f) out.push(f);
  }
  // Pending first, so a cap never cuts the items waiting for a decision.
  out.sort((a, b) => Number(b.properties?.status === 'pending') - Number(a.properties?.status === 'pending'));
  return capped(out);
}
