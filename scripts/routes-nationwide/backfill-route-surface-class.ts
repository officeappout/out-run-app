/**
 * scripts/routes-nationwide/backfill-route-surface-class.ts — copy `surfaceClass` from
 * route_scores/{routeId} onto official_routes/{routeId} (owner-approved 23.10.2026), so the
 * app can filter routes by surface without reading route_scores.
 *
 * For every official_routes doc WITHOUT `surfaceClass` (absence detected in memory — axiom
 * §33, no `== null` queries): take the class from its route_scores doc. No score doc, or a
 * score class of 'unknown': left unset and listed (the client derives those). Docs that
 * already carry the field are never touched (idempotent). Never writes anything but
 * {surfaceClass}.
 *
 * DEFAULT = DRY-RUN (reads only). Writes only with --apply --project appout-1 + a typed YES,
 * through lib/surface-class-apply.node.ts (buildValidatedDoc update mode, payload exactly
 * {surfaceClass}, read-time updateTime precondition, batches ≤ 400).
 *
 *   npx tsx scripts/routes-nationwide/backfill-route-surface-class.ts                       # dry-run vs prod (read-only)
 *   npx tsx scripts/routes-nationwide/backfill-route-surface-class.ts --city=שדרות          # one city
 *   npx tsx scripts/routes-nationwide/backfill-route-surface-class.ts --apply --project appout-1 [--city=…]
 *   options: --batch-size N  --pause-ms N  --out <dir>
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as fs from 'fs';
import * as path from 'path';
import { applySurfaceClassWrites, planSurfaceClassBackfill } from './lib/surface-class-apply.node';
import { confirmTypedYes, describeTarget, flagValue, openTarget, PRODUCTION_PROJECT } from '../trails/lib/trails-apply.node';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const CITY = flagValue(argv, 'city');
const BATCH = Number(flagValue(argv, 'batch-size') ?? 400);
const PAUSE = Number(flagValue(argv, 'pause-ms') ?? 500);
const OUT_DIR = flagValue(argv, 'out') ?? path.join('scripts', 'output', `route-surface-class-${new Date().toISOString().replace(/[:.]/g, '-')}`);

async function main() {
  if (APPLY && !flagValue(argv, 'project')) throw new Error('--apply needs --project <id> (production: --project appout-1)');
  const target = await openTarget(flagValue(argv, 'project') ?? PRODUCTION_PROJECT);
  console.log(`TARGET: ${describeTarget(target)} — ${APPLY ? 'WILL WRITE {surfaceClass} after confirmation' : 'read-only (dry-run)'}${CITY ? ` · city = ${CITY}` : ''}`);

  const authSnap = await target.db.collection('authorities').select('name').get();
  const knownAuthorityIds = new Set(authSnap.docs.map((d) => d.id));
  const { rows, writes, summary: s } = await planSurfaceClassBackfill(target.db, { city: CITY, knownAuthorityIds });

  console.log(`\nofficial_routes${CITY ? ` in ${CITY}` : ''}: ${s.total} docs`);
  console.log(`  already have surfaceClass : ${s.alreadySet}`);
  console.log(`  planned fills             : ${s.fill}`);
  for (const [c, n] of Object.entries(s.fillByClass)) console.log(`    ${c.padEnd(16)} ${n}`);
  console.log(`  no route_scores doc       : ${s.noScore}   (left unset)`);
  console.log(`  score class unknown       : ${s.scoreUnknown}   (left unset)`);
  console.log(`  score mismatch            : ${s.scoreMismatch}   (reported, never written)`);
  console.log(`  invalid existing value    : ${s.invalidExisting}   (reported, never written)`);
  const listed = rows.filter((r) => r.plan.kind !== 'fill' && r.plan.kind !== 'already_set');
  for (const r of listed.slice(0, 60)) console.log(`  - ${r.plan.kind.padEnd(16)} ${r.id} "${r.name}" [${r.city ?? '∅'}]${'reason' in r.plan ? ` ${r.plan.reason}` : ''}`);
  if (listed.length > 60) console.log(`  … ${listed.length - 60} more in plan.json`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, 'plan.json'),
    JSON.stringify({ target: describeTarget(target), city: CITY, summary: s, fills: writes.map((w) => ({ id: w.id, surfaceClass: w.surfaceClass, city: w.existingCity })), notWritten: listed }, null, 2),
  );
  console.log(`\nPlan: ${OUT_DIR}/plan.json`);

  if (!APPLY) {
    console.log('Dry run only — no Firestore writes.\nTo write: npx tsx scripts/routes-nationwide/backfill-route-surface-class.ts --apply --project appout-1');
    return;
  }
  if (!writes.length) { console.log('Nothing to write.'); return; }
  if (!(await confirmTypedYes(`\nType YES to set surfaceClass on ${writes.length} official_routes doc(s) in ${describeTarget(target)}: `))) { console.log('Aborted — nothing written.'); return; }
  const res = await applySurfaceClassWrites(target.db, writes, knownAuthorityIds, { batchSize: BATCH, pauseMs: PAUSE });
  console.log(`written ${res.written} in ${res.batches} batch(es); conflicts (edited since read, skipped): ${res.conflicts.length ? res.conflicts.join(', ') : 0}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
