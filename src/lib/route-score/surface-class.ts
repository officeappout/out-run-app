/**
 * Surface class per route (owner addition 21.10.2026) — the app filters on it:
 *   bike_road       cycling, mostly paved (asphalt / concrete / paving)
 *   bike_offroad    cycling, mostly unpaved (gravel / dirt — MTB, singletrack)
 *   walk_run_paved  walking/running, mostly paved
 *   hike_offroad    walking/running, mostly unpaved (dirt / trail)
 *   unknown         no surface data at all
 *
 * Reuses the existing SurfaceType vocabulary (src/lib/route-collections/
 * surface-type.ts) — the same values the OSM segment importer writes on
 * street_segments and the trails pipeline writes as surfaceMix. Never guesses
 * a material: 'unknown' length stays unknown and only lowers knownShare.
 */
import type { SurfaceType } from '../route-collections/surface-type';
import { haversineM, makeProjector, pointSegDist, type XY } from '../route-quality/geo';
import type { LngLat } from './types';

export type SurfaceClass = 'bike_road' | 'bike_offroad' | 'walk_run_paved' | 'hike_offroad' | 'unknown';
export const SURFACE_CLASSES: SurfaceClass[] = ['walk_run_paved', 'hike_offroad', 'bike_road', 'bike_offroad'];

export const PAVED_SURFACES: ReadonlySet<SurfaceType> = new Set<SurfaceType>(['asphalt', 'concrete', 'paving_stones']);
export const UNPAVED_SURFACES: ReadonlySet<SurfaceType> = new Set<SurfaceType>(['gravel', 'dirt', 'grass']);

/** Where the surface numbers came from — strongest first. */
export type SurfaceSource = 'street_segments' | 'trail_stats' | 'route_surface_type' | 'coarse_features' | 'none';

export interface SurfaceShares {
  /** Share (0..1) of the route's length on paved / unpaved surface; unknown is the remainder. */
  pavedShare: number;
  unpavedShare: number;
  knownShare: number;
  source: SurfaceSource;
}

/** Any mix (percent or metres or fractions — only ratios matter) → shares. */
export function sharesFromMix(mix: Partial<Record<string, number>>, source: SurfaceSource): SurfaceShares {
  let paved = 0, unpaved = 0, total = 0;
  for (const [k, v] of Object.entries(mix)) {
    const n = typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
    total += n;
    if (PAVED_SURFACES.has(k as SurfaceType)) paved += n;
    else if (UNPAVED_SURFACES.has(k as SurfaceType)) unpaved += n;
  }
  if (total <= 0) return { pavedShare: 0, unpavedShare: 0, knownShare: 0, source: 'none' };
  const r = (n: number) => Math.round((n / total) * 1000) / 1000;
  return { pavedShare: r(paved), unpavedShare: r(unpaved), knownShare: r(paved + unpaved), source };
}

const COARSE_PAVED = new Set(['road', 'asphalt', 'paved']);
const COARSE_UNPAVED = new Set(['trail', 'dirt']);

/**
 * Surface shares from what a stored route doc already carries, strongest
 * first: a street_segments join (passed in), trail.stats.surfaceMix, the
 * dominant `surfaceType`, then the coarse `features.surface` (proxy).
 */
export function surfaceSharesFromDoc(d: Record<string, any>, segmentMix?: Partial<Record<string, number>> | null): SurfaceShares {
  if (segmentMix) {
    const s = sharesFromMix(segmentMix, 'street_segments');
    if (s.knownShare > 0) return s;
  }
  const mix = d?.trail?.stats?.surfaceMix;
  if (mix && typeof mix === 'object') {
    const s = sharesFromMix(mix, 'trail_stats');
    if (s.knownShare > 0) return s;
  }
  const st = d?.surfaceType;
  if (typeof st === 'string' && st !== 'unknown') {
    const s = sharesFromMix({ [st]: 1 }, 'route_surface_type');
    if (s.knownShare > 0) return s;
  }
  const coarse = d?.features?.surface;
  if (typeof coarse === 'string') {
    if (COARSE_PAVED.has(coarse)) return { pavedShare: 1, unpavedShare: 0, knownShare: 1, source: 'coarse_features' };
    if (COARSE_UNPAVED.has(coarse)) return { pavedShare: 0, unpavedShare: 1, knownShare: 1, source: 'coarse_features' };
  }
  return { pavedShare: 0, unpavedShare: 0, knownShare: 0, source: 'none' };
}

/** Majority of the KNOWN length decides; ties go to paved. */
export function classifySurface(activityType: string | null, s: SurfaceShares): SurfaceClass {
  if (s.knownShare <= 0) return 'unknown';
  const offroad = s.unpavedShare > s.pavedShare;
  if (activityType === 'cycling') return offroad ? 'bike_offroad' : 'bike_road';
  return offroad ? 'hike_offroad' : 'walk_run_paved';
}

// ── street_segments join ────────────────────────────────────────────────

export interface SurfaceSegment {
  coords: LngLat[];
  surfaceType: SurfaceType | string | null;
}

export interface SegmentIndex {
  cell: number;
  origin: LngLat;
  cells: Map<string, Array<{ a: XY; b: XY; surface: string }>>;
  project: (p: LngLat) => XY;
}

/** Grid index (projected metres) over segment pieces, for the route sampling join. */
export function buildSegmentIndex(segments: SurfaceSegment[], cellM = 100): SegmentIndex {
  const first = segments.find((s) => s.coords.length)?.coords[0] ?? [35, 32];
  const proj = makeProjector(first as LngLat);
  const cells = new Map<string, Array<{ a: XY; b: XY; surface: string }>>();
  for (const s of segments) {
    const surface = s.surfaceType ?? 'unknown';
    for (let k = 1; k < s.coords.length; k++) {
      const a = proj.toXY(s.coords[k - 1]);
      const b = proj.toXY(s.coords[k]);
      const minX = Math.min(a[0], b[0]), maxX = Math.max(a[0], b[0]);
      const minY = Math.min(a[1], b[1]), maxY = Math.max(a[1], b[1]);
      for (let cx = Math.floor(minX / cellM); cx <= Math.floor(maxX / cellM); cx++) {
        for (let cy = Math.floor(minY / cellM); cy <= Math.floor(maxY / cellM); cy++) {
          const kk = `${cx}:${cy}`;
          if (!cells.has(kk)) cells.set(kk, []);
          cells.get(kk)!.push({ a, b, surface });
        }
      }
    }
  }
  return { cell: cellM, origin: first as LngLat, cells, project: (p) => proj.toXY(p) };
}

/**
 * Sample the route every `stepM` and give each sample the surface of the
 * nearest segment within `bufferM` (none → 'unknown'). Returns metres per
 * SurfaceType — feed it to sharesFromMix.
 */
export function surfaceMixFromSegments(path: LngLat[], index: SegmentIndex, bufferM = 15, stepM = 25): Partial<Record<string, number>> {
  const mix: Partial<Record<string, number>> = {};
  const add = (k: string, m: number) => { mix[k] = (mix[k] ?? 0) + m; };
  for (let k = 1; k < path.length; k++) {
    const len = haversineM(path[k - 1], path[k]);
    const n = Math.max(1, Math.round(len / stepM));
    for (let s = 0; s < n; s++) {
      const t = (s + 0.5) / n;
      const p: LngLat = [path[k - 1][0] + (path[k][0] - path[k - 1][0]) * t, path[k - 1][1] + (path[k][1] - path[k - 1][1]) * t];
      const xy = index.project(p);
      let best = Infinity, surface = 'unknown';
      const cx = Math.floor(xy[0] / index.cell), cy = Math.floor(xy[1] / index.cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const seg of index.cells.get(`${cx + dx}:${cy + dy}`) ?? []) {
          const d = pointSegDist(xy, seg.a, seg.b).d;
          if (d < best) { best = d; surface = seg.surface; }
        }
      }
      add(best <= bufferM ? surface : 'unknown', len / n);
    }
  }
  return mix;
}
