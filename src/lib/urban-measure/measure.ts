/**
 * The four urban measurements — each a named pure function over one route
 * line and the authority's UrbanLayer — plus the adapter to routeScore's
 * FromDocOptions and the "is this candidate urban" rule.
 */
import { computeRouteComposition } from '../../../scripts/lib/route-composition-classify';
import { hasLampWithin } from '../lighting/lamps';
import { LIT_LAMP_RADIUS_M } from '../lighting/constants';
import { pathLengthM, pointSegDist, resampleXY } from '../route-quality/geo';
import { majorRoadCrossings, majorRoadShare } from '../route-quality/major-roads';
import type { OsmRoadLayer } from '../route-quality/types';
import { litFromTags } from '../trail-graph/tags';
import {
  AMENITY_RADIUS_M, COMPOSITION_MIN_MATCHED_PCT, LIGHTING_MIN_KNOWN, URBAN_BUILT_UP_MIN_PCT, URBAN_ON_WAY_M, URBAN_SAMPLE_STEP_M,
} from './constants';
import { amenityCellKey, type UrbanLayer } from './layer';
import {
  URBAN_AMENITY_KINDS, type LngLat, type UrbanAmenities, type UrbanAmenityKind, type UrbanComposition, type UrbanCrossings, type UrbanLighting, type UrbanMeasurement,
} from './types';

/** Composition (sidewalk / dedicated / street / other) — the quality-certificate classifier on OSM ways. Null when < 50% of the line snaps to a way. */
export function measureComposition(path: LngLat[], layer: UrbanLayer): UrbanComposition | null {
  if (path.length < 2 || !layer.composition.waysById.size) return null;
  const c = layer.composition;
  const r = computeRouteComposition(path.map(([lng, lat]) => [lat, lng] as [number, number]), c.waysById, c.allGrid, c.roadGrid, c.categoryCache);
  if (100 - r.unmatchedPct < COMPOSITION_MIN_MATCHED_PCT) return null;
  return { sidewalkPct: r.sidewalkPct, genuinePct: r.genuinePct, ordinaryPct: r.ordinaryPct, otherPct: r.otherPct, unmatchedPct: r.unmatchedPct };
}

/** The way a route sample runs on (nearest within URBAN_ON_WAY_M), or -1. */
function wayAt(layer: UrbanLayer, p: [number, number]): number {
  let best = URBAN_ON_WAY_M, idx = -1;
  for (const s of layer.wayGrid.near(p, URBAN_ON_WAY_M)) {
    const d = pointSegDist(p, s.a, s.b).d;
    if (d <= best) { best = d; idx = s.data; }
  }
  return idx;
}

/**
 * Lighting along the line, sample by sample: the way's OSM `lit=*` decides
 * first (`lit=no` is unlit even under a lamp), else a street lamp within
 * LIT_LAMP_RADIUS_M makes it lit, else unknown — untagged is never "unlit"
 * (same rule as src/lib/lighting). Null when less than half the length has
 * an answer.
 */
export function measureLighting(path: LngLat[], layer: UrbanLayer): UrbanLighting | null {
  if (path.length < 2 || !layer.hasLightingData) return null;
  const { pts } = resampleXY(path.map(layer.proj.toXY), URBAN_SAMPLE_STEP_M);
  if (!pts.length) return null;
  let lit = 0, known = 0;
  for (const p of pts) {
    const w = wayAt(layer, p);
    const tag = w >= 0 ? litFromTags(layer.ways[w].tags) : 'unknown';
    if (tag === 'no') { known++; continue; }
    if (tag === 'yes' || hasLampWithin(layer.lamps, layer.proj.toLngLat(p), LIT_LAMP_RADIUS_M)) { known++; lit++; }
  }
  const share = known / pts.length;
  if (share < LIGHTING_MIN_KNOWN) return null;
  return { known: Math.round(share * 1000) / 1000, litPct: Math.round((lit / known) * 1000) / 10 };
}

/** Benches, drinking water, toilets and fitness stations within AMENITY_RADIUS_M of the line. Null when the layer has no amenity points at all (no coverage ≠ none). */
export function measureAmenities(path: LngLat[], layer: UrbanLayer, radiusM = AMENITY_RADIUS_M): UrbanAmenities | null {
  if (path.length < 2 || !layer.amenityCount) return null;
  const counts = Object.fromEntries(URBAN_AMENITY_KINDS.map((k) => [k, 0])) as Record<UrbanAmenityKind, number>;
  const seen = new Set<object>();
  const { pts } = resampleXY(path.map(layer.proj.toXY), Math.max(5, radiusM / 2));
  const span = Math.ceil(radiusM / AMENITY_RADIUS_M);
  for (const p of pts) {
    const [cx, cy] = amenityCellKey(p).split(':').map(Number);
    for (let i = -span; i <= span; i++) {
      for (let j = -span; j <= span; j++) {
        for (const a of layer.amenityCells.get(`${cx + i}:${cy + j}`) ?? []) {
          if (seen.has(a)) continue;
          if (Math.hypot(a.xy[0] - p[0], a.xy[1] - p[1]) <= radiusM) { seen.add(a); counts[a.kind]++; }
        }
      }
    }
  }
  const has = Object.fromEntries(URBAN_AMENITY_KINDS.map((k) => [k, counts[k] > 0])) as Record<UrbanAmenityKind, boolean>;
  return { has, counts };
}

/** Major-road share + crossings of tertiary+ roads, marked vs unmarked (route-quality v1 on the PBF road layer). */
export function measureCrossings(path: LngLat[], layer: UrbanLayer): UrbanCrossings | null {
  if (path.length < 2) return null;
  const m = 0.001; // ≈100 m around the route
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [lng, lat] of path) { w = Math.min(w, lng); s = Math.min(s, lat); e = Math.max(e, lng); n = Math.max(n, lat); }
  const inBox = (c: LngLat) => c[0] >= w - m && c[0] <= e + m && c[1] >= s - m && c[1] <= n + m;
  const osm: OsmRoadLayer = {
    bbox: { south: s - m, west: w - m, north: n + m, east: e + m },
    roads: layer.majorRoads.filter((r) => {
      let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      for (const [x, y] of r.coords) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
      return a <= e + m && c >= w - m && b <= n + m && d >= s - m;
    }),
    crossings: layer.crossings.filter((c) => inBox(c.coord)),
  };
  const km = pathLengthM(path) / 1000;
  const marks = osm.roads.length ? majorRoadCrossings(path, osm) : [];
  const count = (c: string) => marks.filter((x) => x.control === c).length;
  const unmarked = count('unmarked');
  return {
    majorRoadPct: osm.roads.length ? Math.round(majorRoadShare(path, osm) * 1000) / 1000 : 0,
    total: marks.length,
    signalled: count('signalled'),
    marked: count('marked'),
    unmarked,
    unmarkedPerKm: km > 0 ? Math.round((unmarked / km) * 100) / 100 : 0,
  };
}

/** All four measurements for one route line. */
export function measureUrbanRoute(path: LngLat[], layer: UrbanLayer): UrbanMeasurement {
  const composition = measureComposition(path, layer);
  const lighting = measureLighting(path, layer);
  const amenities = measureAmenities(path, layer);
  const crossings = measureCrossings(path, layer);
  const notes: string[] = [];
  if (!composition) notes.push('composition: < 50% on OSM ways');
  if (!lighting) notes.push('lighting: < 50% known');
  if (!amenities) notes.push('amenities: no OSM amenity points in the area');
  return { composition, lighting, amenities, crossings, notes };
}

/** routeScore inputs from a measurement (FromDocOptions subset; absent = not measured). */
export function urbanScoreOptions(m: UrbanMeasurement): {
  composition?: { sidewalkPct: number; genuinePct: number; ordinaryPct: number; otherPct: number };
  litCoveragePct?: number;
  amenitiesHas?: Record<UrbanAmenityKind, boolean>;
  osmSafety?: { majorRoadPct: number; unmarkedPerKm: number };
} {
  return {
    ...(m.composition ? { composition: { sidewalkPct: m.composition.sidewalkPct, genuinePct: m.composition.genuinePct, ordinaryPct: m.composition.ordinaryPct, otherPct: m.composition.otherPct } } : {}),
    ...(m.lighting ? { litCoveragePct: m.lighting.litPct } : {}),
    ...(m.amenities ? { amenitiesHas: { ...m.amenities.has } } : {}),
    ...(m.crossings ? { osmSafety: { majorRoadPct: m.crossings.majorRoadPct, unmarkedPerKm: m.crossings.unmarkedPerKm } } : {}),
  };
}

/** Runner stages whose candidates are urban by construction (never the trail pipeline's). */
export const URBAN_STAGES: ReadonlySet<string> = new Set(['existing', 'known_routes', 'dataset', 'named_ways', 'bike_adjacent_walk', 'park_loops', 'neighbourhood']);

/**
 * Which candidates get measured. Trail-pipeline routes (OSM relations,
 * generated trail loops) only when they run mostly through built-up area —
 * a hiking trail is not judged on benches and street lamps.
 */
export function isUrbanCandidate(stage: string, data: Record<string, any> | null | undefined): boolean {
  if (URBAN_STAGES.has(stage)) return true;
  const builtUp = data?.trail?.stats?.builtUpPct;
  return typeof builtUp === 'number' && builtUp >= URBAN_BUILT_UP_MIN_PCT;
}
