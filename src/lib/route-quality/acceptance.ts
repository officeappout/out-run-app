import type { RouteQualityMetrics } from './types';

/** Phase-1 loop acceptance bars (route quality v1). */
export const LOOP_QUALITY_THRESHOLDS = {
  maxRetracedPct: 0.08,
  maxUTurns: 0,
  // Calibrated on the 6-start sweep: < 0.22 is an out-and-back-like sliver; a
  // compact block loop with a short start/finish stick still reads ~0.3.
  minCompactness: 0.22,
  maxUnmarkedCrossingsPerKm: 0.5,
} as const;

export type QualityRejectReason = 'retrace' | 'uturn' | 'compactness' | 'unmarked_crossings';

export interface QualityVerdict {
  pass: boolean;
  reasons: QualityRejectReason[];
  /** 0 = perfect; ranking penalty used to order candidates (lower is better). */
  penalty: number;
}

/** Judge a loop against the v1 bars. Crossing bars apply only when an OSM layer was available. */
export function evaluateLoopQuality(m: RouteQualityMetrics, t = LOOP_QUALITY_THRESHOLDS): QualityVerdict {
  const reasons: QualityRejectReason[] = [];
  if (m.retracedPct > t.maxRetracedPct) reasons.push('retrace');
  if (m.uTurnCount + m.spurCount > t.maxUTurns) reasons.push('uturn');
  if (m.compactness < t.minCompactness) reasons.push('compactness');
  if (m.crossings && m.crossings.unmarkedPerKm > t.maxUnmarkedCrossingsPerKm) reasons.push('unmarked_crossings');
  const penalty =
    3 * m.retracedPct +
    0.25 * (m.uTurnCount + m.spurCount) +
    Math.max(0, 0.45 - m.compactness) +
    0.15 * (m.crossings?.unmarked ?? 0) +
    0.2 * m.selfIntersections +
    0.5 * (m.majorRoadPct ?? 0);
  return { pass: reasons.length === 0, reasons, penalty };
}
