/**
 * scripts/lib/route-lighting-classify.ts — pure, I/O-free lighting-coverage
 * classifier for the quality-certificate v1. Computes what fraction of a
 * route's LENGTH passes within a buffer of an OSM `highway=street_lamp`
 * node, per the spec (query lamp nodes near the route, buffer ~30m).
 *
 * Distinct from — and a complement to, not a replacement for — the existing
 * `computeLitCoverage` in route-comfort-tags.service.ts, which reads
 * `street_segments.tags.lit` (OSM `lit=yes` tags on street WAYS). That
 * pipeline is TLV-only today (street_segments has zero coverage for any
 * other city — confirmed live, 18426/18426 docs have no `city` field and
 * were only ever ingested for Tel Aviv), so it can't cover all 278 routes.
 * Querying lamp NODES directly, scoped per-city like the composition
 * classifier, works uniformly regardless of street_segments ingestion
 * status. LIT_COVERAGE_THRESHOLD below is set to match
 * LIT_TAG_COVERAGE_THRESHOLD (0.6) from that module — same reasoning
 * (patchy OSM coverage shouldn't be all-or-nothing), independently arrived
 * at twice, which is itself a signal the threshold is reasonable.
 *
 * Caller does all I/O (Overpass fetch of lamp nodes, Firestore route reads)
 * — this module only takes an already-fetched lamp-point list and a route
 * path. Browser-safe.
 */
import { haversineMeters } from '../../src/features/parks/core/services/geoUtils';

export const LAMP_BUFFER_M = 30;
export const LIT_COVERAGE_THRESHOLD = 0.6;

const GRID_DEG = 0.0006;

export interface LampPoint { lat: number; lng: number }

export function buildLampGrid(lamps: LampPoint[]): Map<string, LampPoint[]> {
  const grid = new Map<string, LampPoint[]>();
  for (const p of lamps) {
    const key = `${Math.floor(p.lat / GRID_DEG)}:${Math.floor(p.lng / GRID_DEG)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(p);
  }
  return grid;
}
function nearbyLamps(lat: number, lng: number, grid: Map<string, LampPoint[]>, radiusCells = 1): LampPoint[] {
  const la = Math.floor(lat / GRID_DEG), lo = Math.floor(lng / GRID_DEG);
  const out: LampPoint[] = [];
  for (let da = -radiusCells; da <= radiusCells; da++) for (let dob = -radiusCells; dob <= radiusCells; dob++) {
    const bucket = grid.get(`${la + da}:${lo + dob}`); if (bucket) out.push(...bucket);
  }
  return out;
}

export interface LitCoverageResult {
  litCoveragePct: number;
  totalLenM: number;
}

/**
 * Pure: samples the route path every ~10m (same spacing convention as the
 * sidewalk-parallel detector) and marks each sub-segment "lit" if its
 * midpoint falls within `bufferM` of ANY lamp node. Returns the
 * LENGTH-weighted lit fraction, matching the spec's "fraction of route
 * length with a lamp within buffer" (not fraction of sample points).
 */
export function computeLampCoverage(
  path: [number, number][],
  lampGrid: Map<string, LampPoint[]>,
  bufferM: number = LAMP_BUFFER_M,
): LitCoverageResult {
  const SAMPLE_SPACING_M = 10;
  let litLen = 0, totalLen = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const segLen = haversineMeters(a[0], a[1], b[0], b[1]);
    if (segLen === 0) continue;
    totalLen += segLen;
    const steps = Math.max(1, Math.round(segLen / SAMPLE_SPACING_M));
    for (let s = 0; s < steps; s++) {
      const f = (s + 0.5) / steps;
      const lat = a[0] + (b[0] - a[0]) * f, lng = a[1] + (b[1] - a[1]) * f;
      const sampleLen = segLen / steps;
      const near = nearbyLamps(lat, lng, lampGrid);
      const isLit = near.some((lamp) => haversineMeters(lat, lng, lamp.lat, lamp.lng) <= bufferM);
      if (isLit) litLen += sampleLen;
    }
  }
  return { litCoveragePct: totalLen > 0 ? Math.round((litLen / totalLen) * 1000) / 10 : 0, totalLenM: totalLen };
}

export type LightingStatus = 'computed' | 'unknown';

export interface RouteLighting {
  status: LightingStatus;
  litCoveragePct: number | null;
  isLit: boolean | null;
}

/**
 * `cityHasAnyLampData` must be false ONLY when the city-wide lamp fetch
 * returned zero street_lamp nodes anywhere in the bbox — i.e. OSM has no
 * lamp data for the area at all. In that case every route in that city
 * reports 'unknown', not 'unlit': absence of data is not absence of lamps.
 * A route with real 0% coverage in a city that DOES have lamp data
 * elsewhere is a genuine computed 'unlit' result.
 */
export function classifyLighting(
  path: [number, number][],
  lampGrid: Map<string, LampPoint[]>,
  cityHasAnyLampData: boolean,
  threshold: number = LIT_COVERAGE_THRESHOLD,
): RouteLighting {
  if (!cityHasAnyLampData) return { status: 'unknown', litCoveragePct: null, isLit: null };
  const { litCoveragePct } = computeLampCoverage(path, lampGrid);
  return { status: 'computed', litCoveragePct, isLit: litCoveragePct >= threshold * 100 };
}
