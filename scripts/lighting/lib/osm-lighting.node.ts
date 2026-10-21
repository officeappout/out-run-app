/**
 * OSM inputs for the lighting build: walkable highways (with `lit=*`) and
 * highway=street_lamp nodes, cut to a bbox from the local Geofabrik PBF.
 * READ-ONLY. OSM: ODbL, © OpenStreetMap contributors.
 */
import * as path from 'path';
import { loadOpl, run } from '../../lib/osm-pbf.node';
import type { LonLat } from '../../../src/lib/shade/types';

export interface LightingOsm {
  highways: Array<{ id: number; tags: Record<string, string>; coords: LonLat[] }>;
  lamps: LonLat[];
}

export async function extractLightingOsm(pbf: string, bbox: [number, number, number, number], workDir: string): Promise<LightingOsm> {
  const cut = path.join(workDir, 'city.osm.pbf');
  run('osmium', ['extract', '-O', '-b', bbox.join(','), '--strategy=smart', pbf, '-o', cut]);
  const f = path.join(workDir, 'lighting.osm.pbf');
  run('osmium', ['tags-filter', '-O', cut, 'w/highway', 'n/highway=street_lamp', '-o', f]);
  const data = await loadOpl(f);
  const lamps: LonLat[] = [];
  data.nodes.forEach((n) => {
    if (n.tags.highway === 'street_lamp') lamps.push([n.lon, n.lat]);
  });
  const highways: LightingOsm['highways'] = [];
  data.ways.forEach((w) => {
    if (!w.tags.highway) return;
    const coords: LonLat[] = [];
    for (const id of w.nodes) {
      const n = data.nodes.get(id);
      if (n) coords.push([n.lon, n.lat]);
    }
    if (coords.length >= 2) highways.push({ id: w.id, tags: w.tags, coords });
  });
  return { highways, lamps };
}
