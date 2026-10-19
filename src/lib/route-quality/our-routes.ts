/**
 * "On our routes" — how much of a generated line runs along OUT's own mapped
 * routes (official_routes / curated_routes geometries: known quality, level
 * and elevation). Pure, no I/O: callers hand in the route lines they already
 * loaded.
 *
 * A stretch of the line counts as "on" a route when it lies within
 * OUR_ROUTES_BUFFER_M of that route's centerline AND runs along it (heading
 * within OUR_ROUTES_MAX_ANGLE_DEG either way) — a perpendicular crossing does
 * not count. A route is "used" once at least OUR_ROUTES_MIN_USE_M of the line
 * runs along it.
 */
import type { LngLat } from './types';
import { angleBetween, headingRad, makeProjector, pointSegDist, resampleXY, type Projector, type XY } from './geo';
import { SegmentGrid } from './grid';

export const OUR_ROUTES_BUFFER_M = 15;
export const OUR_ROUTES_MIN_USE_M = 100;
export const OUR_ROUTES_MAX_ANGLE_DEG = 35;
const SAMPLE_STEP_M = 5;

/** One of our mapped routes as a plain line ([lng, lat], same order as Route.path). */
export interface OurRouteLine {
  id: string;
  path: LngLat[];
  /** Which collection it came from — display only. */
  kind?: 'official' | 'curated';
  name?: string;
}

export interface OurRoutesShare {
  /** 0..1 of the line's length running along one of our routes. */
  share: number;
  onM: number;
  lengthM: number;
  /** Distinct routes with >= OUR_ROUTES_MIN_USE_M along them, longest first. */
  routeIds: string[];
  routesUsed: number;
}

/** A prepared spatial index of our routes (build once, measure many lines). */
export interface OurRoutesIndex {
  projector: Projector;
  grid: SegmentGrid<string>;
  routeCount: number;
}

export function buildOurRoutesIndex(routes: OurRouteLine[], origin?: LngLat): OurRoutesIndex | null {
  const usable = routes.filter(r => Array.isArray(r.path) && r.path.length >= 2);
  if (usable.length === 0) return null;
  const projector = makeProjector(origin ?? usable[0].path[0]);
  const grid = new SegmentGrid<string>(50);
  for (const r of usable) {
    const xy = r.path.map(p => projector.toXY(p));
    for (let i = 1; i < xy.length; i++) {
      if (xy[i][0] === xy[i - 1][0] && xy[i][1] === xy[i - 1][1]) continue;
      grid.add(xy[i - 1], xy[i], r.id);
    }
  }
  return { projector, grid, routeCount: usable.length };
}

/** Share of `path` along our routes (see header). Empty / no index → share 0. */
export function ourRoutesShare(
  path: LngLat[],
  index: OurRoutesIndex | null,
  opts: { bufferM?: number; minUseM?: number } = {},
): OurRoutesShare {
  const bufferM = opts.bufferM ?? OUR_ROUTES_BUFFER_M;
  const minUseM = opts.minUseM ?? OUR_ROUTES_MIN_USE_M;
  if (!index || path.length < 2) return { share: 0, onM: 0, lengthM: 0, routeIds: [], routesUsed: 0 };
  const maxAngle = (OUR_ROUTES_MAX_ANGLE_DEG * Math.PI) / 180;
  const { pts } = resampleXY(path.map(p => index.projector.toXY(p)), SAMPLE_STEP_M);
  let lengthM = 0, onM = 0;
  const perRoute = new Map<string, number>();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len === 0) continue;
    lengthM += len;
    const mid: XY = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const h = headingRad(a, b);
    let best: { id: string; d: number } | null = null;
    for (const s of index.grid.near(mid, bufferM)) {
      const { d } = pointSegDist(mid, s.a, s.b);
      if (d > bufferM) continue;
      const ang = angleBetween(h, headingRad(s.a, s.b));
      if (Math.min(ang, Math.PI - ang) > maxAngle) continue;
      if (!best || d < best.d) best = { id: s.data, d };
    }
    if (best) {
      onM += len;
      perRoute.set(best.id, (perRoute.get(best.id) ?? 0) + len);
    }
  }
  const used = Array.from(perRoute.entries()).filter(([, m]) => m >= minUseM).sort((x, y) => y[1] - x[1]).map(([id]) => id);
  return { share: lengthM > 0 ? onM / lengthM : 0, onM, lengthM, routeIds: used, routesUsed: used.length };
}

/** Our routes with at least one vertex within `radiusM` of `center` (cheap pre-filter for loaders). */
export function ourRoutesNear(routes: OurRouteLine[], center: LngLat, radiusM: number): OurRouteLine[] {
  const pr = makeProjector(center);
  const r2 = radiusM * radiusM;
  return routes.filter(r => Array.isArray(r.path) && r.path.length >= 2 && r.path.some(p => {
    const [x, y] = pr.toXY(p);
    return x * x + y * y <= r2;
  }));
}
