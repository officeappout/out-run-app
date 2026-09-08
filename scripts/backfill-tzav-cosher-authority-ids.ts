/**
 * scripts/backfill-tzav-cosher-authority-ids.ts
 *
 * One-time backfill: assigns each of the 12 tzav-cosher branches (created
 * by import-tzav-cosher-branches.ts, all with authorityId:'') to its real
 * municipality's authorities/{id}, resolved this session by exact-name
 * lookup against the `authorities` collection — see the conversation for
 * the two duplicate/bad-coordinate records deliberately avoided (a second
 * "הרצליה" pointing near Haifa, a second "עלומים" pointing near Tel Aviv).
 *
 * David's explicit decision (08.09.2026, after confirming isAdmin() is
 * global and unscoped by authorityId in firestore.rules — this field
 * changes what's VISIBLE in the panel's per-authority list, not what's
 * PERMITTED; the real access-control gap is tracked separately, not fixed
 * by this backfill):
 *   "authorityId הוא מסנן תצוגה בפאנל, לא שער... חסימת השיוך לא מקטינה
 *    שום סיכון. היא רק משאירה אותי עיוור."
 *
 * tzav-tlv-sportek-sun (the existing, manually-created group) is NOT
 * touched — it already has the correct authorityId
 * (t9hiRkDnJtgZESlNCBp8, תל אביב-יפו) and is excluded from the map below
 * on purpose.
 *
 * Writes through updateGroup() (community.service.ts) — same single write
 * path as every other write today, authenticated as David's real admin
 * account via a short-lived custom token.
 *
 * SAFE BY DEFAULT: dry-run (no flags) prints current vs. target
 * authorityId per group. --confirm applies. Idempotent: a group whose
 * authorityId already matches the target is skipped, not re-written.
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

// row id (from tzav-cosher-branches.csv) -> the community_groups doc id
// created by import-tzav-cosher-branches.ts's earlier --confirm run.
const ROW_TO_GROUP_ID: Record<string, string> = {
  'tzav-rehovot-sun': 'xTJueGB3t94K7cFZUCCT',
  'tzav-beer-sheva-sun': 'ZvxBost3Fls1sZJzNgpe',
  'tzav-kiryat-gat-sun': 'qwaFSYaEJpt5ocOVWyvS',
  'tzav-pardes-hana-mon': 'gUuTsQXfrZjVyVDsATb5',
  'tzav-tlv-frishman-mon': 'URny7sxvFrMLD2ojYizb',
  'tzav-herzliya-mon': 'vmnhuDF6URJ4ayz3siBF',
  'tzav-hevel-yavne-tue': 'YkgYRwbzfr9mhWP2Ygy9',
  'tzav-alumim-tue': 'wbVnvDagAqiZmMiqYsLZ',
  'tzav-haifa-tue': 'uzkKafajk1BXQxgV5dcj',
  'tzav-jerusalem-wed': 'adwopPrXKNfYSP20xUeB',
  'tzav-modiin-wed': 'YuVmdYGrty8jhkwaQfrS',
  'tzav-pardes-hana-fri': '3vxf2CZdpQYPRBkoB90x',
};

// Resolved this session by exact-name match against `authorities` —
// duplicates with bad/wrong-city coordinates deliberately excluded.
const ROW_TO_AUTHORITY_ID: Record<string, { authorityId: string; cityName: string }> = {
  'tzav-rehovot-sun': { authorityId: 'k89XhZKXPFirYY9VN5ur', cityName: 'רחובות' },
  'tzav-beer-sheva-sun': { authorityId: 'X505lUcEWgiih0WJ3yP7', cityName: 'באר שבע' },
  'tzav-kiryat-gat-sun': { authorityId: 'lfdFHzo43oS7GN8qRHpM', cityName: 'קרית גת' },
  'tzav-pardes-hana-mon': { authorityId: 'u0qHVCGC0k9zWyHJKDVG', cityName: 'פרדס חנה-כרכור' },
  'tzav-tlv-frishman-mon': { authorityId: 't9hiRkDnJtgZESlNCBp8', cityName: 'תל אביב-יפו (same authority as the existing Sportek group)' },
  'tzav-herzliya-mon': { authorityId: '1O54R5EOghNYylTEhxJa', cityName: 'הרצליה (NOT a0AVB2oEDTaCCtfm6fcv — that record\'s coordinate is near Haifa, a data error)' },
  'tzav-hevel-yavne-tue': { authorityId: 'x8Vets9PdgNqPIwABQvt', cityName: 'חבל יבנה' },
  'tzav-alumim-tue': { authorityId: '2VrVY2frLEkpgbcLKapD', cityName: 'עלומים (NOT n1a3iFlLAMAhBcHL6QW9 — that record\'s coordinate is near Tel Aviv, unrelated)' },
  'tzav-haifa-tue': { authorityId: '9ZdWFmlkP0njOyFPceEw', cityName: 'חיפה' },
  'tzav-jerusalem-wed': { authorityId: 'vxYpJ9HKm4fot5y1ahDA', cityName: 'ירושלים' },
  'tzav-modiin-wed': { authorityId: 'lPzF3aqyJEhnZl6YSYlf', cityName: 'מודיעין-מכבים-רעות' },
  'tzav-pardes-hana-fri': { authorityId: 'u0qHVCGC0k9zWyHJKDVG', cityName: 'פרדס חנה-כרכור (same authority as the Monday branch)' },
};

async function main() {
  const confirm = process.argv.includes('--confirm');
  init();
  const adb = admin.firestore();

  console.log('── PLAN ──────────────────────────────────────────────────');
  const plan: { rowId: string; groupId: string; current: string; target: string; skip: boolean }[] = [];
  for (const [rowId, groupId] of Object.entries(ROW_TO_GROUP_ID)) {
    const target = ROW_TO_AUTHORITY_ID[rowId];
    if (!target) throw new Error(`No authority resolution for row "${rowId}" — refusing to guess.`);
    const snap = await adb.collection('community_groups').doc(groupId).get();
    if (!snap.exists) { console.log(`  🛑 ${rowId}: group ${groupId} does not exist — skipping`); continue; }
    const current = snap.data()?.authorityId ?? '';
    const skip = current === target.authorityId;
    plan.push({ rowId, groupId, current, target: target.authorityId, skip });
    console.log(`  ${skip ? '⏭️  already set' : '➕ will update'} — ${rowId} (${groupId})`);
    console.log(`     current authorityId: "${current || '(empty)'}"`);
    console.log(`     target  authorityId: "${target.authorityId}"  (${target.cityName})`);
  }

  const willUpdate = plan.filter((p) => !p.skip).length;
  const willSkip = plan.filter((p) => p.skip).length;
  console.log(`\n── SUMMARY ── will update: ${willUpdate}  already correct (skip): ${willSkip}`);

  if (!confirm) {
    console.log('\nDry run only — no writes performed. Re-run with --confirm to apply.');
    return;
  }

  const { auth } = await import('@/lib/firebase');
  const { updateGroup } = await import('@/features/admin/services/community.service');
  const token = await admin.auth().createCustomToken(ADMIN_UID);
  await signInWithCustomToken(auth, token);
  console.log('\nSigned in as admin:', auth.currentUser?.uid);

  let updated = 0;
  for (const p of plan) {
    if (p.skip) continue;
    await updateGroup(p.groupId, { authorityId: p.target }, ['reserve']);
    console.log(`  ✅ ${p.rowId} (${p.groupId}) → authorityId = ${p.target}`);
    updated++;
  }
  await auth.signOut();

  console.log(`\nDone. ${updated} groups updated.`);

  // Post-condition check, not "it printed success" — read the docs back.
  let verifiedOk = 0;
  for (const p of plan) {
    const snap = await adb.collection('community_groups').doc(p.groupId).get();
    if (snap.data()?.authorityId === p.target) verifiedOk++;
    else console.log(`  ⚠️  ${p.rowId}: expected authorityId=${p.target}, found ${snap.data()?.authorityId}`);
  }
  console.log(`Post-write verification: ${verifiedOk}/${plan.length} groups confirmed with the correct authorityId.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
