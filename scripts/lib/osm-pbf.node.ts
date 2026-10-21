/**
 * scripts/lib/osm-pbf.node.ts — the shared local-OSM reader (RC6 step 4 / W1):
 * the public Geofabrik `israel-and-palestine` PBF, downloaded once into the
 * gitignored `.cache/osm/`, cut and filtered with the osmium CLI
 * (`brew install osmium-tool`) and parsed from OPL by
 * src/lib/trail-graph/osm-opl.ts. Used by the trails pipeline
 * (scripts/trails/lib/pilot-osm.node.ts re-exports it) and by geo-discovery
 * (scripts/geo-discovery-routes.ts → --osm-source=pbf, and the region
 * snapshot builder). READ-ONLY w.r.t. every backend: no Firestore, no Storage.
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
import { emptyOsmData, parseOplLine } from '../../src/lib/trail-graph/osm-opl';
import type { OsmData } from '../../src/lib/trail-graph/types';

export const GEOFABRIK_URL = 'https://download.geofabrik.de/asia/israel-and-palestine-latest.osm.pbf';

export function osmCacheDir(): string {
  return process.env.TRAILS_OSM_CACHE_DIR || path.resolve(process.cwd(), '.cache/osm');
}

export function run(cmd: string, args: string[]): void {
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

/** Streams `osmium cat -f opl` of a (filtered) PBF into OsmData. */
export async function loadOpl(pbf: string): Promise<OsmData> {
  const data = emptyOsmData();
  await new Promise<void>((resolve, reject) => {
    const p = spawn('osmium', ['cat', pbf, '-f', 'opl,add_metadata=false']);
    const rl = readline.createInterface({ input: p.stdout });
    rl.on('line', (l) => parseOplLine(l, data));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`osmium cat exited ${code}`))));
  });
  return data;
}

/**
 * The OSM objects geo-discovery queries (scripts/geo-discovery-routes.ts —
 * every Overpass query it makes): all highways (incl. bike-lane tags), marked
 * route relations, parks/gardens, water + pools, buildings, admin boundaries.
 * Referenced members are kept (osmium's default), boundaries and
 * multipolygons are completed across the bbox edge (smart strategy).
 */
export const GEO_DISCOVERY_TAG_FILTERS = [
  'w/highway',
  'r/route=hiking,foot,walking,running',
  'wr/leisure=park,garden,swimming_pool,water_park',
  'wr/natural=water',
  'w/building',
  'r/boundary=administrative',
] as const;

export interface Bbox4 { latMin: number; lonMin: number; latMax: number; lonMax: number }

/** Cut `bbox` out of the national PBF, keep only GEO_DISCOVERY_TAG_FILTERS, parse to OsmData. */
export async function extractGeoDiscoveryOsm(pbf: string, bbox: Bbox4, workDir: string): Promise<OsmData> {
  fs.mkdirSync(workDir, { recursive: true });
  const cut = path.join(workDir, 'region.osm.pbf');
  run('osmium', ['extract', '-O', '-b', `${bbox.lonMin},${bbox.latMin},${bbox.lonMax},${bbox.latMax}`, '--strategy=smart', '-S', 'types=multipolygon,boundary', pbf, '-o', cut]);
  const filtered = path.join(workDir, 'region-geo-discovery.osm.pbf');
  run('osmium', ['tags-filter', '-O', cut, ...GEO_DISCOVERY_TAG_FILTERS, '-o', filtered]);
  return loadOpl(filtered);
}
