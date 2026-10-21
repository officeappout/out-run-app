/**
 * city-inventory/measure.ts — raw OSM tallies for one authority
 * (docs/routes/CITY-MAPPING-PLAN.md §4.1 steps 3-5). Pure: features come in
 * already parsed (the I1 script reads them from the local Geofabrik PBF).
 *
 * Clipping rules (documented approximations):
 *   - a node counts when it lies inside the boundary;
 *   - a way's length is the sum of its segments whose midpoint is inside;
 *     the way counts once when any segment is inside;
 *   - an area (park / pitch polygon) counts when its first outer ring's
 *     vertex-mean centre is inside (same test as park-loops).
 * Point-like layers (benches, water, toilets, courts, fitness stations) are
 * taken from nodes and areas only; a bench drawn as an open way is skipped
 * so a closed pitch way is never counted twice (way + polygon).
 */
import { haversineM } from '@/lib/park-loops/geometry';
import type { LngLat } from '@/lib/park-loops/types';
import { litFromTags } from '@/lib/trail-graph/tags';
import { ringCentre, type BoundaryIndex } from './boundary';
import { classifyFeature, hasCrossingDetail, isWalkableWay, surfaceBucket } from './classify';
import { measureParks, type ParkTallies } from './measure-parks';
import type { InventoryLayerKey, OsmTags } from './types';

export interface InvNode { id: number; lon: number; lat: number; tags: OsmTags }
export interface InvWay { id: number; tags: OsmTags; coords: LngLat[] }
export interface InvArea { id: string; tags: OsmTags; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown } }

export interface InventoryFeatures { nodes: InvNode[]; ways: InvWay[]; areas: InvArea[] }

/** Linear layers measured from open ways. */
export const LINEAR_LAYER_KEYS = ['major_roads', 'bike_paved', 'bike_offroad', 'trails_paved', 'trails_offroad', 'promenades'] as const;
export type LinearLayerKey = (typeof LINEAR_LAYER_KEYS)[number];
/** Countable layers taken from nodes / polygons. */
export const COUNT_LAYER_KEYS = ['courts', 'fitness_stations', 'benches', 'drinking_water', 'toilets'] as const;
export type CountLayerKey = (typeof COUNT_LAYER_KEYS)[number];

/** Car streets — the "per km of street" denominator for point densities (plan §3.4). */
export const STREET_HIGHWAYS = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street']);

export interface LinearTally { count: number; lengthM: number; knownSurfaceM: number }

export interface OsmTallies {
  linear: Record<LinearLayerKey, LinearTally>;
  counts: Record<CountLayerKey, number>;
  crossings: { count: number; detailed: number };
  /** Walkable-way length and how much of it carries a `lit=*` answer / `lit=yes`. */
  lighting: { walkableM: number; taggedM: number; litM: number };
  streetM: number;
  parks: ParkTallies;
  /** Walkable ways inside the boundary, clipped — input for shade coverage. */
  walkableLines: LngLat[][];
}

const LINEAR_SET = new Set<InventoryLayerKey>(LINEAR_LAYER_KEYS);
const COUNT_SET = new Set<InventoryLayerKey>(COUNT_LAYER_KEYS);

function emptyLinear(): Record<LinearLayerKey, LinearTally> {
  const out = {} as Record<LinearLayerKey, LinearTally>;
  for (const k of LINEAR_LAYER_KEYS) out[k] = { count: 0, lengthM: 0, knownSurfaceM: 0 };
  return out;
}

function emptyCounts(): Record<CountLayerKey, number> {
  const out = {} as Record<CountLayerKey, number>;
  for (const k of COUNT_LAYER_KEYS) out[k] = 0;
  return out;
}

/** Inside-boundary length of a way, plus the inside runs (for shade matching). */
export function clipWay(coords: LngLat[], b: BoundaryIndex): { lengthM: number; runs: LngLat[][] } {
  let lengthM = 0;
  const runs: LngLat[][] = [];
  let run: LngLat[] | null = null;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], c = coords[i];
    const inside = b.contains([(a[0] + c[0]) / 2, (a[1] + c[1]) / 2]);
    if (!inside) { run = null; continue; }
    lengthM += haversineM(a, c);
    if (!run) { run = [a]; runs.push(run); }
    run.push(c);
  }
  return { lengthM, runs };
}

function tallyWay(t: OsmTallies, w: InvWay, b: BoundaryIndex): void {
  const tags = w.tags ?? {};
  if (!tags.highway || w.coords.length < 2) return;
  const { lengthM, runs } = clipWay(w.coords, b);
  if (lengthM <= 0) return;
  if (STREET_HIGHWAYS.has(tags.highway)) t.streetM += lengthM;
  if (isWalkableWay(tags)) {
    t.lighting.walkableM += lengthM;
    const lit = litFromTags(tags);
    if (lit !== 'unknown') t.lighting.taggedM += lengthM;
    if (lit === 'yes') t.lighting.litM += lengthM;
    t.walkableLines.push(...runs);
  }
  const known = surfaceBucket(tags).known;
  for (const k of classifyFeature({ kind: 'way', tags })) {
    if (!LINEAR_SET.has(k)) continue;
    const l = t.linear[k as LinearLayerKey];
    l.count++;
    l.lengthM += lengthM;
    if (known) l.knownSurfaceM += lengthM;
  }
}

function tallyNode(t: OsmTallies, n: InvNode, b: BoundaryIndex): void {
  const tags = n.tags ?? {};
  if (!Object.keys(tags).length || !b.contains([n.lon, n.lat])) return;
  for (const k of classifyFeature({ kind: 'node', tags })) {
    if (k === 'crossings') {
      t.crossings.count++;
      if (hasCrossingDetail(tags)) t.crossings.detailed++;
    } else if (COUNT_SET.has(k)) t.counts[k as CountLayerKey]++;
  }
}

function firstOuterRing(a: InvArea): LngLat[] | null {
  const c = a.geometry?.coordinates as unknown;
  const ring = a.geometry?.type === 'Polygon' ? (c as LngLat[][])?.[0] : (c as LngLat[][][])?.[0]?.[0];
  return Array.isArray(ring) && ring.length >= 4 ? ring : null;
}

/** Areas whose centre is inside the boundary. */
export function areasInside(areas: readonly InvArea[], b: BoundaryIndex): InvArea[] {
  return areas.filter((a) => {
    const r = firstOuterRing(a);
    return r !== null && b.contains(ringCentre(r));
  });
}

export function measureOsm(f: InventoryFeatures, b: BoundaryIndex): OsmTallies {
  const t: OsmTallies = {
    linear: emptyLinear(),
    counts: emptyCounts(),
    crossings: { count: 0, detailed: 0 },
    lighting: { walkableM: 0, taggedM: 0, litM: 0 },
    streetM: 0,
    parks: { parks: 0, parksAreaM2: 0, bigParks: 0, bigParksAreaM2: 0, lapLoops: 0, lapLoopsAreaM2: 0 },
    walkableLines: [],
  };
  for (const w of f.ways) tallyWay(t, w, b);
  for (const n of f.nodes) tallyNode(t, n, b);
  const inside = areasInside(f.areas, b);
  for (const a of inside) {
    for (const k of classifyFeature({ kind: 'area', tags: a.tags ?? {} })) {
      if (COUNT_SET.has(k)) t.counts[k as CountLayerKey]++;
      if (k === 'promenades') t.linear.promenades.count++;
    }
  }
  t.parks = measureParks(inside);
  return t;
}
