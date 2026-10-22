/**
 * scripts/routes-nationwide/assign-authority-by-boundary.ts — RC6 step 1
 * (owner decision 21.10.2026: assign authority to routes by the authorities'
 * boundaries).
 *
 * For every official_routes / curated_routes doc WITHOUT an authorityId:
 * majority-of-length inside an authority boundary (authorities.boundaryGeoJSON,
 * dataset-import's assignAuthority, no guess below 50%) → set authorityId,
 * and `city` only when the doc has none (§23: both lock once set; an existing
 * authorityId is never changed; an existing city that names a DIFFERENT
 * authority is reported, not overwritten).
 *
 * Also prints the exact city_registrations.adminRelationId fix for the two
 * regional councils whose OSM relation doesn't match by name. It never writes
 * that collection: its only writer is POST /api/admin/city-mapping/register-city
 * (the Add-City screen), so the fix is printed for the owner.
 *
 * --skipped-by-doc-city (opt-in, owner decision 22.10.2026): docs still
 * without authorityId that the boundary pass skips as below_majority or
 * city_conflict (owner-curated routes crossing into a neighbouring council)
 * get authorityId from their OWN `city` — exact normalised-name match to
 * exactly one authorities doc (resolveSkippedByDocCity); 0 or >1 matches stay
 * skipped and are reported. Payload exactly {authorityId}; city never changes.
 *
 * DEFAULT = DRY-RUN (reads only). Writes only with --apply --project appout-1
 * + a typed YES, through lib/authority-apply.node.ts (buildValidatedDoc update
 * mode, payload exactly {authorityId[, city]}, read-time updateTime
 * precondition, batches ≤ 400).
 *
 *   npx tsx scripts/routes-nationwide/assign-authority-by-boundary.ts                          # dry-run vs prod (read-only)
 *   npx tsx scripts/routes-nationwide/assign-authority-by-boundary.ts --apply --project appout-1
 *   options: --skipped-by-doc-city  --collection official_routes|curated_routes (default both)  --batch-size N  --pause-ms N  --out <dir>
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as fs from 'fs';
import * as path from 'path';
import { boundaryFromStored, type AuthorityBoundary } from '../../src/lib/dataset-import';
import {
  bboxOfBoundary, KNOWN_ADMIN_RELATION_FIXES, normalizeAuthorityName, planAuthorityBackfill, resolveSkippedByDocCity, summarizeBackfill,
  type AuthorityName, type BackfillRouteDoc,
} from '../../src/lib/routes-nationwide';
import { parsePathLoose } from './lib/path';
import { applyAuthorityWrites, authorityPayload, type AuthorityTargetCollection, type AuthorityWrite } from './lib/authority-apply.node';
import { confirmTypedYes, describeTarget, flagValue, openTarget, PRODUCTION_PROJECT } from '../trails/lib/trails-apply.node';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const BY_DOC_CITY = argv.includes('--skipped-by-doc-city');
const ONLY = flagValue(argv, 'collection');
const BATCH = Number(flagValue(argv, 'batch-size') ?? 200);
const PAUSE = Number(flagValue(argv, 'pause-ms') ?? 500);
const OUT_DIR = flagValue(argv, 'out') ?? path.join('scripts', 'output', `assign-authority-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const COLLECTIONS: AuthorityTargetCollection[] = ONLY === 'official_routes' || ONLY === 'curated_routes' ? [ONLY] : ['official_routes', 'curated_routes'];

async function main() {
  if (ONLY && !COLLECTIONS.includes(ONLY as AuthorityTargetCollection)) throw new Error(`--collection must be official_routes or curated_routes`);
  if (APPLY && !flagValue(argv, 'project')) throw new Error('--apply needs --project <id> (production: --project appout-1)');
  const target = await openTarget(flagValue(argv, 'project') ?? PRODUCTION_PROJECT);
  console.log(`TARGET: ${describeTarget(target)} — ${APPLY ? 'WILL WRITE {authorityId, city?} after confirmation' : 'read-only (dry-run)'}${BY_DOC_CITY ? ' · --skipped-by-doc-city ON' : ''}`);

  const authSnap = await target.db.collection('authorities').select('name', 'boundaryGeoJSON').get();
  const knownAuthorityIds = new Set<string>();
  const boundaries: AuthorityBoundary[] = [];
  const authorityNames: AuthorityName[] = [];
  for (const d of authSnap.docs) {
    knownAuthorityIds.add(d.id);
    authorityNames.push({ id: d.id, name: String(d.data()?.name ?? '') });
    const g = boundaryFromStored(d.data()?.boundaryGeoJSON);
    if (g) boundaries.push({ id: d.id, name: String(d.data()?.name ?? d.id), geometry: g });
  }
  console.log(`authorities: ${knownAuthorityIds.size} (${boundaries.length} with a boundary)`);

  const writes: AuthorityWrite[] = [];
  const report: Record<string, unknown> = {};
  for (const col of COLLECTIONS) {
    const snap = await target.db.collection(col).select('authorityId', 'city', 'path', 'name').get();
    const docs: BackfillRouteDoc[] = [];
    const meta = new Map<string, { updateTime: AuthorityWrite['updateTime']; city: string | null; name: string }>();
    for (const d of snap.docs) {
      const x = d.data();
      docs.push({ id: d.id, authorityId: x.authorityId, city: x.city, coords: parsePathLoose(x.path) });
      meta.set(d.id, { updateTime: d.updateTime, city: typeof x.city === 'string' && x.city.trim() ? x.city.trim() : null, name: String(x.name ?? '') });
    }
    const plan = planAuthorityBackfill(docs, boundaries);
    const sum = summarizeBackfill(plan);
    const missing = docs.length - (sum.skippedByReason.has_authority ?? 0);
    console.log(`\n${col}: ${docs.length} docs, ${missing} without authorityId → ${plan.updates.length} resolvable`);
    for (const [city, n] of Object.entries(sum.byCity).sort((a, b) => b[1] - a[1])) console.log(`  ${city}: ${n}`);
    for (const [reason, n] of Object.entries(sum.skippedByReason)) if (reason !== 'has_authority') console.log(`  skipped ${reason}: ${n}`);
    for (const s of plan.skipped) if (s.reason !== 'has_authority') console.log(`    - ${s.id} "${meta.get(s.id)?.name}" [${s.city ?? '∅'}] ${s.reason}: ${s.detail}`);

    for (const u of plan.updates) {
      const m = meta.get(u.id)!;
      const w: AuthorityWrite = { collection: col, id: u.id, authorityId: u.authorityId, city: u.city, existingCity: m.city, updateTime: m.updateTime };
      authorityPayload(w, knownAuthorityIds); // chokepoint now, in dry-run too
      writes.push(w);
    }
    let byDocCity: unknown = undefined;
    if (BY_DOC_CITY) {
      const r = resolveSkippedByDocCity(docs, plan.skipped, authorityNames);
      console.log(`  --skipped-by-doc-city: ${r.resolved.length} resolved from doc.city, ${r.unresolved.length} still skipped`);
      const resolvedRows = r.resolved.map((x) => {
        const m = meta.get(x.id)!;
        // existingCity = the doc's city → payload is exactly {authorityId}; city is never written.
        const w: AuthorityWrite = { collection: col, id: x.id, authorityId: x.authorityId, existingCity: m.city, updateTime: m.updateTime };
        const payload = authorityPayload(w, knownAuthorityIds); // chokepoint now, in dry-run too
        writes.push(w);
        console.log(`    + ${x.id} "${m.name}" [${x.city}] → ${x.authorityId} (${x.authorityName}) · boundary ${x.boundaryReason}: ${x.boundaryDetail}`);
        return { ...x, name: m.name, payload };
      });
      for (const u of r.unresolved) console.log(`    ✗ ${u.id} "${meta.get(u.id)?.name}" [${u.city ?? '∅'}] ${u.reason}${u.candidates.length ? ` (${u.candidates.map((c) => c.id).join(', ')})` : ''} · boundary ${u.boundaryReason}: ${u.boundaryDetail}`);
      byDocCity = { resolved: resolvedRows, unresolved: r.unresolved.map((u) => ({ ...u, name: meta.get(u.id)?.name ?? '' })) };
    }
    report[col] = {
      total: docs.length, withoutAuthority: missing, ...sum, updates: plan.updates, skipped: plan.skipped.filter((s) => s.reason !== 'has_authority'),
      ...(BY_DOC_CITY ? { skippedByDocCity: byDocCity } : {}),
    };
  }

  // Regional councils whose OSM admin relation doesn't match by name.
  const regSnap = await target.db.collection('city_registrations').get();
  const regByLabel = new Map(regSnap.docs.map((d) => [normalizeAuthorityName(String(d.data()?.label ?? '')), { key: d.id, data: d.data() }]));
  console.log('\ncity_registrations.adminRelationId fixes (NOT written by this script — only writer is the Add-City screen):');
  const fixes: unknown[] = [];
  for (const f of KNOWN_ADMIN_RELATION_FIXES) {
    const auth = boundaries.find((b) => normalizeAuthorityName(b.name) === normalizeAuthorityName(f.authorityName));
    const reg = regByLabel.get(normalizeAuthorityName(f.authorityName));
    if (reg?.data?.adminRelationId === f.adminRelationId) { console.log(`  ✓ ${f.authorityName}: already ${f.adminRelationId} (city_registrations/${reg.key})`); continue; }
    const bbox = auth ? bboxOfBoundary(auth.geometry) : null;
    if (reg) {
      console.log(`  ${f.authorityName}: city_registrations/${reg.key} has adminRelationId=${reg.data?.adminRelationId ?? '∅'} → set adminRelationId: ${f.adminRelationId}`);
      fixes.push({ action: 'update', doc: `city_registrations/${reg.key}`, adminRelationId: f.adminRelationId });
    } else {
      const doc = { key: f.key, label: f.authorityName, adminRelationId: f.adminRelationId, bbox };
      console.log(`  ${f.authorityName}: no city_registrations doc. Owner, in /admin/city-mapping/add: search the OSM name, pick relation/${f.adminRelationId},`);
      console.log(`    set label = "${f.authorityName}" (must equal the authority name — the runner matches registrations by label), key = "${f.key}", save.`);
      console.log(`    Resulting doc: ${JSON.stringify({ ...doc, bbox: bbox ?? '(derived by the screen from the confirmed boundary)' })}`);
      fixes.push({ action: 'create', ...doc });
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'plan.json'), JSON.stringify({ target: describeTarget(target), ...report, adminRelationFixes: fixes }, null, 2));
  console.log(`\nPlan: ${OUT_DIR}/plan.json · ${writes.length} doc update(s) planned`);

  if (!APPLY) {
    console.log(`Dry run only — no Firestore writes.\nTo write: npx tsx scripts/routes-nationwide/assign-authority-by-boundary.ts${BY_DOC_CITY ? ' --skipped-by-doc-city' : ''} --apply --project appout-1`);
    return;
  }
  if (!writes.length) { console.log('Nothing to write.'); return; }
  if (!(await confirmTypedYes(`\nType YES to set authorityId on ${writes.length} route doc(s) in ${describeTarget(target)}: `))) { console.log('Aborted — nothing written.'); return; }
  const res = await applyAuthorityWrites(target.db, writes, knownAuthorityIds, { batchSize: BATCH, pauseMs: PAUSE });
  console.log(`written ${res.written} in ${res.batches} batch(es); conflicts (edited since read, skipped): ${res.conflicts.length ? res.conflicts.join(', ') : 0}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
