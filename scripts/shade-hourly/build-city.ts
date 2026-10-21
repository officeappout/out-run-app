/**
 * scripts/shade-hourly/build-city.ts — RC7 step 2: one city's hourly shade file.
 *
 *   OSM buildings / trees / walkable streets (local Geofabrik PBF)
 *   + optional local files (--file kind:sourceId:path — open or pending-licence)
 *   → src/lib/shade-hourly engine (12 reference days × 14 hours per ≤100 m street piece)
 *   → <out>/<city>.bin.gz (+ <city>.manifest.json)
 *
 * DRY-RUN BY DEFAULT: writes only to --out (a local dir), prints stats and a
 * sanity check against the Technion daily summer SI on the same streets
 * (--technion <normalized city geojson>). Never reads or writes Firestore.
 *
 * --apply --project <id> uploads `shade/hourly/v1/<city>.bin.gz` to Storage
 * after a typed YES — and refuses when any `pending_licence` source was used.
 *
 * Usage:
 *   npx tsx scripts/shade-hourly/build-city.ts --city tel-aviv --out <dir> \
 *     [--file canopy:soi_canopy_otb:<canopy.geojsonl>] [--file buildings:tlv_buildings_iview2:<sample.geojson>] \
 *     [--technion <tel-aviv.geojson>] [--offsets -6,0,6] [--step 10] [--limit N] [--bbox minLon,minLat,maxLon,maxLat]
 *   ... --apply --project <projectId> [--overwrite]
 *
 * PBF: $TRAILS_OSM_CACHE_DIR/israel-and-palestine-latest.osm.pbf (downloaded once if missing).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { assertOsmium, ensureIsraelPbf, pbfTimestamp } from '../lib/osm-pbf.node';
import { extractShadeOsm } from './lib/osm-input.node';
import { readFeatures } from './lib/geojson-input.node';
import { confirmYes, uploadObjects } from './lib/upload.node';
import {
  buildSunTable,
  cellIndex,
  createCityFileWriter,
  createObstacleIndexBuilder,
  dequantizeCell,
  quantizeProfile,
  radiationWeightedMean,
  resolveBuildingHeight,
  segmentShadeProfile,
  sunRays,
  DEFAULT_TREE_HEIGHT_M,
  GRID_CELLS,
  TREE_CANOPY_OPACITY,
  type HeightSource,
} from '../../src/lib/shade-hourly';
import { hourlyShadeCity, hourlyShadeObjectPath } from '../../src/lib/shade-hourly/cities';
import { crownRadiusFromTags, crownRing, pointsAlong, DEFAULT_CROWN_RADIUS_M } from '../../src/lib/shade-hourly/crowns';
import { isWalkableHighway, pieceId, splitLine, MAX_PIECE_M } from '../../src/lib/shade-hourly/segments';
import { shadeSource, type ShadeSource } from '../../src/lib/shade-hourly/sources';
import { pearson, quantile, spearman } from '../../src/lib/shade-hourly/stats';
import { buildShadeIndex, shadeShareForLine, type ShadeSegmentCollection } from '../../src/lib/shade';
import { parseHeightM } from '../../src/lib/shade-hourly/heights';
import type { LonLat } from '../../src/lib/shade/types';

const argv = process.argv.slice(2);
const arg = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const args = (n: string) => argv.flatMap((a, i) => (a === `--${n}` && argv[i + 1] ? [argv[i + 1]] : []));
const flag = (n: string) => argv.includes(`--${n}`);

/** Obstacles within this margin outside the city bbox still cast shadows into it. */
const OBSTACLE_MARGIN_M = 300;
/** Summer months for the Technion comparison (Jun, Jul, Aug — month indexes). */
const SUMMER_MONTHS = [5, 6, 7];
/** A street matches the Technion layer only if ≥ this share of its length matched. */
const TECHNION_MIN_COVERAGE = 0.5;

interface InputFile { kind: 'buildings' | 'canopy' | 'trees'; source: ShadeSource; file: string }

function parseFiles(): InputFile[] {
  return args('file').map((spec) => {
    const [kind, sourceId, ...rest] = spec.split(':');
    const file = rest.join(':');
    const source = shadeSource(sourceId);
    if (!source) throw new Error(`--file ${spec}: unknown source "${sourceId}" (see src/lib/shade-hourly/sources.ts)`);
    if (kind !== 'buildings' && kind !== 'canopy' && kind !== 'trees') throw new Error(`--file ${spec}: kind must be buildings|canopy|trees`);
    if (!fs.existsSync(file)) throw new Error(`--file ${spec}: ${file} not found`);
    return { kind, source, file };
  });
}

const fmtMB = (n: number) => `${(n / 1e6).toFixed(2)} MB`;
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : '—');

async function main() {
  const slug = arg('city');
  const outDir = arg('out');
  const city = slug ? hourlyShadeCity(slug) : undefined;
  if (!city || !outDir) {
    console.error('usage: npx tsx scripts/shade-hourly/build-city.ts --city <slug> --out <dir> [--file kind:source:path]... [--technion <geojson>] [--apply --project <id>]');
    process.exit(1);
  }
  const apply = flag('apply');
  const project = arg('project');
  const year = Number(arg('year') ?? 2026);
  const stepM = Number(arg('step') ?? 10);
  const offsetsM = (arg('offsets') ?? '0').split(',').map(Number).filter(Number.isFinite);
  const limit = arg('limit') ? Number(arg('limit')) : Infinity;
  const files = parseFiles();
  const pending = files.filter((f) => f.source.status === 'pending_licence');
  if (apply && pending.length) {
    console.error(`--apply refused: pending-licence source(s) used: ${pending.map((f) => f.source.id).join(', ')}. Build without them to upload.`);
    process.exit(1);
  }
  if (apply && !project) {
    console.error('--apply requires --project <projectId>');
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const workDir = path.join(outDir, `work-${city.slug}`);
  fs.mkdirSync(workDir, { recursive: true });
  const t0 = Date.now();

  // ── OSM ────────────────────────────────────────────────────────────────
  assertOsmium();
  const pbf = arg('pbf') ?? (await ensureIsraelPbf());
  const bboxArg = arg('bbox')?.split(',').map(Number);
  if (bboxArg && (bboxArg.length !== 4 || bboxArg.some((v) => !Number.isFinite(v)))) throw new Error('--bbox minLon,minLat,maxLon,maxLat');
  const [minLon, minLat, maxLon, maxLat] = (bboxArg as [number, number, number, number] | undefined) ?? city.bbox;
  const midLat = (minLat + maxLat) / 2;
  const dLat = OBSTACLE_MARGIN_M / 111_195;
  const dLon = OBSTACLE_MARGIN_M / (111_195 * Math.cos((midLat * Math.PI) / 180));
  const obsBbox: [number, number, number, number] = [minLon - dLon, minLat - dLat, maxLon + dLon, maxLat + dLat];
  const osm = await extractShadeOsm(pbf, obsBbox, workDir);
  const osmDate = pbfTimestamp(pbf);
  console.log(`[osm] ${path.basename(pbf)} (${osmDate ?? 'date unknown'}): ${osm.buildings.length} buildings, ${osm.trees.length} trees, ${osm.treeRows.length} tree rows, ${osm.woods.length} woods, ${osm.highways.length} highways  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  // ── Obstacles ─────────────────────────────────────────────────────────
  const origin: LonLat = [(minLon + maxLon) / 2, midLat];
  const builder = createObstacleIndexBuilder(origin);
  const inObsBbox = (r: LonLat[]) => r.some((p) => p[0] >= obsBbox[0] && p[0] <= obsBbox[2] && p[1] >= obsBbox[1] && p[1] <= obsBbox[3]);
  const heightSources: Record<string, Record<HeightSource, number>> = {};
  const bump = (src: string, hs: HeightSource) => {
    heightSources[src] ??= { height: 0, levels: 0, type_default: 0, default: 0 };
    heightSources[src][hs]++;
  };
  const used: Record<string, { source: ShadeSource; features: number; obstacles: number }> = {};
  const use = (s: ShadeSource, feats: number, obs: number) => {
    used[s.id] ??= { source: s, features: 0, obstacles: 0 };
    used[s.id].features += feats;
    used[s.id].obstacles += obs;
  };

  const buildingFiles = files.filter((f) => f.kind === 'buildings');
  const keepOsmBuildings = buildingFiles.length === 0 || flag('keep-osm-buildings');
  if (keepOsmBuildings) {
    let n = 0;
    for (const b of osm.buildings) {
      const h = resolveBuildingHeight({ heightM: b.tags.height, levels: b.tags['building:levels'], buildingType: b.tags.building });
      for (const r of b.rings) if (inObsBbox(r) && builder.add(r, h.heightM, 1, 'building')) n++;
      bump('osm', h.source);
    }
    use(shadeSource('osm')!, osm.buildings.length, n);
  }
  for (const f of buildingFiles) {
    let n = 0;
    const st = await readFeatures(f.file, (feat) => {
      const h = resolveBuildingHeight({
        heightM: f.source.heightField ? (feat.props[f.source.heightField] as number | string | null) : null,
        levels: f.source.levelsField ? (feat.props[f.source.levelsField] as number | string | null) : null,
      });
      for (const r of feat.rings) if (inObsBbox(r) && builder.add(r, h.heightM, 1, 'building')) n++;
      bump(f.source.id, h.source);
    });
    use(f.source, st.kept, n);
  }

  let osmTreeObs = 0;
  for (const t of osm.trees) {
    const h = parseHeightM(t.tags.height) ?? DEFAULT_TREE_HEIGHT_M;
    if (builder.add(crownRing(t.at, crownRadiusFromTags(t.tags)), h, TREE_CANOPY_OPACITY, 'tree')) osmTreeObs++;
  }
  for (const row of osm.treeRows) {
    for (const p of pointsAlong(row.coords)) if (builder.add(crownRing(p, DEFAULT_CROWN_RADIUS_M), DEFAULT_TREE_HEIGHT_M, TREE_CANOPY_OPACITY, 'tree')) osmTreeObs++;
  }
  for (const w of osm.woods) for (const r of w.rings) if (inObsBbox(r) && builder.add(r, DEFAULT_TREE_HEIGHT_M, TREE_CANOPY_OPACITY, 'tree')) osmTreeObs++;
  use(shadeSource('osm_trees')!, osm.trees.length + osm.treeRows.length + osm.woods.length, osmTreeObs);

  for (const f of files.filter((x) => x.kind !== 'buildings')) {
    let n = 0;
    const st = await readFeatures(f.file, (feat) => {
      const h = (f.source.heightField ? parseHeightM(feat.props[f.source.heightField] as number | string | null) : null) ?? DEFAULT_TREE_HEIGHT_M;
      for (const r of feat.rings) if (inObsBbox(r) && builder.add(r, h, TREE_CANOPY_OPACITY, 'tree')) n++;
      for (const p of feat.points) if (builder.add(crownRing(p), h, TREE_CANOPY_OPACITY, 'tree')) n++;
    });
    use(f.source, st.kept, n);
  }
  const idx = builder.finish();
  console.log(`[obstacles] ${idx.count} prisms (max height ${idx.maxHeightM.toFixed(0)} m)  (${((Date.now() - t0) / 1000).toFixed(1)}s, rss ${fmtMB(process.memoryUsage().rss)})`);

  // ── Streets → profiles (streamed into the writer) ─────────────────────
  const table = buildSunTable(origin[1], origin[0], year);
  const rays = sunRays(table);
  const writer = createCityFileWriter(year, origin);
  const inCity = (p: LonLat) => p[0] >= minLon && p[0] <= maxLon && p[1] >= minLat && p[1] <= maxLat;
  const summer: number[] = [];
  const pieces: LonLat[][] = [];
  const julyHourSum = new Float64Array(14);
  let julyHourN = 0;
  let km = 0;
  const tProf = Date.now();
  for (const w of osm.highways) {
    if (writer.count >= limit) break;
    if (!isWalkableHighway(w.tags) || !w.coords.some(inCity)) continue;
    const parts = splitLine(w.coords, MAX_PIECE_M);
    for (let k = 0; k < parts.length && k < 1000; k++) {
      const line = parts[k];
      if (!line.some(inCity)) continue;
      const cells = quantizeProfile(segmentShadeProfile(idx, line, rays, { stepM, offsetsM }));
      writer.push({ id: pieceId(w.id, k), line, cells });
      summer.push(radiationWeightedMean(cells, table, SUMMER_MONTHS) ?? 0);
      pieces.push(line);
      for (let h = 0; h < 14; h++) julyHourSum[h] += dequantizeCell(cells[cellIndex(6, 6 + h)]) ?? 1;
      julyHourN++;
      for (let i = 1; i < line.length; i++) {
        const dx = (line[i][0] - line[i - 1][0]) * 111_195 * Math.cos((midLat * Math.PI) / 180);
        const dy = (line[i][1] - line[i - 1][1]) * 111_195;
        km += Math.hypot(dx, dy) / 1000;
      }
    }
  }
  const profSec = (Date.now() - tProf) / 1000;
  const bytes = writer.finish();
  const gz = zlib.gzipSync(Buffer.from(bytes), { level: 9 });
  const outFile = path.join(outDir, `${city.slug}.bin.gz`);
  fs.writeFileSync(outFile, gz);
  console.log(`[profiles] ${writer.count} pieces, ${km.toFixed(0)} km of street, ${GRID_CELLS} cells each, in ${profSec.toFixed(1)}s (${((profSec * 1000) / Math.max(1, km)).toFixed(1)} ms/km)`);
  console.log(`[file] ${outFile}: ${fmtMB(gz.length)} gz (${fmtMB(bytes.length)} raw)`);

  // ── Stats ─────────────────────────────────────────────────────────────
  const sorted = [...summer].sort((a, b) => a - b);
  console.log(`\nsummer (Jun–Aug) radiation-weighted daily shade per piece: mean ${(summer.reduce((s, v) => s + v, 0) / Math.max(1, summer.length)).toFixed(3)}  p10 ${quantile(sorted, 0.1)?.toFixed(3)}  p50 ${quantile(sorted, 0.5)?.toFixed(3)}  p90 ${quantile(sorted, 0.9)?.toFixed(3)}`);
  console.log(`July 21 city-wide mean shade by hour: ${Array.from(julyHourSum).map((s, h) => `${String(6 + h).padStart(2, '0')}h ${(s / Math.max(1, julyHourN)).toFixed(2)}`).join('  ')}`);
  console.log('height sources (buildings):');
  for (const [src, c] of Object.entries(heightSources)) {
    const tot = c.height + c.levels + c.type_default + c.default;
    console.log(`  ${src.padEnd(22)} ${tot} — measured ${pct(c.height, tot)}, levels ${pct(c.levels, tot)}, type default ${pct(c.type_default, tot)}, global default ${pct(c.default, tot)}`);
  }
  console.log('sources:');
  for (const u of Object.values(used)) console.log(`  ${u.source.id.padEnd(22)} ${u.source.status.padEnd(16)} ${u.features} features → ${u.obstacles} prisms   [${u.source.licence}]`);

  // ── Technion sanity check ─────────────────────────────────────────────
  let technion: Record<string, unknown> | null = null;
  const techFile = arg('technion');
  if (techFile) {
    const fc = JSON.parse(fs.readFileSync(techFile, 'utf8')) as ShadeSegmentCollection;
    const tIdx = buildShadeIndex(fc);
    const ours: number[] = [];
    const si: number[] = [];
    for (let i = 0; i < pieces.length; i++) {
      const r = shadeShareForLine(pieces[i], tIdx);
      if (r.shadeShare == null || r.coverage < TECHNION_MIN_COVERAGE) continue;
      ours.push(summer[i]);
      si.push(r.shadeShare);
    }
    const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
    technion = {
      file: path.basename(techFile),
      matchedPieces: ours.length,
      pearson: pearson(ours, si),
      spearman: spearman(ours, si),
      meanOurs: mean(ours),
      meanTechnionSI: mean(si),
    };
    console.log(`\nTechnion SI check (${path.basename(techFile)}): ${ours.length}/${pieces.length} pieces matched (coverage ≥ ${TECHNION_MIN_COVERAGE})`);
    console.log(`  Pearson r = ${pearson(ours, si)?.toFixed(3)}   Spearman ρ = ${spearman(ours, si)?.toFixed(3)}   mean ours ${mean(ours).toFixed(3)} vs SI ${mean(si).toFixed(3)}`);
    // quintiles of SI → our mean
    const order = si.map((v, i) => i).sort((a, b) => si[a] - si[b]);
    const q = 5;
    const rows: string[] = [];
    for (let k = 0; k < q; k++) {
      const part = order.slice(Math.floor((k * order.length) / q), Math.floor(((k + 1) * order.length) / q));
      rows.push(`SI q${k + 1} ${mean(part.map((i) => si[i])).toFixed(2)} → ours ${mean(part.map((i) => ours[i])).toFixed(2)}`);
    }
    console.log(`  by SI quintile: ${rows.join(' | ')}`);
  }

  const manifest = {
    city: city.slug,
    builtAt: new Date().toISOString(),
    year,
    grid: { months: 12, referenceDay: 21, hours: '06-19 Israel local, sampled HH:30', cells: GRID_CELLS, quantization: '0-200 = shade 0-1, 255 = sun down' },
    params: { stepM, offsetsM, maxPieceM: MAX_PIECE_M, obstacleMarginM: OBSTACLE_MARGIN_M },
    osmDate,
    pieces: writer.count,
    streetKm: Math.round(km),
    sources: Object.values(used).map((u) => ({ id: u.source.id, status: u.source.status, licence: u.source.licence, features: u.features, prisms: u.obstacles })),
    pendingLicenceUsed: pending.map((f) => f.source.id),
    heightSources,
    technion,
    fileBytesGz: gz.length,
  };
  fs.writeFileSync(path.join(outDir, `${city.slug}.manifest.json`), JSON.stringify(manifest, null, 2));
  console.log(`\ntotal ${((Date.now() - t0) / 1000).toFixed(1)}s, peak rss ${fmtMB(process.memoryUsage().rss)}`);

  if (!apply) {
    console.log(`\nDRY-RUN — nothing uploaded. To upload: --apply --project <id> (refused if a pending-licence source was used).`);
    return;
  }
  const objectPath = hourlyShadeObjectPath(city.slug);
  const ok = await confirmYes(`Upload ${fmtMB(gz.length)} to gs://${project}.firebasestorage.app/${objectPath}? Type YES: `);
  if (!ok) {
    console.log('Not confirmed — nothing uploaded.');
    return;
  }
  await uploadObjects(
    project!,
    [
      {
        objectPath,
        body: gz,
        contentType: 'application/octet-stream',
        metadata: {
          city: city.slug,
          format: 'SHH1',
          year: String(year),
          pieces: String(writer.count),
          osmDate: osmDate ?? '',
          sources: Object.keys(used).join(','),
          licence: Array.from(new Set(Object.values(used).map((u) => u.source.licence))).join(' | '),
        },
      },
    ],
    flag('overwrite'),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
