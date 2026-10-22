/**
 * Named corridors (RC8, owner 22.10.2026): OSM ways that carry a real NAME —
 * promenades, park paths, nature paths, named cycleways — are often split
 * into many short ways. Same-name ways whose ends meet (≤ JOIN_GAP_M) are
 * stitched into one corridor that keeps the OSM name verbatim. Streets only
 * qualify when the name itself says promenade / path / park (a "רחוב X" is a
 * street, not a route). Pure; the OSM slice is injected.
 *
 * Shape: a corridor that closes on itself is a loop; one whose name reads as
 * a promenade/path is a `linear_corridor` (never penalised on compactness);
 * any other named path is point-to-point.
 */
import { haversineM, pathLengthM } from '../park-loops/geometry';
import type { LngLat } from '../park-loops';
import { CORRIDOR_NAME_PATTERN, NAMED_PLACE_PATTERN } from '../route-score/weights';

export const CORRIDOR_FOOT_HIGHWAYS = new Set(['footway', 'path', 'pedestrian', 'cycleway', 'track', 'bridleway', 'living_street']);
/** Street-class ways only count when the name is a promenade/path/park name. */
export const CORRIDOR_STREET_HIGHWAYS = new Set(['residential', 'service', 'unclassified', 'tertiary']);
export const CORRIDOR_NAME_HINT = /טיילת|שביל|רצועת|רצועה|פארק|גן |^גן|גינת|נחל|ואדי|חוף|יער|אגם|מסילה|שדרת|promenade|trail|park/i;
export const JOIN_GAP_M = 25;
export const CORRIDOR_MIN_M = 800;
export const CORRIDOR_MAX_M = 25_000;
export const CORRIDOR_LOOP_GAP_M = 50;
export const MAX_CORRIDORS = 30;

export interface NamedWay { id: number; name: string; highway: string; coords: LngLat[] }

export interface Corridor { name: string; wayIds: number[]; coords: LngLat[]; lengthM: number; closed: boolean }

export function corridorEligible(w: NamedWay): boolean {
  if (!w.name.trim() || w.coords.length < 2) return false;
  if (CORRIDOR_FOOT_HIGHWAYS.has(w.highway)) return true;
  return CORRIDOR_STREET_HIGHWAYS.has(w.highway) && CORRIDOR_NAME_HINT.test(w.name);
}

/** Greedy end-to-end chaining of same-name ways (reversing a way when needed). */
export function stitchSameName(ways: NamedWay[], gapM = JOIN_GAP_M): Corridor[] {
  const byName = new Map<string, NamedWay[]>();
  for (const w of ways) { const n = w.name.trim(); if (!byName.has(n)) byName.set(n, []); byName.get(n)!.push(w); }
  const out: Corridor[] = [];
  for (const [name, group] of Array.from(byName.entries())) {
    const left = group.slice().sort((a, b) => a.id - b.id);
    while (left.length) {
      const first = left.shift()!;
      let line = first.coords.slice();
      const ids = [first.id];
      for (let grew = true; grew;) {
        grew = false;
        for (let i = 0; i < left.length; i++) {
          const w = left[i], a = line[0], z = line[line.length - 1], s = w.coords[0], e = w.coords[w.coords.length - 1];
          if (haversineM(z, s) <= gapM) line = [...line, ...w.coords.slice(1)];
          else if (haversineM(z, e) <= gapM) line = [...line, ...w.coords.slice(0, -1).reverse()];
          else if (haversineM(a, e) <= gapM) line = [...w.coords.slice(0, -1), ...line];
          else if (haversineM(a, s) <= gapM) line = [...w.coords.slice(1).reverse(), ...line];
          else continue;
          ids.push(w.id);
          left.splice(i, 1);
          grew = true;
          break;
        }
      }
      const lengthM = pathLengthM(line);
      out.push({ name, wayIds: ids.sort((x, y) => x - y), coords: line, lengthM, closed: haversineM(line[0], line[line.length - 1]) <= CORRIDOR_LOOP_GAP_M });
    }
  }
  return out;
}

/** Eligible, stitched, length-windowed; longest first, at most MAX_CORRIDORS. */
export function namedCorridors(ways: NamedWay[], max = MAX_CORRIDORS): Corridor[] {
  return stitchSameName(ways.filter(corridorEligible))
    .filter((c) => c.lengthM >= CORRIDOR_MIN_M && c.lengthM <= CORRIDOR_MAX_M)
    .sort((a, b) => b.lengthM - a.lengthM || a.name.localeCompare(b.name))
    .slice(0, max);
}

const PACE_RUN_M_PER_MIN = 160;

export function corridorDoc(c: Corridor, ctx: { authorityId: string; city: string; osmSnapshot: string | null; importBatchId: string }): { id: string; data: Record<string, unknown> } {
  const km = Math.round((c.lengthM / 1000) * 100) / 100;
  const single = c.wayIds.length === 1;
  const externalId = single ? `osm:way/${c.wayIds[0]}` : `osm:stitched/${c.wayIds.join('-')}`.slice(0, 400);
  const corridorShape = CORRIDOR_NAME_PATTERN.test(c.name) || NAMED_PLACE_PATTERN.test(c.name);
  const idTail = single ? `w${c.wayIds[0]}` : `s${c.wayIds[0]}-${c.wayIds.length}`;
  return {
    id: `named_${ctx.authorityId.replace(/[^0-9a-zA-Z_-]/g, '_').slice(0, 60)}_${idTail}`,
    data: {
      name: c.name,
      description: `${c.name} — שביל/טיילת בשם ב-OpenStreetMap, ${km.toFixed(1)} ק״מ`,
      distance: km,
      duration: Math.max(1, Math.round(c.lengthM / PACE_RUN_M_PER_MIN)),
      score: Math.round(km * 10),
      rating: 0,
      calories: Math.round(km * 65),
      type: 'walking',
      activityType: 'walking',
      activityTypes: ['walking', 'running'],
      difficulty: 'easy',
      path: c.coords.map(([lng, lat]) => ({ lng, lat })),
      segments: [],
      features: { hasGym: false, hasBenches: false, scenic: corridorShape, terrain: 'asphalt', environment: 'urban', trafficLoad: 'none', surface: 'road' },
      routeShape: c.closed ? 'loop' : 'point_to_point',
      ...(c.closed ? {} : corridorShape ? { shapeType: 'linear_corridor' } : {}),
      authorityId: ctx.authorityId,
      city: ctx.city,
      status: 'pending',
      published: false,
      origin: 'osm_named_way',
      source: { type: 'official_api', name: 'OSM named ways', externalId, externalLink: `https://www.openstreetmap.org/way/${c.wayIds[0]}`, sourceWayIds: c.wayIds },
      provenance: { pipeline: 'named-corridors', osm: { license: 'ODbL-1.0', snapshot: ctx.osmSnapshot, extract: 'geofabrik:israel-and-palestine' } },
      importBatchId: ctx.importBatchId,
    },
  };
}
