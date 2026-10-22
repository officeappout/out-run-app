/**
 * Admin-SDK readers behind GET /api/admin/city-mapping/hub/layers
 * (CITY-MAPPING-HUB-DESIGN.md §4.2). One authority, one layer per call.
 * READ-ONLY — nothing here writes. The route has already passed
 * requireSuperAdminApi + the enable_city_mapping_hub gate and validated
 * `authorityId` / `layer`.
 *
 * Routes: `official_routes where authorityId == id` PLUS `where city in
 * [the authority's names]` — 156 / 183 docs had no authorityId (16.08), so
 * the legacy city-name fallback is required, exactly like the table's counts.
 * Parks get the same fallback (`city` is optional on parks). osm_amenities
 * always carry authorityId (OsmAmenity.authorityId is required at ingest) and
 * user_contributions carry it or nothing — no name guessing for those.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { normCity } from '../city-inventory/overview';
import { amenityFeature, boundaryPayload, contributionFeature, parkFeature, pointsPayload, routesPayload } from './layer-geojson';
import { emptyFC, type HubLayerPayload } from './layer-payload';
import { AMENITY_LAYER_CATEGORY, type AmenityFetchLayer, type HubFetchLayer } from './layers';

type Data = Record<string, unknown>;

export interface AuthorityNames {
  exists: boolean;
  names: string[];
}

/** The authority's name + its inventory city, raw and normalized (Firestore `in` is exact match). Max 30 for `in`. */
export async function readAuthorityNames(db: Firestore, authorityId: string): Promise<AuthorityNames> {
  const [a, inv] = await db.getAll(
    db.collection('authorities').doc(authorityId),
    db.collection('city_inventory').doc(authorityId),
    { fieldMask: ['name', 'city'] },
  );
  const raw = [a?.data()?.name, inv?.data()?.city].filter((v): v is string => typeof v === 'string' && !!v.trim());
  const names = Array.from(new Set(raw.flatMap((n) => [n, n.trim(), normCity(n)]).filter(Boolean))).slice(0, 30);
  return { exists: !!a?.exists || !!inv?.exists, names };
}

async function readRoutes(db: Firestore, authorityId: string, names: string[]): Promise<HubLayerPayload> {
  const col = db.collection('official_routes');
  const fields = ['name', 'path', 'published', 'status', 'distance', 'origin', 'activityType', 'type', 'city', 'authorityId'];
  const [byId, byCity] = await Promise.all([
    col.where('authorityId', '==', authorityId).select(...fields).get(),
    names.length ? col.where('city', 'in', names).select(...fields).get() : Promise.resolve(null),
  ]);
  const docs = [...byId.docs, ...(byCity?.docs ?? [])]
    .map((d) => ({ id: d.id, data: (d.data() ?? {}) as Data }))
    // A city-name match that belongs to ANOTHER authority is not ours.
    .filter((d) => !d.data.authorityId || d.data.authorityId === authorityId);
  return routesPayload(docs);
}

const docsOf = (snaps: Array<{ docs: Array<{ id: string; data: () => Data | undefined }> } | null>) =>
  snaps.flatMap((s) => s?.docs ?? []).map((d) => ({ id: d.id, data: (d.data() ?? {}) as Data }));

async function readParks(db: Firestore, authorityId: string, names: string[]): Promise<HubLayerPayload> {
  const col = db.collection('parks');
  const fields = ['name', 'location', 'lat', 'lng', 'published', 'contentStatus', 'facilityType', 'images', 'image', 'gymEquipment', 'origin', 'authorityId', 'city'];
  const [byId, byCity] = await Promise.all([
    col.where('authorityId', '==', authorityId).select(...fields).get(),
    names.length ? col.where('city', 'in', names).select(...fields).get() : Promise.resolve(null),
  ]);
  const docs = docsOf([byId, byCity]).filter((d) => !d.data.authorityId || d.data.authorityId === authorityId);
  return pointsPayload(docs, parkFeature);
}

async function readAmenities(db: Firestore, authorityId: string, layer: AmenityFetchLayer): Promise<HubLayerPayload> {
  const snap = await db.collection('osm_amenities')
    .where('authorityId', '==', authorityId)
    .where('category', '==', AMENITY_LAYER_CATEGORY[layer])
    .select('location', 'status', 'category', 'name', 'sport')
    .get();
  return pointsPayload(docsOf([snap]), amenityFeature);
}

async function readContributions(db: Firestore, authorityId: string): Promise<HubLayerPayload> {
  const snap = await db.collection('user_contributions')
    .where('authorityId', '==', authorityId)
    .where('status', '==', 'pending')
    .select('type', 'status', 'location', 'photoUrl', 'parkName', 'facilityType', 'gymEquipment', 'editSummary', 'issueType', 'rating', 'linkedParkId', 'createdAt')
    .get();
  return pointsPayload(docsOf([snap]), contributionFeature);
}

async function readBoundary(db: Firestore, authorityId: string): Promise<HubLayerPayload> {
  const snap = await db.collection('authorities').doc(authorityId).get();
  return boundaryPayload(snap.exists ? snap.data()?.boundaryGeoJSON : null);
}

export async function readHubLayer(db: Firestore, authorityId: string, layer: HubFetchLayer, names: string[]): Promise<HubLayerPayload> {
  switch (layer) {
    case 'boundary': return readBoundary(db, authorityId);
    case 'routes': return readRoutes(db, authorityId, names);
    case 'parks': return readParks(db, authorityId, names);
    case 'contributions': return readContributions(db, authorityId);
    case 'fitness': case 'courts': case 'benches': case 'water': case 'crossings':
      return readAmenities(db, authorityId, layer);
    default: return { featureCollection: emptyFC(), truncated: false, total: 0 };
  }
}
