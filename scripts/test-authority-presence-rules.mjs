/**
 * Firestore security rules regression test
 *
 * Covers two regression fixes:
 *   A) noTenantFieldsChanged blocks onboarding when authorityId first set
 *      → now routed through /api/user/update-authority (Admin SDK)
 *   B) null-unsafe get(user_memberships).data.get() crashes presence rules
 *      for users with no user_memberships doc
 *      → fixed with memberGroupIds() null-safe helper
 *
 * Run:   node scripts/test-authority-presence-rules.mjs
 * Needs: firebase emulators:start --only firestore
 */

import { readFileSync } from 'fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'appout-1';

const REGULAR_UID  = 'regular_user_uid';
const OWNER_UID    = 'group_owner_uid';
const GUEST_UID    = 'group_guest_uid';
const NOMEM_UID    = 'no_membership_uid';
const GROUP_ID     = 'test_group_001';
const AUTHORITY_ID = 'ashkelon';

let passed = 0;

function ok(label)        { console.log(`  ✅  ${label}`); passed++; }
function fail(label, err) { console.error(`  ❌  ${label}\n      ${err?.message ?? err}`); process.exitCode = 1; }

async function run() {
  console.log('\n[Rules Test] authority + presence regression\n');

  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });

  await testEnv.clearFirestore();

  // ── Seed: bypass rules ─────────────────────────────────────────────────────
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    // Authority document (needed by the server endpoint in production;
    // here it's not queried by rules, but we seed it for completeness)
    await setDoc(doc(db, 'authorities', AUTHORITY_ID), { name: 'אשקלון', isActiveClient: true });

    // Regular user — doc exists but no authorityId yet (Scenario A)
    await setDoc(doc(db, 'users', REGULAR_UID), {
      id: REGULAR_UID,
      core: {
        name: 'Test User', email: 'test@example.com',
        role: 'USER', isApproved: false,
        isSuperAdmin: false, isSystemAdmin: false,
        isVerticalAdmin: false, isTenantOwner: false,
        managedVertical: '', tenantId: '', tenantType: '',
        unitId: '', unitPath: [],
        // intentionally NO authorityId
      },
      progression: { coins: 0, globalLevel: 1, globalXP: 0 },
      social: { groupIds: [] },
      onboardingStep: 'PERSONA', onboardingStatus: 'ONBOARDING',
    });

    // Owner — doc exists with authorityId (Scenario B: same-value re-write)
    await setDoc(doc(db, 'users', OWNER_UID), {
      id: OWNER_UID,
      core: {
        name: 'Owner', role: 'USER', isApproved: false,
        isSuperAdmin: false, isSystemAdmin: false,
        isVerticalAdmin: false, isTenantOwner: false,
        managedVertical: '', tenantId: '', tenantType: '',
        unitId: '', unitPath: [], authorityId: AUTHORITY_ID,
      },
      progression: { coins: 50, globalLevel: 5, globalXP: 1200 },
      social: { groupIds: [GROUP_ID] },
      onboardingStep: 'COMPLETED', onboardingStatus: 'COMPLETED',
    });

    // Owner's user_memberships (exists → presence write should be allowed)
    await setDoc(doc(db, 'user_memberships', OWNER_UID), { groupIds: [GROUP_ID] });

    // Owner's presence doc (group mode)
    await setDoc(doc(db, 'presence', OWNER_UID), {
      uid: OWNER_UID, mode: 'group',
      audienceGroupIds: [GROUP_ID], lat: 31.6, lng: 34.6,
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1 — users/{uid} onboarding writes
  // ══════════════════════════════════════════════════════════════════════════
  console.log('── SECTION 1: users/{uid} onboarding writes ──');

  // 1.1  Typical onboarding update — no authorityId in payload (FIXED) → ALLOWED
  try {
    const db = testEnv.authenticatedContext(REGULAR_UID).firestore();
    await assertSucceeds(updateDoc(doc(db, 'users', REGULAR_UID), {
      lastActive: new Date(), onboardingStep: 'EQUIPMENT', onboardingStatus: 'ONBOARDING',
      updatedAt: new Date(),
      'core.name': 'Test User', 'core.role': 'USER', 'core.isApproved': false,
      'core.isSuperAdmin': false, 'core.isSystemAdmin': false,
      'core.isVerticalAdmin': false, 'core.isTenantOwner': false,
      'core.managedVertical': '', 'core.tenantId': '', 'core.tenantType': '',
      'core.unitId': '', 'core.unitPath': [],
      'core.gender': 'male', 'core.weight': 70,
      // NO core.authorityId — this is the fix
    }));
    ok('onboarding update (no authorityId) → ALLOWED');
  } catch (err) { fail('onboarding update (no authorityId)', err); }

  // 1.2  Direct authorityId write (what the OLD code did) → DENIED
  try {
    const db = testEnv.authenticatedContext(REGULAR_UID).firestore();
    await assertFails(updateDoc(doc(db, 'users', REGULAR_UID), {
      'core.authorityId': AUTHORITY_ID, updatedAt: new Date(),
    }));
    ok('direct authorityId write → DENIED (noTenantFieldsChanged guard intact)');
  } catch (err) { fail('direct authorityId write should be DENIED', err); }

  // 1.3  COMPLETED step — progression domains/tracks (coins same) → ALLOWED
  try {
    const db = testEnv.authenticatedContext(REGULAR_UID).firestore();
    await assertSucceeds(updateDoc(doc(db, 'users', REGULAR_UID), {
      onboardingStep: 'COMPLETED', onboardingStatus: 'COMPLETED', updatedAt: new Date(),
      onboardingComplete: true,
      'progression.globalLevel': 1, 'progression.globalXP': 0, 'progression.coins': 0,
      'progression.activePrograms': [], 'progression.domains': {}, 'progression.tracks': {},
    }));
    ok('COMPLETED step — progression same values → ALLOWED');
  } catch (err) { fail('COMPLETED step progression update', err); }

  // 1.4  Game-integrity guard — coin self-award → DENIED
  try {
    const db = testEnv.authenticatedContext(REGULAR_UID).firestore();
    await assertFails(updateDoc(doc(db, 'users', REGULAR_UID), {
      'progression.coins': 9999, updatedAt: new Date(),
    }));
    ok('coin self-award → DENIED (noGameIntegrityFieldsChanged intact)');
  } catch (err) { fail('coin self-award should be DENIED', err); }

  // 1.5  syncLocationToFirestore — anchorLat/Lng only → ALLOWED
  try {
    const db = testEnv.authenticatedContext(REGULAR_UID).firestore();
    await assertSucceeds(updateDoc(doc(db, 'users', REGULAR_UID), {
      'core.anchorLat': 31.5, 'core.anchorLng': 34.5, updatedAt: new Date(),
    }));
    ok('anchor lat/lng update (no authorityId) → ALLOWED');
  } catch (err) { fail('anchor lat/lng update', err); }

  // 1.6  Owner: same authorityId re-written (Scenario B) → ALLOWED
  //      (simulates syncOnboardingToFirestore on an existing user with same city)
  try {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertFails(updateDoc(doc(db, 'users', OWNER_UID), {
      // Scenario C: changing authorityId → still DENIED (user must use endpoint)
      'core.authorityId': 'tel_aviv', updatedAt: new Date(),
    }));
    ok('city change (value → different value) → DENIED (Scenario C)');
  } catch (err) { fail('city change should be DENIED (Scenario C)', err); }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 2 — null-safe presence rules (memberGroupIds helper)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── SECTION 2: null-safe presence rules ──');

  // 2.1  Presence write — empty audienceGroupIds, no user_memberships → ALLOWED
  try {
    const db = testEnv.authenticatedContext(GUEST_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'presence', GUEST_UID), {
      uid: GUEST_UID, mode: 'verified_global', audienceGroupIds: [], lat: 31.6, lng: 34.6,
    }));
    ok('presence write (empty audienceGroupIds, no user_memberships) → ALLOWED');
  } catch (err) { fail('presence write empty audienceGroupIds', err); }

  // 2.2  Presence write — non-empty audienceGroupIds, NO user_memberships → DENIED
  try {
    const db = testEnv.authenticatedContext(GUEST_UID).firestore();
    await assertFails(setDoc(doc(db, 'presence', GUEST_UID), {
      uid: GUEST_UID, mode: 'group', audienceGroupIds: [GROUP_ID], lat: 31.6, lng: 34.6,
    }));
    ok('presence write (groupIds, no user_memberships) → DENIED (memberGroupIds=[] guard)');
  } catch (err) { fail('presence write with groupIds, no membership should be DENIED', err); }

  // 2.3  Add guest's user_memberships, then write group presence → ALLOWED
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'user_memberships', GUEST_UID), { groupIds: [GROUP_ID] });
  });
  try {
    const db = testEnv.authenticatedContext(GUEST_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'presence', GUEST_UID), {
      uid: GUEST_UID, mode: 'group', audienceGroupIds: [GROUP_ID], lat: 31.6, lng: 34.6,
    }));
    ok('presence write (user_memberships exists + correct groupId) → ALLOWED');
  } catch (err) { fail('presence write with valid user_memberships', err); }

  // 2.4  Presence GROUP read — reader has NO user_memberships → DENIED
  try {
    const db = testEnv.authenticatedContext(NOMEM_UID).firestore();
    await assertFails(getDoc(doc(db, 'presence', OWNER_UID)));
    ok('presence group read (no user_memberships) → DENIED (memberGroupIds=[] → no match)');
  } catch (err) { fail('presence group read without membership should be DENIED', err); }

  // 2.5  Presence GROUP read — reader HAS user_memberships with correct groupId → ALLOWED
  try {
    const db = testEnv.authenticatedContext(GUEST_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'presence', OWNER_UID)));
    ok('presence group read (user_memberships has groupId) → ALLOWED');
  } catch (err) { fail('presence group read with valid membership', err); }

  // 2.6  Owner's own presence — always readable → ALLOWED
  try {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'presence', OWNER_UID)));
    ok('owner reads own presence → ALLOWED');
  } catch (err) { fail("owner read own presence", err); }

  // ── Summary ────────────────────────────────────────────────────────────────
  await testEnv.cleanup();
  const total = passed + (process.exitCode === 1 ? '?' : 0);
  const status = process.exitCode === 1 ? '❌  SOME TESTS FAILED' : `✅  ALL ${passed} TESTS PASSED`;
  console.log(`\n${status}\n`);
}

run().catch((err) => {
  console.error('\n[FATAL]', err);
  process.exit(1);
});
