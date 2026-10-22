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
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { normCity } from '../city-inventory/overview';
import { boundaryPayload, routesPayload } from './layer-geojson';
import { emptyFC, type HubLayerPayload } from './layer-payload';
import type { HubFetchLayer } from './layers';

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

async function readBoundary(db: Firestore, authorityId: string): Promise<HubLayerPayload> {
  const snap = await db.collection('authorities').doc(authorityId).get();
  return boundaryPayload(snap.exists ? snap.data()?.boundaryGeoJSON : null);
}

export async function readHubLayer(db: Firestore, authorityId: string, layer: HubFetchLayer, names: string[]): Promise<HubLayerPayload> {
  switch (layer) {
    case 'boundary': return readBoundary(db, authorityId);
    case 'routes': return readRoutes(db, authorityId, names);
    default: return { featureCollection: emptyFC(), truncated: false, total: 0 };
  }
}
