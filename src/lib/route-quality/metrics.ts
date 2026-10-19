import type { LngLat, OsmRoadLayer, RouteQualityMetrics } from './types';
import { pathLengthM } from './geo';
import { detectUTurns } from './uturns';
import { retracedFraction } from './retrace';
import { compactness, countSelfIntersections } from './shape';
import { majorRoadCrossings, majorRoadShare } from './major-roads';

export interface MetricsOptions {
  targetKm?: number;
  osm?: OsmRoadLayer | null;
}

/** Every route-quality metric for one route line (pure; no I/O). */
export function computeRouteQualityMetrics(path: LngLat[], opts: MetricsOptions = {}): RouteQualityMetrics {
  const lengthM = pathLengthM(path);
  const km = lengthM / 1000;
  const uTurns = detectUTurns(path);
  let crossings: RouteQualityMetrics['crossings'] = null;
  let majorRoadPct: number | null = null;
  if (opts.osm) {
    const marks = majorRoadCrossings(path, opts.osm);
    const count = (c: string) => marks.filter(m => m.control === c).length;
    const unmarked = count('unmarked');
    crossings = {
      total: marks.length,
      perKm: km > 0 ? marks.length / km : 0,
      signalled: count('signalled'),
      marked: count('marked'),
      unmarked,
      unmarkedPerKm: km > 0 ? unmarked / km : 0,
      marks,
    };
    majorRoadPct = majorRoadShare(path, opts.osm);
  }
  return {
    lengthM,
    uTurns,
    uTurnCount: uTurns.filter(u => u.kind === 'uturn').length,
    spurCount: uTurns.filter(u => u.kind === 'spur').length,
    retracedPct: retracedFraction(path),
    selfIntersections: countSelfIntersections(path),
    compactness: compactness(path),
    distanceErrorPct: opts.targetKm && opts.targetKm > 0 ? (km - opts.targetKm) / opts.targetKm : null,
    majorRoadPct,
    crossings,
  };
}
