/**
 * scripts/city-inventory/lib/osm-extract.node.ts — one authority's OSM
 * features from the local Geofabrik PBF (RC4 I1). Uses the shared PBF reader
 * (scripts/lib/osm-pbf.node.ts: osmium extract/tags-filter, OPL load,
 * polygon export). READ-ONLY w.r.t. every backend.
 */
import * as fs from 'fs';
import * as path from 'path';
import { exportPolygons, loadOpl, run } from '../../lib/osm-pbf.node';
import type { BoundaryIndex, InventoryFeatures, InvNode, InvWay } from '../../../src/lib/city-inventory';
import type { LngLat } from '../../../src/lib/park-loops/types';

/** Everything classify.ts can put in a layer, and nothing else. */
export const INVENTORY_LINEAR_FILTERS = [
  'w/highway',
  'n/amenity=bench,drinking_water,toilets,water_point,fountain',
  'n/man_made=water_tap',
  'n/leisure=bench,fitness_station,pitch',
  'n/highway=crossing',
] as const;

export const INVENTORY_AREA_FILTERS = [
  'wr/leisure=park,garden,nature_reserve,pitch,fitness_station',
  'wr/landuse=recreation_ground',
  'wr/highway=pedestrian',
] as const;

/** ~1 km margin so ways crossing the city edge are complete before clipping. */
const BBOX_MARGIN_DEG = 0.01;

export async function extractInventoryFeatures(pbf: string, boundary: BoundaryIndex, workDir: string): Promise<InventoryFeatures> {
  fs.mkdirSync(workDir, { recursive: true });
  const b = boundary.bbox;
  const cut = path.join(workDir, 'city.osm.pbf');
  run('osmium', [
    'extract', '-O',
    '-b', `${b.minLng - BBOX_MARGIN_DEG},${b.minLat - BBOX_MARGIN_DEG},${b.maxLng + BBOX_MARGIN_DEG},${b.maxLat + BBOX_MARGIN_DEG}`,
    '--strategy=smart', '-S', 'types=multipolygon,boundary', pbf, '-o', cut,
  ]);

  const lin = path.join(workDir, 'city-linear.osm.pbf');
  run('osmium', ['tags-filter', '-O', cut, ...INVENTORY_LINEAR_FILTERS, '-o', lin]);
  const data = await loadOpl(lin);

  const ar = path.join(workDir, 'city-areas.osm.pbf');
  run('osmium', ['tags-filter', '-O', cut, ...INVENTORY_AREA_FILTERS, '-o', ar]);
  const areas = exportPolygons(ar);

  const nodes: InvNode[] = [];
  for (const n of Array.from(data.nodes.values())) if (Object.keys(n.tags).length) nodes.push(n);
  const ways: InvWay[] = [];
  for (const w of Array.from(data.ways.values())) {
    const coords: LngLat[] = [];
    for (const id of w.nodes) {
      const n = data.nodes.get(id);
      if (n) coords.push([n.lon, n.lat]);
    }
    if (coords.length >= 2) ways.push({ id: w.id, tags: w.tags, coords });
  }
  return { nodes, ways, areas };
}
