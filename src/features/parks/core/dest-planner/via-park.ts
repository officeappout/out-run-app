/**
 * "דרך גינת כושר": which nearby fitness parks are worth a stop on the way.
 * Pure. A park qualifies when it is a real fitness park (catalog flags — no
 * guessing from names), not at either end, and the straight-line detour
 * through it is small: ≤ 40% of the direct distance, capped at 0.8 km.
 */
import { haversineKm } from '../services/geoUtils';
import type { LatLng } from './types';

export interface ParkLike {
  id: string;
  name?: string | null;
  location?: { lat?: number | null; lng?: number | null } | null;
  facilityType?: string | null;
  isPrimaryFitness?: boolean;
  hasUsableEquipment?: boolean;
}

export const VIA_PARK_MAX_DETOUR_KM = 0.8;
export const VIA_PARK_MAX_DETOUR_RATIO = 0.4;
/** Minimum allowance so short trips can still pass a park right next to the line. */
export const VIA_PARK_MIN_DETOUR_KM = 0.3;
/** A park this close to the start or the destination is not a stop "on the way". */
export const VIA_PARK_END_GAP_KM = 0.15;
/** Below this direct distance there is no "way" to stop on. */
export const VIA_PARK_MIN_TRIP_KM = 0.4;

export function isFitnessPark(p: ParkLike): boolean {
  return p.facilityType === 'gym_park' || p.isPrimaryFitness === true || p.hasUsableEquipment === true;
}

function loc(p: ParkLike): LatLng | null {
  const lat = p.location?.lat, lng = p.location?.lng;
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

const km = (a: LatLng, b: LatLng) => haversineKm(a.lat, a.lng, b.lat, b.lng);

export interface ViaParkPick { park: ParkLike & { name: string }; location: LatLng; detourKm: number }

/** Up to `max` fitness parks, smallest detour first, never two within 150 m of each other. */
export function pickViaParks(from: LatLng, to: LatLng, parks: ParkLike[], max = 2): ViaParkPick[] {
  const direct = km(from, to);
  if (!Number.isFinite(direct) || direct < VIA_PARK_MIN_TRIP_KM) return [];
  const allowed = Math.min(VIA_PARK_MAX_DETOUR_KM, Math.max(VIA_PARK_MIN_DETOUR_KM, direct * VIA_PARK_MAX_DETOUR_RATIO));
  const scored: ViaParkPick[] = [];
  for (const p of parks) {
    if (!isFitnessPark(p)) continue;
    const name = typeof p.name === 'string' ? p.name.trim() : '';
    const at = loc(p);
    if (!name || !at) continue;
    const a = km(from, at), b = km(at, to);
    if (a < VIA_PARK_END_GAP_KM || b < VIA_PARK_END_GAP_KM) continue;
    const detourKm = a + b - direct;
    if (detourKm > allowed) continue;
    scored.push({ park: { ...p, name }, location: at, detourKm });
  }
  scored.sort((x, y) => x.detourKm - y.detourKm || x.park.id.localeCompare(y.park.id));
  const out: ViaParkPick[] = [];
  for (const s of scored) {
    if (out.length >= max) break;
    if (out.some((o) => km(o.location, s.location) < VIA_PARK_END_GAP_KM)) continue;
    out.push(s);
  }
  return out;
}

/** Distance along `path` ([lng, lat]) to the vertex nearest `point` (km), null for an empty path. */
export function distanceAlongToNearest(path: [number, number][], point: LatLng): number | null {
  if (!Array.isArray(path) || path.length === 0) return null;
  let best = Infinity, bestAlong = 0, along = 0;
  for (let i = 0; i < path.length; i++) {
    if (i > 0) along += haversineKm(path[i - 1][1], path[i - 1][0], path[i][1], path[i][0]);
    const d = haversineKm(path[i][1], path[i][0], point.lat, point.lng);
    if (d < best) { best = d; bestAlong = along; }
  }
  return Number.isFinite(best) ? Math.round(bestAlong * 10) / 10 : null;
}
