/**
 * scripts/_migrate-persona-content-relabel.ts — relabels the `persona` field
 * across every real, admin-authored `workoutMetadata/*` content library
 * (notifications, titles, descriptions, cues — all authored via
 * `src/app/admin/workout-settings/page.tsx`) onto the canonical 7-value
 * `PersonaId` vocabulary from the 01.09.2026 persona-model redefinition
 * (docs/research/military-persona-unified-architecture.md, branch
 * chore/persona-content-relabel — part ג of the approved plan).
 *
 * SCOPE NOTE: the plan's part ג named only `notifications` (219 docs). A
 * live rescan while executing branch 3 found the SAME legacy vocabulary,
 * confirmed live via `workout-metadata.service.ts`'s `scoredFetch` (real
 * callers: StrengthOverviewCard.tsx, ExerciseDetailView.tsx), on 3 more
 * sibling collections the plan didn't enumerate — extended to cover all 4
 * rather than leave 558 more docs half-migrated. `motivationalPhrases/phrases`
 * has 0 docs — included for completeness, never actually has anything to do.
 *
 * `resolveCanonicalPersona`/`normalizePersonaValue` (persona-alias-map.service.ts,
 * both copies) already alias these legacy values at READ time, so nothing is
 * broken today — this script closes the gap so the stored data matches the
 * vocabulary the rest of the codebase now speaks, rather than depending on
 * the alias map forever as a permanent crutch.
 *
 * Mapping (verified against a live read of all docs, 01.09.2026):
 *   senior -> vatikim
 *   high_tech -> office_worker
 *   reservist, army_combat, army_job -> military
 * Left AS-IS (already canonical or intentionally generic-matching):
 *   parent, student, office_worker, generic, 'any', '' (empty)
 * No live doc uses soldier/active_soldier/athlete/young_pro/home_worker —
 * confirmed via the same read; nothing to map for them.
 *
 * SAFE BY DEFAULT: no flags = backup + dry-run plan only, zero writes.
 * --confirm executes. Idempotent: re-running after success finds nothing
 * left to relabel (already run once for `notifications` on 01.09.2026 —
 * this run is a no-op for that path, real work only on the 3 new paths).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';

function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

const COLLECTION_PATHS = [
  'workoutMetadata/notifications/notifications',
  'workoutMetadata/workoutTitles/titles',
  'workoutMetadata/smartDescriptions/descriptions',
  'workoutMetadata/motivationalPhrases/phrases',
  'workoutMetadata/logicCues/cues',
];

const RELABEL_MAP: Record<string, string> = {
  senior: 'vatikim',
  high_tech: 'office_worker',
  reservist: 'military',
  army_combat: 'military',
  army_job: 'military',
};

async function backup(collectionPath: string, docs: admin.firestore.QueryDocumentSnapshot[]) {
  const out = docs.map((d) => ({ path: d.ref.path, data: d.data() }));
  const dir = path.join(__dirname, '_backups');
  fs.mkdirSync(dir, { recursive: true });
  const safeName = collectionPath.replace(/\//g, '_');
  const file = path.join(dir, `persona-content-relabel-${safeName}-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf-8');
  return file;
}

function isLegacy(d: admin.firestore.QueryDocumentSnapshot): boolean {
  const persona = (d.data() as any).persona;
  return typeof persona === 'string' && RELABEL_MAP[persona] !== undefined;
}

async function main() {
  init();
  const db = admin.firestore();
  const confirm = process.argv.includes('--confirm');

  let totalTargets = 0;
  let totalRemaining = 0;

  for (const collectionPath of COLLECTION_PATHS) {
    console.log(`\n========== ${collectionPath} ==========`);
    const snap = await db.collection(collectionPath).get();
    const targets = snap.docs.filter(isLegacy);
    console.log(`scanned ${snap.size} doc(s), ${targets.length} need relabeling`);

    if (targets.length === 0) {
      console.log('Already clean — nothing to do.');
      continue;
    }
    totalTargets += targets.length;

    const backupFile = await backup(collectionPath, targets);
    console.log(`✅ backup written: ${backupFile}`);

    const counts: Record<string, number> = {};
    for (const doc of targets) {
      const from = (doc.data() as any).persona as string;
      const to = RELABEL_MAP[from];
      counts[`${from} -> ${to}`] = (counts[`${from} -> ${to}`] || 0) + 1;
    }
    console.log('RELABEL PLAN (dry-run unless --confirm):');
    Object.entries(counts).forEach(([k, v]) => console.log(`  ${k}: ${v} doc(s)`));

    if (!confirm) {
      console.log('DRY RUN ONLY — no writes performed for this collection.');
      continue;
    }

    console.log('--confirm passed — executing relabel now.');
    const BATCH_SIZE = 400;
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = targets.slice(i, i + BATCH_SIZE);
      for (const doc of chunk) {
        const from = (doc.data() as any).persona as string;
        batch.update(doc.ref, { persona: RELABEL_MAP[from] });
      }
      await batch.commit();
      console.log(`  committed batch ${i / BATCH_SIZE + 1} (${chunk.length} docs)`);
    }
    console.log('✅ relabel committed for this collection.');

    const after = await db.collection(collectionPath).get();
    const remaining = after.docs.filter(isLegacy);
    totalRemaining += remaining.length;
    console.log(`sanity check: ${remaining.length} doc(s) still legacy (expect 0).`);
    if (remaining.length > 0) {
      console.error('❌ SANITY CHECK FAILED for this collection:', remaining.map((d) => d.id));
    }
  }

  console.log(`\n=== TOTAL: ${totalTargets} doc(s) targeted across all collections${confirm ? `, ${totalRemaining} still legacy after write (expect 0)` : ' (dry run)'} ===`);
  process.exit(0);
}
main().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
