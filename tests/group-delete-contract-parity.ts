/**
 * Group-delete contract parity test.
 *
 * Two independent implementations of the same delete contract exist —
 * community.service.ts's client-SDK deleteGroup() (browser admin panel)
 * and cleanupEphemeralDocs.ts's Admin-SDK deleteGroupContractAdminSdk()
 * (the hourly ephemeral-group sweep) — because Cloud Functions can't
 * import the Next.js app's client-SDK code, and a shared-module approach
 * was tested and found to silently break the functions deploy's output
 * layout (see cleanupEphemeralDocs.ts's own comment for the full record).
 *
 * This test is the substitute for shared code, per David's condition
 * (08.09.2026): run both implementations against a structurally
 * identical synthetic fixture and assert the resulting state matches —
 * same documents gone, same fields cleaned, same arrays reduced. A
 * future change to one implementation that isn't mirrored in the other
 * fails this test instead of silently drifting.
 *
 * Runs against PRODUCTION using disposable, clearly-marked synthetic
 * fixtures (same methodology used throughout this session's own
 * verification work) — not the Firestore emulator, which would need a
 * second, auth-emulator wiring this repo has never set up for
 * client-SDK custom-token sign-in. Every fixture is deleted by the test
 * itself; nothing is left behind regardless of pass/fail.
 *
 * Run: npx tsx tests/group-delete-contract-parity.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';
import { signInWithCustomToken } from 'firebase/auth';
import { execFileSync } from 'node:child_process';

function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

const ADMIN_UID = 'nX2AM2HJ79WulFZ2F7jGoA4kDhl1';

type Fixture = {
  groupId: string;
  memberUid: string;
  unrelatedGroupId: string;
};

async function seedFixture(adb: admin.firestore.Firestore, tag: string): Promise<Fixture> {
  const groupId = `_paritytest_group_${tag}`;
  const memberUid = `_paritytest_member_${tag}`;
  const unrelatedGroupId = `_paritytest_unrelated_${tag}`;

  await adb.collection('community_groups').doc(groupId).set({
    name: `PARITY TEST ${tag}`, type: 'ephemeral', isActive: true, memberCount: 1,
  });
  await adb.collection('community_groups').doc(groupId).collection('members').doc(memberUid).set({ uid: memberUid, role: 'admin' });
  await adb.collection('community_groups').doc(groupId).collection('attendance').doc('att1').set({ groupId, attendees: [memberUid] });
  await adb.collection('community_groups').doc(groupId).collection('attendance').doc('att1').collection('member_statuses').doc(memberUid).set({ status: 'ready' });
  await adb.collection('chats').doc(`group_${groupId}`).set({ type: 'group', groupId, participants: [memberUid] });
  await adb.collection('chats').doc(`group_${groupId}`).collection('messages').doc('msg1').set({ text: 'hi', senderId: memberUid });
  await adb.collection('users').doc(memberUid).set({ social: { groupIds: [unrelatedGroupId, groupId] } });
  await adb.collection('user_memberships').doc(memberUid).set({ groupIds: [unrelatedGroupId, groupId] });

  return { groupId, memberUid, unrelatedGroupId };
}

async function readResultState(adb: admin.firestore.Firestore, f: Fixture) {
  const groupDoc = await adb.collection('community_groups').doc(f.groupId).get();
  const membersSnap = await adb.collection('community_groups').doc(f.groupId).collection('members').get();
  const attendanceSnap = await adb.collection('community_groups').doc(f.groupId).collection('attendance').get();
  const statusesSnap = await adb.collection('community_groups').doc(f.groupId).collection('attendance').doc('att1').collection('member_statuses').get();
  const chatDoc = await adb.collection('chats').doc(`group_${f.groupId}`).get();
  const messagesSnap = await adb.collection('chats').doc(`group_${f.groupId}`).collection('messages').get();
  const userDoc = await adb.collection('users').doc(f.memberUid).get();
  const membershipDoc = await adb.collection('user_memberships').doc(f.memberUid).get();

  return {
    groupExists: groupDoc.exists,
    memberCount: membersSnap.size,
    attendanceCount: attendanceSnap.size,
    memberStatusesCount: statusesSnap.size,
    chatExists: chatDoc.exists,
    messagesCount: messagesSnap.size,
    socialGroupIds: (userDoc.data()?.social?.groupIds ?? []).sort(),
    membershipGroupIds: (membershipDoc.data()?.groupIds ?? []).sort(),
  };
}

async function cleanupFixture(adb: admin.firestore.Firestore, f: Fixture) {
  await adb.collection('community_groups').doc(f.groupId).collection('attendance').doc('att1').collection('member_statuses').doc(f.memberUid).delete();
  await adb.collection('community_groups').doc(f.groupId).collection('attendance').doc('att1').delete();
  await adb.collection('community_groups').doc(f.groupId).collection('members').doc(f.memberUid).delete();
  await adb.collection('community_groups').doc(f.groupId).delete();
  await adb.collection('chats').doc(`group_${f.groupId}`).collection('messages').doc('msg1').delete();
  await adb.collection('chats').doc(`group_${f.groupId}`).delete();
  await adb.collection('users').doc(f.memberUid).delete();
  await adb.collection('user_memberships').doc(f.memberUid).delete();
}

async function main() {
  init();
  const adb = admin.firestore();

  console.log('Seeding two structurally identical fixtures...');
  const fixtureClient = await seedFixture(adb, 'client');
  const fixtureAdmin = await seedFixture(adb, 'admin');

  try {
    console.log('\n--- Running client-SDK deleteGroup() on fixtureClient ---');
    const { auth } = await import('@/lib/firebase');
    const { deleteGroup } = await import('@/features/admin/services/community.service');
    const token = await admin.auth().createCustomToken(ADMIN_UID);
    await signInWithCustomToken(auth, token);
    await deleteGroup(fixtureClient.groupId);
    await auth.signOut();

    console.log('--- Running Admin-SDK deleteGroupContractAdminSdk() on fixtureAdmin ---');
    // Shelled out to a script living inside functions/ (not imported
    // directly) so Node resolves functions/node_modules/firebase-admin,
    // not this process's root firebase-admin — mixing the two produced a
    // real "Firestore doesn't support JavaScript objects with custom
    // prototypes" error (a FieldValue sentinel from one installation
    // isn't recognized by a batch call from the other).
    const runnerOutput = execFileSync(
      'npx', ['tsx', 'functions/_parity-runner.ts', fixtureAdmin.groupId],
      { cwd: '/Users/calisthenicsltd/Development/appout-1/.claude/worktrees/merge-persona-phase2', encoding: 'utf8' },
    );
    console.log(runnerOutput.trim());

    console.log('\n--- Comparing resulting state ---');
    const clientResult = await readResultState(adb, fixtureClient);
    const adminResult = await readResultState(adb, fixtureAdmin);

    console.log('client-SDK result:', JSON.stringify(clientResult));
    console.log('admin-SDK result: ', JSON.stringify(adminResult));

    const checks: [string, boolean][] = [
      ['groupExists both false', clientResult.groupExists === false && adminResult.groupExists === false],
      ['memberCount both 0', clientResult.memberCount === 0 && adminResult.memberCount === 0],
      ['attendanceCount both 0', clientResult.attendanceCount === 0 && adminResult.attendanceCount === 0],
      ['memberStatusesCount both 0', clientResult.memberStatusesCount === 0 && adminResult.memberStatusesCount === 0],
      ['chatExists both false', clientResult.chatExists === false && adminResult.chatExists === false],
      ['messagesCount both 0', clientResult.messagesCount === 0 && adminResult.messagesCount === 0],
      ['social.groupIds reduced to exactly the unrelated id (client)', JSON.stringify(clientResult.socialGroupIds) === JSON.stringify([fixtureClient.unrelatedGroupId])],
      ['social.groupIds reduced to exactly the unrelated id (admin)', JSON.stringify(adminResult.socialGroupIds) === JSON.stringify([fixtureAdmin.unrelatedGroupId])],
      ['user_memberships reduced to exactly the unrelated id (client)', JSON.stringify(clientResult.membershipGroupIds) === JSON.stringify([fixtureClient.unrelatedGroupId])],
      ['user_memberships reduced to exactly the unrelated id (admin)', JSON.stringify(adminResult.membershipGroupIds) === JSON.stringify([fixtureAdmin.unrelatedGroupId])],
    ];

    let allPass = true;
    for (const [name, pass] of checks) {
      console.log(`  ${pass ? '✅' : '❌'} ${name}`);
      if (!pass) allPass = false;
    }

    console.log(`\n${allPass ? '✅ PARITY CONFIRMED' : '❌ PARITY BROKEN — the two implementations diverge'}`);
    if (!allPass) process.exitCode = 1;
  } finally {
    console.log('\nCleaning up fixtures (in case either delete failed partway)...');
    await cleanupFixture(adb, fixtureClient).catch(() => {});
    await cleanupFixture(adb, fixtureAdmin).catch(() => {});
  }
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => { console.error('TEST ERROR:', e); process.exit(1); });
