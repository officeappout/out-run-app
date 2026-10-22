/**
 * RC9 — the runner's urban-measurement enrich hook. For every URBAN
 * candidate (src/lib/urban-measure isUrbanCandidate) it measures
 * composition, lighting, amenities (≤ 50 m) and road crossings on the
 * authority's OSM slice and hands them to routeScore as FromDocOptions —
 * filling gaps only (the stored doc's own qualitySignals win, see
 * from-route-doc.ts). Read-only; the slice is the one the OSM stages load anyway.
 */
import { parsePath, type FromDocOptions } from '../../../src/lib/route-score';
import type { CandidateRoute } from '../../../src/lib/routes-nationwide';
import { isUrbanCandidate, measureUrbanRoute, urbanScoreOptions } from '../../../src/lib/urban-measure';
import type { AuthorityOsmSlice } from './authority-osm.node';

export interface UrbanEnrichStats { considered: number; measured: number; composition: number; lighting: number; amenities: number; crossings: number }

export function urbanEnricher(slice: AuthorityOsmSlice | null): { enrich: ((r: CandidateRoute) => Promise<FromDocOptions | null>) | undefined; stats: UrbanEnrichStats; note: () => string } {
  const stats: UrbanEnrichStats = { considered: 0, measured: 0, composition: 0, lighting: 0, amenities: 0, crossings: 0 };
  const note = () => `urban measure: ${stats.measured}/${stats.considered} urban candidate(s) — composition ${stats.composition}, lighting ${stats.lighting}, amenities ${stats.amenities}, crossings ${stats.crossings}`;
  if (!slice) return { enrich: undefined, stats, note: () => 'urban measure off (no OSM slice)' };
  return {
    stats,
    note,
    enrich: async (r) => {
      if (!isUrbanCandidate(r.stage, r.data)) return null;
      stats.considered++;
      const osm = await slice.get();
      const line = parsePath(r.data?.path);
      if (!osm || line.length < 2) return null;
      const m = measureUrbanRoute(line, osm.urban);
      const o = urbanScoreOptions(m);
      if (o.composition) stats.composition++;
      if (o.litCoveragePct != null) stats.lighting++;
      if (o.amenitiesHas) stats.amenities++;
      if (o.osmSafety) stats.crossings++;
      if (!Object.keys(o).length) return null;
      stats.measured++;
      return o;
    },
  };
}
