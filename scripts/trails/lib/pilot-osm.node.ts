/**
 * scripts/trails/lib/pilot-osm.node.ts — local OSM extraction for the trails
 * pipeline (pilot: מועצה אזורית שער הנגב). READ-ONLY w.r.t. every backend:
 * downloads the public Geofabrik `israel-and-palestine` PBF once into the
 * gitignored `.cache/osm/`, then uses the osmium CLI (`brew install
 * osmium-tool`) to cut the pilot area and convert it to OPL text that
 * src/lib/trail-graph/osm-opl.ts parses. No Firestore, no Storage.
 *
 * Why the PBF and not Overpass: on 18.10.2026 all three public Overpass
 * mirrors returned 502/500 for a trivial query; the PBF is one 120 MB
 * download, fully reproducible (dated extract), and scales to all of Israel
 * with the same code. Geofabrik data is OSM data: ODbL, "© OpenStreetMap
 * contributors".
 */
import { execFileSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { emptyOsmData, parseOplLine } from '../../../src/lib/trail-graph/osm-opl';
import type { OsmData } from '../../../src/lib/trail-graph/types';

export const GEOFABRIK_URL = 'https://download.geofabrik.de/asia/israel-and-palestine-latest.osm.pbf';
export const SHAAR_HANEGEV_RELATION_ID = 1473954; // admin_level=8, "מועצה אזורית שער הנגב"

export function osmCacheDir(): string {
  return process.env.TRAILS_OSM_CACHE_DIR || path.resolve(process.cwd(), '.cache/osm');
}

function run(cmd: string, args: string[]): void {
  execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] });
}

export function assertOsmium(): void {
  try {
    execFileSync('osmium', ['--version'], { stdio: 'ignore' });
  } catch {
    throw new Error('osmium CLI not found — install with `brew install osmium-tool` (macOS) or `apt install osmium-tool`.');
  }
}

export async function ensureIsraelPbf(log = console.log): Promise<string> {
  const dir = osmCacheDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'israel-and-palestine-latest.osm.pbf');
  if (fs.existsSync(file) && fs.statSync(file).size > 1_000_000) return file;
  log(`[osm] downloading ${GEOFABRIK_URL}`);
  const res = await fetch(GEOFABRIK_URL, { headers: { 'User-Agent': 'OUT-trails-pipeline/1.0' } });
  if (!res.ok) throw new Error(`Geofabrik download failed: HTTP ${res.status}`);
  fs.writeFileSync(`${file}.part`, Buffer.from(await res.arrayBuffer()));
  fs.renameSync(`${file}.part`, file);
  return file;
}

/** PBF header timestamp (osmosis_replication_timestamp) — the data date we cite. */
export function pbfTimestamp(pbf: string): string | null {
  try {
    const out = execFileSync('osmium', ['fileinfo', '-g', 'header.option.osmosis_replication_timestamp', pbf]).toString().trim();
    return out || null;
  } catch {
    return null;
  }
}

export interface PolygonFeature {
  id: string;
  tags: Record<string, string>;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
}

/** osmium export → polygon features (osmium assembles multipolygons correctly). */
export function exportPolygons(pbf: string): PolygonFeature[] {
  const out = execFileSync('osmium', ['export', pbf, '-f', 'geojsonseq', '--geometry-types=polygon', '-a', 'type,id', '-x', 'print_record_separator=false'], { maxBuffer: 1 << 30 }).toString();
  const feats: PolygonFeature[] = [];
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const f = JSON.parse(line);
    const { '@type': t, '@id': id, ...tags } = f.properties ?? {};
    feats.push({ id: `${t}/${id}`, tags, geometry: f.geometry });
  }
  return feats;
}

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
  const data = emptyOsmData();
  await new Promise<void>((resolve, reject) => {
    const p = spawn('osmium', ['cat', lin, '-f', 'opl,add_metadata=false']);
    const rl = readline.createInterface({ input: p.stdout });
    rl.on('line', (l) => parseOplLine(l, data));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`osmium cat exited ${code}`))));
  });

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
