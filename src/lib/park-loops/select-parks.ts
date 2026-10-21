/**
 * Big-park selection (owner decision Q7): ≥ 8 dunam (80,000 m²) OR perimeter
 * ≥ 1.2 km, named, leisure=park / nature_reserve / landuse=recreation_ground.
 * OSM often splits one park into several polygons with the same name (Park
 * HaYarkon) — same-name polygons within MERGE_GAP_M are merged first, then
 * the threshold is applied to the merged park.
 */
import { bboxOf, haversineM, pathLengthM, ringAreaM2 } from './geometry';
import type { LngLat, ParkPolygon } from './types';

export const BIG_PARK_MIN_AREA_M2 = 80_000;
export const BIG_PARK_MIN_PERIMETER_M = 1_200;
export const MERGE_GAP_M = 50;

export interface RawArea {
  id: string;
  tags: Record<string, string>;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: any };
}

export function parkKind(tags: Record<string, string>): ParkPolygon['kind'] | null {
  if (tags.leisure === 'park') return 'park';
  if (tags.leisure === 'nature_reserve') return 'nature_reserve';
  if (tags.landuse === 'recreation_ground') return 'recreation_ground';
  return null;
}

function outerRings(g: RawArea['geometry']): LngLat[][] {
  const polys = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
  return (polys as LngLat[][][]).map((p) => p?.[0]).filter((r): r is LngLat[] => Array.isArray(r) && r.length >= 4);
}

export function toPark(a: RawArea): ParkPolygon | null {
  const kind = parkKind(a.tags ?? {});
  const name = (a.tags?.['name:he'] ?? a.tags?.name ?? '').trim();
  if (!kind || !name) return null;
  const rings = outerRings(a.geometry);
  if (!rings.length) return null;
  return {
    id: a.id, name, kind, rings,
    areaM2: rings.reduce((s, r) => s + ringAreaM2(r), 0),
    perimeterM: rings.reduce((s, r) => s + pathLengthM(r), 0),
  };
}

function near(a: ParkPolygon, b: ParkPolygon, gapM: number): boolean {
  const [a0, a1, a2, a3] = bboxOf(a.rings);
  const [b0, b1, b2, b3] = bboxOf(b.rings);
  const pad = gapM / 90_000;
  if (a0 - pad > b2 || b0 - pad > a2 || a1 - pad > b3 || b1 - pad > a3) return false;
  for (const ra of a.rings) for (const p of ra) for (const rb of b.rings) for (const q of rb) if (haversineM(p, q) <= gapM) return true;
  return false;
}

/** Union-find merge of same-name parks that touch (≤ gapM). */
export function mergeSameName(parks: ParkPolygon[], gapM = MERGE_GAP_M): ParkPolygon[] {
  const byName = new Map<string, ParkPolygon[]>();
  for (const p of parks) { if (!byName.has(p.name)) byName.set(p.name, []); byName.get(p.name)!.push(p); }
  const out: ParkPolygon[] = [];
  for (const group of Array.from(byName.values())) {
    const parent = group.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) if (near(group[i], group[j], gapM)) parent[find(i)] = find(j);
    const sets = new Map<number, ParkPolygon[]>();
    group.forEach((p, i) => { const r = find(i); if (!sets.has(r)) sets.set(r, []); sets.get(r)!.push(p); });
    for (const members of Array.from(sets.values())) {
      if (members.length === 1) { out.push(members[0]); continue; }
      members.sort((x, y) => x.id.localeCompare(y.id));
      out.push({
        id: members.map((m) => m.id).join('+'),
        name: members[0].name,
        kind: members[0].kind,
        rings: members.flatMap((m) => m.rings),
        areaM2: members.reduce((s, m) => s + m.areaM2, 0),
        perimeterM: members.reduce((s, m) => s + m.perimeterM, 0),
      });
    }
  }
  return out;
}

export function isBigPark(p: ParkPolygon): boolean {
  return p.areaM2 >= BIG_PARK_MIN_AREA_M2 || p.perimeterM >= BIG_PARK_MIN_PERIMETER_M;
}

export function selectBigParks(areas: RawArea[]): { parks: ParkPolygon[]; considered: number; small: number } {
  const parks = areas.map(toPark).filter((p): p is ParkPolygon => !!p);
  const merged = mergeSameName(parks);
  const big = merged.filter(isBigPark).sort((a, b) => b.areaM2 - a.areaM2 || a.name.localeCompare(b.name));
  return { parks: big, considered: merged.length, small: merged.length - big.length };
}
