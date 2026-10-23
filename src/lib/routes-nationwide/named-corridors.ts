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
import { CORRIDOR_NAME_PATTERN, NAMED_PLACE_PATTERN, PROMENADE_NAME_PATTERN } from '../route-score/weights';

export const CORRIDOR_FOOT_HIGHWAYS = new Set(['footway', 'path', 'pedestrian', 'cycleway', 'track', 'bridleway', 'living_street']);
/** Street-class ways only count when the name is a promenade/path/park name. */
export const CORRIDOR_STREET_HIGHWAYS = new Set(['residential', 'service', 'unclassified', 'tertiary']);
export const CORRIDOR_NAME_HINT = /טיילת|שביל|רצועת|רצועה|פארק|גן |^גן|גינת|נחל|ואדי|חוף|יער|אגם|מסילה|(?:^|\s)(?:שדר(?:ות|ת)|מדרחוב)|promenade|trail|park/i;
/** Boulevard / pedestrian-mall / promenade names (שדרות רוטשילד, מדרחוב נחלת בנימין, טיילת …). */
export const PROMENADE_NAME_HINT = PROMENADE_NAME_PATTERN;
/** The subset of the above that is NOT already a trusted "promenade" word: its candidates carry the low-confidence flag. */
export const BOULEVARD_NAME_HINT = /(?:^|\s)(?:שדר(?:ות|ת)|מדרחוב)/;
export const LOW_CONFIDENCE_PROMENADE_HINT = 'promenade_hint';
/** A hinted chain counts as a promenade/boulevard only when at least this share of its length is on footway/pedestrian-class ways. */
export const PROMENADE_FOOT_SHARE_MIN = 0.5;
export const JOIN_GAP_M = 25;
export const CORRIDOR_MIN_M = 800;
/** Shorter minimum for boulevard / promenade chains that are mostly footway/pedestrian (and only those). */
export const PROMENADE_CORRIDOR_MIN_M = 500;

/**
 * Collapse NBSP, bidi marks, zero-width chars and any run of whitespace to one
 * plain space, trimmed. OSM and research files carry "שדרות\u00A0רוטשילד" /
 * RLM-tagged names; without this the same name splits into two chains and
 * never matches a regex or a known-route name.
 */
export function normalizeName(s: string): string {
  return String(s ?? '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, '')
    .replace(/[\s\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+/g, ' ')
    .trim();
}
export const CORRIDOR_MAX_M = 25_000;
export const CORRIDOR_LOOP_GAP_M = 50;
export const MAX_CORRIDORS = 30;

export interface NamedWay { id: number; name: string; highway: string; coords: LngLat[] }

export interface Corridor {
  name: string;
  wayIds: number[];
  coords: LngLat[];
  lengthM: number;
  closed: boolean;
  /** Share (0..1) of the chain's length on footway/pedestrian-class ways. Absent on hand-built corridors. */
  footShare?: number;
  /** Set when the candidate came in through a promenade / boulevard name hint (see isPromenadeHintCorridor). */
  lowConfidence?: typeof LOW_CONFIDENCE_PROMENADE_HINT;
}

export function corridorEligible(w: NamedWay): boolean {
  const name = normalizeName(w.name);
  if (!name || w.coords.length < 2) return false;
  if (CORRIDOR_FOOT_HIGHWAYS.has(w.highway)) return true;
  return CORRIDOR_STREET_HIGHWAYS.has(w.highway) && CORRIDOR_NAME_HINT.test(name);
}

/** A promenade/boulevard-named chain that runs mostly on footway/pedestrian ways. */
export function isPromenadeChain(c: Pick<Corridor, 'name' | 'footShare'>): boolean {
  return PROMENADE_NAME_HINT.test(normalizeName(c.name)) && (c.footShare ?? 0) >= PROMENADE_FOOT_SHARE_MIN;
}

/** Minimum length for a chain: 0.5 km for promenade/boulevard chains that are mostly pedestrian, 0.8 km otherwise. */
export function corridorMinM(c: Pick<Corridor, 'name' | 'footShare'>): number {
  return isPromenadeChain(c) ? PROMENADE_CORRIDOR_MIN_M : CORRIDOR_MIN_M;
}

/**
 * Low-confidence marker: a boulevard / pedestrian-mall name, or any chain that only passed because of the
 * shorter promenade minimum. Stored on the route doc and copied to route_scores; never blocks selection.
 */
export function isPromenadeHintCorridor(c: Pick<Corridor, 'name' | 'footShare' | 'lengthM'>): boolean {
  if (!isPromenadeChain(c)) return false;
  return BOULEVARD_NAME_HINT.test(normalizeName(c.name)) || c.lengthM < CORRIDOR_MIN_M;
}

const isFootClass = (w: NamedWay) => CORRIDOR_FOOT_HIGHWAYS.has(w.highway);

/** Greedy end-to-end chaining of same-name ways (reversing a way when needed). */
export function stitchSameName(ways: NamedWay[], gapM = JOIN_GAP_M, opts: { splitByClass?: boolean } = {}): Corridor[] {
  // Promenade / boulevard names are stitched per class (pedestrian strip vs the parallel road) so a
  // 1.9 km road chain can never swallow, or out-rank by length, the 367 m pedestrian strip of the same name.
  const byName = new Map<string, { name: string; group: NamedWay[] }>();
  for (const w of ways) {
    const n = normalizeName(w.name);
    const split = opts.splitByClass || PROMENADE_NAME_HINT.test(n);
    const key = split ? `${n}\u0000${isFootClass(w) ? 'foot' : 'road'}` : n;
    if (!byName.has(key)) byName.set(key, { name: n, group: [] });
    byName.get(key)!.group.push(w);
  }
  const out: Corridor[] = [];
  for (const { name, group } of Array.from(byName.values())) {
    const left = group.slice().sort((a, b) => a.id - b.id);
    while (left.length) {
      const first = left.shift()!;
      let line = first.coords.slice();
      const ids = [first.id];
      const used: NamedWay[] = [first];
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
          used.push(w);
          left.splice(i, 1);
          grew = true;
          break;
        }
      }
      const lengthM = pathLengthM(line);
      const total = used.reduce((a, w) => a + pathLengthM(w.coords), 0);
      const foot = used.filter(isFootClass).reduce((a, w) => a + pathLengthM(w.coords), 0);
      const footShare = total > 0 ? Math.round((foot / total) * 1000) / 1000 : 0;
      const c: Corridor = { name, wayIds: ids.sort((x, y) => x - y), coords: line, lengthM, closed: haversineM(line[0], line[line.length - 1]) <= CORRIDOR_LOOP_GAP_M, footShare };
      if (isPromenadeHintCorridor(c)) c.lowConfidence = LOW_CONFIDENCE_PROMENADE_HINT;
      out.push(c);
    }
  }
  return out;
}

/** Eligible, stitched, length-windowed; longest first, at most MAX_CORRIDORS. */
export function namedCorridors(ways: NamedWay[], max = MAX_CORRIDORS): Corridor[] {
  return stitchSameName(ways.filter(corridorEligible))
    .filter((c) => c.lengthM >= corridorMinM(c) && c.lengthM <= CORRIDOR_MAX_M)
    .sort((a, b) => b.lengthM - a.lengthM || a.name.localeCompare(b.name))
    .slice(0, max);
}

const PACE_RUN_M_PER_MIN = 160;

export function corridorDoc(c: Corridor, ctx: { authorityId: string; city: string; osmSnapshot: string | null; importBatchId: string }): { id: string; data: Record<string, unknown> } {
  const km = Math.round((c.lengthM / 1000) * 100) / 100;
  const single = c.wayIds.length === 1;
  const externalId = single ? `osm:way/${c.wayIds[0]}` : `osm:stitched/${c.wayIds.join('-')}`.slice(0, 400);
  const corridorShape = CORRIDOR_NAME_PATTERN.test(c.name) || NAMED_PLACE_PATTERN.test(c.name) || isPromenadeChain(c);
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
      ...(c.lowConfidence ? { lowConfidence: { reason: c.lowConfidence } } : {}),
      importBatchId: ctx.importBatchId,
    },
  };
}
