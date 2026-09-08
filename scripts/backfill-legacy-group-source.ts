/**
 * scripts/backfill-legacy-group-source.ts
 *
 * One-time backfill: sets `source` on the 35 community_groups docs that
 * predate the field (source undefined). Classification rule, agreed with
 * David 08.09.2026 — NOT a heuristic on isOfficial (all 35 have
 * isOfficial:false, so that signal is useless here): cross-reference each
 * doc's createdBy against the REAL `users` collection's role:'admin' set.
 * createdBy is an admin uid -> 'authority' (David's own testing, same
 * treatment as every panel/import-created group). createdBy is a regular
 * user -> 'user' (genuinely created via the in-app wizard).
 *
 * Applied without exception, per David's explicit instruction — including
 * two odd, test-looking names ("קק", "עממ") both created by his own admin
 * account, classified 'authority' by the same rule as everything else, no
 * special-casing.
 *
 * Pre-checked before this script was written: 0 of the 35 have a
 * createdBy pointing to a deleted/missing user doc — no ambiguous rows.
 *
 * Writes through updateGroup() (community.service.ts), the same single
 * write path as every other write, authenticated as David's real admin
 * account via a short-lived custom token. source is not one of
 * AUDIENCE_SENSITIVE_FIELDS, so this never touches any persona-gated copy.
 *
 * SAFE BY DEFAULT: dry-run (no flags) prints every row's id/name/createdBy/
 * proposed source. --confirm applies. Idempotent: a doc whose source is
 * already set (by this script or otherwise) is skipped, not re-written.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';
import { signInWithCustomToken } from 'firebase/auth';

function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

const ADMIN_UID = 'nX2AM2HJ79WulFZ2F7jGoA4kDhl1'; // David's own real admin account

async function main() {
  const confirm = process.argv.includes('--confirm');
  init();
  const adb = admin.firestore();

  const adminUsersSnap = await adb.collection('users').where('role', '==', 'admin').get();
  const adminUids = new Set(adminUsersSnap.docs.map((d) => d.id));

  const snap = await adb.collection('community_groups').get();
  const legacy = snap.docs.filter((d) => !d.data().source);

  console.log(`Legacy docs (source undefined): ${legacy.length}\n`);

  const plan: { id: string; name: string; createdBy: string; proposed: 'authority' | 'user' }[] = [];
  for (const d of legacy) {
    const data = d.data();
    const createdBy = data.createdBy ?? '';
    const proposed: 'authority' | 'user' = adminUids.has(createdBy) ? 'authority' : 'user';
    plan.push({ id: d.id, name: data.name ?? '(no name)', createdBy, proposed });
    console.log(`  ${d.id}  "${data.name}"  createdBy=${createdBy}  → ${proposed}`);
  }

  const authorityCount = plan.filter((p) => p.proposed === 'authority').length;
  const userCount = plan.filter((p) => p.proposed === 'user').length;
  console.log(`\n── SUMMARY ── total: ${plan.length}  → authority: ${authorityCount}  → user: ${userCount}`);

  if (!confirm) {
    console.log('\nDry run only — no writes performed. Re-run with --confirm to apply.');
    return;
  }

  console.log('\n--confirm passed. Backing up all 35 docs before writing...');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const backupDir = path.join(__dirname, '_backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupData = legacy.map((d) => ({ id: d.id, ...d.data() }));
  fs.writeFileSync(path.join(backupDir, `legacy-source-backfill-${Date.now()}.json`), JSON.stringify(backupData, null, 2));

  const { auth } = await import('@/lib/firebase');
  const { updateGroup } = await import('@/features/admin/services/community.service');
  const token = await admin.auth().createCustomToken(ADMIN_UID);
  await signInWithCustomToken(auth, token);
  console.log('Signed in as admin:', auth.currentUser?.uid);

  let updated = 0;
  for (const p of plan) {
    // Idempotency: re-check live state right before writing, in case
    // something else touched this doc between dry-run and --confirm.
    const fresh = await adb.collection('community_groups').doc(p.id).get();
    if (fresh.data()?.source) { console.log(`  ⏭️  ${p.id}: source already set to "${fresh.data()?.source}" — skipping`); continue; }
    await updateGroup(p.id, { source: p.proposed }, []);
    console.log(`  ✅ ${p.id} → source = ${p.proposed}`);
    updated++;
  }
  await auth.signOut();

  console.log(`\nDone. ${updated} groups updated.`);

  let verifiedOk = 0;
  for (const p of plan) {
    const after = await adb.collection('community_groups').doc(p.id).get();
    if (after.data()?.source === p.proposed) verifiedOk++;
    else console.log(`  ⚠️  ${p.id}: expected source=${p.proposed}, found ${after.data()?.source}`);
  }
  console.log(`Post-write verification: ${verifiedOk}/${plan.length} groups confirmed with the correct source.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
