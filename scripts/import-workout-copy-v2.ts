/**
 * import-workout-copy-v2.ts — load the titles-v2 content set into
 * workoutMetadata/{workoutTitles/titles, smartDescriptions/descriptions}.
 *
 * Source (David's audit, training-audit/copy/titles-v2/):
 *   new_titles.csv        205 title rows       (one "moment" = one bundle)
 *   new_descriptions.csv  272 description rows (bundle partners + rewrites)
 *   archive_list.csv      309 live rows: 293 `archive` + 16 `retag` (field fixes)
 *
 * What it does, in order:
 *   1. Reads BOTH live collections in full and writes a JSON backup to
 *      scripts/_backups/ (gitignored) — always, dry run included.
 *   2. Builds every new row exactly like the admin bulk upload does
 *      (bulk/page.tsx): same fields, same deterministic doc id
 *      (generateMetadataDocId = FNV-1a of text|persona|bundleId|gender), plus
 *      the moment fields the bulk upload now persists (weather, situation,
 *      timeOfDay on descriptions). Sanity-checks the id scheme against the
 *      live rows that were created by the bulk upload (8-char ids).
 *   3. Applies the 16 field fixes (RETAGS below — concrete values for the
 *      audit's "set gender to match the text"-style notes).
 *   4. Archives the 293 rows: sets `archived: true` (+ archivedAt / reason /
 *      replacedBy). The engine skips archived rows (isArchivedContentRow,
 *      workout-metadata.service.ts); the rows stay in Firestore so they can be
 *      restored by unsetting the flag. `--delete` hard-deletes them instead
 *      (the backup from step 1 still has them).
 *
 * ORDER MATTERS: run --write only AFTER the engine change that understands
 * `archived` and `situation` is deployed — an older engine would keep showing
 * the archived rows and would show returning/deload copy in every session.
 * --write therefore also requires --engine-deployed.
 *
 * Run (dry run — default, zero writes):
 *   npx tsx --env-file=../appout-1/.env.local scripts/import-workout-copy-v2.ts
 * Apply:
 *   npx tsx --env-file=../appout-1/.env.local scripts/import-workout-copy-v2.ts --write --engine-deployed
 * Options:
 *   --dir=<path>   content folder (default ../appout-website/training-audit/copy/titles-v2)
 *   --delete       hard-delete the archive rows instead of archived:true
 */

import * as fs from 'fs';
import * as path from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, type DocumentData } from 'firebase-admin/firestore';
import { generateMetadataDocId } from '../src/features/workout-engine/services/workout-metadata-content-fields';
import { RETAGS, parseCsv, buildTitle, buildDescription } from './lib/workout-copy-v2';

const TITLES_PATH = 'workoutMetadata/workoutTitles/titles';
const DESCRIPTIONS_PATH = 'workoutMetadata/smartDescriptions/descriptions';
const BATCH_SIZE = 400;

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const ENGINE_DEPLOYED = args.includes('--engine-deployed');
const HARD_DELETE = args.includes('--delete');
const dirArg = args.find(a => a.startsWith('--dir='))?.slice('--dir='.length);
const CONTENT_DIR = path.resolve(dirArg ?? path.join(process.cwd(), '../appout-website/training-audit/copy/titles-v2'));

function sameContent(a: DocumentData, b: Record<string, unknown>): boolean {
  return Object.entries(b).every(([k, v]) => v === undefined || a[k] === v);
}

async function commitInBatches(db: FirebaseFirestore.Firestore, ops: Array<(b: FirebaseFirestore.WriteBatch) => void>, label: string) {
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const batch = db.batch();
    ops.slice(i, i + BATCH_SIZE).forEach(op => op(batch));
    await batch.commit();
    console.log(`  ${label}: committed ${Math.min(i + BATCH_SIZE, ops.length)}/${ops.length}`);
  }
}

async function main() {
  console.log(`\n=== import-workout-copy-v2 — ${WRITE ? 'WRITE' : 'DRY RUN (no writes)'}${HARD_DELETE ? ' · archive = HARD DELETE' : ''} ===`);
  console.log(`content dir: ${CONTENT_DIR}`);
  if (WRITE && !ENGINE_DEPLOYED) {
    console.error('\n--write needs --engine-deployed: the engine change (archived + situation filters) must be live first.');
    process.exit(1);
  }

  if (!getApps().length) {
    const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
    initializeApp({ credential: cert(c), projectId: c.project_id });
  }
  const db = getFirestore();
  console.log(`project: ${JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!).project_id}`);

  // ── 1. Full backup ────────────────────────────────────────────────────────
  const [titlesSnap, descSnap] = await Promise.all([
    db.collection(TITLES_PATH).get(),
    db.collection(DESCRIPTIONS_PATH).get(),
  ]);
  const live = {
    titles: new Map(titlesSnap.docs.map(d => [d.id, d.data()])),
    descriptions: new Map(descSnap.docs.map(d => [d.id, d.data()])),
  };
  const backupDir = path.join(__dirname, '_backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `workout-copy-v2-${WRITE ? 'pre-write' : 'dry-run'}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({
    takenAt: new Date().toISOString(),
    [TITLES_PATH]: titlesSnap.docs.map(d => ({ id: d.id, data: d.data() })),
    [DESCRIPTIONS_PATH]: descSnap.docs.map(d => ({ id: d.id, data: d.data() })),
  }, null, 2));
  console.log(`\n[1] backup: ${titlesSnap.size} titles + ${descSnap.size} descriptions → ${backupFile}`);

  // Id-scheme sanity check: rows the bulk upload created have 8-char hex ids — they
  // must re-hash to themselves (proves this script ids rows exactly like the admin).
  let idChecked = 0; let idMatched = 0;
  for (const [coll, map] of [['titles', live.titles], ['descriptions', live.descriptions]] as const) {
    for (const [id, d] of Array.from(map.entries())) {
      if (!/^[0-9a-f]{8}$/.test(id)) continue;
      idChecked++;
      const text = coll === 'titles' ? d.text : d.description;
      if (generateMetadataDocId(String(text ?? ''), String(d.persona ?? ''), String(d.bundleId ?? ''), String(d.gender ?? '')) === id) idMatched++;
    }
  }
  console.log(`    id scheme: ${idMatched}/${idChecked} bulk-uploaded live rows re-hash to their own id`);

  // ── 2. New rows ───────────────────────────────────────────────────────────
  const plan = { insert: { titles: 0, descriptions: 0 }, unchanged: { titles: 0, descriptions: 0 }, overwrite: { titles: 0, descriptions: 0 } };
  const ops: Array<(b: FirebaseFirestore.WriteBatch) => void> = [];
  const problems: string[] = [];
  const seenIds = new Set<string>();
  const momentCounts: Record<string, number> = {};

  for (const coll of ['titles', 'descriptions'] as const) {
    const file = path.join(CONTENT_DIR, coll === 'titles' ? 'new_titles.csv' : 'new_descriptions.csv');
    const rows = parseCsv(file);
    console.log(`\n[2] ${path.basename(file)}: ${rows.length} rows`);
    const colPath = coll === 'titles' ? TITLES_PATH : DESCRIPTIONS_PATH;
    rows.forEach((item, i) => {
      const rowProblems: string[] = [];
      const { id, data } = coll === 'titles' ? buildTitle(item, rowProblems) : buildDescription(item, rowProblems);
      if (seenIds.has(`${coll}/${id}`)) rowProblems.push(`duplicate doc id ${id} within the set`);
      seenIds.add(`${coll}/${id}`);
      if (rowProblems.length) { problems.push(`${coll} row ${i + 2} (${item.bundleId}): ${rowProblems.join('; ')}`); return; }
      const key = `${coll}:${data.situation ?? '-'}:${data.weather ?? '-'}`;
      momentCounts[key] = (momentCounts[key] ?? 0) + 1;
      const existing = live[coll].get(id);
      if (existing && sameContent(existing, data)) { plan.unchanged[coll]++; return; }
      if (existing) plan.overwrite[coll]++; else plan.insert[coll]++;
      ops.push(b => b.set(db.collection(colPath).doc(id), {
        ...data,
        ...(existing ? {} : { createdAt: FieldValue.serverTimestamp() }),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }));
    });
  }
  console.log(`    insert: ${plan.insert.titles} titles + ${plan.insert.descriptions} descriptions`);
  console.log(`    already identical (skipped): ${plan.unchanged.titles} titles + ${plan.unchanged.descriptions} descriptions`);
  console.log(`    overwrite (same id, different fields): ${plan.overwrite.titles} titles + ${plan.overwrite.descriptions} descriptions`);
  console.log(`    by collection:situation:weather → ${JSON.stringify(momentCounts)}`);

  // ── 3 + 4. Archive list: retags + archives ──────────────────────────────
  const archiveRows = parseCsv(path.join(CONTENT_DIR, 'archive_list.csv'));
  const toArchive = archiveRows.filter(r => r.suggested_action === 'archive');
  const toRetag = archiveRows.filter(r => r.suggested_action === 'retag');
  console.log(`\n[3] archive_list.csv: ${archiveRows.length} rows (${toArchive.length} archive, ${toRetag.length} retag)`);

  const collOf = (p: string) => (p.endsWith('/titles') ? 'titles' : 'descriptions') as 'titles' | 'descriptions';
  const retagIds = new Set(RETAGS.map(r => r.id));
  const csvRetagIds = new Set(toRetag.map(r => r.doc_id));
  const retagMismatch = Array.from(csvRetagIds).filter(id => !retagIds.has(id)).concat(Array.from(retagIds).filter(id => !csvRetagIds.has(id)));
  if (retagMismatch.length) problems.push(`RETAGS table out of sync with archive_list.csv: ${retagMismatch.join(', ')}`);

  let retagApplied = 0; let retagAlready = 0;
  for (const r of RETAGS) {
    const d = live[r.coll].get(r.id);
    if (!d) { problems.push(`retag ${r.coll}/${r.id}: doc not found`); continue; }
    if (Object.entries(r.set).every(([k, v]) => d[k] === v)) { retagAlready++; continue; }
    const drift = Object.entries(r.expect).filter(([k, v]) => (d[k] ?? undefined) !== v && !(v === '' && d[k] == null));
    if (drift.length) { problems.push(`retag ${r.coll}/${r.id}: live value drifted (${drift.map(([k]) => `${k}=${JSON.stringify(d[k])}`).join(', ')}) — skipped`); continue; }
    retagApplied++;
    const colPath = r.coll === 'titles' ? TITLES_PATH : DESCRIPTIONS_PATH;
    ops.push(b => b.update(db.collection(colPath).doc(r.id), { ...r.set, updatedAt: FieldValue.serverTimestamp() }));
  }
  console.log(`    field fixes: ${retagApplied} to apply, ${retagAlready} already applied`);

  const archiveCount = { titles: 0, descriptions: 0 }; let alreadyArchived = 0; let missing = 0;
  for (const r of toArchive) {
    const coll = collOf(r.collection);
    const d = live[coll].get(r.doc_id);
    if (!d) { missing++; continue; }
    if (!HARD_DELETE && d.archived === true) { alreadyArchived++; continue; }
    archiveCount[coll]++;
    const ref = db.collection(coll === 'titles' ? TITLES_PATH : DESCRIPTIONS_PATH).doc(r.doc_id);
    if (HARD_DELETE) ops.push(b => b.delete(ref));
    else ops.push(b => b.update(ref, {
      archived: true,
      archivedAt: FieldValue.serverTimestamp(),
      archivedReason: (r.reasons || '').slice(0, 500),
      ...(r.replaced_by ? { replacedBy: r.replaced_by } : {}),
    }));
  }
  console.log(`[4] ${HARD_DELETE ? 'delete' : 'archive'}: ${archiveCount.titles} titles + ${archiveCount.descriptions} descriptions` +
    ` (${alreadyArchived} already archived, ${missing} not found live)`);

  // ── Result ───────────────────────────────────────────────────────────────
  const liveAfter = {
    titles: titlesSnap.size + plan.insert.titles - (HARD_DELETE ? archiveCount.titles : 0),
    descriptions: descSnap.size + plan.insert.descriptions - (HARD_DELETE ? archiveCount.descriptions : 0),
  };
  const activeAfter = {
    titles: Array.from(live.titles.values()).filter(d => d.archived !== true).length + plan.insert.titles - archiveCount.titles,
    descriptions: Array.from(live.descriptions.values()).filter(d => d.archived !== true).length + plan.insert.descriptions - archiveCount.descriptions,
  };
  console.log(`\nafter import: ${liveAfter.titles} title docs (${activeAfter.titles} active), ${liveAfter.descriptions} description docs (${activeAfter.descriptions} active)`);
  console.log(`total write ops: ${ops.length}`);

  if (problems.length) {
    console.log(`\n⚠️  ${problems.length} problem(s):`);
    problems.forEach(p => console.log(`  - ${p}`));
  } else {
    console.log('\n✅ no problems');
  }

  if (!WRITE) {
    console.log('\nDRY RUN — nothing written. Re-run with --write --engine-deployed to apply.');
    return;
  }
  if (problems.length) {
    console.error('\nRefusing to write while there are problems.');
    process.exit(1);
  }
  await commitInBatches(db, ops, 'write');
  console.log('\n✅ import applied. Restore: re-run with the backup file above, or unset `archived` on a row in the admin.');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
