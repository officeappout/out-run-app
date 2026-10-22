/**
 * RC9 stage `bike_adjacent_walk` — walking / running corridors beside bike
 * paths (src/lib/routes-nationwide/bike-adjacent.ts). Inputs: the MoT
 * national bike-path layer (`bph_infra_exist`, through the runner's
 * DatasetCatalog — only when the zip is in --datasets-dir) and the
 * authority's OSM slice (cycleways + footways / sidewalks). Candidate docs
 * only, each through buildValidatedDoc; nothing is written here.
 */
import { DATASETS } from '../../../src/lib/dataset-import';
import { pointInRing } from '../../../src/lib/park-loops';
import { buildValidatedDoc } from '../../../src/lib/route-collections/validate';
import type { CandidateRoute, StageProvider } from '../../../src/lib/routes-nationwide';
import {
  bikeAdjacentCorridors, bikeAdjacentDoc, buildWalkIndex, motBikePieces, osmBikePieces, walkLines,
} from '../../../src/lib/routes-nationwide/bike-adjacent';
import { loopNameParts } from '../../../src/lib/routes-nationwide/route-naming';
import type { AuthorityOsmSlice } from './authority-osm.node';
import type { AuthorityCtx, DatasetCatalog } from './providers.node';

const MOT_KEY = 'bph_infra_exist';

export function bikeAdjacentProvider(a: AuthorityCtx, slice: AuthorityOsmSlice, datasets: DatasetCatalog, importBatchId: string): StageProvider {
  return {
    key: 'bike_adjacent_walk',
    async run() {
      const osm = await slice.get();
      if (!osm) return { routes: [], note: 'no boundary — skipped' };
      const inside = (c: [number, number][]) => osm.rings.some((r) => pointInRing(c[Math.floor(c.length / 2)], r));
      const motLines = (await datasets.lines(MOT_KEY)).filter((l) => inside(l.coords));
      const ways = osm.urban.ways;
      const idx = buildWalkIndex(walkLines(ways));
      const osmPieces = osmBikePieces(ways).filter((p) => inside(p.coords));
      const { corridors, report } = bikeAdjacentCorridors(motBikePieces(motLines), osmPieces, idx);
      const spec = DATASETS[MOT_KEY];
      const routes: CandidateRoute[] = [];
      const invalid: string[] = [];
      for (const c of corridors) {
        const parts = loopNameParts(c.coords, osm.naming);
        const fallbackBase = parts.streets[0] ?? parts.park ?? parts.place ?? `שביל האופניים ב${a.name}`;
        const doc = bikeAdjacentDoc(c, {
          authorityId: a.id, city: a.name, importBatchId, osmSnapshot: osm.osmSnapshot, fallbackBase,
          motAttribution: spec ? { license: spec.license, attribution: spec.attribution, url: spec.datasetUrl } : null,
        });
        try {
          const data = buildValidatedDoc('official_routes', doc.data, { mode: 'create', knownAuthorityIds: a.knownAuthorityIds });
          routes.push({ id: doc.id, data: data as Record<string, any>, stage: 'bike_adjacent_walk', isNew: true, ...(c.shadeHint != null ? { opts: { shadeHint: c.shadeHint } } : {}) });
        } catch (e) {
          invalid.push(`${doc.id}: ${(e as Error).message.slice(0, 120)}`);
        }
      }
      const loops = corridors.filter((c) => c.closed).length;
      return {
        routes,
        note: `MoT ${report.motWalkable}/${report.motPieces} walkable section(s)${motLines.length ? '' : ' (no bph_infra_exist file)'}, OSM ${report.osmWalkable}/${report.osmPieces} bike way(s) → ${corridors.length} corridor(s) ≥ 1.5 km (${loops} loop, ${corridors.length - loops} out-and-back; MoT ${report.motCorridors}, OSM ${report.osmCorridors} after dedup)${invalid.length ? `, ${invalid.length} invalid (${invalid[0]})` : ''}`,
      };
    },
  };
}
