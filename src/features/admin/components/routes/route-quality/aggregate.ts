import type { QualityRunRoute, QualityVariant } from './types';

export interface VariantAggregate {
  variant: QualityVariant;
  routes: number;
  uturnPct: number;
  retraceOver8Pct: number;
  meanRetracePct: number;
  meanCompactness: number;
  withinWindowPct: number;
  majorRoadPct: number;
  crossingsPerKm: number;
  unmarkedPerKm: number;
  passPct: number;
  meanMs: number;
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const share = (a: boolean[]) => (a.length ? (100 * a.filter(Boolean).length) / a.length : 0);

/** Aggregates over the TOP route of every generation (what a user sees first). */
export function aggregateVariant(routes: QualityRunRoute[], variant: QualityVariant): VariantAggregate {
  const top = routes.filter(r => r.variant === variant && r.rank === 0);
  const m = top.map(r => r.metrics);
  const km = m.reduce((a, x) => a + x.lengthM / 1000, 0);
  return {
    variant,
    routes: top.length,
    uturnPct: share(m.map(x => x.uTurnCount + x.spurCount > 0)),
    retraceOver8Pct: share(m.map(x => x.retracedPct > 0.08)),
    meanRetracePct: 100 * mean(m.map(x => x.retracedPct)),
    meanCompactness: mean(m.map(x => x.compactness)),
    withinWindowPct: share(m.map(x => Math.abs(x.distanceErrorPct ?? 1) <= 0.15)),
    majorRoadPct: 100 * mean(m.map(x => x.majorRoadPct ?? 0)),
    crossingsPerKm: km ? m.reduce((a, x) => a + (x.crossings?.total ?? 0), 0) / km : 0,
    unmarkedPerKm: km ? m.reduce((a, x) => a + (x.crossings?.unmarked ?? 0), 0) / km : 0,
    passPct: share(top.map(r => r.verdict.pass)),
    meanMs: mean(top.map(r => r.ms)),
  };
}
