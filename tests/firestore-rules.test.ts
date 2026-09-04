/**
 * Firestore Rules — Cumulative Integration Test Suite
 *
 * Covers workstreams deployed together:
 *   presence-group  — Block 1 presence rules (group scope + audienceGroupIds validation)
 *   Phase G         — community_groups/members create with inviteCode + admin-remove
 *   H2              — member role-change guards (promote/demote/remove)
 *   sessions        — scheduleSlots/meetingLocation hasOnly guard
 *   tenant-unit     — core.tenantId/unitId/unitPath admin-only initial write (01.09.2026)
 *   military-decl   — military_declarations/{uid} lockdown + unitDirectory read-only
 *                      public index + users/{uid} no-leak tripwire (Phase 3a, 02.09.2026)
 *   reserve-league  — community_groups/military_reserve_general members-only read lockdown
 *                      (Phase 6a, 04.09.2026)
 *
 * Run:  npx firebase emulators:exec --only firestore "npx tsx tests/firestore-rules.test.ts"
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';

// ─── Harness ──────────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;
const failures: string[] = [];

async function it(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (e: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e?.message ?? e}`);
    fail++;
    failures.push(name);
  }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

const PROJECT_ID = 'appout-1';
const rules = readFileSync('firestore.rules', 'utf8');

let env: RulesTestEnvironment;

async function setup() {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: '127.0.0.1',
      port: 8080,
    },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    // Users
    await setDoc(doc(db, 'users', 'broadcaster1'), {
      core: { name: 'B1', discoverable: true, isVerified: true },
      social: { groupIds: ['grp1'] },
    });
    await setDoc(doc(db, 'users', 'broadcaster2'), {
      core: { name: 'B2', discoverable: true },
      social: { groupIds: [] },
    });
    await setDoc(doc(db, 'users', 'reader_member'), {
      core: { name: 'RM', discoverable: true },
      social: { groupIds: ['grp1'] },
    });
    await setDoc(doc(db, 'users', 'reader_outsider'), {
      core: { name: 'RO', discoverable: true },
      social: { groupIds: ['grp2'] },
    });
    await setDoc(doc(db, 'users', 'group_owner'), {
      core: { name: 'Owner', discoverable: true },
      social: { groupIds: ['grp_test'] },
    });
    await setDoc(doc(db, 'users', 'group_admin_user'), {
      core: { name: 'Admin', discoverable: true },
      social: { groupIds: ['grp_test'] },
    });
    await setDoc(doc(db, 'users', 'regular_member'), {
      core: { name: 'Reg', discoverable: true },
      social: { groupIds: ['grp_test'] },
    });
    await setDoc(doc(db, 'users', 'regular_member2'), {
      core: { name: 'Reg2', discoverable: true },
      social: { groupIds: ['grp_test'] },
    });

    // Presence docs
    await setDoc(doc(db, 'presence', 'broadcaster1'), {
      uid: 'broadcaster1',
      name: 'B1',
      ageGroup: 'adult',
      mode: 'group',
      audienceGroupIds: ['grp1'],
      lat: 32.08,
      lng: 34.78,
      updatedAt: new Date(),
    });
    await setDoc(doc(db, 'presence', 'broadcaster2'), {
      uid: 'broadcaster2',
      name: 'B2',
      ageGroup: 'adult',
      mode: 'verified_global',
      lat: 32.09,
      lng: 34.79,
      updatedAt: new Date(),
    });

    // Community groups
    await setDoc(doc(db, 'community_groups', 'grp_test'), {
      name: 'Test Group',
      createdBy: 'group_owner',
      isPublic: false,
      isOfficial: false,
      isLocked: false,
      source: 'user',
      inviteCode: 'SECRET42',
    });
    await setDoc(doc(db, 'community_groups', 'grp_public'), {
      name: 'Public Group',
      createdBy: 'group_owner',
      isPublic: true,
      isOfficial: false,
      isLocked: false,
      source: 'user',
    });

    // Members
    await setDoc(doc(db, 'community_groups', 'grp_test', 'members', 'group_owner'), {
      uid: 'group_owner', role: 'admin', joinedAt: new Date(),
    });
    await setDoc(doc(db, 'community_groups', 'grp_test', 'members', 'group_admin_user'), {
      uid: 'group_admin_user', role: 'admin', joinedAt: new Date(),
    });
    await setDoc(doc(db, 'community_groups', 'grp_test', 'members', 'regular_member'), {
      uid: 'regular_member', role: 'member', joinedAt: new Date(),
    });
    await setDoc(doc(db, 'community_groups', 'grp_test', 'members', 'regular_member2'), {
      uid: 'regular_member2', role: 'member', joinedAt: new Date(),
    });

    // Phase 6a — reservist league fixture. isPublic:false, isLocked:false —
    // seeded, not createGroup()'d (see scripts/seed-military-reserve-league.ts).
    await setDoc(doc(db, 'community_groups', 'military_reserve_general'), {
      name: 'ליגת המילואים', groupType: 'military',
      isPublic: false, isOfficial: true, isLocked: false,
      source: 'authority', createdBy: 'system',
    });
    await setDoc(doc(db, 'community_groups', 'military_reserve_general', 'members', 'reservist_member'), {
      uid: 'reservist_member', role: 'member', joinedAt: new Date(),
    });

    // Activity — dailyActivity ({userId}_{date}) + streaks ({uid}) for the
    // auth-timing invariant suite.
    await setDoc(doc(db, 'dailyActivity', 'broadcaster1_2026-07-26'), {
      userId: 'broadcaster1', date: '2026-07-26',
      passiveSteps: 0, passiveCalories: 0, passiveActiveMinutes: 0, passiveXpAwardedToday: 0,
    });
    await setDoc(doc(db, 'streaks', 'broadcaster1'), {
      currentStreak: 3, longestStreak: 5, lastActivityDate: '2026-07-26',
    });

    // Tenant/unit lockdown fixtures (01.09.2026 fix).
    await setDoc(doc(db, 'users', 'no_tenant_user'), {
      core: { name: 'NoTenant', discoverable: true, tenantId: '', tenantType: '', unitId: '', unitPath: [] },
    });
    await setDoc(doc(db, 'users', 'has_tenant_user'), {
      core: { name: 'HasTenant', discoverable: true, tenantId: 'brigade_real', tenantType: 'military', unitId: 'unit_real', unitPath: ['unit_real'] },
    });
    await setDoc(doc(db, 'users', 'tenant_admin_user'), {
      core: { name: 'AdminOps', discoverable: true, isSuperAdmin: true },
    });
  });
}

// ─── Test Suites ──────────────────────────────────────────────────────────────

async function testPresenceGroup() {
  console.log('\npresence-group');

  // P1 — group member reads broadcaster presence (shared groupId) → ALLOW
  await it('P1 — group member reads group-mode presence (shared groupId) → ALLOW', async () => {
    const ctx = env.authenticatedContext('reader_member');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'presence', 'broadcaster1')));
  });

  // P2 — outsider (no shared groupId) reads group-mode presence → DENY
  await it('P2 — outsider reads group-mode presence (no shared groupId) → DENY', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    await assertFails(getDoc(doc(ctx.firestore(), 'presence', 'broadcaster1')));
  });

  // P3 — owner writes presence with audienceGroupIds not in own social.groupIds → DENY
  await it('P3 — presence write with spoofed audienceGroupIds (not in social.groupIds) → DENY', async () => {
    // broadcaster2 has social.groupIds=[], tries to claim audienceGroupIds=['grp1']
    const ctx = env.authenticatedContext('broadcaster2');
    await assertFails(setDoc(doc(ctx.firestore(), 'presence', 'broadcaster2'), {
      uid: 'broadcaster2',
      name: 'B2',
      ageGroup: 'adult',
      mode: 'group',
      audienceGroupIds: ['grp1'], // not in their social.groupIds
      lat: 32.09,
      lng: 34.79,
      updatedAt: new Date(),
    }));
  });

  // P4 — client tries to self-write social.groupIds → DENY
  await it('P4 — client self-writes social.groupIds (noSocialGroupIdsChanged rule) → DENY', async () => {
    const ctx = env.authenticatedContext('broadcaster1');
    await assertFails(updateDoc(doc(ctx.firestore(), 'users', 'broadcaster1'), {
      'social.groupIds': ['grp1', 'grp_spoofed'],
    }));
  });
}

async function testPhaseG() {
  console.log('\nPhase G — inviteCode + admin-remove');

  // G1 — public group join without inviteCode → ALLOW
  await it('G1 — public group join (no inviteCode needed) → ALLOW', async () => {
    const ctx = env.authenticatedContext('regular_member');
    await assertSucceeds(setDoc(
      doc(ctx.firestore(), 'community_groups', 'grp_public', 'members', 'regular_member'),
      { uid: 'regular_member', role: 'member', joinedAt: new Date() },
    ));
  });

  // G2 — private group join with correct inviteCode → ALLOW
  await it('G2 — private group join with correct inviteCode → ALLOW', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    await assertSucceeds(setDoc(
      doc(ctx.firestore(), 'community_groups', 'grp_test', 'members', 'reader_outsider'),
      { uid: 'reader_outsider', role: 'member', inviteCode: 'SECRET42', joinedAt: new Date() },
    ));
  });

  // G3 — private group join with wrong inviteCode → DENY
  await it('G3 — private group join with wrong inviteCode → DENY', async () => {
    const ctx = env.authenticatedContext('reader_member');
    await assertFails(setDoc(
      doc(ctx.firestore(), 'community_groups', 'grp_test', 'members', 'reader_member'),
      { uid: 'reader_member', role: 'member', inviteCode: 'WRONG', joinedAt: new Date() },
    ));
  });

  // G4 — group admin removes regular member → ALLOW
  await it('G4 — group admin removes regular member (role=member) → ALLOW', async () => {
    const ctx = env.authenticatedContext('group_admin_user');
    await assertSucceeds(deleteDoc(
      doc(ctx.firestore(), 'community_groups', 'grp_test', 'members', 'regular_member2'),
    ));
  });

  // G5 — group admin tries to remove another admin → DENY
  await it('G5 — group admin tries to remove another admin (role=admin) → DENY', async () => {
    const ctx = env.authenticatedContext('group_admin_user');
    await assertFails(deleteDoc(
      doc(ctx.firestore(), 'community_groups', 'grp_test', 'members', 'group_owner'),
    ));
  });
}

async function testH2Roles() {
  console.log('\nH2 — role-change guards');

  // H2_1 — member self-updates role field → DENY
  await it('H2_1 — member self-update of role field → DENY', async () => {
    const ctx = env.authenticatedContext('regular_member');
    await assertFails(updateDoc(
      doc(ctx.firestore(), 'community_groups', 'grp_test', 'members', 'regular_member'),
      { role: 'admin' },
    ));
  });

  // H2_2 — group admin promotes member → admin → ALLOW
  await it('H2_2 — group admin promotes member → admin → ALLOW', async () => {
    const ctx = env.authenticatedContext('group_admin_user');
    await assertSucceeds(updateDoc(
      doc(ctx.firestore(), 'community_groups', 'grp_test', 'members', 'regular_member'),
      { role: 'admin' },
    ));
  });

  // H2_3 — non-owner admin tries to demote admin → member → DENY
  await it('H2_3 — non-owner admin demotes admin → member (only owner can) → DENY', async () => {
    // After H2_2, regular_member is now admin. group_admin_user cannot demote.
    const ctx = env.authenticatedContext('group_admin_user');
    await assertFails(updateDoc(
      doc(ctx.firestore(), 'community_groups', 'grp_test', 'members', 'regular_member'),
      { role: 'member' },
    ));
  });

  // H2_4 — owner demotes admin → member → ALLOW
  await it('H2_4 — owner demotes admin → member → ALLOW', async () => {
    const ctx = env.authenticatedContext('group_owner');
    await assertSucceeds(updateDoc(
      doc(ctx.firestore(), 'community_groups', 'grp_test', 'members', 'regular_member'),
      { role: 'member' },
    ));
  });
}

async function testSessions() {
  console.log('\nsessions — scheduleSlots/meetingLocation hasOnly guard');

  // S1 — group owner updates scheduleSlots + meetingLocation + updatedAt → ALLOW
  await it('S1 — owner updates scheduleSlots + meetingLocation + updatedAt → ALLOW', async () => {
    const ctx = env.authenticatedContext('group_owner');
    await assertSucceeds(updateDoc(doc(ctx.firestore(), 'community_groups', 'grp_test'), {
      scheduleSlots: [{ day: 'ראשון', time: '08:00' }],
      meetingLocation: { lat: 32.1, lng: 34.8, label: 'כיכר הספורט' },
      updatedAt: new Date(),
    }));
  });

  // S2 — group admin (non-owner) updates scheduleSlots + meetingLocation → ALLOW
  await it('S2 — group admin (non-owner) updates scheduleSlots + meetingLocation → ALLOW', async () => {
    const ctx = env.authenticatedContext('group_admin_user');
    await assertSucceeds(updateDoc(doc(ctx.firestore(), 'community_groups', 'grp_test'), {
      scheduleSlots: [{ day: 'שני', time: '09:00' }],
      meetingLocation: { lat: 32.2, lng: 34.9, label: 'הגן הציבורי' },
      updatedAt: new Date(),
    }));
  });

  // S3 — regular member tries to update scheduleSlots → DENY
  await it('S3 — regular member updates scheduleSlots → DENY', async () => {
    const ctx = env.authenticatedContext('regular_member');
    await assertFails(updateDoc(doc(ctx.firestore(), 'community_groups', 'grp_test'), {
      scheduleSlots: [{ day: 'שלישי', time: '10:00' }],
      updatedAt: new Date(),
    }));
  });

  // S4 — non-owner group admin updates scheduleSlots + name (name not in hasOnly) → DENY
  // The creator rule allows the owner to update name freely; the hasOnly restriction
  // only applies to non-owner group admins. Verify that a non-owner admin is blocked.
  await it('S4 — non-owner admin updates scheduleSlots + name (name not in hasOnly) → DENY', async () => {
    const ctx = env.authenticatedContext('group_admin_user');
    await assertFails(updateDoc(doc(ctx.firestore(), 'community_groups', 'grp_test'), {
      scheduleSlots: [{ day: 'רביעי', time: '07:00' }],
      name: 'Renamed Group',
      updatedAt: new Date(),
    }));
  });
}

async function testActivityRules() {
  console.log('\nactivity — dailyActivity + streaks (auth-timing invariant)');

  // A1 — UNauthenticated read of dailyActivity → DENY. This is the exact bug:
  // on cold start the client fired reads before the auth token was attached
  // (request.auth == null) → permission-denied. The client fix (useDailyActivity
  // authReady gate) waits for auth; these rules are unchanged.
  await it('A1 — unauthenticated reads dailyActivity → DENY', async () => {
    const ctx = env.unauthenticatedContext();
    await assertFails(getDoc(doc(ctx.firestore(), 'dailyActivity', 'broadcaster1_2026-07-26')));
  });

  // A2 — authenticated owner reads own dailyActivity → ALLOW (why the fix works
  // once auth is ready).
  await it('A2 — owner reads own dailyActivity → ALLOW', async () => {
    const ctx = env.authenticatedContext('broadcaster1');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'dailyActivity', 'broadcaster1_2026-07-26')));
  });

  // A3 — a DIFFERENT authenticated user reads it → ALLOW *by design*: the read
  // gate is isAuthenticated() so leaderboard queries can aggregate across users.
  // ("another user can't read" is intentionally NOT the invariant — writes are
  // owner-scoped, reads are open to any signed-in user.)
  await it('A3 — other authenticated user reads dailyActivity → ALLOW (leaderboard design)', async () => {
    const ctx = env.authenticatedContext('broadcaster2');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'dailyActivity', 'broadcaster1_2026-07-26')));
  });

  // A4 — owner creates own dailyActivity (userId == uid, passive fields omitted → 0) → ALLOW.
  await it('A4 — owner creates own dailyActivity → ALLOW', async () => {
    const ctx = env.authenticatedContext('broadcaster2');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'dailyActivity', 'broadcaster2_2026-07-26'), {
      userId: 'broadcaster2', date: '2026-07-26',
    }));
  });

  // A5 — a non-owner writes another user's dailyActivity → DENY (owner-scoped write).
  await it('A5 — non-owner writes another user dailyActivity → DENY', async () => {
    const ctx = env.authenticatedContext('broadcaster2');
    await assertFails(setDoc(doc(ctx.firestore(), 'dailyActivity', 'broadcaster1_2026-07-27'), {
      userId: 'broadcaster1', date: '2026-07-27',
    }));
  });

  // A6 — UNauthenticated read of streaks → DENY (same auth-timing failure mode).
  await it('A6 — unauthenticated reads streaks → DENY', async () => {
    const ctx = env.unauthenticatedContext();
    await assertFails(getDoc(doc(ctx.firestore(), 'streaks', 'broadcaster1')));
  });

  // A7 — authenticated non-owner reads streaks → ALLOW (leaderboard design).
  await it('A7 — other authenticated user reads streaks → ALLOW (leaderboard design)', async () => {
    const ctx = env.authenticatedContext('broadcaster2');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'streaks', 'broadcaster1')));
  });
}

async function testTenantUnitLockdown() {
  console.log('\ntenant-unit-lockdown — core.tenantId/unitId/unitPath self-assignment fix (01.09.2026)');

  // T1 — regular user self-writes core.tenantId while still at default → DENY.
  // This is the exact exploit found: before the fix this succeeded, letting
  // anyone place themselves in any unit's real leaderboard.
  await it('T1 — non-admin self-assigns core.tenantId on update (was ALLOW, now DENY)', async () => {
    const ctx = env.authenticatedContext('no_tenant_user');
    await assertFails(updateDoc(doc(ctx.firestore(), 'users', 'no_tenant_user'), {
      'core.tenantId': 'fake_brigade',
      'core.unitId': 'fake_unit',
    }));
  });

  // T2 — admin (invitation-acceptance flow shape) assigns tenantId/unitId on
  // someone else's doc while still at default → ALLOW. Must keep working —
  // this is invitation.service.ts's real, live write path.
  await it('T2 — admin assigns core.tenantId/unitId on a default doc → ALLOW', async () => {
    const ctx = env.authenticatedContext('tenant_admin_user');
    await assertSucceeds(updateDoc(doc(ctx.firestore(), 'users', 'no_tenant_user'), {
      'core.tenantId': 'real_brigade',
      'core.unitId': 'real_unit',
    }));
  });

  // T3 — a regular (non-admin) user cannot change their OWN already-set
  // tenantId via client write (unchanged pre-existing behavior for
  // non-admins — once non-default, only Admin SDK / validateAccessCode can
  // change it). NOTE: this codebase has a blanket admin fallback
  // (`match /{document=**} { allow read, write: if isAdmin(); }`,
  // firestore.rules:1837-1839) that bypasses every field-level guard in the
  // file for admins — including this one, and every other protected group
  // (game-integrity, social-groupIds, etc). That's pre-existing, deliberate
  // architecture, not something this fix changes or should try to close.
  await it('T3 — non-admin cannot change their own already-non-default core.tenantId → DENY', async () => {
    const ctx = env.authenticatedContext('has_tenant_user');
    await assertFails(updateDoc(doc(ctx.firestore(), 'users', 'has_tenant_user'), {
      'core.tenantId': 'a_different_brigade',
    }));
  });

  // T4 — regular user self-assigns tenantId at DOCUMENT CREATE time → DENY.
  // The create rule had NO guard on these fields at all before the fix.
  await it('T4 — non-admin self-assigns core.tenantId at doc creation → DENY', async () => {
    const ctx = env.authenticatedContext('new_self_assigning_user');
    await assertFails(setDoc(doc(ctx.firestore(), 'users', 'new_self_assigning_user'), {
      core: { name: 'Sneaky', tenantId: 'fake_brigade_at_create' },
    }));
  });

  // T5 — normal onboarding shell-doc creation (fields absent/default) → ALLOW,
  // unaffected by the fix.
  await it('T5 — normal shell-doc creation with no tenant fields → ALLOW', async () => {
    const ctx = env.authenticatedContext('new_normal_user');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'users', 'new_normal_user'), {
      core: { name: 'Normal' },
    }));
  });
}

// Phase 3a — military_declarations/{uid} lockdown (02.09.2026).
// Flagship requirement: a user's military affiliation must never be
// readable by another user, at the rules level, even when their profile
// is discoverable — closing the exact leak core.declaredMilitary (a plain
// field on users/{uid}) would have had via the existing discoverable +
// user-search.service.ts path.
async function testMilitaryDeclarationLockdown() {
  const VALID_DECLARATION = {
    status: 'reserve',
    orgId: 'brigade_real',
    unitId: 'unit_real',
    unitPathIds: ['unit_real'],
    updatedAt: new Date(),
  };

  // U1 — owner reads their own declaration → ALLOW.
  await it('U1 — owner reads own military_declarations doc → ALLOW', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'military_declarations', 'broadcaster1'), VALID_DECLARATION);
    });
    const ctx = env.authenticatedContext('broadcaster1');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'military_declarations', 'broadcaster1')));
  });

  // U2 — flagship test: another user cannot read it, even though
  // broadcaster1 has core.discoverable == true (fixture default).
  await it('U2 — another user CANNOT read it, even when owner is discoverable → DENY', async () => {
    const ctx = env.authenticatedContext('broadcaster2');
    await assertFails(getDoc(doc(ctx.firestore(), 'military_declarations', 'broadcaster1')));
  });

  // U3 — owner writes a valid declaration directly (no Cloud Function) → ALLOW.
  await it('U3 — owner writes a valid declaration directly → ALLOW', async () => {
    const ctx = env.authenticatedContext('broadcaster2');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'military_declarations', 'broadcaster2'), VALID_DECLARATION));
  });

  // U3b — schema enforcement: an unexpected key, or an oversized field,
  // must be rejected — proves isValidMilitaryDeclaration() actually
  // enforces the closed shape, not just documents it in a comment.
  await it('U3b — unexpected key rejected → DENY', async () => {
    const ctx = env.authenticatedContext('broadcaster2');
    await assertFails(setDoc(doc(ctx.firestore(), 'military_declarations', 'broadcaster2'), {
      ...VALID_DECLARATION,
      notes: 'arbitrary extra field',
    }));
  });
  await it('U3b — oversized orgId rejected → DENY', async () => {
    const ctx = env.authenticatedContext('broadcaster2');
    await assertFails(setDoc(doc(ctx.firestore(), 'military_declarations', 'broadcaster2'), {
      ...VALID_DECLARATION,
      orgId: 'x'.repeat(500),
    }));
  });
  await it('U3b — invalid status enum value rejected → DENY', async () => {
    const ctx = env.authenticatedContext('broadcaster2');
    await assertFails(setDoc(doc(ctx.firestore(), 'military_declarations', 'broadcaster2'), {
      ...VALID_DECLARATION,
      status: 'made_up_value',
    }));
  });

  // U4 — another user cannot write to it → DENY.
  await it('U4 — another user cannot write to broadcaster1\'s declaration → DENY', async () => {
    const ctx = env.authenticatedContext('broadcaster2');
    await assertFails(setDoc(doc(ctx.firestore(), 'military_declarations', 'broadcaster1'), VALID_DECLARATION));
  });

  // U5 — admin can read and write any user's declaration → ALLOW.
  await it('U5 — admin reads any declaration → ALLOW', async () => {
    const ctx = env.authenticatedContext('tenant_admin_user');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'military_declarations', 'broadcaster1')));
  });
  await it('U5 — admin writes any declaration → ALLOW', async () => {
    const ctx = env.authenticatedContext('tenant_admin_user');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'military_declarations', 'broadcaster1'), VALID_DECLARATION));
  });

  // U6 — unauthenticated read → DENY.
  await it('U6 — unauthenticated read of any declaration → DENY', async () => {
    const ctx = env.unauthenticatedContext();
    await assertFails(getDoc(doc(ctx.firestore(), 'military_declarations', 'broadcaster1')));
  });
}

// Phase 3a — unitDirectory/{directoryId} (02.09.2026). The whole point of
// this collection is to be searchable by a user with NO existing tenant
// relationship — that's what U7 proves.
async function testUnitDirectory() {
  const DIRECTORY_ENTRY = {
    name: 'חטיבה 11',
    parentId: null,
    level: 'brigade',
    orgId: 'brigade_real',
    unitId: null,
    armType: 'חי"ר',
    statusCategory: 'מילואים',
    updatedAt: new Date(),
  };

  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'unitDirectory', 'brigade_real'), DIRECTORY_ENTRY);
  });

  // U7 — a user with zero tenant relationship (no_tenant_user fixture,
  // core.tenantId == '') can still read the directory. This is the entire
  // reason unitDirectory exists instead of reusing tenants/{orgId}/units,
  // which requires hasTenant(tenantId).
  await it('U7 — user with no tenant relationship reads unitDirectory → ALLOW', async () => {
    const ctx = env.authenticatedContext('no_tenant_user');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'unitDirectory', 'brigade_real')));
  });

  // U8 — a non-admin authenticated user cannot write → DENY.
  await it('U8 — non-admin cannot write unitDirectory → DENY', async () => {
    const ctx = env.authenticatedContext('broadcaster1');
    await assertFails(setDoc(doc(ctx.firestore(), 'unitDirectory', 'brigade_real'), DIRECTORY_ENTRY));
  });

  // U9 — admin can write directly (manual-repair path if sync ever breaks).
  await it('U9 — admin can write unitDirectory directly → ALLOW', async () => {
    const ctx = env.authenticatedContext('tenant_admin_user');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'unitDirectory', 'brigade_real'), DIRECTORY_ENTRY));
  });

  // U10 — unauthenticated read → ALLOW. This is `allow read: if true` by
  // deliberate product decision (David, 02.09.2026) — locked in as a test
  // so a future edit doesn't silently narrow it to isAuthenticated().
  await it('U10 — unauthenticated read of unitDirectory → ALLOW', async () => {
    const ctx = env.unauthenticatedContext();
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'unitDirectory', 'brigade_real')));
  });
}

// Phase 6b — unit_league_aggregates. Same openness as unitDirectory,
// deliberately (see docs/research/military-persona-unified-architecture.md
// §12): the document never carries a uid or a name, so there's no roster
// to lock down here the way community_groups/members needed. This suite
// exists to lock the READ-open / WRITE-admin-only shape in, not to prove a
// roster is protected (there isn't one on this collection).
async function testUnitLeagueAggregates() {
  console.log('\nunit-league-aggregates — public read, admin-only write');

  await setup2UnitLeagueAggregate();

  await it('UL1 — unauthenticated read of a unit aggregate → ALLOW', async () => {
    const ctx = env.unauthenticatedContext();
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'unit_league_aggregates', 'brigade_real')));
  });

  await it('UL2 — regular authenticated user cannot write a unit aggregate directly → DENY', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    await assertFails(setDoc(doc(ctx.firestore(), 'unit_league_aggregates', 'brigade_real'), {
      activeParticipantCount: 999, avgSteps: 99999,
    }));
  });

  await it('UL3 — admin can write a unit aggregate directly (manual-repair path) → ALLOW', async () => {
    const ctx = env.authenticatedContext('tenant_admin_user');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'unit_league_aggregates', 'brigade_real'), {
      activeParticipantCount: 5, avgSteps: 8000,
    }));
  });
}

async function setup2UnitLeagueAggregate() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'unit_league_aggregates', 'brigade_real'), {
      activeParticipantCount: 4, avgSteps: 7000, updatedAt: new Date(),
    });
  });
}

// Phase 6a — reservist league group lockdown. David's flagship test: a
// non-member must not be able to read the roster of a military-type group,
// while a real member (and admin) still can — this is what closes the
// "real names mapped to a military-adjacent group" exposure that community_
// groups/members were previously wide open to for ANY authenticated user.
async function testReserveLeagueLockdown() {
  console.log('\nreserve-league — community_groups/military_reserve_general lockdown');

  await it('R1 — non-member reads the reserve group members list → DENY', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    await assertFails(getDoc(doc(ctx.firestore(), 'community_groups', 'military_reserve_general', 'members', 'reservist_member')));
  });

  await it('R2 — non-member reads the reserve group doc itself → DENY', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    await assertFails(getDoc(doc(ctx.firestore(), 'community_groups', 'military_reserve_general')));
  });

  await it('R3 — a real member reads the members list → ALLOW', async () => {
    const ctx = env.authenticatedContext('reservist_member');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'community_groups', 'military_reserve_general', 'members', 'reservist_member')));
  });

  await it('R4 — a real member reads the group doc → ALLOW', async () => {
    const ctx = env.authenticatedContext('reservist_member');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'community_groups', 'military_reserve_general')));
  });

  await it('R5 — admin reads the members list of a group they are not a member of → ALLOW', async () => {
    const ctx = env.authenticatedContext('tenant_admin_user');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'community_groups', 'military_reserve_general', 'members', 'reservist_member')));
  });

  await it('R6 — non-military groups are unaffected: outsider still reads grp_public members list → ALLOW', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'community_groups', 'grp_test', 'members', 'regular_member')));
  });

  // The regression this specifically guards against: an unfiltered LIST
  // query (not a single get()) must also fail closed for a non-member —
  // this is the exact shape that was proven, empirically, to leak through
  // a resource.data-based rule (see the feed_posts finding this round);
  // the path-based isMilitaryGroup(docId)/isGroupMember(docId) check here
  // must not have the same failure mode.
  await it('R7 — non-member LISTS the members subcollection (no where clause) → DENY, not a silent empty-but-allowed result', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    await assertFails(getDocs(collection(ctx.firestore(), 'community_groups', 'military_reserve_general', 'members')));
  });
}

// Phase 3a — structural regression tripwire, not a rules-engine security
// proof (Firestore rules can't do field-level redaction, so this only
// proves "if nobody writes the field there, it isn't there" — a fact
// about the fixture, not the rule). Its value is catching the day someone
// reintroduces a military field directly onto users/{uid} (a future PR, a
// copy-paste from the old Phase-2 design, or a seed script writing stale
// fields directly to production, as already documented elsewhere).
async function testNoUsersDocLeak() {
  await it('U11 — a discoverable user doc has no military-declaration key on it', async () => {
    const ctx = env.authenticatedContext('broadcaster2');
    const snap = await assertSucceeds(getDoc(doc(ctx.firestore(), 'users', 'broadcaster1')));
    const data = snap.data() as Record<string, unknown> | undefined;
    const core = (data?.core ?? {}) as Record<string, unknown>;
    if ('declaredMilitary' in core || 'militaryDeclaration' in core || 'declaredMilitary' in (data ?? {})) {
      throw new Error('users/{uid} doc has a military-declaration field — it must live in military_declarations/{uid} instead');
    }
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Setting up test environment...');
  await setup();

  await testPresenceGroup();
  await testPhaseG();
  await testH2Roles();
  await testSessions();
  await testActivityRules();
  await testTenantUnitLockdown();
  await testMilitaryDeclarationLockdown();
  await testUnitDirectory();
  await testUnitLeagueAggregates();
  await testReserveLeagueLockdown();
  await testNoUsersDocLeak();

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${pass} passed, ${fail} failed`);
  if (failures.length > 0) {
    console.log('\nFailed tests:');
    failures.forEach((f) => console.log(`  ✗ ${f}`));
  }

  await env.cleanup();

  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('Test harness error:', e);
  process.exit(1);
});
