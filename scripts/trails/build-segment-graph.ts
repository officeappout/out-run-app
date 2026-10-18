/**
 * scripts/trails/build-segment-graph.ts — national trails pipeline, step 1:
 * OSM foot/bike ways → trail SEGMENT graph with Copernicus elevation.
 *
 * Default = DRY-RUN: writes local JSON to `.trails-out/<area>/` (gitignored),
 * nothing else. `--apply` (owner-approved 18.10.2026) additionally upserts
 * the segments into `trail_segments` through scripts/trails/lib/trails-apply.node.ts
 * — see that file's header for every guard rail (explicit flags, name-resolved
 * authority, summary + typed YES, ≤400/batch, idempotent, no deletes).
 *
 * Usage:
 *   npx tsx scripts/trails/build-segment-graph.ts                 # dry-run, pilot: שער הנגב
 *   npx tsx scripts/trails/build-segment-graph.ts --relation=1473954 --area=shaar-hanegev
 *   npx tsx scripts/trails/build-segment-graph.ts --resolve-authority --project appout-1      # read-only
 *   npx tsx scripts/trails/build-segment-graph.ts --apply --project appout-1 --authority <authorityId>
 *   (FIRESTORE_EMULATOR_HOST=127.0.0.1:8089 → the same commands hit the emulator instead)
 *
 * Sources (public, downloaded once into gitignored .cache/):
 *   OSM   — Geofabrik israel-and-palestine PBF (ODbL, © OpenStreetMap contributors),
 *           cut + converted with the osmium CLI
 *   DEM   — Copernicus GLO-30 1° tiles from the AWS Open Data bucket
 */
import * as fs from 'fs';
import * as path from 'path';
import { loadCopernicusProvider } from '../../src/lib/dem-tile-cache/copernicus-glo30-cache.node';
import { COPERNICUS_DEM_ATTRIBUTION } from '../../src/lib/dem-tile-cache/copernicus-glo30';
import { computeSmoothedProfile } from '../../src/lib/dem-tile-cache/elevation-profile';
import { bboxOf } from '../../src/lib/trail-graph/geo';
import { buildRouteMembership, buildSegments } from '../../src/lib/trail-graph/segment-graph';
import { OSM_ATTRIBUTION, OSM_LICENSE, type LngLat, type TrailSegment } from '../../src/lib/trail-graph/types';
import { assertOsmium, ensureIsraelPbf, extractPilot, fetchAdminBoundary, pbfTimestamp, SHAAR_HANEGEV_RELATION_ID } from './lib/pilot-osm.node';
import { PilotContext } from './lib/pilot-context';
import { applyTrailSegments, confirmTypedYes, openTarget, parseApplyFlags, printResolvedAuthority, validateApplyFlags } from './lib/trails-apply.node';

export interface BuildGraphOptions {
  relationId: number;
  area: string;
  outRoot: string;
  marginDeg?: number;
}

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a?.split('=').slice(1).join('=');
}

export async function loadPilot(opts: BuildGraphOptions) {
  assertOsmium();
  const pbf = await ensureIsraelPbf();
  const work = path.join(opts.outRoot, opts.area, 'work');
  fs.mkdirSync(work, { recursive: true });
  const boundary = await fetchAdminBoundary(pbf, opts.relationId, work);
  const coords = ((boundary.geometry.type === 'Polygon' ? [boundary.geometry.coordinates] : boundary.geometry.coordinates) as LngLat[][][]).flatMap((p) => p[0]);
  const b = bboxOf(coords);
  const m = opts.marginDeg ?? 0.015; // ≈1.5 km so edge segments keep their junctions
  const bbox = { minLng: b.minLng - m, minLat: b.minLat - m, maxLng: b.maxLng + m, maxLat: b.maxLat + m };
  const ex = await extractPilot(pbf, bbox, work);
  const ctx = new PilotContext(ex.data, ex.areas, boundary);
  return { pbf, osmTimestamp: pbfTimestamp(pbf), boundary, bbox, ex, ctx };
}

export async function runBuildSegmentGraph(opts: BuildGraphOptions) {
  const t0 = Date.now();
  const { osmTimestamp, boundary, bbox, ex, ctx } = await loadPilot(opts);
  const dem = await loadCopernicusProvider({ latMin: bbox.minLat, lonMin: bbox.minLng, latMax: bbox.maxLat, lonMax: bbox.maxLng });
  const membership = buildRouteMembership(ex.data);
  const built = buildSegments(ex.data, {
    builtUpShare: ctx.builtUpShare,
    lampCoverage: ctx.lampCoverage,
    profile: (line) => computeSmoothedProfile(line, dem),
  }, membership);

  const inArea = built.segments.filter((s) => ctx.lineIntersectsBoundary(s.geometry));
  const outDir = path.join(opts.outRoot, opts.area);
  fs.writeFileSync(path.join(outDir, 'segments.json'), JSON.stringify({ meta: meta(), segments: inArea }));
  fs.writeFileSync(path.join(outDir, 'boundary.geojson'), JSON.stringify({ type: 'Feature', properties: boundary.tags, geometry: boundary.geometry }));

  const summary = summarizeSegments(inArea);
  const out = { area: opts.area, relationId: opts.relationId, osmTimestamp, includedWaysInBbox: built.includedWays, skippedWaysMissingNodes: built.skippedMissingNodes, segmentsInBbox: built.segments.length, ...summary, streetLampsInBbox: ctx.lampCount, settlements: ctx.settlements.map((s) => s.name), seconds: Math.round((Date.now() - t0) / 1000) };
  fs.writeFileSync(path.join(outDir, 'segments-summary.json'), JSON.stringify(out, null, 2));
  return out;

  function meta() {
    return {
      generatedAt: new Date().toISOString(),
      dryRun: true, // the JSON itself is always a local dry-run artifact; --apply writes from it
      osmTimestamp,
      areaName: boundary.tags['name:he'] ?? boundary.tags.name ?? opts.area,
      license: OSM_LICENSE,
      attribution: [OSM_ATTRIBUTION, COPERNICUS_DEM_ATTRIBUTION],
      relationId: opts.relationId,
    };
  }
}

export function summarizeSegments(segs: TrailSegment[]) {
  const totalM = segs.reduce((a, s) => a + s.lengthM, 0);
  const byLen = <K extends string>(key: (s: TrailSegment) => K) => {
    const m: Record<string, number> = {};
    for (const s of segs) m[key(s)] = (m[key(s)] ?? 0) + s.lengthM;
    return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round((v / totalM) * 1000) / 10]));
  };
  return {
    segments: segs.length,
    totalKm: Math.round(totalM / 100) / 10,
    withElevationPct: Math.round((segs.filter((s) => s.elevation).length / Math.max(1, segs.length)) * 1000) / 10,
    inRouteRelationPct: byLen((s) => (s.routeRelationIds.length ? 'member' : 'none')).member ?? 0,
    highwayPctByLength: byLen((s) => s.highwayClass),
    surfaceConfidencePctByLength: byLen((s) => s.surfaceConfidence),
    surfacePctByLength: byLen((s) => s.surface),
    litPctByLength: byLen((s) => `${s.lit}:${s.litSource}`),
    inBuiltUpPctByLength: byLen((s) => (s.inBuiltUp ? 'built_up' : 'open')),
  };
}

/** `.trails-out/<area>/segments.json` as written by runBuildSegmentGraph. */
export function readSegmentsFile(outRoot: string, area: string): { meta: { osmTimestamp: string | null; areaName?: string; relationId: number }; segments: TrailSegment[] } {
  const f = path.join(outRoot, area, 'segments.json');
  if (!fs.existsSync(f)) throw new Error(`Missing ${f} — run scripts/trails/build-segment-graph.ts (dry-run) first.`);
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

async function cli() {
  const argv = process.argv.slice(2);
  const relationId = Number(arg('relation') ?? SHAAR_HANEGEV_RELATION_ID);
  const area = arg('area') ?? 'shaar-hanegev';
  const outRoot = path.resolve(process.cwd(), '.trails-out');
  const flags = parseApplyFlags(argv);
  const resolveOnly = argv.includes('--resolve-authority');
  if (flags.apply || resolveOnly) {
    const dotenv = await import('dotenv');
    dotenv.config({ path: '.env.local' });
    const errs = validateApplyFlags(resolveOnly ? { ...flags, authority: flags.authority ?? '(resolve)' } : flags);
    if (errs.length) {
      console.error(`Refusing:\n  - ${errs.join('\n  - ')}\nNothing was written.`);
      process.exit(2);
    }
  }
  if (resolveOnly) {
    const { meta } = readSegmentsFile(outRoot, area);
    await printResolvedAuthority(await openTarget(flags.project!), meta.areaName ?? area);
    return;
  }
  const summary = await runBuildSegmentGraph({ relationId, area, outRoot });
  console.log(JSON.stringify(summary, null, 2));
  if (!flags.apply) return;
  const { meta, segments } = readSegmentsFile(outRoot, area);
  const res = await applyTrailSegments(segments, {
    target: await openTarget(flags.project!),
    authorityId: flags.authority!,
    areaName: meta.areaName ?? area,
    osmTimestamp: meta.osmTimestamp,
    confirm: confirmTypedYes,
  });
  if (res.aborted) process.exit(3);
}

if (process.argv[1] && /build-segment-graph\.ts$/.test(process.argv[1])) {
  cli().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
