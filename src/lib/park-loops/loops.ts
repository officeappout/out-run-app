/**
 * The three loop sources for one park, in the plan's priority (§2.5):
 *   1. known     — an existing route that already circles the park;
 *   2. perimeter — the park boundary walked on REAL paths (each boundary
 *                  sample snapped to a footway/path/cycleway ≤ 30 m away);
 *   3. inner     — GraphHopper via-points on inner paths (injected router;
 *                  offline runs without GraphHopper report it as blocked).
 * Fitness stations are only marked as optional stops — they never change the
 * geometry.
 */
import { evaluateLoopQuality } from '../route-quality/acceptance';
import { computeRouteQualityMetrics } from '../route-quality/metrics';
import { distToLineM, haversineM, pathLengthM, pointInRing, resample } from './geometry';
import type { PathIndex } from './path-index';
import type { LngLat, ParkLoop, ParkPolygon, PointFeature } from './types';

export const SNAP_M = 30;
export const SAMPLE_STEP_M = 20;
export const PERIMETER_MIN_COVERAGE = 0.8;
export const PERIMETER_MAX_GAP_M = 150;
export const LOOP_MIN_M = 1_000;
export const LOOP_MAX_M = 15_000;
export const KNOWN_MIN_INSIDE = 0.7;
export const FITNESS_STOP_MAX_M = 180; // same reach as resolveRouteStops (route-stops.service.ts)
export const SAME_LOOP_BUFFER_M = 15;
export const SAME_LOOP_MIN_SHARE = 0.7; // the plan's dedup rule (§3.1)

/** Share of `a` lying within 15 m of `b` — ≥0.7 means the same loop. */
export function sameLoopShare(a: LngLat[], b: LngLat[]): number {
  const pts = resample(a, SAMPLE_STEP_M);
  return pts.filter((p) => distToLineM(p, b).d <= SAME_LOOP_BUFFER_M).length / Math.max(1, pts.length);
}

const largestRing = (p: ParkPolygon) => p.rings.slice().sort((a, b) => pathLengthM(b) - pathLengthM(a))[0];

function insideOrNear(pt: LngLat, park: ParkPolygon, bufM: number): boolean {
  return park.rings.some((r) => pointInRing(pt, r) || distToLineM(pt, r).d <= bufM);
}

export function fitnessStopsAlong(coords: LngLat[], stations: PointFeature[]): ParkLoop['fitnessStops'] {
  const out: ParkLoop['fitnessStops'] = [];
  for (const s of stations) {
    const { d } = distToLineM(s.coord, coords);
    if (d <= FITNESS_STOP_MAX_M) out.push({ id: s.id, coord: s.coord, distanceM: Math.round(d) });
  }
  return out.sort((a, b) => a.distanceM - b.distanceM);
}

/** 1. An existing closed route with ≥70% of its length inside (or within 30 m of) the park. */
export function knownLoops(park: ParkPolygon, existing: Array<{ id: string; name: string; coords: LngLat[] }>): ParkLoop[] {
  const out: ParkLoop[] = [];
  for (const r of existing) {
    if (r.coords.length < 4 || haversineM(r.coords[0], r.coords[r.coords.length - 1]) > 50) continue;
    const pts = resample(r.coords, 50);
    const share = pts.filter((p) => insideOrNear(p, park, SNAP_M)).length / pts.length;
    if (share >= KNOWN_MIN_INSIDE) {
      out.push({ park, kind: 'known', coords: r.coords, lengthM: pathLengthM(r.coords), evidence: `existing route ${r.id} ("${r.name}"), ${Math.round(share * 100)}% in the park`, fitnessStops: [] });
    }
  }
  return out;
}

export interface PerimeterResult { loop: ParkLoop | null; coverage: number; maxGapM: number; reason: string }

/** 2. Walk the park's largest outer ring on real paths. */
export function perimeterLoop(park: ParkPolygon, paths: PathIndex): PerimeterResult {
  const ring = largestRing(park);
  const samples = resample(ring, SAMPLE_STEP_M);
  const snapped: Array<LngLat | null> = samples.map((p) => paths.nearest(p, SNAP_M)?.at ?? null);
  const hit = snapped.filter(Boolean).length;
  const coverage = samples.length ? hit / samples.length : 0;
  // Longest run of unsnapped samples (wrapping around the closed ring).
  let maxRun = 0, run = 0;
  for (let k = 0; k < snapped.length * 2; k++) {
    if (!snapped[k % snapped.length]) { run++; maxRun = Math.max(maxRun, Math.min(run, snapped.length)); } else run = 0;
  }
  const maxGapM = maxRun * SAMPLE_STEP_M;
  const coords: LngLat[] = [];
  for (const p of snapped) if (p && (!coords.length || haversineM(coords[coords.length - 1], p) > 1)) coords.push(p);
  if (coords.length > 2) coords.push(coords[0]);
  const lengthM = coords.length > 2 ? pathLengthM(coords) : 0;
  const fail = (reason: string): PerimeterResult => ({ loop: null, coverage, maxGapM, reason });
  if (coverage < PERIMETER_MIN_COVERAGE) return fail(`only ${Math.round(coverage * 100)}% of the boundary has a path within ${SNAP_M} m`);
  if (maxGapM > PERIMETER_MAX_GAP_M) return fail(`a ${maxGapM} m stretch of the boundary has no path`);
  if (lengthM < LOOP_MIN_M || lengthM > LOOP_MAX_M) return fail(`loop length ${Math.round(lengthM)} m outside ${LOOP_MIN_M}-${LOOP_MAX_M} m`);
  // Snapping can hop between two parallel paths — that shows up as U-turns / retrace.
  // Compactness is NOT judged: a long park (Yarkon, HaMesila) is legitimately thin.
  const q = evaluateLoopQuality(computeRouteQualityMetrics(coords));
  const bad = q.reasons.filter((r) => r === 'retrace' || r === 'uturn');
  if (bad.length) return fail(`snapped perimeter fails route-quality (${bad.join(', ')})`);
  return {
    loop: { park, kind: 'perimeter', coords, lengthM, evidence: `${Math.round(coverage * 100)}% of the boundary on paths, longest gap ${maxGapM} m`, fitnessStops: [] },
    coverage, maxGapM, reason: 'ok',
  };
}

/** Injected GraphHopper via-point router (src/lib/routing/graphhopper request-builder's buildViaRequest). */
export interface ViaRouter {
  route(points: LngLat[], opts: { profile: string; preferPolygon: LngLat[] }): Promise<{ coords: LngLat[] } | null>;
}

/** Via points: the path vertex inside the park nearest to each of 3 bearings at ~half the radius. */
export function innerViaPoints(park: ParkPolygon, paths: PathIndex): LngLat[] {
  const ring = largestRing(park);
  let cx = 0, cy = 0;
  for (const [x, y] of ring) { cx += x; cy += y; }
  cx /= ring.length; cy /= ring.length;
  const radiusDeg = Math.max(...ring.map(([x, y]) => Math.hypot(x - cx, y - cy))) / 2;
  const out: LngLat[] = [];
  for (const deg of [90, 210, 330]) {
    const t = (deg * Math.PI) / 180;
    const target: LngLat = [cx + radiusDeg * Math.cos(t), cy + radiusDeg * Math.sin(t)];
    const hit = paths.nearest(target, 150);
    if (hit && pointInRing(hit.at, ring)) out.push(hit.at);
  }
  return out;
}

/** 3. Inner loop: entrance → 3 inner via points → entrance, kept only if it passes the route-quality v1 bars. */
export async function innerLoop(park: ParkPolygon, paths: PathIndex, router: ViaRouter | null, profile = 'out_run'): Promise<{ loop: ParkLoop | null; reason: string }> {
  if (!router) return { loop: null, reason: 'GraphHopper not reachable — inner loops need the GH deploy' };
  const ring = largestRing(park);
  const entrance = resample(ring, SAMPLE_STEP_M).map((p) => paths.nearest(p, SNAP_M)?.at).find(Boolean);
  const vias = innerViaPoints(park, paths);
  if (!entrance || vias.length < 2) return { loop: null, reason: 'no entrance / too few inner paths' };
  const res = await router.route([entrance, ...vias, entrance], { profile, preferPolygon: ring });
  if (!res || res.coords.length < 4) return { loop: null, reason: 'router returned no route' };
  const verdict = evaluateLoopQuality(computeRouteQualityMetrics(res.coords));
  if (!verdict.pass) return { loop: null, reason: `fails route-quality: ${verdict.reasons.join(', ')}` };
  const lengthM = pathLengthM(res.coords);
  if (lengthM < LOOP_MIN_M || lengthM > LOOP_MAX_M) return { loop: null, reason: `length ${Math.round(lengthM)} m` };
  return { loop: { park, kind: 'inner', coords: res.coords, lengthM, evidence: `GraphHopper via ${vias.length} inner points`, fitnessStops: [] }, reason: 'ok' };
}

export interface ParkLoopsResult { park: ParkPolygon; loops: ParkLoop[]; notes: string[] }

/** Priority: known → perimeter → inner. At most 2 loops per park (the selection's own cap). */
export async function loopsForPark(
  park: ParkPolygon,
  ctx: { paths: PathIndex; existing: Array<{ id: string; name: string; coords: LngLat[] }>; fitness: PointFeature[]; router: ViaRouter | null },
): Promise<ParkLoopsResult> {
  const notes: string[] = [];
  const loops: ParkLoop[] = [...knownLoops(park, ctx.existing)];
  if (loops.length) notes.push(`known: ${loops.length}`);
  if (loops.length < 2) {
    const p = perimeterLoop(park, ctx.paths);
    if (!p.loop) notes.push(`perimeter: ${p.reason}`);
    else if (loops.some((k) => sameLoopShare(p.loop!.coords, k.coords) >= SAME_LOOP_MIN_SHARE)) notes.push('perimeter: same as the known loop');
    else loops.push(p.loop);
  }
  if (loops.length < 2) {
    const i = await innerLoop(park, ctx.paths, ctx.router);
    if (!i.loop) notes.push(`inner: ${i.reason}`);
    else if (loops.some((k) => sameLoopShare(i.loop!.coords, k.coords) >= SAME_LOOP_MIN_SHARE)) notes.push('inner: same as an earlier loop');
    else loops.push(i.loop);
  }
  for (const l of loops) l.fitnessStops = fitnessStopsAlong(l.coords, ctx.fitness);
  return { park, loops: loops.slice(0, 2), notes };
}
