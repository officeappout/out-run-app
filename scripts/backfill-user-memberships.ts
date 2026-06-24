/**
 * scripts/backfill-user-memberships.ts
 *
 * Builds user_memberships/{uid}.groupIds from two sources (union):
 *   A. community_groups/{groupId}/members/{uid}  (canonical membership)
 *   B. users/{uid}.social.groupIds               (denormalized array — catches old joinGroup paths
 *                                                  that wrote social.groupIds but not the member doc)
 *
 * Run BEFORE deploying Firestore rules that gate group-mode presence reads on memberGroupIds(uid).
 *
 * Usage:
 *   DRY RUN (default — no writes):
 *     npx tsx scripts/backfill-user-memberships.ts
 *
 *   WRITE to Firestore:
 *     npx tsx scripts/backfill-user-memberships.ts --write
 *
 * Safe to re-run — arrayUnion is idempotent.
 */

import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const isDryRun = !process.argv.includes('--write');

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
}
const db = admin.firestore();

async function run() {
  console.log(isDryRun ? '🔍 DRY RUN — no writes. Pass --write to commit.' : '✍️  WRITE mode');
  console.log('');

  // ── Source A: community_groups/{groupId}/members/{uid} ───────────────────────
  console.log('Source A: reading community_groups/*/members ...');
  const groupsSnap = await db.collection('community_groups').get();
  console.log(`  ${groupsSnap.size} groups`);

  const pairsFromMembers = new Map<string, Set<string>>(); // uid → groupIds
  for (const groupDoc of groupsSnap.docs) {
    const membersSnap = await groupDoc.ref.collection('members').get();
    for (const memberDoc of membersSnap.docs) {
      const uid = memberDoc.id;
      if (!pairsFromMembers.has(uid)) pairsFromMembers.set(uid, new Set());
      pairsFromMembers.get(uid)!.add(groupDoc.id);
    }
  }
  const totalA = [...pairsFromMembers.values()].reduce((s, v) => s + v.size, 0);
  console.log(`  ${pairsFromMembers.size} uids, ${totalA} (uid, groupId) pairs`);

  // ── Source B: users/{uid}.social.groupIds ────────────────────────────────────
  console.log('Source B: reading users with social.groupIds ...');
  const usersSnap = await db
    .collection('users')
    .where('social.groupIds', '!=', null)
    .get();
  console.log(`  ${usersSnap.size} user docs with social.groupIds set`);

  const pairsFromUsers = new Map<string, Set<string>>(); // uid → groupIds
  for (const userDoc of usersSnap.docs) {
    const groupIds: string[] = userDoc.data()?.social?.groupIds ?? [];
    if (groupIds.length === 0) continue;
    pairsFromUsers.set(userDoc.id, new Set(groupIds));
  }
  const totalB = [...pairsFromUsers.values()].reduce((s, v) => s + v.size, 0);
  console.log(`  ${pairsFromUsers.size} uids, ${totalB} (uid, groupId) pairs`);

  // ── Union of both sources ────────────────────────────────────────────────────
  const allUids = new Set([...pairsFromMembers.keys(), ...pairsFromUsers.keys()]);
  const unionPairs = new Map<string, Set<string>>();
  for (const uid of allUids) {
    const merged = new Set([
      ...(pairsFromMembers.get(uid) ?? []),
      ...(pairsFromUsers.get(uid) ?? []),
    ]);
    unionPairs.set(uid, merged);
  }
  const totalUnion = [...unionPairs.values()].reduce((s, v) => s + v.size, 0);
  console.log('');
  console.log(`Union: ${allUids.size} uids, ${totalUnion} (uid, groupId) pairs`);

  // ── Check what's already in user_memberships ─────────────────────────────────
  console.log('');
  console.log('Checking existing user_memberships ...');
  const missing: Array<{ uid: string; groupId: string }> = [];

  for (const [uid, groupIds] of unionPairs) {
    const memSnap = await db.doc(`user_memberships/${uid}`).get();
    const existing: string[] = memSnap.exists ? (memSnap.data()?.groupIds ?? []) : [];
    for (const groupId of groupIds) {
      if (!existing.includes(groupId)) {
        missing.push({ uid, groupId });
      }
    }
  }

  console.log('');
  console.log(`─────────────────────────────────────────`);
  if (missing.length === 0) {
    console.log('✅ All user_memberships are up to date — no backfill needed');
    return;
  }

  console.log(`Pairs missing from user_memberships: ${missing.length}`);
  const missingUids = new Set(missing.map((p) => p.uid));
  console.log(`Affected uids: ${missingUids.size}`);
  console.log('');

  // Print sample (first 20)
  const sample = missing.slice(0, 20);
  console.log(`Sample (first ${sample.length}/${missing.length}):`);
  for (const { uid, groupId } of sample) {
    console.log(`  user_memberships/${uid}  ← groupId: ${groupId}`);
  }
  if (missing.length > 20) console.log(`  ... and ${missing.length - 20} more`);

  if (isDryRun) {
    console.log('');
    console.log('DRY RUN complete. Re-run with --write to commit these changes.');
    return;
  }

  // ── Write ────────────────────────────────────────────────────────────────────
  console.log('');
  console.log('Writing ...');
  const CHUNK = 400;
  let written = 0;
  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK);
    const batch = db.batch();
    for (const { uid, groupId } of chunk) {
      batch.set(
        db.doc(`user_memberships/${uid}`),
        {
          groupIds: FieldValue.arrayUnion(groupId),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    await batch.commit();
    written += chunk.length;
    console.log(`  ${written}/${missing.length} written`);
  }

  console.log('');
  console.log(`✅ Backfill complete — ${written} entries written to user_memberships`);
}

run().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
