/**
 * scripts/delete-legacy-test-and-junk-groups.ts
 *
 * Combined cleanup run, per David's explicit decision (08.09.2026) to do
 * this once through the full delete contract rather than delete-then-fix:
 *
 * - 11 "ריצה עם דוד מובשוביץ" — David's own repeated test groups
 *   (createdBy = his admin uid, memberCount 0-1, dated late June).
 * - 9 obviously junk/test-named groups ("חבו", "בחכבבכ", "בידקה 3/4/5",
 *   "בדיקה 10", "קר", "עממ", "מתן ודוד").
 * - 2 groups already deleted earlier this session ("ככככ", "ר") whose
 *   member data was left orphaned by the OLD deleteGroup() — re-running
 *   the now-enhanced deleteGroup() on them is expected to find "main doc
 *   already gone" and just finish the cleanup (members subcollection +
 *   the 3 affected users' social.groupIds/user_memberships), per the
 *   contract's idempotency guarantee. This is NOT a blocking condition
 *   for these two ids specifically — it's the expected, correct state.
 *
 * Explicitly EXCLUDED: "Joseph family steps" (91OJbugQf5ELVx3XIr43) — 1
 * real member (the creator), a private family group with a custom
 * rule/joke text. Not touched.
 *
 * The other 21 authorityId-less docs ("הליכה/ריצה מתוזמנת" placeholders)
 * are NOT part of this batch — deferred until the root-cause report on
 * why workout-sharing creates a group entity at all.
 *
 * deleteGroup() (community.service.ts) now also deletes: the members
 * subcollection, the group's chats/group_{groupId} thread + its messages
 * subcollection, and cleans arrayRemove(groupId) from every member's
 * users/{uid}.social.groupIds + user_memberships/{uid} — the full
 * contract David approved. It refuses (throws) rather than run if a
 * single group's cleanup would need more than 500 write ops (members +
 * messages), per the "refuse and report, never split non-atomically"
 * rule.
 *
 * SAFE BY DEFAULT: dry-run (no flags) reads every row's current live
 * state — including chat existence and message count, so a surprisingly
 * large chat is visible BEFORE any write, not after — and refuses
 * anything that doesn't match the expected profile. --confirm applies,
 * and even then re-checks each doc immediately before deleting it.
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
const DELETE_BATCH_OP_LIMIT = 500;

const TARGETS: { id: string; name: string; expectedMaxMembers: number; alreadyDeleted?: boolean }[] = [
  // Category ב — David's own repeated test groups
  { id: '2itoy043w50eWgckTWq1', name: 'ריצה עם דוד מובשוביץ', expectedMaxMembers: 1 },
  { id: 'DAz20GMBiQwA1IcZtdjM', name: 'ריצה עם דוד מובשוביץ', expectedMaxMembers: 1 },
  { id: 'J7SwVukdWK0fzG3Sq8cx', name: 'ריצה עם דוד מובשוביץ', expectedMaxMembers: 1 },
  { id: 'NoQ2IZh9WVbWIrV4kwLX', name: 'ריצה עם דוד מובשוביץ', expectedMaxMembers: 1 },
  { id: 'OFREV3syAGJxwGSYpBWK', name: 'ריצה עם דוד מובשוביץ', expectedMaxMembers: 1 },
  { id: 'TOZENoGer01MsVqJVXm0', name: 'ריצה עם דוד מובשוביץ', expectedMaxMembers: 1 },
  { id: 'VGiFH1zm6lELgtXqCR9g', name: 'ריצה עם דוד מובשוביץ', expectedMaxMembers: 1 },
  { id: 'VmA0wjX5PZufEFLjhWsV', name: 'ריצה עם דוד מובשוביץ', expectedMaxMembers: 1 },
  { id: 'aUXeEjbXNmrAoQHA34Ln', name: 'ריצה עם דוד מובשוביץ', expectedMaxMembers: 1 },
  { id: 'kaw1s24cfcWX2cNoHBT9', name: 'ריצה עם דוד מובשוביץ', expectedMaxMembers: 1 },
  { id: 'l38ZB5AjrcdHTraZoJCX', name: 'ריצה עם דוד מובשוביץ', expectedMaxMembers: 1 },
  // Category ג — obvious junk/test-named groups
  { id: '6zhU2wefMprGTAZlVpNg', name: 'חבו', expectedMaxMembers: 1 },
  { id: 'JOETxFNNi1Dv3prTmBNE', name: 'בחכבבכ', expectedMaxMembers: 1 },
  { id: 'Q3DzIKjsJUk5qjnnmQYQ', name: 'בידקה 5', expectedMaxMembers: 1 },
  { id: 'Tws9Y5qfYn6rbOyNnaSG', name: 'קר', expectedMaxMembers: 1 },
  { id: 'fgqG56qYnGk0qTLmjvWQ', name: 'עממ', expectedMaxMembers: 1 },
  { id: 'rAfZi1zJpIhVTh8hiDTm', name: 'מתן ודוד', expectedMaxMembers: 2 },
  { id: 'uFB7HO5gRLfCKc0RK9bI', name: 'בידקה 4', expectedMaxMembers: 1 },
  { id: 'wskLhTLzLAF8yPpsgoNj', name: 'בידקה 3', expectedMaxMembers: 1 },
  { id: 'yiYF50AJ2bpMcoD5TljY', name: 'בדיקה 10', expectedMaxMembers: 8 },
  // Already deleted earlier this session — re-running the enhanced
  // deleteGroup() on these just finishes the orphan cleanup.
  { id: 'UZQqcmxtFFWUK5EGXZTh', name: 'ככככ', expectedMaxMembers: 2, alreadyDeleted: true },
  { id: 'f9ssb8l9krEWjWQIbMZ7', name: 'ר', expectedMaxMembers: 1, alreadyDeleted: true },
];

async function main() {
  const confirm = process.argv.includes('--confirm');
  init();
  const adb = admin.firestore();

  console.log(`Target count: ${TARGETS.length}\n`);

  const plan: {
    id: string; name: string; ok: boolean; reason?: string; data?: any;
    memberCount: number; chatExists: boolean; messageCount: number; opCount: number;
  }[] = [];

  for (const t of TARGETS) {
    const snap = await adb.collection('community_groups').doc(t.id).get();

    const membersSnap = await adb.collection('community_groups').doc(t.id).collection('members').get();
    const memberCount = membersSnap.size;
    const chatSnap = await adb.collection('chats').doc(`group_${t.id}`).get();
    const chatExists = chatSnap.exists;
    const messagesSnap = chatExists ? await adb.collection('chats').doc(`group_${t.id}`).collection('messages').get() : null;
    const messageCount = messagesSnap?.size ?? 0;
    const opCount = 2 + memberCount + memberCount * 2 + (chatExists ? 1 : 0) + messageCount;

    if (!snap.exists && !t.alreadyDeleted) {
      plan.push({ id: t.id, name: t.name, ok: false, reason: 'unexpectedly already gone', memberCount, chatExists, messageCount, opCount });
      continue;
    }
    if (snap.exists) {
      const data = snap.data()!;
      const liveName = data.name ?? '';
      const liveMembers = data.memberCount ?? data.currentParticipants ?? 0;
      if (liveName !== t.name) {
        plan.push({ id: t.id, name: t.name, ok: false, reason: `name mismatch: expected "${t.name}", found "${liveName}"`, data, memberCount, chatExists, messageCount, opCount });
        continue;
      }
      if (liveMembers > t.expectedMaxMembers) {
        plan.push({ id: t.id, name: t.name, ok: false, reason: `memberCount drifted: expected <=${t.expectedMaxMembers}, found ${liveMembers}`, data, memberCount, chatExists, messageCount, opCount });
        continue;
      }
      if (data.authorityId) {
        plan.push({ id: t.id, name: t.name, ok: false, reason: `now HAS an authorityId (${data.authorityId}) — no longer an orphan, re-check before deleting`, data, memberCount, chatExists, messageCount, opCount });
        continue;
      }
    }
    if (opCount > DELETE_BATCH_OP_LIMIT) {
      plan.push({ id: t.id, name: t.name, ok: false, reason: `needs ${opCount} write ops (limit ${DELETE_BATCH_OP_LIMIT}) — refusing`, data: snap.data(), memberCount, chatExists, messageCount, opCount });
      continue;
    }
    plan.push({ id: t.id, name: t.name, ok: true, data: snap.data(), memberCount, chatExists, messageCount, opCount });
  }

  console.log('=== Per-row check (member count / chat exists / message count) ===');
  for (const p of plan) {
    console.log(
      `  ${p.ok ? '✅' : '⛔'} ${p.id}  "${p.name}"  members=${p.memberCount}  chat=${p.chatExists ? `yes(${p.messageCount} msgs)` : 'no'}  opCount=${p.opCount}  ${p.reason ? `— ${p.reason}` : ''}`
    );
  }

  const okRows = plan.filter((p) => p.ok);
  const blockedRows = plan.filter((p) => !p.ok);
  console.log(`\n${okRows.length}/${plan.length} clear. ${blockedRows.length} blocked (see ⛔ above) — SKIPPED regardless of --confirm.`);

  if (!confirm) {
    console.log('\nDry run only — no writes performed. Re-run with --confirm to apply (only the ✅ rows).');
    return;
  }

  if (okRows.length === 0) {
    console.log('\nNothing clear to delete. Stopping.');
    return;
  }

  console.log('\n--confirm passed. Backing up all target docs + their members/chat/messages before writing...');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const backupDir = path.join(__dirname, '_backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupData = [];
  for (const p of plan) {
    const membersSnap = await adb.collection('community_groups').doc(p.id).collection('members').get();
    const chatSnap = await adb.collection('chats').doc(`group_${p.id}`).get();
    const messagesSnap = chatSnap.exists ? await adb.collection('chats').doc(`group_${p.id}`).collection('messages').get() : null;
    backupData.push({
      id: p.id,
      group: p.data ?? null,
      members: membersSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      chat: chatSnap.exists ? chatSnap.data() : null,
      messages: messagesSnap ? messagesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [],
    });
  }
  fs.writeFileSync(path.join(backupDir, `legacy-test-junk-groups-delete-${Date.now()}.json`), JSON.stringify(backupData, null, 2));

  const beforeCountSnap = await adb.collection('community_groups').get();
  console.log(`Total community_groups before: ${beforeCountSnap.size}`);

  const { auth } = await import('@/lib/firebase');
  const { deleteGroup } = await import('@/features/admin/services/community.service');
  const token = await admin.auth().createCustomToken(ADMIN_UID);
  await signInWithCustomToken(auth, token);
  console.log('Signed in as admin:', auth.currentUser?.uid);

  let deleted = 0;
  for (const p of okRows) {
    const t = TARGETS.find((x) => x.id === p.id)!;
    const fresh = await adb.collection('community_groups').doc(p.id).get();
    if (fresh.exists) {
      const freshMembers = fresh.data()?.memberCount ?? fresh.data()?.currentParticipants ?? 0;
      if (freshMembers > t.expectedMaxMembers || fresh.data()?.authorityId) {
        console.log(`  ⛔ ${p.id}: drifted since dry-run (memberCount=${freshMembers}, authorityId=${fresh.data()?.authorityId}) — STOPPING, not continuing further.`);
        break;
      }
    } else if (!t.alreadyDeleted) {
      console.log(`  ⛔ ${p.id}: unexpectedly gone since dry-run — STOPPING.`);
      break;
    }
    await deleteGroup(p.id);
    console.log(`  ✅ ${t.alreadyDeleted ? 'finished cleanup for' : 'deleted'} ${p.id} "${p.name}"`);
    deleted++;
  }
  await auth.signOut();

  const afterCountSnap = await adb.collection('community_groups').get();
  console.log(`\nDone. ${deleted}/${okRows.length} processed.`);
  console.log(`Total community_groups after: ${afterCountSnap.size} (before: ${beforeCountSnap.size})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
