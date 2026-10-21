/**
 * city-inventory/measure-parks.ts — parks / big parks / lap loops for one
 * authority (plan §2.3; owner 21.10.2026). Pure.
 *
 *   - parks: every public park-like polygon (isParkLikeArea) inside the city;
 *   - big parks: the RC3 Q7 rule exactly as park-loops applies it — named
 *     park / nature_reserve / recreation_ground, same-name polygons ≤ 50 m
 *     apart merged first, then ≥ 80,000 m² or perimeter ≥ 1.2 km
 *     (imported from src/lib/park-loops, never copied);
 *   - lap loops: any other park-like polygon whose outer perimeter is
 *     ≥ LAP_LOOP_MIN_PERIMETER_M (I0's proxy for the walkable perimeter).
 * A polygon that is part of a big park is never also a lap loop.
 */
import { isBigPark, mergeSameName, toPark, type RawArea } from '@/lib/park-loops/select-parks';
import { pathLengthM, ringAreaM2 } from '@/lib/park-loops/geometry';
import type { LngLat, ParkPolygon } from '@/lib/park-loops/types';
import { LAP_LOOP_MIN_PERIMETER_M, isParkLikeArea } from './park-size';
import type { OsmTags } from './types';

export interface ParkArea { id: string; tags: OsmTags; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown } }

export interface ParkTallies {
  parks: number;
  parksAreaM2: number;
  bigParks: number;
  bigParksAreaM2: number;
  lapLoops: number;
  lapLoopsAreaM2: number;
}

function polygons(g: ParkArea['geometry']): LngLat[][][] {
  const raw = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
  return (Array.isArray(raw) ? raw : []).filter(Array.isArray) as LngLat[][][];
}

/** Outer rings minus holes, m². */
export function netAreaM2(g: ParkArea['geometry']): number {
  let s = 0;
  for (const poly of polygons(g)) poly.forEach((ring, i) => { if (Array.isArray(ring) && ring.length >= 4) s += (i === 0 ? 1 : -1) * ringAreaM2(ring); });
  return Math.max(0, s);
}

export function outerPerimeterM(g: ParkArea['geometry']): number {
  return polygons(g).reduce((s, poly) => s + (Array.isArray(poly[0]) && poly[0].length >= 4 ? pathLengthM(poly[0]) : 0), 0);
}

export function bigParksOf(areas: readonly ParkArea[]): ParkPolygon[] {
  const parks = areas.map((a) => toPark(a as RawArea)).filter((p): p is ParkPolygon => p !== null);
  return mergeSameName(parks).filter(isBigPark);
}

export function measureParks(areas: readonly ParkArea[]): ParkTallies {
  const parkLike = areas.filter((a) => isParkLikeArea(a.tags ?? {}));
  const big = bigParksOf(parkLike);
  const inBig = new Set(big.flatMap((p) => p.id.split('+')));
  const t: ParkTallies = { parks: 0, parksAreaM2: 0, bigParks: big.length, bigParksAreaM2: 0, lapLoops: 0, lapLoopsAreaM2: 0 };
  for (const a of parkLike) {
    const area = netAreaM2(a.geometry);
    t.parks++;
    t.parksAreaM2 += area;
    if (inBig.has(a.id)) t.bigParksAreaM2 += area;
    else if (outerPerimeterM(a.geometry) >= LAP_LOOP_MIN_PERIMETER_M) {
      t.lapLoops++;
      t.lapLoopsAreaM2 += area;
    }
  }
  return t;
}
