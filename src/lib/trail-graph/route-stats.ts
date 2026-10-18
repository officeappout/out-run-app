/**
 * trail-graph/route-stats.ts — route-level stats from an ordered segment
 * walk. Pure. Elevation is summed PER SEGMENT in its traversal direction
 * (gap-proof: a jump between disconnected relation pieces never invents a
 * climb), and max grade is the steepest directional segment grade.
 */
import type { SurfaceType } from '@/lib/route-collections/surface-type';
import { OFFROAD_HIGHWAYS } from './tags';
import type { RouteStats, TrailSegment } from './types';

export function routeStats(segs: TrailSegment[], forward: boolean[]): RouteStats {
  const lengthM = segs.reduce((a, s) => a + s.lengthM, 0) || 0;
  const share = (pred: (s: TrailSegment) => boolean) =>
    lengthM ? Math.round((segs.filter(pred).reduce((a, s) => a + s.lengthM, 0) / lengthM) * 1000) / 10 : 0;
  const hasEle = segs.length > 0 && segs.every((s) => s.elevation);
  let gain = 0, loss = 0, maxG = 0, maxOpen = 0, minE = Infinity, maxE = -Infinity;
  if (hasEle) {
    segs.forEach((s, i) => {
      const e = s.elevation!;
      const f = forward[i] !== false;
      gain += f ? e.gainFwdM : e.gainRevM;
      loss += f ? e.gainRevM : e.gainFwdM;
      const g = f ? e.maxGrade50mFwdPct : e.maxGrade50mRevPct;
      maxG = Math.max(maxG, g);
      if (!s.inBuiltUp) maxOpen = Math.max(maxOpen, g);
      minE = Math.min(minE, e.minEleM);
      maxE = Math.max(maxE, e.maxEleM);
    });
  }
  const surfaceMix: Partial<Record<SurfaceType, number>> = {};
  for (const s of segs) surfaceMix[s.surface] = (surfaceMix[s.surface] ?? 0) + s.lengthM;
  for (const k of Object.keys(surfaceMix) as SurfaceType[]) surfaceMix[k] = Math.round(((surfaceMix[k] ?? 0) / (lengthM || 1)) * 1000) / 10;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    lengthM: r1(lengthM),
    gainM: hasEle ? r1(gain) : null,
    lossM: hasEle ? r1(loss) : null,
    maxGrade50mPct: hasEle ? r1(maxG) : null,
    maxGrade50mOpenPct: hasEle ? r1(maxOpen) : null,
    minEleM: hasEle ? r1(minE) : null,
    maxEleM: hasEle ? r1(maxE) : null,
    builtUpPct: share((s) => s.inBuiltUp),
    trailPct: share((s) => OFFROAD_HIGHWAYS.has(s.highwayClass)),
    litPct: share((s) => s.lit === 'yes'),
    litUnknownPct: share((s) => s.lit === 'unknown'),
    surfaceMix,
  };
}
