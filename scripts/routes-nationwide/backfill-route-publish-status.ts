/**
 * scripts/routes-nationwide/backfill-route-publish-status.ts — make every official_routes
 * doc carry an explicit `published` + `status` (fix/official-routes-cap-and-approval-query).
 *
 * Why: a doc with no `published` field is LIVE for users (the app hides only
 * `published === false`) but INVISIBLE to the approval center (`published == false` never
 * matches an absent field, axiom §33) and uncounted by city-mapping. Example: the Sderot
 * routes imported without a status. Full reader table + the fill rules:
 * src/lib/routes-nationwide/publish-status.ts.
 *
 * Fills only keys that are genuinely absent (or null), with the value that matches what users
 * see today — the write changes no visibility. Conflicts (no `published` but status
 * pending/archived/rejected, unknown values) are reported, never written.
 *
 * DEFAULT = DRY-RUN (reads only). Writes only with --apply --project appout-1 + a typed YES,
 * through lib/publish-status-apply.node.ts (buildValidatedDoc update mode, payload exactly
 * {published?, status?} + updatedAt, read-time updateTime precondition, batches ≤ 400).
 *
 *   npx tsx scripts/routes-nationwide/backfill-route-publish-status.ts                      # dry-run vs prod (read-only)
 *   npx tsx scripts/routes-nationwide/backfill-route-publish-status.ts --city=שדרות         # one city
 *   npx tsx scripts/routes-nationwide/backfill-route-publish-status.ts --apply --project appout-1 [--city=…]
 *   options: --batch-size N  --pause-ms N  --out <dir>
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as fs from 'fs';
import * as path from 'path';
import { hasNoPublishedField, planPublishState, summarizePublishPlan, type PublishPlanRow } from '../../src/lib/routes-nationwide/publish-status';
import { applyPublishWrites, publishPayload, type PublishWrite } from './lib/publish-status-apply.node';
import { confirmTypedYes, describeTarget, flagValue, openTarget, PRODUCTION_PROJECT } from '../trails/lib/trails-apply.node';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const CITY = flagValue(argv, 'city');
const BATCH = Number(flagValue(argv, 'batch-size') ?? 200);
const PAUSE = Number(flagValue(argv, 'pause-ms') ?? 500);
const OUT_DIR = flagValue(argv, 'out') ?? path.join('scripts', 'output', `route-publish-status-${new Date().toISOString().replace(/[:.]/g, '-')}`);

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

async function main() {
  if (APPLY && !flagValue(argv, 'project')) throw new Error('--apply needs --project <id> (production: --project appout-1)');
  const target = await openTarget(flagValue(argv, 'project') ?? PRODUCTION_PROJECT);
  console.log(`TARGET: ${describeTarget(target)} — ${APPLY ? 'WILL WRITE {published?, status?} after confirmation' : 'read-only (dry-run)'}${CITY ? ` · city = ${CITY}` : ''}`);

  const authSnap = await target.db.collection('authorities').select('name').get();
  const knownAuthorityIds = new Set(authSnap.docs.map((d) => d.id));

  const snap = await target.db.collection('official_routes').select('published', 'status', 'name', 'city', 'authorityId').get();
  const rows: Array<PublishPlanRow & { noPublished: boolean }> = [];
  const writes: PublishWrite[] = [];
  for (const d of snap.docs) {
    const x = d.data();
    const city = str(x.city);
    if (CITY && city !== CITY) continue;
    const plan = planPublishState(x);
    const row = { id: d.id, name: String(x.name ?? ''), city, authorityId: str(x.authorityId), plan, noPublished: hasNoPublishedField(x) };
    rows.push(row);
    if (plan.kind === 'fill') {
      const w: PublishWrite = { id: d.id, patch: plan.patch, existingAuthorityId: row.authorityId, existingCity: city, updateTime: d.updateTime };
      publishPayload(w, knownAuthorityIds); // chokepoint now, in dry-run too
      writes.push(w);
    }
  }

  const sum = summarizePublishPlan(rows);
  console.log(`\nofficial_routes${CITY ? ` in ${CITY}` : ''}: ${sum.total} docs · ${sum.noPublishedField} with NO published field (live for users, not in the approval queue)`);
  for (const [city, n] of Object.entries(sum.noPublishedByCity).sort((a, b) => b[1] - a[1])) console.log(`  ${city}: ${n}`);
  const byPatch: Record<string, number> = {};
  for (const w of writes) {
    const k = JSON.stringify(w.patch);
    byPatch[k] = (byPatch[k] ?? 0) + 1;
  }
  console.log(`\nplanned fills: ${writes.length}`);
  for (const [k, n] of Object.entries(byPatch)) console.log(`  ${k}: ${n}`);
  console.log(`conflicts (reported, never written): ${sum.conflicts}`);
  for (const r of rows) if (r.plan.kind === 'conflict') console.log(`  - ${r.id} "${r.name}" [${r.city ?? '∅'}] ${r.plan.reason}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, 'plan.json'),
    JSON.stringify({ target: describeTarget(target), city: CITY, summary: sum, fills: writes.map((w) => ({ id: w.id, patch: w.patch, city: w.existingCity })), conflicts: rows.filter((r) => r.plan.kind === 'conflict') }, null, 2),
  );
  console.log(`\nPlan: ${OUT_DIR}/plan.json`);

  if (!APPLY) {
    console.log('Dry run only — no Firestore writes.\nTo write: npx tsx scripts/routes-nationwide/backfill-route-publish-status.ts --apply --project appout-1');
    return;
  }
  if (!writes.length) { console.log('Nothing to write.'); return; }
  if (!(await confirmTypedYes(`\nType YES to fill published/status on ${writes.length} official_routes doc(s) in ${describeTarget(target)}: `))) { console.log('Aborted — nothing written.'); return; }
  const res = await applyPublishWrites(target.db, writes, knownAuthorityIds, { batchSize: BATCH, pauseMs: PAUSE });
  console.log(`written ${res.written} in ${res.batches} batch(es); conflicts (edited since read, skipped): ${res.conflicts.length ? res.conflicts.join(', ') : 0}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
