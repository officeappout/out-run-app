/**
 * scripts/city-inventory/run.ts — RC4 wave I1 (docs/routes/CITY-MAPPING-PLAN.md §4.1, §7).
 * Builds ONE authority's map inventory from the local Geofabrik PBF + the
 * authority boundary (read-only prod) + Technion shade (read-only prod
 * Storage) + the approved-route count (read-only), and writes a summary
 * JSON + a readable per-layer table under scripts/output/city-inventory/.
 *
 * DRY-RUN BY DEFAULT — reads production, writes nothing to it.
 *
 *   npx tsx scripts/city-inventory/run.ts --authority=<authorityId>
 *   npx tsx scripts/city-inventory/run.ts --city="באר שבע"
 *   options: --pbf=<path> (default: $TRAILS_OSM_CACHE_DIR or .cache/osm, downloaded once)
 *            --no-shade   (skip the Technion layer)
 *            --no-lighting | --lighting-file=<lighting/v1 .json.gz>  (default: read lighting/v1/<city>.json.gz from Storage if present)
 *            --env=<file> (default .env.local; needs FIREBASE_SERVICE_ACCOUNT_KEY)
 *
 * Writing (David only): add `--apply --project appout-1 --authority=<id>`; the
 * run prints TARGET + the summary and asks for a typed YES, then writes
 * city_inventory/{authorityId} + runs/{runId} in one batch via the I0 store.
 *
 * Point-layer density is compared with the median of earlier runs of the
 * same authority type (≥ 3 peers) found under scripts/output/city-inventory/,
 * so run the pilot cities once, then again, to fill the peer medians.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
const argv = process.argv.slice(2);
const envFlag = argv.find((a) => a.startsWith('--env='))?.slice('--env='.length);
dotenv.config({ path: envFlag || '.env.local' });
dotenv.config();

import { buildBoundaryIndex, buildCityInventory, formatCityReport, licensePendingKeys } from '../../src/lib/city-inventory';
import { TECHNION_PERMISSION } from '../../src/lib/shade/technion-layers';
import { assertOsmium, ensureIsraelPbf, pbfTimestamp } from '../lib/osm-pbf.node';
import { PRODUCTION_PROJECT, describeTarget, flagValue, openTarget, parseApplyFlags } from '../trails/lib/trails-apply.node';
import { applyFlagErrors, applyInventory } from './lib/apply.node';
import { extractInventoryFeatures } from './lib/osm-extract.node';
import { readPeerRows, writeSummary, OUTPUT_ROOT } from './lib/output.node';
import { countApprovedRoutes, loadTechnionShade, readAuthority } from './lib/prod-read.node';
import { loadLightingFromFile, loadLightingFromStorage } from './lib/lighting-read.node';

const AUTHORITY = flagValue(argv, 'authority');
const CITY = flagValue(argv, 'city');
const PBF = flagValue(argv, 'pbf');
const NO_SHADE = argv.includes('--no-shade');
const NO_LIGHTING = argv.includes('--no-lighting');
const LIGHTING_FILE = flagValue(argv, 'lighting-file');
const FLAGS = parseApplyFlags(argv);

async function timed<T>(timings: Record<string, number>, key: string, fn: () => Promise<T> | T): Promise<T> {
  const t0 = Date.now();
  try { return await fn(); } finally { timings[key] = Date.now() - t0; }
}

async function main() {
  if (!AUTHORITY && !CITY) throw new Error('usage: --authority=<authorityId> | --city=<name>  [--apply --project appout-1 --authority=<id>]');
  const timings: Record<string, number> = {};
  const t0 = Date.now();
  assertOsmium();
  const pbf = PBF ? path.resolve(PBF) : await ensureIsraelPbf();
  const osmTs = pbfTimestamp(pbf);
  if (!osmTs) throw new Error(`cannot read the replication timestamp of ${pbf} — refusing to report an undated snapshot`);
  const osmSnapshotDate = osmTs.slice(0, 10);

  // One target for the reads and (with --apply) the write: production by
  // default, the emulator when FIRESTORE_EMULATOR_HOST is set.
  const prod = await openTarget(FLAGS.project ?? PRODUCTION_PROJECT);
  console.log(`READ (read-only): ${describeTarget(prod)} · OSM ${osmTs} (${pbf})`);

  const authority = await timed(timings, 'authority', () => readAuthority(prod.db, { id: AUTHORITY, city: CITY }));
  const boundary = buildBoundaryIndex(authority.boundary);
  if (!boundary) throw new Error(`authorities/${authority.id} (${authority.name}) has no usable boundaryGeoJSON — stopping (axioms §23: no boundary, no inventory)`);
  console.log(`AUTHORITY: ${authority.name} (${authority.id}, ${authority.type}, population ${authority.population ?? 'unknown'}) · boundary ${boundary.areaKm2} km²`);

  if (FLAGS.apply) {
    const errs = applyFlagErrors(FLAGS, authority.id);
    if (errs.length) throw new Error(`--apply refused:\n  - ${errs.join('\n  - ')}`);
  }

  const work = path.join(OUTPUT_ROOT, 'work', authority.id);
  const features = await timed(timings, 'osmExtract', () => extractInventoryFeatures(pbf, boundary, work));
  console.log(`OSM: ${features.ways.length} ways · ${features.nodes.length} tagged nodes · ${features.areas.length} polygons (bbox extract)`);

  const routes = await timed(timings, 'approvedRoutes', () => countApprovedRoutes(prod.db, authority));
  const shade = NO_SHADE ? null : await timed(timings, 'shadeLoad', () => loadTechnionShade(prod.app, prod.projectId, authority.name));
  console.log(`approved routes: ${routes.approved} (${routes.byAuthorityId} by authorityId + ${routes.byCityName} legacy by city name; ${routes.pending} pending, ${routes.noStatus} with no published flag) · shade: ${shade ? `${shade.choice.sourceKey} ${shade.segmentCount} segments (${shade.snapshotDate})` : 'none'}`);

  const lighting = NO_LIGHTING
    ? null
    : await timed(timings, 'lightingLoad', () => (LIGHTING_FILE ? loadLightingFromFile(LIGHTING_FILE) : loadLightingFromStorage(prod.app, prod.projectId, authority.name)));
  if (lighting) console.log(`lighting: lighting/v1 ${lighting.file.city} — ${lighting.file.pieces.length} pieces, sources ${lighting.sources.map((s) => s.key).join(', ')}${lighting.pendingKeys.length ? ` (pending licence: ${lighting.pendingKeys.join(', ')})` : ''}`);
  const pendingKeys = licensePendingKeys(TECHNION_PERMISSION);
  for (const k of lighting?.pendingKeys ?? []) pendingKeys.add(k);

  const now = new Date();
  const runId = `ci-${now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`;
  const { inventory, extras } = await timed(timings, 'build', () => buildCityInventory({
    authority: { id: authority.id, name: authority.name, type: authority.type, population: authority.population },
    boundary,
    features,
    osmSnapshotDate,
    approvedRoutes: routes.approved,
    shade,
    peers: readPeerRows(),
    lighting,
    licensePendingKeys: pendingKeys,
    now,
    runId,
    builtBy: 'scripts/city-inventory/run.ts',
  }));
  timings.total = Date.now() - t0;

  const report = formatCityReport(inventory, extras, routes.approved);
  const files = writeSummary({ kind: 'city-inventory-dry-run', generatedAt: now.toISOString(), apply: FLAGS.apply, inventory, extras, approvedRoutes: routes, timingsMs: timings }, report);
  console.log(`\n${report}\n\nsummary: ${files.json}\ntable:   ${files.md}\ntimings (ms): ${JSON.stringify(timings)}`);

  if (!FLAGS.apply) {
    console.log('\nDry run — nothing written to Firestore or Storage.');
    return;
  }
  await applyInventory(prod, inventory);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
