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

  const issues = verifyImport(exp, imp, { requireComplete: process.argv.includes('--require-complete') });
  if (issues.length) { for (const i of issues.slice(0, 50)) console.error(`${i.check} ${i.exerciseId} ${i.path}: ${i.message}`); console.error(`verify-import failed (${issues.length}); nothing written`); process.exit(1); }

  const db = adminDb();
  const live = new Map<string, any>();
  for (const p of imp.exercises) { const s = await db.collection('exercises').doc(p.exerciseId).get(); if (s.exists) live.set(p.exerciseId, s.data()); }

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

  for (let i = 0; i < tasks.length; i += BATCH) {
    const batch = db.batch();
    for (const t of tasks.slice(i, i + BATCH)) batch.update(db.collection('exercises').doc(t.id), { ...t.patch, updatedAt: FieldValue.serverTimestamp() });
    await batch.commit();
    console.log(`committed ${Math.min(i + BATCH, tasks.length)}/${tasks.length}`);
  }

  let bad = 0;
  for (const t of tasks) {
    const after = (await db.collection('exercises').doc(t.id).get()).data();
    const problems = verifyApplied(t.before, after, t.payload, tgt);
    if (problems.length) { bad++; console.error(`POST-VERIFY ${t.id}: ${problems.join('; ')}`); }
  }
  console.log(bad ? `post-verify FAILED for ${bad} exercises; restore from ${backup}` : `post-verify OK for ${tasks.length} exercises`);
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
