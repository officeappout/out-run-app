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
 *            --keep-work  (keep scripts/output/city-inventory/work/<authorityId>/ — the
 *                          osmium cuts; deleted after the extract by default)
 *            --env=<file> (default .env.local; needs FIREBASE_SERVICE_ACCOUNT_KEY)
 *
 * Writing (David only): add `--apply --project appout-1 --authority=<id>`; the
 * run prints TARGET + the summary and asks for a typed YES, then writes
 * city_inventory/{authorityId} + runs/{runId} in one batch via the I0 store.
 *
 * ALL AUTHORITIES (RC8 step 4) — resumable, one authority at a time:
 *   npx tsx scripts/city-inventory/run.ts --all                     # every city/council with a boundary, dry-run
 *   … --all --tier=client|large_city|regional_council|other  --limit=N  --fresh  --retry-errors
 *   … --all --out=<dir>   (default scripts/output/city-inventory/all — checkpoint.json + summary-all.{json,md})
 *   Owner batch write: --all --tier=client --apply --project appout-1   (one typed YES for the whole batch)
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

import * as fs from 'fs';
import { formatRollupMarkdown, inventoryTodo, INVENTORY_TIERS, newInventoryCheckpoint, orderInventoryAuthorities, parseInventoryCheckpoint, rollupReadiness, type InventoryCheckpoint, type InventoryTier } from '../../src/lib/city-inventory/all-run';
import { boundaryFromStored } from '../../src/lib/dataset-import';
import { assertOsmium, ensureIsraelPbf, pbfTimestamp } from '../lib/osm-pbf.node';
import { PRODUCTION_PROJECT, confirmTypedYes, describeTarget, flagValue, openTarget, parseApplyFlags, type Target } from '../trails/lib/trails-apply.node';
import { OUTPUT_ROOT } from './lib/output.node';
import { runOneInventory, type RunOneOptions } from './lib/run-one.node';

const AUTHORITY = flagValue(argv, 'authority');
const CITY = flagValue(argv, 'city');
const PBF = flagValue(argv, 'pbf');
const ALL = argv.includes('--all');
const TIER = flagValue(argv, 'tier') as InventoryTier | null;
const LIMIT = Number(flagValue(argv, 'limit') ?? 0) || null;
const FRESH = argv.includes('--fresh');
const RETRY_ERRORS = argv.includes('--retry-errors');
const ALL_OUT = flagValue(argv, 'out') ?? path.join(OUTPUT_ROOT, 'all');
const FLAGS = parseApplyFlags(argv);

let stopRequested = false;
process.on('SIGINT', () => {
  if (stopRequested) process.exit(130);
  stopRequested = true;
  console.log('\n⏸  Stop requested — finishing the current authority, then saving the checkpoint. (Ctrl-C again to abort now.)');
});

function writeJson(file: string, v: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(v, null, 2));
  fs.renameSync(`${file}.tmp`, file);
}

async function runAll(prod: Target, o: RunOneOptions) {
  if (TIER && !INVENTORY_TIERS.includes(TIER)) throw new Error(`--tier must be one of ${INVENTORY_TIERS.join(', ')}`);
  if (FLAGS.apply && !FLAGS.project) throw new Error('--all --apply needs --project <id> (production: --project appout-1)');
  const snap = await prod.db.collection('authorities').select('name', 'type', 'population', 'isActiveClient', 'boundaryGeoJSON').get();
  const rows = snap.docs.map((d) => {
    const a = d.data();
    return {
      id: d.id, name: String(a?.name ?? d.id).trim(), type: typeof a?.type === 'string' ? a.type : null,
      population: typeof a?.population === 'number' && a.population > 0 ? a.population : null,
      isActiveClient: a?.isActiveClient === true, hasBoundary: !!boundaryFromStored(a?.boundaryGeoJSON),
    };
  });
  const { ordered, skippedNoBoundary } = orderInventoryAuthorities(rows);
  const inRun = ordered.filter((a) => !TIER || a.tier === TIER).slice(0, LIMIT ?? undefined);
  console.log(`authorities: ${rows.length} docs → ${ordered.length} city/council with a boundary (${skippedNoBoundary.length} without — skipped) → ${inRun.length} in this run`);

  const cpFile = path.join(ALL_OUT, 'checkpoint.json');
  let cp: InventoryCheckpoint | null = !FRESH && fs.existsSync(cpFile) ? parseInventoryCheckpoint(fs.readFileSync(cpFile, 'utf8')) : null;
  if (cp && cp.apply !== FLAGS.apply) throw new Error(`checkpoint ${cpFile} is a ${cp.apply ? 'apply' : 'dry-run'} run — use --fresh or another --out`);
  cp = cp ?? newInventoryCheckpoint(FLAGS.apply);
  const todo = inventoryTodo(cp, inRun.map((a) => a.id), RETRY_ERRORS);
  console.log(`checkpoint: ${Object.keys(cp.done).length} done · to do now: ${todo.length}`);
  writeJson(cpFile, cp);

  // --all --apply: ONE typed YES for the whole batch (owner request 22.10.2026), showing how many
  // authorities will be written. Per authority only city_inventory/{id} + its run row are written.
  let batchConfirm: RunOneOptions['confirm'];
  if (FLAGS.apply && todo.length) {
    const ok = await confirmTypedYes(`\nType YES to write city_inventory (+ run row) for ${todo.length} authorities to ${describeTarget(prod)}: `);
    if (!ok) {
      console.log('Not confirmed — nothing was written.');
      return;
    }
    batchConfirm = async () => true;
  }

  const byId = new Map(inRun.map((a) => [a.id, a]));
  for (const id of todo) {
    if (stopRequested) break;
    const a = byId.get(id)!;
    console.log(`\n■ ${a.name} [${a.id}] — ${a.tier}`);
    try {
      const r = await runOneInventory(prod, { id, city: null }, { ...o, batch: true, confirm: batchConfirm, log: () => {} });
      const rd = r.inventory.readiness;
      console.log(`  ${rd.level} ${rd.score}/100 · approved routes ${r.routes.approved} · ${rd.blockers[0] ?? 'no blocker'}`);
      cp.done[id] = { name: a.name, tier: a.tier, status: 'done', finishedAt: new Date().toISOString(), level: rd.level, score: rd.score, missing: rd.missing, blockers: rd.blockers, approvedRoutes: r.routes.approved, file: r.files.json };
    } catch (e) {
      console.error(`  ✖ ${(e as Error).message}`);
      cp.done[id] = { name: a.name, tier: a.tier, status: 'error', finishedAt: new Date().toISOString(), note: (e as Error).message.slice(0, 300) };
    }
    writeJson(cpFile, cp);
  }

  const rollup = rollupReadiness(cp.done);
  writeJson(path.join(ALL_OUT, 'summary-all.json'), { generatedAt: new Date().toISOString(), apply: FLAGS.apply, skippedNoBoundary: skippedNoBoundary.map((r) => ({ id: r.id, name: r.name, type: r.type })), rollup, done: cp.done });
  fs.writeFileSync(path.join(ALL_OUT, 'summary-all.md'), `${formatRollupMarkdown(rollup, cp.done)}\n`);
  console.log(`\nREADINESS (${rollup.authorities}): 🔴${rollup.levels.red} 🟡${rollup.levels.yellow} 🟢${rollup.levels.green} · errors ${rollup.errors} · mean ${rollup.meanScore ?? '—'}`);
  console.log(`summary: ${path.join(ALL_OUT, 'summary-all.md')}${stopRequested ? ' — stopped early; run the same command to continue' : ''}`);
  if (!FLAGS.apply) console.log('Dry run — nothing written to Firestore or Storage.');
}

async function main() {
  if (!ALL && !AUTHORITY && !CITY) throw new Error('usage: --authority=<authorityId> | --city=<name> | --all  [--apply --project appout-1 --authority=<id>]');
  assertOsmium();
  const pbf = PBF ? path.resolve(PBF) : await ensureIsraelPbf();
  const osmTs = pbfTimestamp(pbf);
  if (!osmTs) throw new Error(`cannot read the replication timestamp of ${pbf} — refusing to report an undated snapshot`);

  // One target for the reads and (with --apply) the write: production by
  // default, the emulator when FIRESTORE_EMULATOR_HOST is set.
  const prod = await openTarget(FLAGS.project ?? PRODUCTION_PROJECT);
  console.log(`READ (read-only): ${describeTarget(prod)} · OSM ${osmTs} (${pbf})`);
  const o: RunOneOptions = {
    pbf, osmTs,
    noShade: argv.includes('--no-shade'),
    noLighting: argv.includes('--no-lighting'),
    lightingFile: flagValue(argv, 'lighting-file'),
    keepWork: argv.includes('--keep-work'),
    flags: FLAGS,
  };
  if (ALL) return runAll(prod, o);
  const r = await runOneInventory(prod, { id: AUTHORITY, city: CITY }, o);
  if (!FLAGS.apply) console.log('\nDry run — nothing written to Firestore or Storage.');
  void r;
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
