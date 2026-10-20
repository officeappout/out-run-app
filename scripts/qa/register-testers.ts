/**
 * scripts/qa/register-testers.ts — puts the tester accounts of the mission files on the roster
 * demo_registry/testers { uids } (mintDemoTesterToken signs only uids listed there).
 * Owner-run, once (and again after adding a mission). Writes ONE document; nothing else.
 *
 *   npx tsx scripts/qa/register-testers.ts --project appout-1 --dry-run
 *   npx tsx scripts/qa/register-testers.ts --project appout-1 --confirm "רשום את הבודקים"
 *
 * Same target rules as scripts/demo (explicit --project, FIREBASE_SERVICE_ACCOUNT_KEY from
 * .env.local whose project matches, or --emulator). The demo purge removes demo_registry
 * (this roster included).
 */
import { FieldValue } from 'firebase-admin/firestore';
import { DEMO_REGISTRY, DEMO_TESTERS_DOC } from '@/lib/demo-control/paths';
import { closeDemoTarget, describeDemoTarget, loadEnvLocal, openDemoTarget, parseDemoArgs, requireConfirm } from '../demo/lib/target';
import { loadPersonasAndMissions } from './lib/files';
import { isTesterUid } from './lib/demo-guard';

export const REGISTER_CONFIRM_PHRASE = 'רשום את הבודקים';

async function main() {
  const args = parseDemoArgs(process.argv.slice(2));
  const { missions } = loadPersonasAndMissions();
  const uids = Array.from(new Set(missions.map((m) => m.uid))).sort();
  if (!uids.every(isTesterUid)) throw new Error('a mission uid is not demo_qa_*');
  console.log(`בודקים: ${uids.join(', ')}`);
  if (args.dryRun) return;
  await loadEnvLocal();
  requireConfirm(args, REGISTER_CONFIRM_PHRASE, 'רישום הבודקים');
  const t = await openDemoTarget(args);
  try {
    console.log(`יעד: ${describeDemoTarget(t)}`);
    await t.db.collection(DEMO_REGISTRY).doc(DEMO_TESTERS_DOC).set({ uids: FieldValue.arrayUnion(...uids), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    console.log('נרשם.');
  } finally {
    await closeDemoTarget(t);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
