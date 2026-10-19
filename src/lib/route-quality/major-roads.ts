import type { CrossingControl, LngLat, OsmRoadLayer, RoadCrossingMark } from './types';
import { angleBetween, cumulative, headingRad, pointAt, pointSegDist, projectorFor, resampleXY, segIntersection, sideOf, type Projector, type XY } from './geo';
import { SegmentGrid } from './grid';

/** Route samples within this distance of a parallel major-road centerline are "on" it. */
const ON_ROAD_TOL_M = 10;
const ON_ROAD_PARALLEL_RAD = (25 * Math.PI) / 180;
/** A route that meets a road at a shallower angle than this is running along it, not crossing it. */
const MIN_CROSS_ANGLE_RAD = (35 * Math.PI) / 180;
/** Crossings closer than this are one street crossing (dual carriageways, junction arms). */
const MERGE_M = 30;
/** A crossing/signal node within this distance of the crossing point controls it. */
const CONTROL_RADIUS_M = 20;

/** Route probe distance either side of a crossing, and how far off the road line a probe must be. */
const PROBE_M = 15;
const SIDE_MIN_M = 2;

const RANK: Record<CrossingControl, number> = { signalled: 0, marked: 1, unmarked: 2 };

interface RoadSeg { highway: string; name?: string }

function roadGrid(layer: OsmRoadLayer, proj: Projector): SegmentGrid<RoadSeg> {
  const grid = new SegmentGrid<RoadSeg>(50);
  for (const r of layer.roads) {
    const xy = r.coords.map(proj.toXY);
    for (let i = 0; i < xy.length - 1; i++) grid.add(xy[i], xy[i + 1], { highway: r.highway, name: r.name });
  }
  return grid;
}

/** Share (0..1) of the route length running along a tertiary+ centerline. */
export function majorRoadShare(path: LngLat[], layer: OsmRoadLayer): number {
  if (path.length < 2) return 0;
  const proj = projectorFor(path);
  const grid = roadGrid(layer, proj);
  const { pts } = resampleXY(path.map(proj.toXY), 10);
  if (pts.length < 2) return 0;
  let on = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const h = headingRad(pts[i], pts[i + 1]);
    for (const s of grid.near(pts[i], ON_ROAD_TOL_M)) {
      if (pointSegDist(pts[i], s.a, s.b).d > ON_ROAD_TOL_M) continue;
      const a = angleBetween(h, headingRad(s.a, s.b));
      if (a <= ON_ROAD_PARALLEL_RAD || a >= Math.PI - ON_ROAD_PARALLEL_RAD) { on++; break; }
    }
  }
  return on / (pts.length - 1);
}

/** Every place the route crosses a tertiary+ road, merged per street crossing and classified by its control. */
export function majorRoadCrossings(path: LngLat[], layer: OsmRoadLayer): RoadCrossingMark[] {
  if (path.length < 2) return [];
  const proj = projectorFor(path);
  const grid = roadGrid(layer, proj);
  const xy = path.map(proj.toXY);
  const cum = cumulative(xy);
  const raw: Array<{ p: XY; s: number; road: RoadSeg }> = [];
  for (let i = 0; i < xy.length - 1; i++) {
    const h = headingRad(xy[i], xy[i + 1]);
    for (const s of grid.nearSegment(xy[i], xy[i + 1])) {
      const a = angleBetween(h, headingRad(s.a, s.b));
      if (a < MIN_CROSS_ANGLE_RAD || a > Math.PI - MIN_CROSS_ANGLE_RAD) continue;
      const hit = segIntersection(xy[i], xy[i + 1], s.a, s.b);
      if (!hit) continue;
      // Confirm the route really goes from one side of the road to the other
      // (a vertex shared with the road's own node, or touching and turning
      // along it, is not a crossing).
      const at = cum[i] + hit.t * (cum[i + 1] - cum[i]);
      const before = sideOf(pointAt(xy, cum, at - PROBE_M), s.a, s.b);
      const after = sideOf(pointAt(xy, cum, at + PROBE_M), s.a, s.b);
      if (Math.abs(before) < SIDE_MIN_M || Math.abs(after) < SIDE_MIN_M || Math.sign(before) === Math.sign(after)) continue;
      raw.push({ p: hit.p, s: at, road: s.data });
    }
  }
  raw.sort((x, y) => x.s - y.s);
  // Merge consecutive-in-space crossings (route order is preserved by the scan above).
  const merged: Array<{ pts: XY[]; road: RoadSeg }> = [];
  for (const c of raw) {
    const last = merged[merged.length - 1];
    if (last && last.pts.some(q => Math.hypot(q[0] - c.p[0], q[1] - c.p[1]) <= MERGE_M)) last.pts.push(c.p);
    else merged.push({ pts: [c.p], road: c.road });
  }
  const nodes = layer.crossings.map(n => ({ xy: proj.toXY(n.coord), control: n.control }));
  return merged.map(m => {
    // Each carriageway/arm crossed must be controlled — the merged crossing is as safe as its worst point.
    let worst: CrossingControl = 'signalled';
    for (const p of m.pts) {
      let best: CrossingControl = 'unmarked';
      for (const n of nodes) {
        if (Math.hypot(n.xy[0] - p[0], n.xy[1] - p[1]) <= CONTROL_RADIUS_M && RANK[n.control] < RANK[best]) best = n.control;
      }
      if (RANK[best] > RANK[worst]) worst = best;
    }
    const c = m.pts[0];
    return { coord: proj.toLngLat(c), roadName: m.road.name, highway: m.road.highway, control: worst };
  });
}
