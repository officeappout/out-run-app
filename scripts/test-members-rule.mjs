/**
 * Block 0 — Firestore security rule test for members/{uid}
 *
 * Tests:
 *   1. Private group + NO inviteCode in write payload → REJECTED
 *   2. Private group + correct inviteCode in write payload → ACCEPTED
 *   3. Public group  + NO inviteCode in write payload → ACCEPTED (regression)
 *
 * Run:  node scripts/test-members-rule.mjs
 * Requires: Firestore emulator running on 127.0.0.1:8080
 */

import { readFileSync } from 'fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

const PROJECT_ID = 'appout-1';
const GROUP_PRIVATE = 'group_private_test';
const GROUP_PUBLIC  = 'group_public_test';
const INVITE_CODE   = 'ABC123';
const HOST_UID      = 'host_uid_1';
const MEMBER_UID    = 'member_uid_2';

let testEnv;

function pass(label) { console.log(`  ✅  ${label}`); }
function fail(label, err) { console.error(`  ❌  ${label}\n      ${err?.message ?? err}`); process.exitCode = 1; }

async function run() {
  console.log('\n[Block-0] members/{uid} Firestore rule tests\n');

  // ── 1. Init test environment ───────────────────────────────────────────────
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });

  // ── 2. Seed group docs (bypasses rules) ───────────────────────────────────
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'community_groups', GROUP_PRIVATE), {
      name: 'Private Group',
      isPublic: false,
      inviteCode: INVITE_CODE,
      source: 'user',
      createdBy: HOST_UID,
      isOfficial: false,
    });
    await setDoc(doc(db, 'community_groups', GROUP_PUBLIC), {
      name: 'Public Group',
      isPublic: true,
      source: 'user',
      createdBy: HOST_UID,
      isOfficial: false,
    });
  });

  // ── Test 1: Private group, NO inviteCode → REJECTED ───────────────────────
  try {
    const db = testEnv.authenticatedContext(MEMBER_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'community_groups', GROUP_PRIVATE, 'members', MEMBER_UID), {
        uid: MEMBER_UID,
        name: 'Test Member',
        role: 'member',
        // inviteCode intentionally omitted
      })
    );
    pass('Private group, no inviteCode → REJECTED (as expected)');
  } catch (err) {
    fail('Private group, no inviteCode should be REJECTED', err);
  }

  // ── Test 2: Private group, CORRECT inviteCode → ACCEPTED ──────────────────
  try {
    const db = testEnv.authenticatedContext(MEMBER_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'community_groups', GROUP_PRIVATE, 'members', MEMBER_UID), {
        uid: MEMBER_UID,
        name: 'Test Member',
        role: 'member',
        inviteCode: INVITE_CODE,
      })
    );
    pass('Private group, correct inviteCode → ACCEPTED');
  } catch (err) {
    fail('Private group, correct inviteCode should be ACCEPTED', err);
  }

  // ── Test 3: Public group, no inviteCode → ACCEPTED (regression) ───────────
  try {
    const db = testEnv.authenticatedContext(MEMBER_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'community_groups', GROUP_PUBLIC, 'members', MEMBER_UID), {
        uid: MEMBER_UID,
        name: 'Test Member',
        role: 'member',
        // no inviteCode needed for public group
      })
    );
    pass('Public group, no inviteCode → ACCEPTED (regression ✓)');
  } catch (err) {
    fail('Public group join (regression) should be ACCEPTED', err);
  }

  // ── Test 4: Group creator self-adds to private group (no inviteCode) → ACCEPTED ──
  try {
    const db = testEnv.authenticatedContext(HOST_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'community_groups', GROUP_PRIVATE, 'members', HOST_UID), {
        uid: HOST_UID,
        name: 'Host Creator',
        role: 'admin',
        // no inviteCode — passes via createdBy == request.auth.uid branch
      })
    );
    pass('Group creator self-adds to private group (no inviteCode) → ACCEPTED (createdBy branch ✓)');
  } catch (err) {
    fail('Group creator self-add should be ACCEPTED via createdBy branch', err);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────
  await testEnv.cleanup();

  const status = process.exitCode === 1 ? '❌ SOME TESTS FAILED' : '✅ ALL TESTS PASSED';
  console.log(`\n${status}\n`);
}

run().catch((err) => {
  console.error('\n[FATAL]', err);
  process.exit(1);
});
