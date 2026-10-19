/**
 * Our routes on the wire (app → POST /api/routes/generate): only the stretches
 * within the loop radius, simplified to WIRE_TOLERANCE_M and rounded to ~1 m,
 * capped in count and points. The server never reads route collections itself
 * — the app already has these lines (the same loader the Mapbox path uses).
 */
import type { LngLat, OurRouteLine } from '@/lib/route-quality';
import { clipLineToRadius, round5, simplifyLineM } from './simplify';

export interface WireOurRoute { id: string; path: [number, number][] }

export const WIRE_MAX_ROUTES = 60;
export const WIRE_MAX_POINTS = 4000;
const WIRE_TOLERANCE_M = 4;

export function toWireOurRoutes(lines: OurRouteLine[], start: { lat: number; lng: number }, radiusKm: number): WireOurRoute[] {
  const center: LngLat = [start.lng, start.lat];
  const out: WireOurRoute[] = [];
  let points = 0;
  for (const l of lines) {
    const stretches = clipLineToRadius(l.path, center, radiusKm * 1000);
    stretches.forEach((s, k) => {
      if (out.length >= WIRE_MAX_ROUTES) return;
      const path = simplifyLineM(s, WIRE_TOLERANCE_M).map(p => [round5(p[0]), round5(p[1])] as [number, number]);
      if (path.length < 2 || points + path.length > WIRE_MAX_POINTS) return;
      points += path.length;
      out.push({ id: stretches.length > 1 ? `${l.id}#${k}` : l.id, path });
    });
  }
  return out;
}

const ISRAEL = { south: 29.3, north: 33.5, west: 34.0, east: 35.95 };
const okPoint = (p: unknown): p is [number, number] =>
  Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number' &&
  p[0] >= ISRAEL.west && p[0] <= ISRAEL.east && p[1] >= ISRAEL.south && p[1] <= ISRAEL.north;

/** Validated lines, or undefined when the field is absent / malformed (the request still runs, without it). */
export function parseWireOurRoutes(v: unknown): OurRouteLine[] | undefined {
  if (!Array.isArray(v) || v.length === 0 || v.length > WIRE_MAX_ROUTES) return undefined;
  const out: OurRouteLine[] = [];
  let points = 0;
  for (const r of v as Array<{ id?: unknown; path?: unknown }>) {
    if (!r || typeof r.id !== 'string' || r.id.length > 160 || !Array.isArray(r.path) || r.path.length < 2) return undefined;
    if (!r.path.every(okPoint)) return undefined;
    points += r.path.length;
    if (points > WIRE_MAX_POINTS) return undefined;
    out.push({ id: r.id, path: r.path as LngLat[] });
  }
  return out;
}
