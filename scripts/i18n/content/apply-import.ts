// @ts-nocheck -- standalone tsx script
/**
 * GUARDED production write: ONLY the target-language slots of exercises, exactly like the admin importer
 * (applyBulkTranslations / importTranslationJSON). OWNER GATE: the owner approves the run.
 *
 *   npx tsx scripts/i18n/content/apply-import.ts --import work/es/import.json --export work/es/export.json   # dry run (reads only)
 *   npx tsx scripts/i18n/content/apply-import.ts --import ... --export ... --confirm-production              # writes
 *
 * Writes need --confirm-production. Order: (1) refuse unless verify-import passes (--require-complete optional),
 * (2) read live docs, skip any whose source text or structure changed since the export, (3) full backup of every doc to
 * be touched (backups/i18n-exercises-<ts>.json; abort if it cannot be written), (4) write batches of 400 with
 * update(patch + updatedAt), (5) re-read and verify: source slots unchanged, target equals import, nothing else changed.
 */
import fs from 'fs';
import path from 'path';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, argOf } from './admin';
import { buildPatch, sourceDrift, validateBulkFile, verifyApplied, verifyImport } from './exercise-bulk';

const BATCH = 400;

async function main() {
  const impPath = argOf('--import');
  const expPath = argOf('--export');
  if (!impPath || !expPath) { console.error('usage: apply-import.ts --import <f> --export <f> [--confirm-production] [--require-complete] [--backup-dir dir]'); process.exit(2); }
  const confirm = process.argv.includes('--confirm-production');
  const imp = validateBulkFile(JSON.parse(fs.readFileSync(impPath, 'utf8')));
  const exp = validateBulkFile(JSON.parse(fs.readFileSync(expPath, 'utf8')));
  const tgt = imp.targetLang;
  if (tgt === 'he' || tgt === imp.sourceLang || tgt === exp.sourceLang) { console.error(`refusing: targetLang "${tgt}" must not be he or the source language`); process.exit(1); }

  const issues = verifyImport(exp, imp, { requireComplete: process.argv.includes('--require-complete') });
  if (issues.length) { for (const i of issues.slice(0, 50)) console.error(`${i.check} ${i.exerciseId} ${i.path}: ${i.message}`); console.error(`verify-import failed (${issues.length}); nothing written`); process.exit(1); }

  const db = adminDb();
  const live = new Map<string, any>();
  const readTime = new Map<string, string>();
  for (const p of imp.exercises) { const s = await db.collection('exercises').doc(p.exerciseId).get(); if (s.exists) { live.set(p.exerciseId, s.data()); readTime.set(p.exerciseId, s.updateTime.toDate().toISOString()); } }

  const tasks: Array<{ id: string; patch: any; before: any; payload: any }> = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  for (const p of imp.exercises) {
    const before = live.get(p.exerciseId);
    if (!before) { skipped.push({ id: p.exerciseId, reason: 'not found in Firestore' }); continue; }
    const drift = sourceDrift(before, p, tgt);
    if (drift.length) { skipped.push({ id: p.exerciseId, reason: `source changed since export: ${drift[0]}` }); continue; }
    tasks.push({ id: p.exerciseId, patch: buildPatch(before, p, tgt), before, payload: p });
  }
  console.log(`${tasks.length} exercises to write, ${skipped.length} skipped`);
  for (const s of skipped.slice(0, 30)) console.log(`SKIP ${s.id}: ${s.reason}`);
  if (!confirm) { console.log('dry run: nothing written (add --confirm-production to write)'); return; }

  const dir = argOf('--backup-dir') ?? 'backups';
  fs.mkdirSync(dir, { recursive: true });
  const backup = path.join(dir, `i18n-exercises-${tgt}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backup, JSON.stringify(Object.fromEntries(tasks.map((t) => [t.id, t.before])), null, 2));
  if (!fs.existsSync(backup) || fs.statSync(backup).size === 0) throw new Error('backup not written; aborting');
  console.log(`backup: ${backup}`);

  const written: typeof tasks = [];
  for (let i = 0; i < tasks.length; i += BATCH) {
    // Concurrent-edit guard: re-read right before the batch; skip any doc edited since the first read (source/counts/anything),
    // and pin the write to the fresh updateTime so a later edit makes Firestore reject it instead of being overwritten.
    const refs = tasks.slice(i, i + BATCH).map((t) => db.collection('exercises').doc(t.id));
    const fresh = await db.getAll(...refs);
    const batch = db.batch();
    fresh.forEach((snap, k) => {
      const t = tasks[i + k];
      const changed = !snap.exists || snap.updateTime.toDate().toISOString() !== readTime.get(t.id) || sourceDrift(snap.data(), t.payload, tgt).length > 0;
      if (changed) { skipped.push({ id: t.id, reason: 'edited concurrently before its batch; skipped' }); console.log(`SKIP ${t.id}: edited concurrently`); return; }
      batch.update(snap.ref, { ...t.patch, updatedAt: FieldValue.serverTimestamp() }, { lastUpdateTime: snap.updateTime });
      written.push(t);
    });
    await batch.commit();
    console.log(`committed batch ${i / BATCH + 1}`);
  }

  let bad = 0;
  for (const t of written) {
    const after = (await db.collection('exercises').doc(t.id).get()).data();
    const problems = verifyApplied(t.before, after, t.payload, tgt);
    if (problems.length) { bad++; console.error(`POST-VERIFY ${t.id}: ${problems.join('; ')}`); }
  }
  console.log(bad ? `post-verify FAILED for ${bad} exercises; restore from ${backup}` : `post-verify OK for ${written.length} exercises (${skipped.length} skipped in total)`);
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
