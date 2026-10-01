/**
 * WRITE script — Phase 4c-2 Item 3, full_body / legs subPrograms cleanup.
 * Deliberately a SEPARATE script from _fix-legs-program-name.ts (Item 1's
 * Firestore write) so each write stays independently reviewable/revertible.
 *
 * Two independent fixes, each read-before-write and idempotent:
 *
 * 1. full_body (H2279XsRGDg9G370J7S9): subPrograms currently holds 5
 *    entries — ['upper_body', <push-id>, <pull-id>, <core-id>, <legs-id>].
 *    The first is a stray SLUG string mixed in among 4 raw Firestore ids
 *    (upper_body's real id, 47smw26hUyG5ZbE1bhr3, is not what's stored).
 *    This isn't just a type inconsistency — traced two concrete live
 *    consequences in progression.service.ts:
 *      a. getMasterProgramProgress (~line 450-533): iterates subProgramIds,
 *         and for 'upper_body' specifically, getProgram('upper_body') does
 *         a raw-doc-id lookup that fails (null) — so it falls into the LEAF
 *         branch instead of recursing as a master. There it resolves via
 *         hasOwnTrack: progression.tracks.upper_body IS a real, populated
 *         field for any user with push+pull tracked (recalculateMasterLevel
 *         dual-writes both the hash-id key AND the slug key, ~line 743-752).
 *         So 'upper_body's own already-averaged level gets added to
 *         full_body's children ALONGSIDE push and pull individually —
 *         double-counting push/pull's contribution once raw, once
 *         pre-averaged. EXCLUDED_FROM_AVG.full_body only excludes 'core',
 *         not 'upper_body' (that exclusion set is calisthenics_upper-only —
 *         line 622). Net effect: full_body's displayed level/percent is
 *         skewed upward for any user who has both push and pull tracked.
 *      b. processBottomUpMasterCompletion (~line 1747-1830, the workout-
 *         completion XP-distribution path for a workout logged directly
 *         under full_body): childSlugs includes 'upper_body' as a 5th
 *         bucket. getProgressionRuleForLevel('upper_body', ...) is called
 *         for it unconditionally, and its requiredSetsForFullGain is added
 *         into totalRequiredSets even though the bucket stays empty
 *         (no exercise classifies into a literal "upper_body" keyword) —
 *         a wasted rule lookup and an inflated denominator on every
 *         full_body-logged workout. (Full XP-dollar-amount impact not
 *         traced further than this — removing the entry removes this
 *         processing regardless of its exact magnitude.)
 *    KNOWN_MASTER_PROGRAMS.full_body (progression.service.ts:116, David-
 *    approved 09.08.2026 per WorkoutBuilderSheet.tsx's own comment) is
 *    already the authoritative definition: ['push','pull','legs','core'] —
 *    4 entries, no upper_body. Fix: REMOVE the 'upper_body' entry entirely
 *    (not just convert its key type) — subPrograms becomes exactly the 4
 *    raw ids for push/pull/core/legs, matching that already-approved set.
 *    Confirmed nothing else needs 'upper_body' present: every other live
 *    consumer of Program.subPrograms gates on `isMaster` (true for
 *    full_body) and either (i) already has its own hardcoded bypass for
 *    full_body's exact 4-leaf set (WorkoutBuilderSheet.tsx's
 *    isMasterEligible, full_body-specific override, explicitly because the
 *    live doc's 5-entry subPrograms was already known-bad) or (ii) is the
 *    exact code this fix repairs. No code reads subPrograms expecting
 *    'upper_body' to be there on purpose.
 *
 * 2. legs (OrAmOH3F375dVio5yGdU): subPrograms currently holds
 *    ['kDMpobbKsuVTByTIKUpe'] (core's raw id), despite legs being
 *    isMaster:false. Confirmed inert — grepped every production consumer
 *    of Program.subPrograms across the codebase; every single one gates on
 *    `isMaster === true` before ever reading the field (or, for the one
 *    unconditional reader, WorkoutBuilderSheet.tsx:370, its result is only
 *    consulted behind `prog.isMaster` downstream — program-hierarchy.utils.ts,
 *    progression.service.ts, InputSanitizerMiddleware.ts, the admin pages,
 *    all confirmed isMaster-gated). Fix: clear to [].
 *
 * Run: npx tsx --env-file=.env.local scripts/_fix-full-body-legs-subprograms.ts
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

const FULL_BODY_ID = 'H2279XsRGDg9G370J7S9';
const LEGS_ID = 'OrAmOH3F375dVio5yGdU';

const PUSH_ID = 'J0fLpmJhG0KDN2tQouxh';
const PULL_ID = 'UPDBtTdCvX748dtBlWYj';
const CORE_ID = 'kDMpobbKsuVTByTIKUpe';
const LEGS_SUB_ID = 'OrAmOH3F375dVio5yGdU';

const EXPECTED_FULL_BODY_SUBPROGRAMS = ['upper_body', PUSH_ID, PULL_ID, CORE_ID, LEGS_SUB_ID];
const NEW_FULL_BODY_SUBPROGRAMS = [PUSH_ID, PULL_ID, CORE_ID, LEGS_SUB_ID];

const EXPECTED_LEGS_SUBPROGRAMS = [CORE_ID];

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const as = [...a].sort();
  const bs = [...b].sort();
  return as.every((v, i) => v === bs[i]);
}

async function main() {
  console.log('--- full_body: removing stray "upper_body" slug from subPrograms ---');
  {
    const ref = db.collection('programs').doc(FULL_BODY_ID);
    const snap = await ref.get();
    if (!snap.exists) { console.log(`  ✗ ${FULL_BODY_ID} — DOES NOT EXIST, aborted`); } else {
      const d = snap.data()!;
      const current: string[] = d.subPrograms ?? [];
      if (!sameSet(current, EXPECTED_FULL_BODY_SUBPROGRAMS)) {
        console.log(`  ✗ ${FULL_BODY_ID} — subPrograms is already [${current.join(', ')}] (not the expected 5-entry set), skipped — re-check before re-running`);
      } else {
        await ref.update({ subPrograms: NEW_FULL_BODY_SUBPROGRAMS, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        console.log(`  ✓ ${FULL_BODY_ID} — subPrograms updated to [${NEW_FULL_BODY_SUBPROGRAMS.join(', ')}]`);
      }
    }
  }

  console.log('--- legs: clearing inert subPrograms ---');
  {
    const ref = db.collection('programs').doc(LEGS_ID);
    const snap = await ref.get();
    if (!snap.exists) { console.log(`  ✗ ${LEGS_ID} — DOES NOT EXIST, aborted`); } else {
      const d = snap.data()!;
      const current: string[] = d.subPrograms ?? [];
      if (!sameSet(current, EXPECTED_LEGS_SUBPROGRAMS)) {
        console.log(`  ✗ ${LEGS_ID} — subPrograms is already [${current.join(', ')}] (not the expected [${EXPECTED_LEGS_SUBPROGRAMS.join(', ')}]), skipped — re-check before re-running`);
      } else {
        await ref.update({ subPrograms: [], updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        console.log(`  ✓ ${LEGS_ID} — subPrograms cleared to []`);
      }
    }
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
