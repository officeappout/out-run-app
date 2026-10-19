/**
 * Trim spurs, measure with src/lib/route-quality, rank. Score (lower = better)
 * = 10 if it fails the v1 bars + the v1 penalty + 2·|distance error| — the
 * exact ranking the experiment validated (77.8% pass vs 58.3% Mapbox v1).
 */
import { computeRouteQualityMetrics, evaluateLoopQuality, trimSpurs, type LngLat, type OsmRoadLayer, type QualityVerdict, type RouteQualityMetrics } from '@/lib/route-quality';
import type { LoopCandidate, LoopSource } from './candidates';
import type { RoutedPath } from '../graphhopper';

export interface ScoredLoop {
  source: LoopSource;
  path: LngLat[];
  distanceKm: number;
  /** GraphHopper time scaled to the trimmed length. */
  timeMin: number;
  ascendM: number;
  maxGradePct: number;
  trimmedM: number;
  metrics: RouteQualityMetrics;
  verdict: QualityVerdict;
  score: number;
  /** From GraphHopper path details (pre-trim). */
  roadClassShare: RoutedPath['roadClassShare'];
  crossingsAll: RoutedPath['crossings'];
}

/** Loops further off the target than this are only used when nothing else exists. */
export const MAX_DISTANCE_ERROR = 0.3;

export function scoreLoop(c: LoopCandidate, targetKm: number, osm: OsmRoadLayer | null): ScoredLoop {
  const r = c.routed;
  const t = trimSpurs(r.path);
  const metrics = computeRouteQualityMetrics(t.path, { targetKm, osm });
  // No OSM layer → fill the major-road share from GraphHopper's own road_class
  // details (same tertiary+ definition). Crossing bars stay off without OSM:
  // GraphHopper's crossing detail cannot tell a side-street crossing from a
  // main-road one.
  if (metrics.majorRoadPct == null) metrics.majorRoadPct = r.majorRoadShare;
  const verdict = evaluateLoopQuality(metrics);
  const distanceM = Math.max(0, r.distanceM - t.trimmedM);
  const err = Math.abs(metrics.distanceErrorPct ?? 0);
  const unmarkedTiebreak = osm ? 0 : 0.05 * r.crossings.unmarked;
  return {
    source: c.source,
    path: t.path,
    distanceKm: distanceM / 1000,
    timeMin: r.distanceM > 0 ? (r.timeMs / 60_000) * (distanceM / r.distanceM) : 0,
    ascendM: r.ascendM,
    maxGradePct: r.maxGradePct,
    trimmedM: t.trimmedM,
    metrics,
    verdict,
    score: (verdict.pass ? 0 : 10) + verdict.penalty + 2 * err + unmarkedTiebreak,
    roadClassShare: r.roadClassShare,
    crossingsAll: r.crossings,
  };
}

const mid = (p: LngLat[]) => p[Math.floor(p.length / 2)];
const nearlySame = (a: ScoredLoop, b: ScoredLoop) => {
  if (Math.abs(a.distanceKm - b.distanceKm) > 0.01 * Math.max(a.distanceKm, b.distanceKm)) return false;
  const [x, y] = [mid(a.path), mid(b.path)];
  return Math.abs(x[0] - y[0]) < 0.0003 && Math.abs(x[1] - y[1]) < 0.0003;
};

/** Best `n` distinct loops; far-off-target loops only when nothing closer exists. */
export function selectTopLoops(loops: ScoredLoop[], n: number): ScoredLoop[] {
  const near = loops.filter(l => Math.abs(l.metrics.distanceErrorPct ?? 0) <= MAX_DISTANCE_ERROR);
  const pool = [...(near.length ? near : loops)].sort((a, b) => a.score - b.score);
  const out: ScoredLoop[] = [];
  for (const l of pool) {
    if (out.length >= n) break;
    if (!out.some(o => nearlySame(o, l))) out.push(l);
  }
  return out;
}
