/** ScoredLoop / RoutedPath → the compact JSON the app receives. */
import type { GeneratedLoopDto, GenerateAbResponse } from '@/lib/routing/api-contract';
import type { RoutedPath } from '@/lib/routing/graphhopper';
import type { ScoredLoop } from '@/lib/routing/loop-service';

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const r3 = (n: number) => Math.round(n * 1e3) / 1e3;
const path6 = (p: [number, number][]) => p.map(([x, y]) => [r6(x), r6(y)] as [number, number]);

export function toLoopDto(l: ScoredLoop): GeneratedLoopDto {
  return {
    source: l.source,
    path: path6(l.path),
    distanceKm: r3(l.distanceKm),
    timeMin: Math.round(l.timeMin),
    ascendM: Math.round(l.ascendM),
    maxGradePct: l.maxGradePct,
    pass: l.verdict.pass,
    reasons: l.verdict.reasons,
    score: r3(l.score),
    majorRoadPct: l.metrics.majorRoadPct == null ? null : r3(l.metrics.majorRoadPct),
    unmarkedCrossingsPerKm: l.metrics.crossings ? r3(l.metrics.crossings.unmarkedPerKm) : null,
    retracedPct: r3(l.metrics.retracedPct),
    compactness: r3(l.metrics.compactness),
  };
}

export function toAbDto(r: RoutedPath): NonNullable<GenerateAbResponse['route']> {
  return {
    path: path6(r.path),
    distanceKm: r3(r.distanceM / 1000),
    timeMin: Math.round(r.timeMs / 60_000),
    ascendM: Math.round(r.ascendM),
    maxGradePct: r.maxGradePct,
    majorRoadPct: r3(r.majorRoadShare),
  };
}
