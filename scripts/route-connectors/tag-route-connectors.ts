/**
 * scripts/route-connectors/tag-route-connectors.ts — RC10 (owner decision
 * 22.10.2026: Sderot's municipal routes include short "transition segments";
 * keep them in the data, hide them from user-facing route lists).
 *
 * For ONE authority's official_routes (default: Sderot, CdiRk1QP5UrUGSbGjCkU):
 *   1. classifies every route with the pure connector rule
 *      (src/lib/route-collections/display-role.ts → classifyConnectors:
 *      name starts with מקטע/תוספת/הפרד + open + both ends on another route);
 *   2. plans `displayRole: 'connector'` on the matches not already tagged;
 *   3. REPORTS (never writes) which routes have no `status` / `published`
 *      value — those are live in the app today (an absent `published` reads
 *      as published) yet invisible in the approval center (its query is
 *      `published == false`, which never matches an absent field — axiom §33).
 *
 * The hiding itself only happens while the panel flag
 * enable_hide_route_connectors is on; the field alone changes nothing.
 *
 * DEFAULT = DRY-RUN (reads only). Writes only with --apply --project appout-1
 * + a typed YES, through lib/connector-apply.node.ts (buildValidatedDoc update
 * mode, payload exactly {displayRole:'connector'} + updatedAt, read-time
 * updateTime precondition, batches ≤ 400). Nothing else on a doc is touched.
 *
 *   npx tsx scripts/route-connectors/tag-route-connectors.ts                          # dry-run vs prod (read-only)
 *   npx tsx scripts/route-connectors/tag-route-connectors.ts --apply --project appout-1
 *   options: --authority <id> (default Sderot)  --exclude id1,id2 (keep these visible)  --out <dir>
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as fs from 'fs';
import * as path from 'path';
import { classifyConnectors, CONNECTOR_ATTACH_M, CONNECTOR_MIN_OPEN_GAP_M, CONNECTOR_NAME_PATTERN, type ConnectorCandidate } from '../../src/lib/route-collections/display-role';
import { parsePathLoose } from '../routes-nationwide/lib/path';
import { applyConnectorWrites, connectorPayload, readAuthorityOfficialRoutes, type ConnectorWrite } from './lib/connector-apply.node';
import { confirmTypedYes, describeTarget, flagValue, openTarget, PRODUCTION_PROJECT } from '../trails/lib/trails-apply.node';

export const SDEROT_AUTHORITY_ID = 'CdiRk1QP5UrUGSbGjCkU';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const AUTHORITY = flagValue(argv, 'authority') ?? SDEROT_AUTHORITY_ID;
const EXCLUDE = new Set((flagValue(argv, 'exclude') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const OUT_DIR = flagValue(argv, 'out') ?? path.join('scripts', 'output', `route-connectors-${AUTHORITY}-${new Date().toISOString().replace(/[:.]/g, '-')}`);

const show = (v: unknown) => (v === undefined ? '∅' : String(v));

async function main() {
  if (APPLY && !flagValue(argv, 'project')) throw new Error('--apply needs --project <id> (production: --project appout-1)');
  const target = await openTarget(flagValue(argv, 'project') ?? PRODUCTION_PROJECT);
  console.log(`TARGET: ${describeTarget(target)} — ${APPLY ? "WILL WRITE {displayRole:'connector'} after confirmation" : 'read-only (dry-run)'}`);

  const auth = await target.db.collection('authorities').doc(AUTHORITY).get();
  if (!auth.exists) throw new Error(`authority ${AUTHORITY} not found — nothing read further`);
  const authName = String(auth.data()?.name ?? AUTHORITY);
  const knownAuthorityIds = new Set([AUTHORITY]);

  const docs = await readAuthorityOfficialRoutes(target.db, AUTHORITY);
  const candidates: ConnectorCandidate[] = docs.map((d) => ({ id: d.id, name: String(d.data.name ?? ''), path: parsePathLoose(d.data.path) as [number, number][] }));
  const verdicts = new Map(classifyConnectors(candidates).map((v) => [v.id, v]));
  const nameById = new Map(candidates.map((c) => [c.id, c.name.trim()]));

  console.log(`\n${authName} (${AUTHORITY}): ${docs.length} official_routes`);
  console.log(`rule: name /${CONNECTOR_NAME_PATTERN.source}/ + open (ends > ${CONNECTOR_MIN_OPEN_GAP_M} m apart) + both ends ≤ ${CONNECTOR_ATTACH_M} m from another route\n`);
  console.log('id                   | name                                     | length m | status    | published | displayRole | verdict');
  const rows = docs
    .map((d) => ({ d, v: verdicts.get(d.id)! }))
    .sort((a, b) => a.v.lengthM - b.v.lengthM);
  const writes: ConnectorWrite[] = [];
  for (const { d, v } of rows) {
    const x = d.data;
    let verdict: string;
    if (v.connector) {
      verdict = `CONNECTOR (ends ${v.startAttachM} m → "${nameById.get(v.startTo)}", ${v.endAttachM} m → "${nameById.get(v.endTo)}")`;
      if (EXCLUDE.has(d.id)) verdict += ' — EXCLUDED by --exclude';
      else if (x.displayRole === 'connector') verdict += ' — already tagged';
      else {
        const w: ConnectorWrite = { id: d.id, existingAuthorityId: x.authorityId ?? null, existingCity: x.city ?? null, updateTime: d.updateTime };
        connectorPayload(w, knownAuthorityIds); // chokepoint now, in dry-run too
        writes.push(w);
      }
    } else {
      verdict = `route (${v.reason}${v.reason === 'name' ? '' : `, ends gap ${v.endGapM} m, attach ${v.startAttachM}/${v.endAttachM} m`})`;
    }
    console.log(`${d.id} | ${String(x.name ?? '').trim().padEnd(40).slice(0, 40)} | ${String(v.lengthM).padStart(8)} | ${show(x.status).padEnd(9)} | ${show(x.published).padEnd(9)} | ${show(x.displayRole).padEnd(11)} | ${verdict}`);
  }

  const noStatus = docs.filter((d) => d.data.status === undefined || d.data.published === undefined);
  console.log(`\nRoutes with no status and/or no published value: ${noStatus.length} of ${docs.length}`);
  console.log('  Today these are SHOWN in the app (an absent `published` reads as published) but do NOT appear in the');
  console.log('  approval center (its query is published == false, which never matches a missing field). This script does');
  console.log('  not change them — approving/hiding them is an owner decision (see the PR body).');
  for (const d of noStatus) console.log(`  - ${d.id} "${String(d.data.name ?? '').trim()}" status=${show(d.data.status)} published=${show(d.data.published)}${verdicts.get(d.id)?.connector ? ' [connector]' : ''}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'plan.json'), JSON.stringify({
    target: describeTarget(target),
    authority: { id: AUTHORITY, name: authName },
    rule: { namePattern: CONNECTOR_NAME_PATTERN.source, minOpenGapM: CONNECTOR_MIN_OPEN_GAP_M, attachM: CONNECTOR_ATTACH_M },
    excluded: Array.from(EXCLUDE),
    routes: rows.map(({ d, v }) => ({ ...v, name: String(d.data.name ?? '').trim(), status: d.data.status ?? null, published: d.data.published ?? null, displayRole: d.data.displayRole ?? null })),
    writes: writes.map((w) => ({ id: w.id, name: nameById.get(w.id), payload: { displayRole: 'connector' } })),
    missingStatusOrPublished: noStatus.map((d) => ({ id: d.id, name: String(d.data.name ?? '').trim(), status: d.data.status ?? null, published: d.data.published ?? null })),
  }, null, 2));
  console.log(`\nPlan: ${OUT_DIR}/plan.json · ${writes.length} doc update(s) planned ({displayRole:'connector'} only)`);

  if (!APPLY) {
    console.log(`Dry run only — no Firestore writes.\nTo write: npx tsx scripts/route-connectors/tag-route-connectors.ts --apply --project appout-1${AUTHORITY !== SDEROT_AUTHORITY_ID ? ` --authority ${AUTHORITY}` : ''}`);
    return;
  }
  if (!writes.length) { console.log('Nothing to write.'); return; }
  if (!(await confirmTypedYes(`\nType YES to set displayRole:'connector' on ${writes.length} official_routes doc(s) of ${authName} in ${describeTarget(target)}: `))) { console.log('Aborted — nothing written.'); return; }
  const res = await applyConnectorWrites(target.db, writes, knownAuthorityIds);
  console.log(`written ${res.written} in ${res.batches} batch(es); conflicts (edited since read, skipped): ${res.conflicts.length ? res.conflicts.join(', ') : 0}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
