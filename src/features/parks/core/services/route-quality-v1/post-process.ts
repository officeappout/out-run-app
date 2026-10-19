/**
 * v1 loop post-processing: cut dead-end spurs / U-turns out of the raw
 * Mapbox line, then measure it and judge it against the v1 bars.
 */
import { computeRouteQualityMetrics, evaluateLoopQuality, trimSpurs, type OsmRoadLayer, type QualityVerdict, type RouteQualityMetrics } from '@/lib/route-quality';

export interface LoopPostProcess {
  path: [number, number][];
  trimmedM: number;
  spursTrimmed: number;
  metrics: RouteQualityMetrics;
  verdict: QualityVerdict;
}

export function postProcessLoopV1(rawPath: [number, number][], targetKm: number, osm: OsmRoadLayer | null): LoopPostProcess {
  const t = trimSpurs(rawPath);
  const metrics = computeRouteQualityMetrics(t.path, { targetKm, osm });
  return { path: t.path, trimmedM: t.trimmedM, spursTrimmed: t.spursTrimmed, metrics, verdict: evaluateLoopQuality(metrics) };
}
