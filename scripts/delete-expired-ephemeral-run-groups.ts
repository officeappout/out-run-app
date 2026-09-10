/**
 * scripts/delete-expired-ephemeral-run-groups.ts
 *
 * One-time cleanup: the 19 (of 21) type:'ephemeral' community_groups docs
 * with 0-1 members, per David's decision (08.09.2026) to clean the
 * existing backlog through the full delete contract while the actual
 * migration to planned_sessions is deferred to after app-store launch.
 *
 * Explicitly EXCLUDED, per his standing "2+ members come to me first"
 * rule for this category: 5wJ66moZcncaLwpB2eh3 and WlrV1YO6VfEdeHi1nin1
 * (both 2 members, both real joins from ~2 months ago) — held out for
 * his individual decision, not included here.
 *
 * Uses the full deleteGroup() contract (community.service.ts) — main
 * doc, members, chats/group_{id}+messages (none of these 19 have a
 * chat), attendance+member_statuses, and arrayRemove(groupId) from every
 * member's social.groupIds/user_memberships.
 *
 * SAFE BY DEFAULT: dry-run (no flags) prints every row's current live
 * state. --confirm applies, then re-checks each doc immediately before
 * deleting it.
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

const ADMIN_UID = 'nX2AM2HJ79WulFZ2F7jGoA4kDhl1';

const TARGET_IDS = [
  '4C7x6ALCdqIGMvvhP75j', '4Ds9XlRPel93FRelfIN6', '4oBElRUK7TEjsuk74Kw9',
  '7lNIrMQ3nYVNKOIZtPji', '80qRbtwFsH9MS040viXI', '936xJAUtYgnIeIfcNUA0',
  '9SnLoWtfAG0LHr5VDe6x', 'AyqwH67xR0bzOSnmlEOJ', 'BPv2kYF7ti02cQAwCeRz',
  'Begyd76BDorr7B2IqkKn', 'MnFpg5rgGbL99YjlQQ4B', 'ShJgL88m8jAOfgDz5k5U',
  'Vq4d1uxUcwtMKXWhvB7H', 'cLklTOHgUcmFjYhfBTlj', 'ec2ljEvhsynkRi7ciA5Q',
  'f6QqFEGsnQkCin0w2Bar', 'nyEA7AnvJ1xeD7GY7nef', 'pGZIF2qmEMdzfHvjegqf',
  'pUQgscmxX8Oo10osvPpI',
];

async function main() {
  const confirm = process.argv.includes('--confirm');
  init();
  const adb = admin.firestore();

  console.log(`Target count: ${TARGET_IDS.length}\n`);

  const plan: { id: string; ok: boolean; reason?: string; name?: string; memberCount: number }[] = [];
  for (const id of TARGET_IDS) {
    const snap = await adb.collection('community_groups').doc(id).get();
    if (!snap.exists) { plan.push({ id, ok: false, reason: 'already gone', memberCount: 0 }); continue; }
    const data = snap.data()!;
    const membersSnap = await adb.collection('community_groups').doc(id).collection('members').get();
    if (data.type !== 'ephemeral') { plan.push({ id, ok: false, reason: `type is "${data.type}", not ephemeral — SKIP`, name: data.name, memberCount: membersSnap.size }); continue; }
    if (membersSnap.size > 1) { plan.push({ id, ok: false, reason: `memberCount drifted to ${membersSnap.size} — SKIP`, name: data.name, memberCount: membersSnap.size }); continue; }
    plan.push({ id, ok: true, name: data.name, memberCount: membersSnap.size });
  }

  console.log('=== Per-row check ===');
  for (const p of plan) {
    console.log(`  ${p.ok ? '✅' : '⛔'} ${p.id}  "${p.name ?? '?'}"  members=${p.memberCount}  ${p.reason ? `— ${p.reason}` : ''}`);
  }

  const okRows = plan.filter((p) => p.ok);
  console.log(`\n${okRows.length}/${plan.length} clear.`);

  if (!confirm) {
    console.log('\nDry run only — no writes performed. Re-run with --confirm to apply.');
    return;
  }
  if (okRows.length === 0) { console.log('\nNothing clear to delete.'); return; }

  console.log('\n--confirm passed. Backing up all target docs + members/attendance before writing...');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const backupDir = path.join(__dirname, '_backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupData = [];
  for (const p of okRows) {
    const groupDoc = await adb.collection('community_groups').doc(p.id).get();
    const membersSnap = await adb.collection('community_groups').doc(p.id).collection('members').get();
    const attendanceSnap = await adb.collection('community_groups').doc(p.id).collection('attendance').get();
    backupData.push({
      id: p.id,
      group: groupDoc.data(),
      members: membersSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      attendance: attendanceSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
  }
  fs.writeFileSync(path.join(backupDir, `ephemeral-run-groups-delete-${Date.now()}.json`), JSON.stringify(backupData, null, 2));

  const beforeCount = (await adb.collection('community_groups').where('type', '==', 'ephemeral').get()).size;

  const { auth } = await import('@/lib/firebase');
  const { deleteGroup } = await import('@/features/admin/services/community.service');
  const token = await admin.auth().createCustomToken(ADMIN_UID);
  await signInWithCustomToken(auth, token);
  console.log('Signed in as admin:', auth.currentUser?.uid);

  let deleted = 0;
  for (const p of okRows) {
    const fresh = await adb.collection('community_groups').doc(p.id).get();
    if (!fresh.exists) { console.log(`  ⏭️  ${p.id}: already gone — skipping`); continue; }
    const freshMembers = (await adb.collection('community_groups').doc(p.id).collection('members').get()).size;
    if (freshMembers > 1) {
      console.log(`  ⛔ ${p.id}: drifted to ${freshMembers} members since dry-run — STOPPING, not continuing further.`);
      break;
    }
    await deleteGroup(p.id);
    console.log(`  ✅ deleted ${p.id} "${p.name}"`);
    deleted++;
  }
  await auth.signOut();

  const afterCount = (await adb.collection('community_groups').where('type', '==', 'ephemeral').get()).size;
  console.log(`\nDone. ${deleted}/${okRows.length} deleted.`);
  console.log(`type:'ephemeral' groups: ${beforeCount} before -> ${afterCount} after`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
