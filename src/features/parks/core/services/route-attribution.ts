/**
 * route-attribution.ts — PURE: which data-source credits a route needs.
 *
 * Licences (docs/trails-pilot/TRAILS-PILOT-SHAAR-HANEGEV.md §5):
 *   - OpenStreetMap (ODbL 1.0): "© OpenStreetMap contributors", linked to
 *     https://www.openstreetmap.org/copyright, on every screen showing
 *     OSM-derived routes.
 *   - Copernicus GLO-30: credit required when its elevation is shown/stored.
 *
 * OSM credit is driven by the route's own data — any of:
 *   - provenance.osm / trail.license 'ODbL-1.0'   (scripts/trails pipeline)
 *   - origin 'osm_import'                         (scripts/geo-discovery-routes.ts,
 *     src/lib/trail-graph/firestore-docs.ts, admin approval-center OSM imports)
 *   - source.externalId 'osm:rel/…' | 'osm:way/…' | 'osm:stitched/…'
 *     (geo-discovery / import-osm-routes-tlv keys)
 *   - source.name naming OSM ('OSM Geo-Discovery', 'OSM trails (Geofabrik)', …)
 *   - non-empty sourceWayIds (stitched OSM ways)
 *   - qualitySignals.source 'osm_overpass_v1' (attributes derived from OSM ways)
 * Routes with none of these (manually drawn, user-generated) render exactly
 * as before. Copernicus credit is still provenance-only.
 */
import type { Route } from '../types/route.types';

export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';
export const OSM_CREDIT = '© OpenStreetMap contributors';
export const COPERNICUS_CREDIT = 'Elevation: Copernicus WorldDEM-30 © DLR/Airbus';

export interface RouteCredit {
  key: 'osm' | 'copernicus';
  text: string;
  href?: string;
}

/**
 * Loose shape — Firestore docs are spread into Route as-is
 * (InventoryService.fetchOfficialRoutes), so fields like `origin:'osm_import'`
 * and `sourceWayIds` arrive at runtime even though Route's static type
 * doesn't list them.
 */
export interface RouteCreditInput {
  provenance?: Route['provenance'];
  trail?: Route['trail'];
  origin?: string | null;
  source?: { name?: string | null; externalId?: string | null } | null;
  sourceWayIds?: unknown;
  qualitySignals?: { source?: string | null } | null;
}

const OSM_EXTERNAL_ID = /^osm:/i;
const OSM_SOURCE_NAME = /\bOSM\b|openstreetmap/i;

/** True when the route's geometry or attributes come from OpenStreetMap. */
export function isOsmDerivedRoute(route: RouteCreditInput | null | undefined): boolean {
  if (!route) return false;
  if (route.provenance?.osm || route.trail?.license === 'ODbL-1.0') return true;
  if (route.origin === 'osm_import') return true;
  const src = route.source;
  if (typeof src?.externalId === 'string' && OSM_EXTERNAL_ID.test(src.externalId)) return true;
  if (typeof src?.name === 'string' && OSM_SOURCE_NAME.test(src.name)) return true;
  if (Array.isArray(route.sourceWayIds) && route.sourceWayIds.length > 0) return true;
  if (route.qualitySignals?.source === 'osm_overpass_v1') return true;
  return false;
}

export function routeDataCredits(route: RouteCreditInput | null | undefined): RouteCredit[] {
  if (!route) return [];
  const out: RouteCredit[] = [];
  const p = route.provenance;
  if (isOsmDerivedRoute(route)) out.push({ key: 'osm', text: OSM_CREDIT, href: OSM_COPYRIGHT_URL });
  if (p?.elevation?.provider === 'copernicus-glo30') out.push({ key: 'copernicus', text: COPERNICUS_CREDIT });
  return out;
}
