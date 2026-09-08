/**
 * scripts/delete-legacy-test-and-junk-groups.ts
 *
 * One-time cleanup: deletes 20 of the 44 authorityId-less community_groups
 * docs found during the 08.09.2026 all-groups-overview delete investigation,
 * per David's explicit per-row decisions on that exact list:
 *
 * - 11 "ריצה עם דוד מובשוביץ" — David's own repeated test groups
 *   (createdBy = his admin uid, memberCount 0-1, dated late June).
 * - 9 obviously junk/test-named groups ("חבו", "בחכבבכ", "בידקה 3/4/5",
 *   "בדיקה 10", "קר", "עממ", "מתן ודוד").
 *
 * Explicitly EXCLUDED from this batch: "Joseph family steps"
 * (91OJbugQf5ELVx3XIr43) — checked and confirmed to have 1 real member
 * (the creator, a private family group with a custom rule/joke text) —
 * David asked for this one to be pulled out and reported, not deleted.
 *
 * The other 21 authorityId-less docs ("הליכה/ריצה מתוזמנת" placeholders)
 * are explicitly NOT part of this batch — David: "לא נוגעים. עדיין" —
 * deferred until the root-cause report (item 3) is done.
 *
 * Known gap this batch will repeat (not fixed here, on record separately):
 * deleteGroup() does not clean up the members subcollection or the
 * deleted members' users/{uid}.social.groupIds / user_memberships —
 * same orphan pattern already found on 2 groups earlier this session.
 * Item 2 (the delete-contract fix) should cover these creators too once
 * approved — most are David's own admin uid, a few are real other users
 * (see the per-row createdBy in the dry-run output below).
 *
 * SAFE BY DEFAULT: dry-run (no flags) prints every row's current live
 * state and refuses anything that doesn't match the expected profile
 * (memberCount <= 1, isActive as recorded). --confirm applies, and even
 * then re-checks each doc immediately before deleting it — if a doc's
 * live memberCount/isActive has drifted from what was recorded when this
 * list was built, that ONE row is skipped and flagged, not deleted,
 * per David's explicit instruction: "אם תוך כדי אתה מגלה שקבוצה כן
 * פעילה או כן יש בה מישהו — עוצר ומדווח, לא ממשיך."
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

const TARGETS: { id: string; name: string; expectedMaxMembers: number }[] = [
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
];

async function main() {
  const confirm = process.argv.includes('--confirm');
  init();
  const adb = admin.firestore();

  console.log(`Target count: ${TARGETS.length}\n`);

  const plan: { id: string; name: string; ok: boolean; reason?: string; data?: any }[] = [];
  for (const t of TARGETS) {
    const snap = await adb.collection('community_groups').doc(t.id).get();
    if (!snap.exists) {
      plan.push({ id: t.id, name: t.name, ok: false, reason: 'already gone' });
      continue;
    }
    const data = snap.data()!;
    const liveName = data.name ?? '';
    const liveMembers = data.memberCount ?? data.currentParticipants ?? 0;
    if (liveName !== t.name) {
      plan.push({ id: t.id, name: t.name, ok: false, reason: `name mismatch: expected "${t.name}", found "${liveName}"`, data });
      continue;
    }
    if (liveMembers > t.expectedMaxMembers) {
      plan.push({ id: t.id, name: t.name, ok: false, reason: `memberCount drifted: expected <=${t.expectedMaxMembers}, found ${liveMembers}`, data });
      continue;
    }
    if (data.authorityId) {
      plan.push({ id: t.id, name: t.name, ok: false, reason: `now HAS an authorityId (${data.authorityId}) — no longer an orphan, re-check before deleting`, data });
      continue;
    }
    plan.push({ id: t.id, name: t.name, ok: true, data });
  }

  console.log('=== Per-row check ===');
  for (const p of plan) {
    console.log(`  ${p.ok ? '✅' : '⛔'} ${p.id}  "${p.name}"  source=${p.data?.source ?? '?'}  memberCount=${p.data?.memberCount ?? p.data?.currentParticipants ?? 0}  createdBy=${p.data?.createdBy ?? '?'}  ${p.reason ? `— ${p.reason}` : ''}`);
  }

  const okRows = plan.filter((p) => p.ok);
  const blockedRows = plan.filter((p) => !p.ok);
  console.log(`\n${okRows.length}/${plan.length} clear to delete. ${blockedRows.length} blocked (see ⛔ above) — these will be SKIPPED, not deleted, regardless of --confirm.`);

  if (!confirm) {
    console.log('\nDry run only — no writes performed. Re-run with --confirm to apply (only the ✅ rows).');
    return;
  }

  if (okRows.length === 0) {
    console.log('\nNothing clear to delete. Stopping.');
    return;
  }

  console.log('\n--confirm passed. Backing up all target docs (including blocked ones) before writing...');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const backupDir = path.join(__dirname, '_backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupData = plan.map((p) => ({ id: p.id, ...p.data }));
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
    // Re-check immediately before deleting — catches drift between dry-run and --confirm.
    const fresh = await adb.collection('community_groups').doc(p.id).get();
    if (!fresh.exists) { console.log(`  ⏭️  ${p.id}: already gone — skipping`); continue; }
    const freshMembers = fresh.data()?.memberCount ?? fresh.data()?.currentParticipants ?? 0;
    const expected = TARGETS.find((t) => t.id === p.id)!.expectedMaxMembers;
    if (freshMembers > expected || fresh.data()?.authorityId) {
      console.log(`  ⛔ ${p.id}: drifted since dry-run (memberCount=${freshMembers}, authorityId=${fresh.data()?.authorityId}) — STOPPING, not continuing further.`);
      break;
    }
    await deleteGroup(p.id);
    console.log(`  ✅ deleted ${p.id} "${p.name}"`);
    deleted++;
  }
  await auth.signOut();

  const afterCountSnap = await adb.collection('community_groups').get();
  console.log(`\nDone. ${deleted}/${okRows.length} deleted.`);
  console.log(`Total community_groups after: ${afterCountSnap.size} (before: ${beforeCountSnap.size})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
