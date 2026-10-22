/**
 * "🌳 מוצל X%" on GraphHopper loops (enable_route_shade_tag). Server side,
 * after the loops are picked: each loop DTO gets `shadedPct` ONLY when the
 * city's Technion layer measures it (≥ 50% coverage) — otherwise the field is
 * absent. Never changes ranking or any other field. Pure: the caller supplies
 * the city's shade index (or null).
 */
import { measureRouteShade } from '../shade/route-shade';
import type { ShadeSpatialIndex } from '../shade/match';

export function withShadedPct<T extends { path: [number, number][] }>(
  loops: T[],
  index: ShadeSpatialIndex | null,
): Array<T & { shadedPct?: number }> {
  if (!index) return loops;
  return loops.map((l) => {
    const s = measureRouteShade(l.path, index);
    return s.status === 'measured' && s.shadedPct != null ? { ...l, shadedPct: s.shadedPct } : l;
  });
}
