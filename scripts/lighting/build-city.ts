/**
 * scripts/lighting/build-city.ts — RC7 step 3: one city's lighting file.
 *
 *   OSM walkable streets + `lit=*` + highway=street_lamp (local Geofabrik PBF)
 *   + lamp-post layers (--lamps <datasetKey>:<file> | --arcgis <datasetKey> --raw <dir>)
 *   → each ≤100 m street piece: lit when ≥ 60% of its points are within 25 m of a lamp,
 *     merged with OSM lit (lit=no wins; untagged and lamp-less = unknown, not unlit)
 *   → <out>/<city>.json.gz  (lighting/v1 format, src/lib/lighting/file.ts)
 *
 * DRY-RUN BY DEFAULT (writes only to --out). Never touches Firestore.
 * --apply --project <id> + typed YES uploads `lighting/v1/<city>.json.gz` to
 * Storage, and is refused when any `pending_licence` dataset contributed.
 *
 * Usage:
 *   npx tsx scripts/lighting/build-city.ts --city tel-aviv --out <dir>
 *   npx tsx scripts/lighting/build-city.ts --city beer-sheva --out <dir> --lamps beer_sheva_street_lights:<file.geojson>
 *   npx tsx scripts/lighting/build-city.ts --city tel-aviv --out <dir> --arcgis tel_aviv_lamps --raw <dir> [--from-raw] [--sample-bbox a,b,c,d]
 *   ... --apply --project <projectId> [--overwrite]
 */
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { assertOsmium, ensureIsraelPbf, pbfTimestamp } from '../lib/osm-pbf.node';
import { confirmYes, uploadObjects } from '../shade-hourly/lib/upload.node';
import { fetchArcgisLamps, readLampFile, readRawPages } from './lib/lamp-input.node';
import { extractLightingOsm } from './lib/osm-lighting.node';
import {
  buildLampIndex,
  classifyLitPiece,
  lampDataset,
  lampShare,
  lightingObjectPath,
  makeLightingFile,
  LIT_LAMP_RADIUS_M,
  LIT_PIECE_MIN_SHARE,
  type LampDataset,
  type LightingPiece,
  type LightingSourceRef,
  type LitBasis,
} from '../../src/lib/lighting';
import { hourlyShadeCity } from '../../src/lib/shade-hourly/cities';
import { isWalkableHighway, pieceId, splitLine, MAX_PIECE_M } from '../../src/lib/shade-hourly/segments';
import { lineLengthM } from '../../src/lib/shade/geometry';
import type { LonLat } from '../../src/lib/shade/types';

const argv = process.argv.slice(2);
const arg = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const args = (n: string) => argv.flatMap((a, i) => (a === `--${n}` && argv[i + 1] ? [argv[i + 1]] : []));
const flag = (n: string) => argv.includes(`--${n}`);
const today = () => new Date().toISOString().slice(0, 10);

async function main() {
  const slug = arg('city');
  const outDir = arg('out');
  const city = slug ? hourlyShadeCity(slug) : undefined;
  if (!city || !outDir) {
    console.error('usage: npx tsx scripts/lighting/build-city.ts --city <slug> --out <dir> [--lamps key:file]... [--arcgis key --raw dir] [--apply --project id]');
    process.exit(1);
  }
  const apply = flag('apply');
  const project = arg('project');
  const radiusM = Number(arg('radius') ?? LIT_LAMP_RADIUS_M);

  // ── lamp datasets ──
  const datasets: Array<{ ds: LampDataset; points: LonLat[] }> = [];
  for (const spec of args('lamps')) {
    const [key, ...rest] = spec.split(':');
    const ds = lampDataset(key);
    if (!ds) throw new Error(`--lamps ${spec}: unknown dataset "${key}" (src/lib/lighting/registry.ts)`);
    datasets.push({ ds, points: await readLampFile(rest.join(':')) });
  }
  const arcKey = arg('arcgis');
  if (arcKey) {
    const ds = lampDataset(arcKey);
    if (!ds || ds.format !== 'arcgis') throw new Error(`--arcgis ${arcKey}: not an ArcGIS dataset`);
    const raw = arg('raw');
    if (!raw) throw new Error('--arcgis needs --raw <dir> (pages are saved there first)');
    if (!flag('from-raw')) {
      const sample = arg('sample-bbox')?.split(',').map(Number);
      const n = await fetchArcgisLamps(ds.url, raw, { bbox: sample, orderBy: ds.idField });
      console.log(`[arcgis] ${ds.key}: ${n} features → ${raw}`);
    }
    datasets.push({ ds, points: await readRawPages(raw) });
  }
  const pending = datasets.filter((d) => d.ds.status === 'pending_licence');
  if (apply && pending.length) {
    console.error(`--apply refused: pending-licence dataset(s) used: ${pending.map((d) => d.ds.key).join(', ')}. Build without them to upload.`);
    process.exit(1);
  }
  if (apply && !project) {
    console.error('--apply requires --project <projectId>');
    process.exit(1);
  }

  // ── OSM ──
  fs.mkdirSync(outDir, { recursive: true });
  const work = path.join(outDir, `work-lighting-${city.slug}`);
  fs.mkdirSync(work, { recursive: true });
  assertOsmium();
  const pbf = arg('pbf') ?? (await ensureIsraelPbf());
  const osmDate = (pbfTimestamp(pbf) ?? '').slice(0, 10);
  const osm = await extractLightingOsm(pbf, city.bbox, work);
  const osmLamps = lampDataset('osm_street_lamps')!;
  datasets.unshift({ ds: osmLamps, points: osm.lamps });

  const [minLon, minLat, maxLon, maxLat] = city.bbox;
  const inBox = (p: LonLat) => p[0] >= minLon && p[0] <= maxLon && p[1] >= minLat && p[1] <= maxLat;
  const allLamps: LonLat[] = [];
  for (const d of datasets) for (const p of d.points) allLamps.push(p);
  const idx = buildLampIndex(allLamps, [(minLon + maxLon) / 2, (minLat + maxLat) / 2]);
  for (const d of datasets) console.log(`[lamps] ${d.ds.key.padEnd(26)} ${d.ds.status.padEnd(16)} ${d.points.length} points (${d.points.filter(inBox).length} in the city bbox)  [${d.ds.licence}]`);

  // ── classify pieces ──
  const t0 = Date.now();
  const pieces: LightingPiece[] = [];
  const byBasisM: Partial<Record<LitBasis, number>> = {};
  let walkableM = 0, knownM = 0, litM = 0, unknownPieces = 0;
  for (const w of osm.highways) {
    if (!isWalkableHighway(w.tags) || !w.coords.some(inBox)) continue;
    const parts = splitLine(w.coords, MAX_PIECE_M);
    for (let k = 0; k < parts.length && k < 1000; k++) {
      const line = parts[k];
      if (!line.some(inBox)) continue;
      const len = lineLengthM(line);
      walkableM += len;
      const share = lampShare(idx, line, radiusM);
      const c = classifyLitPiece(w.tags, share, LIT_PIECE_MIN_SHARE);
      byBasisM[c.basis] = (byBasisM[c.basis] ?? 0) + len;
      if (c.lit === 'unknown') {
        unknownPieces++;
        continue;
      }
      knownM += len;
      if (c.lit === 'yes') litM += len;
      pieces.push({ id: pieceId(w.id, k), lit: c.lit, basis: c.basis, line });
    }
  }
  const sources: LightingSourceRef[] = datasets.map((d) => ({
    key: d.ds.key,
    licence: d.ds.licence,
    status: d.ds.status,
    attribution: d.ds.attribution,
    snapshotDate: d.ds.key === 'osm_street_lamps' ? osmDate : today(),
    count: d.points.filter(inBox).length,
  }));
  const file = makeLightingFile({
    city: city.slug,
    builtAt: new Date().toISOString(),
    radiusM,
    minShare: LIT_PIECE_MIN_SHARE,
    sources,
    summary: { walkableM: Math.round(walkableM), knownM: Math.round(knownM), litM: Math.round(litM), byBasisM: Object.fromEntries(Object.entries(byBasisM).map(([k, v]) => [k, Math.round(v ?? 0)])) },
    pieces,
  });
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(file)), { level: 9 });
  const outFile = path.join(outDir, `${city.slug}.json.gz`);
  fs.writeFileSync(outFile, gz);

  const km = (m: number) => `${(m / 1000).toFixed(0)} km`;
  const pc = (a: number) => `${((100 * a) / Math.max(1, walkableM)).toFixed(1)}%`;
  console.log(`\n[pieces] ${pieces.length} with an answer, ${unknownPieces} unknown, in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`walkable ${km(walkableM)} · known ${km(knownM)} (${pc(knownM)}) · lit ${km(litM)} (${pc(litM)})  [radius ${radiusM} m, piece lit at ≥${LIT_PIECE_MIN_SHARE * 100}% of points]`);
  console.log(`by basis: ${Object.entries(byBasisM).map(([k, v]) => `${k} ${km(v ?? 0)} (${pc(v ?? 0)})`).join(' · ')}`);
  console.log(`[file] ${outFile}: ${(gz.length / 1e6).toFixed(2)} MB gz`);

  if (!apply) {
    console.log('\nDRY-RUN — nothing uploaded. To upload: --apply --project <id> (refused if a pending-licence dataset was used).');
    return;
  }
  const objectPath = lightingObjectPath(city.slug);
  if (!(await confirmYes(`Upload ${(gz.length / 1e6).toFixed(2)} MB to gs://${project}.firebasestorage.app/${objectPath}? Type YES: `))) {
    console.log('Not confirmed — nothing uploaded.');
    return;
  }
  await uploadObjects(
    project!,
    [{
      objectPath,
      body: gz,
      contentType: 'application/json',
      contentEncoding: 'gzip',
      metadata: { city: city.slug, format: 'lighting/v1', radiusM: String(radiusM), sources: sources.map((s) => s.key).join(','), osmDate },
    }],
    flag('overwrite'),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
