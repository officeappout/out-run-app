/**
 * "Shadiest route" preference (enable_route_pref_shade, RC6 step 3). Server
 * side, after GraphHopper: the loop candidates are re-ranked by their Technion
 * shade — passing loops first (quality bars are never traded for shade), then
 * measured shade high → low, then the generator's own order. Loops whose shade
 * is not measured (layer covers < 50%) keep their order after the measured ones.
 * Pure: the caller supplies the city's shade index (or null).
 */
import { measureRouteShade } from '../shade/route-shade';
import type { ShadeSpatialIndex } from '../shade/match';
import type { ScoredLoop } from './loop-service';

/** How many distinct candidates to ask the loop service for when ranking by shade (vs the usual 3). */
export const SHADE_PREF_POOL = 6;

export type ShadePrefReason = 'applied' | 'no_shade_data' | 'not_measured' | 'timeout';

export interface ShadePrefMeta {
  requested: true;
  applied: boolean;
  /** Technion city slug when the city has a shade layer. */
  city: string | null;
  reason: ShadePrefReason;
}

export interface ShadeRanked<T> { loops: Array<T & { shadeShare: number | null }>; meta: ShadePrefMeta }

export function rankLoopsByShade<T extends Pick<ScoredLoop, 'path' | 'verdict'>>(
  loops: T[],
  shade: { city: string; index: ShadeSpatialIndex } | null,
  n: number,
  timedOut = false,
): ShadeRanked<T> {
  if (!shade) {
    return {
      loops: loops.slice(0, n).map((l) => ({ ...l, shadeShare: null })),
      meta: { requested: true, applied: false, city: null, reason: timedOut ? 'timeout' : 'no_shade_data' },
    };
  }
  const withShade = loops.map((l, order) => {
    const s = measureRouteShade(l.path, shade.index);
    return { l, order, share: s.status === 'measured' ? s.shadeShare : null };
  });
  const anyMeasured = withShade.some((x) => x.share != null);
  withShade.sort((a, b) => {
    const pass = Number(b.l.verdict.pass) - Number(a.l.verdict.pass);
    if (pass) return pass;
    if (a.share != null && b.share != null && a.share !== b.share) return b.share - a.share;
    if ((a.share == null) !== (b.share == null)) return a.share == null ? 1 : -1;
    return a.order - b.order;
  });
  return {
    loops: withShade.slice(0, n).map((x) => ({ ...x.l, shadeShare: x.share })),
    meta: { requested: true, applied: anyMeasured, city: shade.city, reason: anyMeasured ? 'applied' : 'not_measured' },
  };
}
