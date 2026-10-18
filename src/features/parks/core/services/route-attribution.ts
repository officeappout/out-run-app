/**
 * route-attribution.ts — PURE: which data-source credits a route needs.
 *
 * Licences (docs/TRAILS-PILOT-SHAAR-HANEGEV.md §5):
 *   - OpenStreetMap (ODbL 1.0): "© OpenStreetMap contributors", linked to
 *     https://www.openstreetmap.org/copyright, on every screen showing
 *     OSM-derived routes.
 *   - Copernicus GLO-30: credit required when its elevation is shown/stored.
 *
 * Driven ONLY by the route's own provenance (written by scripts/trails), so
 * routes without it render exactly as before.
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

export function routeDataCredits(route: Pick<Route, 'provenance'> & { trail?: Route['trail'] } | null | undefined): RouteCredit[] {
  if (!route) return [];
  const out: RouteCredit[] = [];
  const p = route.provenance;
  if (p?.osm || route.trail?.license === 'ODbL-1.0') out.push({ key: 'osm', text: OSM_CREDIT, href: OSM_COPYRIGHT_URL });
  if (p?.elevation?.provider === 'copernicus-glo30') out.push({ key: 'copernicus', text: COPERNICUS_CREDIT });
  return out;
}
