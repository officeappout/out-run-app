// @ts-nocheck -- standalone tsx script
/**
 * GUARDED production write for <collection>-import.json (build-collection-import.ts). OWNER GATE: the owner approves each run.
 *
 *   npx tsx scripts/i18n/content/apply-collection-import.ts --import <c>-import.json --export export/<c>.json            # dry run (reads only)
 *   npx tsx scripts/i18n/content/apply-collection-import.ts --import ... --export ... --confirm-production               # writes
 *
 * Writes ONLY (a) the { he, en } value of the listed READY_PATHS fields of existing docs (the touched top-level field is replaced
 * whole, array items included; update pinned to the fresh updateTime) and (b) new `-en` documents (create(), fails if the id exists). Refuses targetLang he, any
 * non-ready path, any doc whose Hebrew changed or that already has English. Needs-code fields are never touched.
 * The collection may be a subcollection path (workoutMetadata/workoutTitles/titles); archived rows are skipped.
 * Order: verify -> read live -> drift check -> full backup of touched docs (abort if it cannot be written) -> write -> re-read + verify.
 */
import fs from 'fs';
import path from 'path';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, argOf } from './admin';
import { applyWrites, collectionFileKey, getAtPath, hebrewAt, liveDrift, topKey, verifyCreates, verifyImport } from './collection-bulk';

const BATCH = 400;
async function main() {
  const impPath = argOf('--import'), expPath = argOf('--export');
  if (!impPath || !expPath) { console.error('usage: apply-collection-import.ts --import <f> --export <f> [--confirm-production] [--backup-dir dir]'); process.exit(2); }
  const confirm = process.argv.includes('--confirm-production');
  const imp = JSON.parse(fs.readFileSync(impPath, 'utf8'));
  const exp = JSON.parse(fs.readFileSync(expPath, 'utf8'));
  if (imp.targetLang !== 'en') { console.error(`refusing: targetLang "${imp.targetLang}" must be en`); process.exit(1); }
  const col = imp.collection;
  const scoped = col === 'site_content' ? { ...exp, fields: exp.fields.filter((x) => !x.id.startsWith('faq-')) } : exp;
  const db = adminDb();
  const existingIds = new Set<string>();
  for (const c of imp.creates ?? []) if ((await db.collection(col).doc(c.docId).get()).exists) existingIds.add(c.docId);
  const issues = [...verifyImport(scoped, imp), ...verifyCreates(col, imp.creates ?? [], existingIds)];
  if (issues.length) { for (const i of issues.slice(0, 50)) console.error(`${i.check} ${i.docId} ${i.path}: ${i.message}`); console.error(`verify failed (${issues.length}); nothing written`); process.exit(1); }

  const byDoc = new Map<string, typeof imp.writes>();
  for (const w of imp.writes) byDoc.set(w.docId, [...(byDoc.get(w.docId) ?? []), w]);
  const live = new Map<string, any>(), readTime = new Map<string, string>();
  const ids = Array.from(byDoc.keys());
  for (let i = 0; i < ids.length; i += 300) { // batched live reads (getAll), not one get() per doc
    for (const s of await db.getAll(...ids.slice(i, i + 300).map((id) => db.collection(col).doc(id)))) {
      if (s.exists) { live.set(s.id, s.data()); readTime.set(s.id, s.updateTime.toDate().toISOString()); }
    }
  }
  const tasks: Array<{ id: string; ws: any[]; patch: Record<string, unknown> }> = [];
  const skipped: string[] = [];
  for (const [id, ws] of byDoc) {
    const before = live.get(id);
    if (!before) { skipped.push(`${id}: not found`); continue; }
    const bad = ws.map((w) => liveDrift(before, w)).find(Boolean);
    if (bad) { skipped.push(`${id}: ${bad}`); continue; }
    tasks.push({ id, ws, patch: applyWrites(before, ws) });
  }
  console.log(`${tasks.length} docs to update, ${(imp.creates ?? []).length} docs to create, ${skipped.length} skipped`);
  for (const s of skipped.slice(0, 30)) console.log(`SKIP ${s}`);
  if (!confirm) { console.log('dry run: nothing written (add --confirm-production to write)'); return; }

  const dir = argOf('--backup-dir') ?? 'backups';
  fs.mkdirSync(dir, { recursive: true });
  const backup = path.join(dir, `i18n-${collectionFileKey(col)}-en-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backup, JSON.stringify({ updated: Object.fromEntries(tasks.map((t) => [t.id, live.get(t.id)])), created: (imp.creates ?? []).map((c) => c.docId) }, null, 2));
  if (!fs.existsSync(backup) || fs.statSync(backup).size === 0) throw new Error('backup not written; aborting');
  console.log(`backup: ${backup} (restore: write "updated" docs back, delete "created" ids)`);

  const done: typeof tasks = [];
  for (let i = 0; i < tasks.length; i += BATCH) {
    const fresh = await db.getAll(...tasks.slice(i, i + BATCH).map((t) => db.collection(col).doc(t.id)));
    const batch = db.batch();
    fresh.forEach((snap, k) => {
      const t = tasks[i + k];
      const changed = !snap.exists || snap.updateTime.toDate().toISOString() !== readTime.get(t.id) || t.ws.some((w) => liveDrift(snap.data(), w));
      if (changed) { console.log(`SKIP ${t.id}: edited concurrently`); return; }
      batch.update(snap.ref, { ...applyWrites(snap.data(), t.ws), updatedAt: FieldValue.serverTimestamp() }, { lastUpdateTime: snap.updateTime });
      done.push(t);
    });
    await batch.commit();
  }
  for (const c of imp.creates ?? []) await db.collection(col).doc(c.docId).create({ ...c.data, updatedBy: 'i18n-content-en-batch2', updatedAt: FieldValue.serverTimestamp() });

  let bad = 0;
  for (const t of done) {
    const after = (await db.collection(col).doc(t.id).get()).data();
    for (const w of t.ws) {
      const v = getAtPath(after, w.path) as any;
      if (hebrewAt(after, w.path) !== w.he || v?.en !== w.en) { bad++; console.error(`POST-VERIFY ${t.id} ${w.path}`); }
    }
    const before = live.get(t.id);
    const expected = applyWrites(before, t.ws);
    for (const k of Object.keys(before)) {
      if (k === 'updatedAt') continue;
      const want = k in expected ? expected[k] : before[k];
      if (JSON.stringify(want) !== JSON.stringify(after[k])) { bad++; console.error(`POST-VERIFY ${t.id}: field ${k} differs from the plan`); }
    }
  }
  for (const c of imp.creates ?? []) if (!(await db.collection(col).doc(c.docId).get()).exists) { bad++; console.error(`POST-VERIFY ${c.docId} missing`); }
  console.log(bad ? `post-verify FAILED (${bad}); restore from ${backup}` : `post-verify OK: ${done.length} updated, ${(imp.creates ?? []).length} created`);
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
