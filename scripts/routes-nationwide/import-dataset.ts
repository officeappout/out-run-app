/**
 * scripts/routes-nationwide/import-dataset.ts — NATIONWIDE-PLAN.md W1.5.
 * Regulated open dataset (CC-BY only for now, owner decision Q11) → named,
 * continuous routes in official_routes as pending / unpublished.
 *
 * DRY-RUN BY DEFAULT. Reads a LOCAL file only — it never downloads: data.gov.il
 * serves the shapefiles behind a CloudFront bot check, so the owner downloads
 * the zip in a browser from the dataset page and passes --file.
 *
 *   npx tsx scripts/routes-nationwide/import-dataset.ts --dataset=ofneidan --file=~/Downloads/ofneidan.zip
 *   npx tsx scripts/routes-nationwide/import-dataset.ts --dataset=bicycle_jer_2019 --file=… --authority=<jerusalemId>
 *   … --offline --boundaries-json=<file>     # no Firestore at all ([{id,name,city,geometry}])
 *   … --apply --project appout-1             # owner only: create-only writes, typed YES
 *
 * Reads (dry-run, read-only): authorities (name + boundaryGeoJSON) and
 * official_routes name/path for dedup, via the existing trails-apply pager.
 * Writes (only --apply): through trails-apply's planCollection/executePlan —
 * create-only, buildValidatedDoc re-run at the write site. This script holds
 * no write of its own, so safety-check's allowlists are unchanged.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as fs from 'fs';
import * as path from 'path';
import { boundaryFromStored, getDataset, planDatasetImport, readShapefileZip, type AuthorityBoundary, type ExistingRoute } from '../../src/lib/dataset-import';
import { buildValidatedDoc } from '../../src/lib/route-collections/validate';
import { parsePathLoose } from './lib/path';
import {
  PRODUCTION_PROJECT, confirmTypedYes, describeTarget, executePlan, flagValue, formatPlan, listOfficialRoutesPage, openTarget, planCollection,
} from '../trails/lib/trails-apply.node';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const OFFLINE = argv.includes('--offline');
const DATASET = flagValue(argv, 'dataset');
const FILE = flagValue(argv, 'file');
const FORCE_AUTHORITY = flagValue(argv, 'authority');
const BOUNDARIES_JSON = flagValue(argv, 'boundaries-json');
const SNAPSHOT = flagValue(argv, 'snapshot');
const OUT_DIR = flagValue(argv, 'out') ?? path.join('scripts', 'output', `dataset-import-${DATASET}-${new Date().toISOString().replace(/[:.]/g, '-')}`);

async function readInput(file: string): Promise<unknown> {
  const buf = fs.readFileSync(file.replace(/^~/, process.env.HOME ?? '~'));
  if (/\.zip$/i.test(file)) return readShapefileZip(new Uint8Array(buf));
  return JSON.parse(buf.toString('utf8'));
}

async function main() {
  if (!DATASET || !FILE) throw new Error('usage: --dataset=<key> --file=<local .zip shapefile | .geojson> [--authority=<id>] [--offline --boundaries-json=<f>] [--apply --project <id>]');
  if (APPLY && OFFLINE) throw new Error('--apply cannot be combined with --offline');
  if (APPLY && !flagValue(argv, 'project')) throw new Error('--apply needs --project <id> (production: --project appout-1)');
  const spec = getDataset(DATASET);
  console.log(`DATASET: ${spec.key} — ${spec.title} (${spec.license})`);
  const geojson = await readInput(FILE);

  let boundaries: AuthorityBoundary[] = [];
  const cityByAuthority: Record<string, string> = {};
  const knownAuthorityIds = new Set<string>();
  let existing: ExistingRoute[] = [];
  let target: Awaited<ReturnType<typeof openTarget>> | null = null;

  if (OFFLINE) {
    console.log('TARGET: none (offline)');
    const raw = BOUNDARIES_JSON ? JSON.parse(fs.readFileSync(BOUNDARIES_JSON, 'utf8')) : [];
    for (const b of raw) {
      boundaries.push({ id: b.id, name: b.name, geometry: b.geometry });
      cityByAuthority[b.id] = b.city ?? b.name;
      knownAuthorityIds.add(b.id);
    }
  } else {
    target = await openTarget(flagValue(argv, 'project') ?? PRODUCTION_PROJECT);
    console.log(`TARGET: ${describeTarget(target)} — ${APPLY ? 'WILL WRITE official_routes after confirmation' : 'read-only (dry-run)'}`);
    const snap = await target.db.collection('authorities').select('name', 'boundaryGeoJSON').get();
    for (const d of snap.docs) {
      const a = d.data();
      knownAuthorityIds.add(d.id);
      cityByAuthority[d.id] = String(a?.name ?? '');
      const g = boundaryFromStored(a?.boundaryGeoJSON);
      if (g) boundaries.push({ id: d.id, name: String(a?.name ?? d.id), geometry: g });
    }
    let after: string | null = null;
    for (;;) {
      const page = await listOfficialRoutesPage(target.db, { afterId: after, pageSize: 500, authorityId: null });
      for (const r of page) existing.push({ id: r.id, authorityId: null, name: String(r.data?.name ?? ''), coords: parsePathLoose(r.data?.path) });
      if (page.length < 500) break;
      after = page[page.length - 1].id;
    }
    console.log(`authorities: ${knownAuthorityIds.size} (${boundaries.length} with a boundary) · existing official_routes for dedup: ${existing.length}`);
  }
  if (FORCE_AUTHORITY && !knownAuthorityIds.has(FORCE_AUTHORITY)) throw new Error(`--authority ${FORCE_AUTHORITY} is not a known authority`);

  const plan = planDatasetImport(geojson, spec, {
    boundaries, cityByAuthority, existing, snapshot: SNAPSHOT, forceAuthorityId: FORCE_AUTHORITY,
    importBatchId: `dataset-${spec.key}-${new Date().toISOString().slice(0, 10)}`,
  });
  // Chokepoint check now, in dry-run too — a doc that would fail at write time fails here.
  const valid: typeof plan.routes = [];
  for (const r of plan.routes) {
    try { buildValidatedDoc('official_routes', r.data, { mode: 'create', knownAuthorityIds }); valid.push(r); }
    catch (e) { plan.skipped.push({ name: r.corridor.name, lengthM: Math.round(r.corridor.lengthM), reason: `chokepoint: ${(e as Error).message}` }); }
  }

  const n = plan.normalize;
  console.log(`\nfeatures ${n.features} → existing-status lines ${n.lines} (skipped by status: ${JSON.stringify(n.skippedStatus)}, not a line: ${n.skippedNotLine}, bad coords: ${n.skippedBadCoords}, from ITM: ${n.reprojectedFromItm})`);
  console.log(`stitch: ${plan.stitch.pieces} pieces → ${plan.stitch.chains} chains → ${plan.stitch.kept} corridors ≥ 2 km (${plan.stitch.droppedShort} shorter dropped)`);
  console.log(`routes: ${valid.length} planned · ${plan.skipped.length} skipped`);
  for (const r of valid) console.log(`  + ${(r.data as any).name}  ${(r.corridor.lengthM / 1000).toFixed(2)} km  [${cityByAuthority[r.authorityId]}]  ${r.id}`);
  for (const s of plan.skipped) console.log(`  - ${s.name} ${(s.lengthM / 1000).toFixed(2)} km: ${s.reason}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify({ dataset: spec.key, normalize: plan.normalize, stitch: plan.stitch, perAuthority: plan.perAuthority, routes: valid.map((r) => ({ id: r.id, name: (r.data as any).name, km: (r.data as any).distance, authorityId: r.authorityId })), skipped: plan.skipped }, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'routes.geojson'), JSON.stringify({ type: 'FeatureCollection', features: valid.map((r) => ({ type: 'Feature', properties: { id: r.id, name: (r.data as any).name }, geometry: { type: 'LineString', coordinates: r.corridor.coords } })) }));
  console.log(`\nSummary + map: ${OUT_DIR}`);

  if (!APPLY) { console.log('Dry run only — no Firestore writes.'); return; }
  if (!target) return;
  const byAuthority = new Map<string, typeof valid>();
  for (const r of valid) { if (!byAuthority.has(r.authorityId)) byAuthority.set(r.authorityId, []); byAuthority.get(r.authorityId)!.push(r); }
  const plans = [];
  for (const [authId, rs] of Array.from(byAuthority.entries())) {
    const p = await planCollection(target.db, 'official_routes', rs.map((r) => ({ id: r.id, data: r.data })), 'create_only', authId);
    p.knownAuthorityIds = knownAuthorityIds;
    plans.push(p);
    console.log(`  [${cityByAuthority[authId]}] ${formatPlan(p)}`);
  }
  const total = plans.reduce((a, p) => a + p.create.length, 0);
  if (!total) { console.log('Nothing to write.'); return; }
  if (!(await confirmTypedYes(`\nType YES to create ${total} official_routes doc(s) in ${describeTarget(target)}: `))) { console.log('Aborted — nothing written.'); return; }
  for (const p of plans) await executePlan(target.db, p);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
