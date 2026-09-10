/**
 * Runner for tests/group-delete-contract-parity.ts, executed via
 * `npx tsx functions/_parity-runner.ts <groupId>` from the repo root.
 *
 * Lives inside functions/ (but NOT functions/src — functions/tsconfig.json
 * only includes "src", so this is never compiled or deployed) purely so
 * Node's module resolution finds functions/node_modules/firebase-admin,
 * not the repo root's copy. Mixing the two in one process is exactly the
 * dual-package-instance bug this whole file exists to route around: a
 * FieldValue sentinel created by one firebase-admin installation isn't
 * recognized by a Firestore batch call belonging to another.
 *
 * Not part of the deployed function — deleted after the parity test
 * proves out, or kept as the test's dependency if it's re-run later.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local', override: true });
import * as admin from 'firebase-admin';

function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

async function main() {
  const groupId = process.argv[2];
  if (!groupId) throw new Error('usage: tsx functions/_parity-runner.ts <groupId>');
  // Explicit init BEFORE importing cleanupEphemeralDocs.ts — that module's
  // own top-level `if (!admin.apps.length) admin.initializeApp()` (bare,
  // no credentials — correct for the real Cloud Functions runtime, which
  // provides ambient credentials) would otherwise win the race and leave
  // no way to auto-detect a project id outside that runtime.
  init();
  const { deleteGroupContractAdminSdk } = await import('./src/cleanupEphemeralDocs');
  const db = admin.firestore();
  const outcome = await deleteGroupContractAdminSdk(db, groupId, { dryRun: false });
  console.log(JSON.stringify(outcome));
}

main().then(() => process.exit(0)).catch((e) => { console.error('RUNNER ERROR:', e); process.exit(1); });
