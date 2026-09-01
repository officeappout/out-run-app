/**
 * scripts/_migrate-persona-consolidation.ts — throwaway.
 *
 * Phase 2 of docs/research/military-persona-unified-architecture.md:
 * for every user with personaId/onboardingAnswers.persona in
 * {reservist, soldier}, writes a new `militaryStatus` field
 * ('reservist'->'reserve', 'soldier'->'regular') WITHOUT touching the
 * original persona string fields (additive-only, per the report's
 * "alias, don't rename" decision — content-gating call sites keep working
 * unmodified).
 *
 * Modes:
 *   (no flags)              dry-run: backup + print plan, zero writes
 *   --confirm               backup, then execute the writes
 *   --restore <backupFile>  restore every doc in that backup to its exact
 *                           prior content (used to rehearse/verify reversibility)
 *
 * Connects to whatever FIRESTORE_EMULATOR_HOST points at if set (for
 * rehearsal), otherwise real production Firestore via the service account.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';

function init() {
  if (admin.apps.length) return;
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    admin.initializeApp({ projectId: 'appout-1' });
  } else {
    const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
    admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  }
}

const PERSONA_TO_STATUS: Record<string, 'reserve' | 'regular'> = {
  reservist: 'reserve',
  soldier: 'regular',
};

async function findTargetUsers(db: admin.firestore.Firestore) {
  const targets: admin.firestore.QueryDocumentSnapshot[] = [];
  for (const persona of Object.keys(PERSONA_TO_STATUS)) {
    const snap = await db.collection('users').where('personaId', '==', persona).get();
    targets.push(...snap.docs);
  }
  // dedupe by id
  const seen = new Set<string>();
  return targets.filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)));
}

async function backup(db: admin.firestore.Firestore, users: admin.firestore.QueryDocumentSnapshot[]) {
  const out = users.map((d) => ({ path: d.ref.path, data: d.data() }));
  const dir = path.join(__dirname, '_backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `persona-consolidation-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf-8');
  return file;
}

async function restore(db: admin.firestore.Firestore, backupFile: string) {
  const raw = JSON.parse(fs.readFileSync(backupFile, 'utf-8')) as { path: string; data: any }[];
  const batch = db.batch();
  for (const entry of raw) {
    batch.set(db.doc(entry.path), entry.data);
  }
  await batch.commit();
  console.log(`✅ restored ${raw.length} doc(s) from ${backupFile}`);
}

async function execute(db: admin.firestore.Firestore, users: admin.firestore.QueryDocumentSnapshot[]) {
  const batch = db.batch();
  for (const doc of users) {
    const persona = (doc.data() as any).personaId;
    const status = PERSONA_TO_STATUS[persona];
    if (!status) continue;
    batch.update(doc.ref, { militaryStatus: status });
  }
  await batch.commit();
  console.log(`✅ migrated ${users.length} user(s).`);
}

async function main() {
  init();
  const db = admin.firestore();
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const restoreIdx = args.indexOf('--restore');

  if (restoreIdx !== -1) {
    const file = args[restoreIdx + 1];
    if (!file) throw new Error('--restore requires a file path');
    await restore(db, file);
    process.exit(0);
  }

  const targets = await findTargetUsers(db);
  console.log(`found ${targets.length} user(s) with personaId in {reservist, soldier}`);
  targets.forEach((d) => console.log(`  ${d.id}: personaId=${(d.data() as any).personaId}, militaryStatus(current)=${(d.data() as any).militaryStatus ?? '(none)'}`));

  const backupFile = await backup(db, targets);
  console.log(`\n✅ backup written: ${backupFile}`);

  if (!confirm) {
    console.log('\nDRY RUN ONLY — no writes performed. Re-run with --confirm to execute.');
    process.exit(0);
  }

  await execute(db, targets);
  process.exit(0);
}
main().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
