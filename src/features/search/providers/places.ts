/**
 * Parks + official routes providers — the same cached lists the map search uses (fetchRealParks,
 * getCachedOfficialRoutes), matched on name / city, ranked by match then distance. Also the
 * "nearest" lists for the empty parks / routes chips and the map's quick chips. Ranking is pure.
 */
import { fetchRealParks } from '@/features/parks/core/services/parks.service';
import { getCachedOfficialRoutes } from '@/features/parks/core/services/inventory.service';
import type { Park } from '@/features/parks/core/types/park.types';
import type { Route } from '@/features/parks/core/types/route.types';
import { scoreFields } from '../core/text';
import type { LatLng, ParkHit, RouteHit } from '../core/types';

let parksPromise: Promise<Park[]> | null = null;
export function loadParks(): Promise<Park[]> {
  if (!parksPromise) parksPromise = fetchRealParks().catch((e) => { parksPromise = null; throw e; });
  return parksPromise;
}
export const loadRoutes = (): Promise<Route[]> => getCachedOfficialRoutes();

export function haversineKm(a: LatLng, b: LatLng): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const validLoc = (l: { lat?: number; lng?: number } | undefined): l is LatLng =>
  !!l && Number.isFinite(l.lat) && Number.isFinite(l.lng) && (l.lat !== 0 || l.lng !== 0);

/** Minor urban spots (fountains, toilets …) are not "gardens". */
const isGarden = (p: Park) => p.isMinor !== true;

function parkHit(p: Park, score: number, pos: LatLng | null): ParkHit {
  const km = pos && validLoc(p.location) ? haversineKm(pos, p.location) : null;
  return { kind: 'park', key: `park:${p.id}`, id: p.id, title: p.name, subtitle: p.city || undefined, score, distanceKm: km };
}

function routeStart(r: Route): LatLng | null {
  const first = Array.isArray(r.path) ? r.path[0] : null;
  return first && Number.isFinite(first[1]) && Number.isFinite(first[0]) ? { lat: first[1], lng: first[0] } : null;
}

function routeHit(r: Route, score: number, pos: LatLng | null): RouteHit {
  const start = routeStart(r);
  const km = pos && start ? haversineKm(pos, start) : null;
  const len = typeof r.distance === 'number' ? r.distance : undefined;
  return {
    kind: 'route', key: `route:${r.id}`, id: r.id, title: r.name, score, distanceKm: km, lengthKm: len,
    subtitle: r.city || undefined, // PlaceRow puts the length (lengthKm) in front of the city
  };
}

/** Closer wins a tie; a hit within 2 km gets a small boost so "the one near me" comes first. */
const near = (km: number | null) => (km == null ? 0 : km < 2 ? 4 : km < 10 ? 2 : 0);

export function rankParks(parks: readonly Park[], query: string, pos: LatLng | null, max = 40): ParkHit[] {
  return parks
    .filter(isGarden)
    .map((p) => ({ p, s: scoreFields([[p.name, 1], [p.city, 0.6]], query) }))
    .filter((x) => x.s > 0)
    .map(({ p, s }) => { const h = parkHit(p, s, pos); h.score += near(h.distanceKm); return h; })
    .sort((a, b) => b.score - a.score || (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9))
    .slice(0, max);
}

export function rankRoutes(routes: readonly Route[], query: string, pos: LatLng | null, max = 30): RouteHit[] {
  return routes
    .filter((r) => Array.isArray(r.path) && r.path.length > 0)
    .map((r) => ({ r, s: scoreFields([[r.name, 1], [r.city, 0.6]], query) }))
    .filter((x) => x.s > 0)
    .map(({ r, s }) => { const h = routeHit(r, s, pos); h.score += near(h.distanceKm); return h; })
    .sort((a, b) => b.score - a.score || (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9))
    .slice(0, max);
}

export function nearestParks(parks: readonly Park[], pos: LatLng, n = 10, filter: (p: Park) => boolean = isGarden): ParkHit[] {
  return parks
    .filter((p) => filter(p) && validLoc(p.location))
    .map((p) => parkHit(p, 1, pos))
    .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9))
    .slice(0, n);
}

export function nearestRoutes(routes: readonly Route[], pos: LatLng, n = 10): RouteHit[] {
  return routes
    .filter((r) => routeStart(r))
    .map((r) => routeHit(r, 1, pos))
    .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9))
    .slice(0, n);
}

/** Fitness gardens only (map quick chip "גינות כושר"). */
export const isFitnessGarden = (p: Park) => isGarden(p) && (p.isPrimaryFitness === true || p.facilityType === 'gym_park');

export function countParksWithin(parks: readonly Park[], pos: LatLng, km: number): number {
  return parks.filter((p) => isGarden(p) && validLoc(p.location) && haversineKm(pos, p.location) <= km).length;
}

export async function searchParks(query: string, pos: LatLng | null): Promise<ParkHit[]> {
  return rankParks(await loadParks(), query, pos);
}
export async function searchRoutes(query: string, pos: LatLng | null): Promise<RouteHit[]> {
  return rankRoutes(await loadRoutes(), query, pos);
}

export const parkHref = (id: string) => `/map?openPark=${encodeURIComponent(id)}`;
export const routeHref = (id: string) => `/map?openRoute=${encodeURIComponent(id)}`;
