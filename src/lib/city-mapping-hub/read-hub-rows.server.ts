/**
 * Admin-SDK reads for the hub table (CITY-MAPPING-HUB-DESIGN.md §4.1). Called
 * from GET /api/admin/city-mapping/inventory/all?view=hub — the route has
 * already passed requireSuperAdminApi and read city_inventory + the published
 * routes. Four more reads, each with a field mask (status fields only):
 * authorities, unpublished official_routes, unpublished parks, pending
 * user_contributions. Read-only — nothing here writes.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import type { CityInventory } from '../city-inventory/types';
import {
  buildCityToAuthority,
  buildHubRows,
  countByAuthority,
  isPendingPark,
  isPendingRoute,
  type HubAuthority,
  type HubRow,
} from './rows';

type Data = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : null);

export function toHubAuthority(id: string, a: Data): HubAuthority {
  const c = a.coordinates && typeof a.coordinates === 'object' ? (a.coordinates as Data) : null;
  return {
    id,
    name: str(a.name),
    type: str(a.type),
    population: typeof a.population === 'number' ? a.population : null,
    isActiveClient: a.isActiveClient === true,
    coordinates: c ? { lat: c.lat, lng: c.lng } : null,
    parentAuthorityId: str(a.parentAuthorityId),
    tenantType: str(a.tenantType),
  };
}

export async function readHubRows(db: Firestore, inventories: CityInventory[], publishedRoutes: Data[]): Promise<HubRow[]> {
  const [authSnap, unpublishedRoutes, unpublishedParks, pendingContribs] = await Promise.all([
    db.collection('authorities').select('name', 'type', 'population', 'isActiveClient', 'coordinates', 'parentAuthorityId', 'tenantType').get(),
    db.collection('official_routes').where('published', '==', false).select('authorityId', 'city', 'status', 'published').get(),
    db.collection('parks').where('published', '==', false).select('authorityId', 'city', 'contentStatus', 'published').get(),
    db.collection('user_contributions').where('status', '==', 'pending').select('authorityId').get(),
  ]);
  const authorities = authSnap.docs.map((d) => toHubAuthority(d.id, d.data() ?? {}));
  const cityToAuthority = buildCityToAuthority(authorities, inventories);
  return buildHubRows({
    authorities,
    inventories,
    approved: countByAuthority(publishedRoutes, cityToAuthority),
    pendingRoutes: countByAuthority(unpublishedRoutes.docs.map((d) => d.data() ?? {}).filter(isPendingRoute), cityToAuthority),
    pendingParks: countByAuthority(unpublishedParks.docs.map((d) => d.data() ?? {}).filter(isPendingPark), cityToAuthority),
    // Contributions carry authorityId only (no city) — one without it is counted nowhere, never guessed.
    pendingContributions: countByAuthority(pendingContribs.docs.map((d) => ({ authorityId: (d.data() ?? {}).authorityId })), new Map()),
  });
}
