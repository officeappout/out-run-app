/**
 * scripts/repair-social-groupids-from-memberships.ts
 *
 * One-time repair: the 08.09.2026 combined delete-cleanup run's
 * deleteGroup() had a bug in its users/{uid}.social.groupIds write (fixed
 * in community.service.ts — see that commit) that wiped the entire array
 * for any user with more than just the deleted group's id in it.
 * user_memberships/{uid}.groupIds used a correct write shape throughout
 * and stayed intact — it is the verified source of truth for what each
 * affected user's social.groupIds should currently contain.
 *
 * Restores exactly 5 real users (found by cross-referencing all 16 users
 * touched by that run against their intact user_memberships doc):
 * W0ohGH3fRbMglCzi4Kkatf86Oxv1, Zz62HexHTFchSA1hkqc6py8sMub2 (both lost
 * their real membership in "הליכה שדרות", the Sderot group reassigned
 * earlier the same day), W2YFPNAo7GYw5Ls8v56FFKaBWDx2 (3 "מתוזמנות"
 * placeholder groups), nX2AM2HJ79WulFZ2F7jGoA4kDhl1 — David's own account
 * (4 "מתוזמנות" groups), thNspMJdokTvhhfJCdbkKBdsiGR2 ("הליכה בת״א").
 *
 * Write form verified on a synthetic doc before this script was written
 * (update() with a dotted path + a plain array value — not a FieldValue
 * sentinel, so the exact bug that hit the delete path doesn't apply here,
 * but the form itself was still confirmed working per David's new rule:
 * verify on synthetic data before touching anything real).
 *
 * SAFE BY DEFAULT: dry-run (no flags) prints exactly what each of the 5
 * users' social.groupIds would become, sourced fresh from their live
 * user_memberships doc. --confirm applies, then reads back and prints
 * the actual resulting content for all 5 — not "restored".
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';

function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

const DAMAGED_UIDS = [
  'W0ohGH3fRbMglCzi4Kkatf86Oxv1',
  'Zz62HexHTFchSA1hkqc6py8sMub2',
  'W2YFPNAo7GYw5Ls8v56FFKaBWDx2',
  'nX2AM2HJ79WulFZ2F7jGoA4kDhl1',
  'thNspMJdokTvhhfJCdbkKBdsiGR2',
];

async function main() {
  const confirm = process.argv.includes('--confirm');
  init();
  const adb = admin.firestore();

  console.log('=== Repair plan, sourced fresh from user_memberships (intact throughout) ===');
  const plan: { uid: string; correctGroupIds: string[]; currentSocial: string[] }[] = [];
  for (const uid of DAMAGED_UIDS) {
    const membershipDoc = await adb.collection('user_memberships').doc(uid).get();
    const userDoc = await adb.collection('users').doc(uid).get();
    const correctGroupIds: string[] = membershipDoc.data()?.groupIds ?? [];
    const currentSocial: string[] = userDoc.data()?.social?.groupIds ?? [];
    plan.push({ uid, correctGroupIds, currentSocial });
    console.log(`  ${uid}`);
    console.log(`    current social.groupIds: ${JSON.stringify(currentSocial)}`);
    console.log(`    will become:             ${JSON.stringify(correctGroupIds)}`);
  }

  if (!confirm) {
    console.log('\nDry run only — no writes performed. Re-run with --confirm to apply.');
    return;
  }

  console.log('\n--confirm passed. Backing up all 5 users\' current state before writing...');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const backupDir = path.join(__dirname, '_backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupData = [];
  for (const uid of DAMAGED_UIDS) {
    const userDoc = await adb.collection('users').doc(uid).get();
    backupData.push({ uid, userData: userDoc.data() });
  }
  fs.writeFileSync(path.join(backupDir, `social-groupids-repair-${Date.now()}.json`), JSON.stringify(backupData, null, 2));

  // Admin SDK direct write, not the client SDK: this is a pure data
  // repair (plain field set, no persona routing, no business logic to
  // exercise) — the write form itself was already verified synthetically
  // via the Admin SDK's update(), so there's no reason to fight the
  // dynamic dual-import artifact that hit the earlier client-SDK attempt.
  for (const p of plan) {
    await adb.collection('users').doc(p.uid).update({
      'social.groupIds': p.correctGroupIds,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`  ✅ ${p.uid} written`);
  }

  console.log('\n=== Post-repair verification — actual content, read fresh ===');
  for (const uid of DAMAGED_UIDS) {
    const userDoc = await adb.collection('users').doc(uid).get();
    const membershipDoc = await adb.collection('user_memberships').doc(uid).get();
    console.log(`\n  ${uid}`);
    console.log(`    users/${uid}.social.groupIds:        ${JSON.stringify(userDoc.data()?.social?.groupIds ?? [])}`);
    console.log(`    user_memberships/${uid}.groupIds:    ${JSON.stringify(membershipDoc.data()?.groupIds ?? [])}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
