/**
 * scripts/trails/lib/pilot-osm.node.ts — local OSM extraction for the trails
 * pipeline (pilot: מועצה אזורית שער הנגב). The generic PBF reader (download,
 * osmium wrappers, OPL load) moved to scripts/lib/osm-pbf.node.ts (RC6 step 4,
 * shared with geo-discovery) and is re-exported here unchanged.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { OsmData } from '../../../src/lib/trail-graph/types';
import { exportPolygons, loadOpl, run, type PolygonFeature } from '../../lib/osm-pbf.node';

export { GEOFABRIK_URL, osmCacheDir, assertOsmium, ensureIsraelPbf, pbfTimestamp, exportPolygons, type PolygonFeature } from '../../lib/osm-pbf.node';

export const SHAAR_HANEGEV_RELATION_ID = 1473954; // admin_level=8, "מועצה אזורית שער הנגב"

export async function fetchAdminBoundary(pbf: string, relationId: number, workDir: string): Promise<PolygonFeature> {
  const out = path.join(workDir, `boundary-r${relationId}.osm.pbf`);
  run('osmium', ['getid', '-O', '-r', pbf, `r${relationId}`, '-o', out]);
  // getid -r also pulls member ways that are closed rings on their own — pick the relation itself.
  const f = exportPolygons(out).find((x) => x.id === `relation/${relationId}`);
  if (!f) throw new Error(`Could not assemble admin boundary polygon for relation ${relationId}`);
  return f;
}

export interface PilotExtract {
  data: OsmData;
  areas: PolygonFeature[];
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number };
}

/**
 * Cuts the bbox (+margin) out of the national PBF and loads:
 *   - OPL of highway ways, trail route relations, waterways and the
 *     point features we name things after / count as amenities / lamps
 *   - polygons: built-up (landuse=residential, place=*), green and parks
 */
export async function extractPilot(pbf: string, bbox: PilotExtract['bbox'], workDir: string): Promise<PilotExtract> {
  fs.mkdirSync(workDir, { recursive: true });
  const cut = path.join(workDir, 'pilot.osm.pbf');
  run('osmium', ['extract', '-O', '-b', `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`, '--strategy=smart', pbf, '-o', cut]);

  const lin = path.join(workDir, 'pilot-linear.osm.pbf');
  run('osmium', [
    'tags-filter', '-O', cut,
    'w/highway', 'r/type=route', 'w/waterway=stream,river,wadi,canal', 'w/natural=valley,ridge',
    'n/highway=street_lamp', 'n/natural=peak,spring,hill,valley,cave_entrance,saddle,cliff',
    'n/place', 'n/amenity=drinking_water,bench,shelter,toilets', 'n/leisure=picnic_table',
    'n/tourism=picnic_site,viewpoint', 'n/historic', 'n/water=pond,lake,reservoir',
    '-o', lin,
  ]);
  const data: OsmData = await loadOpl(lin);

  const ar = path.join(workDir, 'pilot-areas.osm.pbf');
  run('osmium', [
    'tags-filter', '-O', cut,
    'landuse=residential,forest,orchard,recreation_ground,village_green', 'place',
    'leisure=park,nature_reserve,garden', 'natural=wood', 'boundary=national_park,protected_area',
    '-o', ar,
  ]);
  const areas = exportPolygons(ar);
  return { data, areas, bbox };
}
