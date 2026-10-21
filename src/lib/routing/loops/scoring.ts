/**
 * Trim spurs, measure with src/lib/route-quality, rank. Score (lower = better)
 * = 10 if it fails the v1 bars + the v1 penalty + 2·|distance error| — the
 * ranking the experiment validated (77.8% pass vs 58.3% Mapbox v1) — + a mild
 * turn/zigzag term (turnScorePenalty, 21.10.2026).
 */
import { computeRouteQualityMetrics, evaluateLoopQuality, ourRoutesShare, trimSpurs, type LngLat, type OsmRoadLayer, type OurRoutesIndex, type QualityVerdict, type RouteQualityMetrics } from '@/lib/route-quality';
import type { LoopCandidate, LoopSource } from './candidates';
import type { RoutedPath } from '../graphhopper';
import { OUR_ROUTES_GH_SCORE_WEIGHT } from '../our-routes';

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
  /** 0..1 on our mapped routes — only when our routes were passed (enable_loops_prefer_official). */
  ourRoutesShare?: number;
}

/**
 * Turn-aware ranking (owner feedback 21.10.2026: GraphHopper loops zigzag
 * through side streets). Ranking only — never a reject bar, and deliberately
 * mild: it breaks near-ties between the 6 candidates toward the calmer loop
 * without trading away main-road share or distance (a stronger weight bought
 * only ~2% fewer turns for +3 pp main-road length on the 21.10 sweep). The
 * real fix for the zigzag is GraphHopper turn costs (profile foot_turns).
 * Free allowance TURNS_FREE_PER_KM (live GH loops: 4–12 turns/km, v1 ≈ 6.7),
 * then TURNS_SCORE_WEIGHT per extra turn/km, plus ZIGZAG_SCORE_WEIGHT per
 * 0.1 of zigzag index over 1.05 (block staircase ≈ 1.41).
 */
export const TURNS_FREE_PER_KM = 5;
export const TURNS_SCORE_WEIGHT = 0.05;
export const ZIGZAG_SCORE_WEIGHT = 0.2;

export function turnScorePenalty(m: Pick<RouteQualityMetrics, 'turnsPerKm' | 'zigzagIndex'>): number {
  return TURNS_SCORE_WEIGHT * Math.max(0, (m.turnsPerKm ?? 0) - TURNS_FREE_PER_KM)
    + ZIGZAG_SCORE_WEIGHT * 10 * Math.max(0, (m.zigzagIndex ?? 1) - 1.05);
}

/** Loops further off the target than this are only used when nothing else exists. */
export const MAX_DISTANCE_ERROR = 0.3;

/** `ourRoutes` (enable_loops_prefer_official): loops along our mapped routes rank better — see OUR_ROUTES_GH_SCORE_WEIGHT. */
export function scoreLoop(c: LoopCandidate, targetKm: number, osm: OsmRoadLayer | null, ourRoutes?: OurRoutesIndex | null): ScoredLoop {
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
  const share = ourRoutes ? ourRoutesShare(t.path, ourRoutes).share : null;
  const scored: ScoredLoop = {
    source: c.source,
    path: t.path,
    distanceKm: distanceM / 1000,
    timeMin: r.distanceM > 0 ? (r.timeMs / 60_000) * (distanceM / r.distanceM) : 0,
    ascendM: r.ascendM,
    maxGradePct: r.maxGradePct,
    trimmedM: t.trimmedM,
    metrics,
    verdict,
    score: (verdict.pass ? 0 : 10) + verdict.penalty + 2 * err + unmarkedTiebreak + turnScorePenalty(metrics),
    roadClassShare: r.roadClassShare,
    crossingsAll: r.crossings,
  };
  if (share != null) {
    scored.ourRoutesShare = share;
    scored.score -= OUR_ROUTES_GH_SCORE_WEIGHT * share;
  }
  return scored;
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
