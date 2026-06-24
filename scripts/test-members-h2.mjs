/**
 * H2 — Firestore security rule tests for members/{uid}
 *
 * Covers Block-0 (Phase G inviteCode gate) + H2 role management rules:
 *
 *   CREATE (Phase G regression)
 *     C1. Private group, no inviteCode                      → REJECTED
 *     C2. Private group, correct inviteCode                 → ACCEPTED
 *     C3. Public group, no inviteCode                       → ACCEPTED
 *     C4. Creator self-adds to private group (no code)      → ACCEPTED
 *
 *   UPDATE — promotion
 *     U1. Admin promotes member → admin                     → ACCEPTED
 *     U2. Admin promotes another admin (no-op role write)   → REJECTED (target already admin, role=='member' fails)
 *     U3. Member self-promotes to admin  *** CRITICAL ***   → REJECTED
 *     U4. Member updates own name (non-role field)          → ACCEPTED
 *
 *   UPDATE — demotion
 *     U5. Owner demotes admin → member                      → ACCEPTED
 *     U6. Admin demotes admin → member  *** CRITICAL ***    → REJECTED
 *     U7. Owner demotes themselves (self)                   → REJECTED (role immutable via self-update branch; owner-demote branch requires uid!=self)
 *
 *   DELETE
 *     D1. Admin removes member  *** CRITICAL ***            → ACCEPTED
 *     D2. Admin removes admin                               → REJECTED
 *     D3. Owner removes admin                               → ACCEPTED
 *     D4. Member self-removes (leave)                       → ACCEPTED
 *     D5. Plain member removes another member               → REJECTED
 *     D6. Admin removes owner                               → REJECTED (owner has role='admin', not 'member')
 *
 * Run:  node scripts/test-members-h2.mjs
 * Requires: firebase emulators:start --only firestore (port 8080)
 */

import { readFileSync } from 'fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const PROJECT_ID   = 'appout-1';
const GROUP_ID     = 'grp_h2_test';
const OWNER_UID    = 'owner_uid';
const ADMIN_UID    = 'admin_uid';
const MEMBER_UID   = 'member_uid';
const OUTSIDER_UID = 'outsider_uid';

let testEnv;
let passed = 0;
let failed = 0;

function pass(label) {
  console.log(`  ✅  ${label}`);
  passed++;
}
function fail(label, err) {
  console.error(`  ❌  ${label}`);
  console.error(`      ${err?.message ?? err}`);
  failed++;
  process.exitCode = 1;
}

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    // Group doc
    await setDoc(doc(db, 'community_groups', GROUP_ID), {
      name: 'H2 Test Group',
      isPublic: false,
      inviteCode: 'CODE42',
      createdBy: OWNER_UID,
      source: 'user',
      isOfficial: false,
    });

    // Owner member doc (role=admin)
    await setDoc(doc(db, 'community_groups', GROUP_ID, 'members', OWNER_UID), {
      uid: OWNER_UID, name: 'Owner', role: 'admin', joinedAt: new Date(),
    });

    // Appointed admin doc (role=admin)
    await setDoc(doc(db, 'community_groups', GROUP_ID, 'members', ADMIN_UID), {
      uid: ADMIN_UID, name: 'Admin', role: 'admin', joinedAt: new Date(),
    });

    // Regular member doc (role=member)
    await setDoc(doc(db, 'community_groups', GROUP_ID, 'members', MEMBER_UID), {
      uid: MEMBER_UID, name: 'Member', role: 'member', joinedAt: new Date(),
    });
  });
}

async function runCreateTests() {
  console.log('\n── CREATE (Phase G regression) ──');

  // C1
  try {
    const db = testEnv.authenticatedContext(OUTSIDER_UID).firestore();
    await assertFails(setDoc(doc(db, 'community_groups', GROUP_ID, 'members', OUTSIDER_UID), {
      uid: OUTSIDER_UID, name: 'Outsider', role: 'member',
    }));
    pass('C1. Private group, no inviteCode → REJECTED');
  } catch (e) { fail('C1. Private group, no inviteCode should be REJECTED', e); }

  // C2
  try {
    const db = testEnv.authenticatedContext(OUTSIDER_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'community_groups', GROUP_ID, 'members', OUTSIDER_UID), {
      uid: OUTSIDER_UID, name: 'Outsider', role: 'member', inviteCode: 'CODE42',
    }));
    pass('C2. Private group, correct inviteCode → ACCEPTED');
  } catch (e) { fail('C2. Private group, correct inviteCode should be ACCEPTED', e); }

  // C3 — need a public group for this
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'community_groups', 'grp_public'), {
      name: 'Public', isPublic: true, createdBy: OWNER_UID, source: 'user', isOfficial: false,
    });
  });
  try {
    const db = testEnv.authenticatedContext(OUTSIDER_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'community_groups', 'grp_public', 'members', OUTSIDER_UID), {
      uid: OUTSIDER_UID, name: 'Outsider', role: 'member',
    }));
    pass('C3. Public group, no inviteCode → ACCEPTED');
  } catch (e) { fail('C3. Public group join should be ACCEPTED', e); }

  // C4
  try {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(setDoc(doc(ownerDb, 'community_groups', GROUP_ID, 'members', OWNER_UID), {
      uid: OWNER_UID, name: 'Owner', role: 'admin',
    }));
    pass('C4. Creator self-adds to private group (no code) → ACCEPTED');
  } catch (e) { fail('C4. Creator self-add should be ACCEPTED', e); }
}

async function runUpdateTests() {
  console.log('\n── UPDATE ──');

  // U1: admin promotes member → admin
  try {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(updateDoc(
      doc(db, 'community_groups', GROUP_ID, 'members', MEMBER_UID),
      { role: 'admin' }
    ));
    pass('U1. Admin promotes member → admin → ACCEPTED');
    // reset for next tests
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'community_groups', GROUP_ID, 'members', MEMBER_UID), { role: 'member' });
    });
  } catch (e) { fail('U1. Admin promote member→admin should be ACCEPTED', e); }

  // U2: admin tries to "promote" someone already admin (role stays 'admin', but target already 'admin' so resource.role!='member')
  try {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(updateDoc(
      doc(db, 'community_groups', GROUP_ID, 'members', OWNER_UID),
      { role: 'admin' }
    ));
    pass('U2. Admin writes role=admin on already-admin target → REJECTED (no matching branch)');
  } catch (e) { fail('U2. Writing role=admin on existing admin should be REJECTED', e); }

  // U3: CRITICAL — member self-promotes
  try {
    const db = testEnv.authenticatedContext(MEMBER_UID).firestore();
    await assertFails(updateDoc(
      doc(db, 'community_groups', GROUP_ID, 'members', MEMBER_UID),
      { role: 'admin' }
    ));
    pass('U3. *** Member self-promotes to admin → REJECTED ✓');
  } catch (e) { fail('U3. CRITICAL: Member self-promote should be REJECTED', e); }

  // U4: member updates own name (non-role field)
  try {
    const db = testEnv.authenticatedContext(MEMBER_UID).firestore();
    await assertSucceeds(updateDoc(
      doc(db, 'community_groups', GROUP_ID, 'members', MEMBER_UID),
      { name: 'Updated Name' }
    ));
    pass('U4. Member updates own name → ACCEPTED');
  } catch (e) { fail('U4. Member self-update name should be ACCEPTED', e); }

  // U5: owner demotes admin → member
  try {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(updateDoc(
      doc(db, 'community_groups', GROUP_ID, 'members', ADMIN_UID),
      { role: 'member' }
    ));
    pass('U5. Owner demotes admin → member → ACCEPTED');
    // restore admin role
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'community_groups', GROUP_ID, 'members', ADMIN_UID), { role: 'admin' });
    });
  } catch (e) { fail('U5. Owner demote admin→member should be ACCEPTED', e); }

  // U6: CRITICAL — admin demotes another admin
  try {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(updateDoc(
      doc(db, 'community_groups', GROUP_ID, 'members', OWNER_UID),
      { role: 'member' }
    ));
    pass('U6. *** Admin demotes admin → member → REJECTED ✓');
  } catch (e) { fail('U6. CRITICAL: Admin demote admin should be REJECTED', e); }

  // U7: owner demotes themselves (self)
  try {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertFails(updateDoc(
      doc(db, 'community_groups', GROUP_ID, 'members', OWNER_UID),
      { role: 'member' }
    ));
    pass('U7. Owner self-demotion → REJECTED (role immutable via self-update; owner-demote branch requires uid!=self)');
  } catch (e) { fail('U7. Owner self-demotion should be REJECTED', e); }
}

async function runDeleteTests() {
  console.log('\n── DELETE ──');

  // D1: CRITICAL — admin removes member
  try {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(deleteDoc(
      doc(db, 'community_groups', GROUP_ID, 'members', MEMBER_UID)
    ));
    pass('D1. *** Admin removes member → ACCEPTED ✓');
    // restore
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'community_groups', GROUP_ID, 'members', MEMBER_UID), {
        uid: MEMBER_UID, name: 'Member', role: 'member', joinedAt: new Date(),
      });
    });
  } catch (e) { fail('D1. CRITICAL: Admin remove member should be ACCEPTED', e); }

  // D2: admin removes another admin
  try {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(deleteDoc(
      doc(db, 'community_groups', GROUP_ID, 'members', OWNER_UID)
    ));
    pass('D2. *** Admin removes admin (owner) → REJECTED ✓');
  } catch (e) { fail('D2. CRITICAL: Admin remove admin should be REJECTED', e); }

  // D3: owner removes admin
  try {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(deleteDoc(
      doc(db, 'community_groups', GROUP_ID, 'members', ADMIN_UID)
    ));
    pass('D3. Owner removes admin → ACCEPTED');
    // restore
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'community_groups', GROUP_ID, 'members', ADMIN_UID), {
        uid: ADMIN_UID, name: 'Admin', role: 'admin', joinedAt: new Date(),
      });
    });
  } catch (e) { fail('D3. Owner remove admin should be ACCEPTED', e); }

  // D4: member self-removes
  try {
    const db = testEnv.authenticatedContext(MEMBER_UID).firestore();
    await assertSucceeds(deleteDoc(
      doc(db, 'community_groups', GROUP_ID, 'members', MEMBER_UID)
    ));
    pass('D4. Member self-removes → ACCEPTED');
  } catch (e) { fail('D4. Member self-remove should be ACCEPTED', e); }

  // D5: plain member removes another member
  try {
    const db = testEnv.authenticatedContext(MEMBER_UID).firestore();
    await assertFails(deleteDoc(
      doc(db, 'community_groups', GROUP_ID, 'members', ADMIN_UID)
    ));
    pass('D5. Plain member removes another member → REJECTED');
  } catch (e) { fail('D5. Plain member remove other should be REJECTED', e); }

  // D6: admin removes owner (owner has role='admin')
  try {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(deleteDoc(
      doc(db, 'community_groups', GROUP_ID, 'members', OWNER_UID)
    ));
    pass('D6. Admin removes owner (role=admin) → REJECTED');
  } catch (e) { fail('D6. Admin remove owner should be REJECTED', e); }
}

async function run() {
  console.log('\n[H2] members/{uid} Firestore rule tests\n');

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });

  await testEnv.clearFirestore();
  await seed();
  await runCreateTests();
  await runUpdateTests();
  await runDeleteTests();

  await testEnv.cleanup();

  console.log(`\n${passed} passed, ${failed} failed`);
  const status = failed > 0 ? '❌  SOME TESTS FAILED — do not deploy' : '✅  ALL TESTS PASSED — safe to deploy';
  console.log(`${status}\n`);
}

run().catch((err) => {
  console.error('\n[FATAL]', err);
  process.exit(1);
});
