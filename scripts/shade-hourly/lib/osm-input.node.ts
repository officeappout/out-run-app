/**
 * The OSM inputs of the hourly shade build, from the local Geofabrik PBF via
 * the shared osmium reader (scripts/lib/osm-pbf.node.ts): buildings (with
 * height tags), trees / woods, and walkable highways — all cut to a bbox.
 * READ-ONLY w.r.t. every backend. OSM: ODbL, © OpenStreetMap contributors.
 */
import * as path from 'path';
import { exportPolygons, loadOpl, run } from '../../lib/osm-pbf.node';
import type { LonLat } from '../../../src/lib/shade/types';

export interface OsmPolygon { id: string; tags: Record<string, string>; rings: LonLat[][] }
export interface OsmLine { id: number; tags: Record<string, string>; coords: LonLat[] }
export interface OsmPoint { id: number; tags: Record<string, string>; at: LonLat }

const outerRings = (g: { type: string; coordinates: unknown }): LonLat[][] => {
  const c = g.coordinates as LonLat[][] | LonLat[][][];
  if (g.type === 'Polygon') return [(c as LonLat[][])[0]].filter(Boolean);
  if (g.type === 'MultiPolygon') return (c as LonLat[][][]).map((p) => p[0]).filter(Boolean);
  return [];
};

export interface ShadeOsmInputs {
  buildings: OsmPolygon[];
  woods: OsmPolygon[];
  trees: OsmPoint[];
  treeRows: OsmLine[];
  highways: OsmLine[];
}

export async function extractShadeOsm(pbf: string, bbox: [number, number, number, number], workDir: string): Promise<ShadeOsmInputs> {
  const cut = path.join(workDir, 'city.osm.pbf');
  run('osmium', ['extract', '-O', '-b', bbox.join(','), '--strategy=smart', '-S', 'types=multipolygon', pbf, '-o', cut]);

  const bld = path.join(workDir, 'buildings.osm.pbf');
  run('osmium', ['tags-filter', '-O', cut, 'wr/building', '-o', bld]);
  const buildings = exportPolygons(bld)
    .filter((f) => f.tags.building && f.tags.building !== 'no')
    .map((f) => ({ id: f.id, tags: f.tags, rings: outerRings(f.geometry) }));

  const wd = path.join(workDir, 'woods.osm.pbf');
  run('osmium', ['tags-filter', '-O', cut, 'wr/natural=wood', 'wr/landuse=forest', '-o', wd]);
  const woods = exportPolygons(wd).map((f) => ({ id: f.id, tags: f.tags, rings: outerRings(f.geometry) }));

  const lin = path.join(workDir, 'lines.osm.pbf');
  run('osmium', ['tags-filter', '-O', cut, 'w/highway', 'w/natural=tree_row', 'n/natural=tree', '-o', lin]);
  const data = await loadOpl(lin);
  const trees: OsmPoint[] = [];
  data.nodes.forEach((n) => {
    if (n.tags.natural === 'tree') trees.push({ id: n.id, tags: n.tags, at: [n.lon, n.lat] });
  });
  const highways: OsmLine[] = [];
  const treeRows: OsmLine[] = [];
  data.ways.forEach((w) => {
    const coords: LonLat[] = [];
    for (const id of w.nodes) {
      const n = data.nodes.get(id);
      if (n) coords.push([n.lon, n.lat]);
    }
    if (coords.length < 2) return;
    if (w.tags.highway) highways.push({ id: w.id, tags: w.tags, coords });
    else if (w.tags.natural === 'tree_row') treeRows.push({ id: w.id, tags: w.tags, coords });
  });
  return { buildings, woods, trees, treeRows, highways };
}
