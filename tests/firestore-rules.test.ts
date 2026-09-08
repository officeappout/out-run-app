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
 *                      (Phase 6a, 04.09.2026) — isMilitaryGroup() renamed to
 *                      isReserveLeagueGroup() (07.09.2026), same fixed-id check
 *   persona-audience — community_groups_reserve top-level collection, gated by
 *                      get() on the requester's own military_declarations doc
 *                      ("צו כושר" fitness-meetup groups, Phase 07.09.2026)
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
  query,
  where,
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
      isActive: true,
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

  // U3c — pendingUnitId (07.09.2026, "unit isn't in the list" submission
  // display fix). A fresh top-level unit proposal has NO orgId/unitId yet
  // (nothing real exists to reference) — pendingUnitId alone must still be
  // a valid declaration, not rejected as "incomplete".
  await it('U3c — pendingUnitId alone (no orgId/unitId yet) → ALLOW', async () => {
    const ctx = env.authenticatedContext('broadcaster2');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'military_declarations', 'broadcaster2'), {
      status: 'reserve',
      pendingUnitId: 'bde_u_abc123',
      updatedAt: new Date(),
    }));
  });
  await it('U3c — pendingUnitId alongside a real orgId (battalion/company under a real parent) → ALLOW', async () => {
    const ctx = env.authenticatedContext('broadcaster2');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'military_declarations', 'broadcaster2'), {
      status: 'reserve',
      orgId: 'brigade_real',
      pendingUnitId: 'bn_brigade_real_abc123',
      updatedAt: new Date(),
    }));
  });
  await it('U3c — oversized pendingUnitId rejected → DENY', async () => {
    const ctx = env.authenticatedContext('broadcaster2');
    await assertFails(setDoc(doc(ctx.firestore(), 'military_declarations', 'broadcaster2'), {
      ...VALID_DECLARATION,
      pendingUnitId: 'x'.repeat(500),
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

  // Changed 07.09.2026: the parent group doc carries no real names — only
  // its members/{uid} roster does (see R1/R7) — so it's unconditionally
  // readable like any other group, same as R6 below. See R8's comment for
  // why gating this doc broke list queries for every non-admin.
  await it('R2 — non-member reads the reserve group doc itself → ALLOW (no real names on this doc — only members/{uid} is gated, see R1)', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'community_groups', 'military_reserve_general')));
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

  // Found 07.09.2026 verifying "צו כושר ב'" in production: R1-R7 only ever
  // exercise getDoc() or a list scoped to ONE already-known docId's own
  // subcollection — in both cases the wildcard segment is fixed for the
  // whole request. NearbyGroupsRow's actual query is a LIST against the
  // TOP-LEVEL community_groups collection with no docId filter at all, so
  // docId varies across every potential result document. Firestore can't
  // prove isReserveLeagueGroup(docId) from the query's own where-clauses
  // (isPublic/isActive say nothing about docId), so it can't bound the
  // OR-chain for ANY non-admin caller and rejects the whole query — even
  // though every real matching document except one would evaluate true.
  // This is the same class of bug as the nested collectionGroup design
  // this session already ruled out — but it hit community_groups' own
  // pre-existing top-level rule instead, LIVE in production since Phase 6a.
  await it('R8 — non-admin LISTS community_groups the way NearbyGroupsRow actually does (isPublic+isActive, no docId filter) → ALLOW, must include grp_test', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    const snap = await assertSucceeds(
      getDocs(query(collection(ctx.firestore(), 'community_groups'), where('isPublic', '==', true), where('isActive', '==', true)))
    );
    if (!snap.docs.some((d) => d.id === 'grp_public')) {
      throw new Error('grp_public missing from list result — the fix must not exclude ordinary public groups');
    }
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

// "היחידה שלי לא ברשימה" (04.09.2026) — exact mirror of user_contributions'
// owner+admin shape, deliberately: a pending unit must be invisible to
// everyone but its submitter and admins until approved, or the app fills up
// with duplicate not-yet-real battalions the moment two soldiers search the
// same missing unit. unitDirectory itself is never touched by any of this.
async function testPendingUnits() {
  console.log('\npending_units — owner+admin only, mirrors user_contributions');

  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'pending_units', 'co_bn_9307_test'), {
      submittedBy: 'reservist_member',
      level: 'company',
      proposedName: 'פלוגה בדיקה',
      status: 'pending',
      resolvedTo: null,
    });
  });

  await it('PU1 — the submitter reads their own pending unit → ALLOW', async () => {
    const ctx = env.authenticatedContext('reservist_member');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'pending_units', 'co_bn_9307_test')));
  });

  await it('PU2 — a different authenticated user reads someone elses pending unit → DENY', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    await assertFails(getDoc(doc(ctx.firestore(), 'pending_units', 'co_bn_9307_test')));
  });

  await it('PU3 — admin reads any pending unit → ALLOW', async () => {
    const ctx = env.authenticatedContext('tenant_admin_user');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'pending_units', 'co_bn_9307_test')));
  });

  await it('PU4 — an authenticated user creates their own pending unit → ALLOW', async () => {
    const ctx = env.authenticatedContext('reservist_member');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'pending_units', 'co_bn_9307_own'), {
      submittedBy: 'reservist_member', level: 'company', proposedName: 'פלוגה שלי', status: 'pending', resolvedTo: null,
    }));
  });

  await it('PU5 — a user cannot create a pending unit claiming a different submittedBy → DENY', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    await assertFails(setDoc(doc(ctx.firestore(), 'pending_units', 'co_bn_9307_spoof'), {
      submittedBy: 'reservist_member', level: 'company', proposedName: 'זיוף', status: 'pending', resolvedTo: null,
    }));
  });

  await it('PU6 — a non-admin submitter cannot approve/update their own pending unit → DENY', async () => {
    const ctx = env.authenticatedContext('reservist_member');
    await assertFails(updateDoc(doc(ctx.firestore(), 'pending_units', 'co_bn_9307_test'), { status: 'approved' }));
  });

  await it('PU7 — admin can update (approve/reject) a pending unit → ALLOW', async () => {
    const ctx = env.authenticatedContext('tenant_admin_user');
    await assertSucceeds(updateDoc(doc(ctx.firestore(), 'pending_units', 'co_bn_9307_test'), { status: 'rejected' }));
  });

  // Same regression class as R7 above — an unfiltered LIST by a non-owner,
  // non-admin user must fail closed, not silently return an empty allowed set.
  await it('PU8 — non-owner LISTS pending_units with no filter → DENY', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    await assertFails(getDocs(collection(ctx.firestore(), 'pending_units')));
  });

  // Real production incident, 06.09.2026: submitPendingUnit()'s own
  // idempotency check (getDoc before create, so a resubmission doesn't
  // reset an already-approved/rejected doc back to pending) calls getDoc
  // on a NOT-YET-EXISTING doc on every first-time submission — the normal
  // path, not an edge case. PU1-PU8 above only ever tested reads on a doc
  // pre-created via a rules bypass; none of them exercised this exact
  // sequence, so this slipped through both the emulator suite AND an
  // admin-SDK end-to-end test (which bypasses rules entirely) before a real
  // logged-in user hit it in production and the CTA silently did nothing.
  await it('PU9 — getDoc on a NOT-YET-EXISTING doc, by the user who would own it → ALLOW (no data exists to leak; this is the exact call submitPendingUnit() makes on every first submission)', async () => {
    const ctx = env.authenticatedContext('future_submitter');
    const snap = await assertSucceeds(getDoc(doc(ctx.firestore(), 'pending_units', 'co_bn_9999_pu9')));
    if (snap.exists()) throw new Error('test setup error: doc should not exist');
  });

  await it('PU10 — getDoc on a NOT-YET-EXISTING doc, by a DIFFERENT user → ALLOW too (still nothing to leak — the security boundary is only on an EXISTING doc, verified by PU2)', async () => {
    const ctx = env.authenticatedContext('someone_else_entirely');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'pending_units', 'co_bn_9999_pu9')));
  });
}

async function testPersonaAudienceCollection() {
  console.log('\npersona-audience — community_groups_reserve (Phase "צו כושר", 07.09.2026)');

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'military_declarations', 'pa_reservist'), { status: 'reserve', updatedAt: new Date() });
    await setDoc(doc(db, 'military_declarations', 'pa_regular'), { status: 'regular', updatedAt: new Date() });
    // pa_no_declaration deliberately has NO military_declarations doc at all.
    await setDoc(doc(db, 'community_groups_reserve', 'pa_group_1'), { parkId: 'PARK_TEST', hours: '18:00' });
  });

  await it('PA1 — declared reservist gets the doc directly → ALLOW', async () => {
    const ctx = env.authenticatedContext('pa_reservist');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'community_groups_reserve', 'pa_group_1')));
  });

  await it('PA2 — declared reservist LISTS filtered by parkId (the real park-page query shape) → ALLOW, exactly 1 result', async () => {
    const ctx = env.authenticatedContext('pa_reservist');
    const snap = await assertSucceeds(
      getDocs(query(collection(ctx.firestore(), 'community_groups_reserve'), where('parkId', '==', 'PARK_TEST')))
    );
    if (snap.size !== 1) throw new Error(`expected 1 result, got ${snap.size}`);
  });

  await it('PA3 — declared "regular" (not reserve) gets the SAME doc → DENY (persona value must match exactly, not just "any declaration")', async () => {
    const ctx = env.authenticatedContext('pa_regular');
    await assertFails(getDoc(doc(ctx.firestore(), 'community_groups_reserve', 'pa_group_1')));
  });

  await it('PA4 — no declaration at all gets the doc → DENY, not a thrown 500/crash the client can\'t handle (still surfaces as permission-denied)', async () => {
    const ctx = env.authenticatedContext('pa_no_declaration');
    await assertFails(getDoc(doc(ctx.firestore(), 'community_groups_reserve', 'pa_group_1')));
  });

  await it('PA5 — no declaration at all LISTS filtered by parkId → ALLOW the call to resolve with zero rows OR reject; either way must not return the doc', async () => {
    const ctx = env.authenticatedContext('pa_no_declaration');
    try {
      const snap = await getDocs(query(collection(ctx.firestore(), 'community_groups_reserve'), where('parkId', '==', 'PARK_TEST')));
      if (snap.size !== 0) throw new Error(`expected 0 results for an undeclared user, got ${snap.size}`);
    } catch (e: any) {
      if (e?.code !== 'permission-denied') throw e;
    }
  });

  await it('PA6 — unauthenticated gets the doc → DENY', async () => {
    const ctx = env.unauthenticatedContext();
    await assertFails(getDoc(doc(ctx.firestore(), 'community_groups_reserve', 'pa_group_1')));
  });

  await it('PA7 — admin gets the doc despite no persona declared → ALLOW (panel edit-form access)', async () => {
    const ctx = env.authenticatedContext('tenant_admin_user');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'community_groups_reserve', 'pa_group_1')));
  });

  await it('PA8 — a declared reservist (non-admin) tries to WRITE directly → DENY (write is admin-only; the app writes only via community.service.ts\'s atomic batch, never from a user session)', async () => {
    const ctx = env.authenticatedContext('pa_reservist');
    await assertFails(setDoc(doc(ctx.firestore(), 'community_groups_reserve', 'pa_group_1'), { parkId: 'HACK', hours: '00:00' }));
  });
}

// Found 08.09.2026 while verifying the card fix: a persona-gated group's
// SENSITIVE FIELDS were rules-protected, but membership itself was not —
// members/{uid}'s create rule only ever checked isPublic/inviteCode/
// createdBy, never whether the joiner's own declared persona matched the
// group's gate. A non-matching user could join a public, persona-gated
// group and then read its chat (see testChatLeakClosed below), which
// carries the exact info the field-split was built to hide, in plain text.
async function testPersonaGatedMembershipBlock() {
  console.log('\npersona-gated-membership — members/{uid} create now checks the gate too (08.09.2026)');

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // A real "צו כושר"-shaped group: public (so isPublic alone would have
    // let anyone join before this fix), persona-gated via a
    // community_groups_reserve copy — mirrors the real production shape
    // (community_groups/HZBAz5d3UKEcs20R6EIC + its reserve copy).
    await setDoc(doc(db, 'community_groups', 'pg_group_public'), {
      name: 'Test Gated Group', isPublic: true, isLocked: false, createdBy: 'system',
    });
    await setDoc(doc(db, 'community_groups_reserve', 'pg_group_public'), {
      meetingLocation: { address: 'Secret Address' }, phone: '050-0000000',
    });
    // An ordinary, ungated public group — must be completely unaffected.
    await setDoc(doc(db, 'community_groups', 'pg_group_ungated'), {
      name: 'Ordinary Group', isPublic: true, isLocked: false, createdBy: 'system',
    });
  });

  await it('PG1 — a user with NO reserve declaration tries to join the gated group → DENY', async () => {
    const ctx = env.authenticatedContext('pa_no_declaration');
    await assertFails(setDoc(doc(ctx.firestore(), 'community_groups', 'pg_group_public', 'members', 'pa_no_declaration'), {
      uid: 'pa_no_declaration', role: 'member', joinedAt: new Date(),
    }));
  });

  await it('PG2 — a user declared "regular" (not reserve) tries to join the gated group → DENY', async () => {
    const ctx = env.authenticatedContext('pa_regular');
    await assertFails(setDoc(doc(ctx.firestore(), 'community_groups', 'pg_group_public', 'members', 'pa_regular'), {
      uid: 'pa_regular', role: 'member', joinedAt: new Date(),
    }));
  });

  await it('PG3 — a genuinely declared reservist joins the gated group → ALLOW', async () => {
    const ctx = env.authenticatedContext('pa_reservist');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'community_groups', 'pg_group_public', 'members', 'pa_reservist'), {
      uid: 'pa_reservist', role: 'member', joinedAt: new Date(),
    }));
  });

  await it('PG4 — the SAME non-declared user joins the UNGATED ordinary group → ALLOW (unaffected)', async () => {
    const ctx = env.authenticatedContext('pa_no_declaration');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'community_groups', 'pg_group_ungated', 'members', 'pa_no_declaration'), {
      uid: 'pa_no_declaration', role: 'member', joinedAt: new Date(),
    }));
  });

  await it('PG5 — admin joins/adds a member to the gated group despite no persona declared → ALLOW (panel/moderation access, via isAdmin())', async () => {
    const ctx = env.authenticatedContext('tenant_admin_user');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'community_groups', 'pg_group_public', 'members', 'some_other_uid'), {
      uid: 'some_other_uid', role: 'member', joinedAt: new Date(),
    }));
  });
}

// Found 08.09.2026, confirmed live in production against a real,
// completely uninvolved native anonymous account: "any authenticated user
// can read a group-type chat" leaked lastMessage/participants/
// participantNames for EVERY group chat, to anyone, whether or not they
// were ever a member. chatId is deterministic ("group_" + groupId), so no
// guessing was even required.
async function testChatLeakClosed() {
  console.log('\nchat-leak-closed — chats/{chatId} group-read now requires real membership (08.09.2026)');

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'community_groups', 'cl_group'), { name: 'Chat Test Group', isPublic: true, isLocked: false, createdBy: 'cl_member' });
    await setDoc(doc(db, 'community_groups', 'cl_group', 'members', 'cl_member'), { uid: 'cl_member', role: 'member', joinedAt: new Date() });
    // Chat participants deliberately does NOT yet include cl_member — the
    // realistic "just joined, chat-sync step hasn't landed yet" case
    // (joinGroup's addMemberToGroupChat/createGroupChat step is non-fatal).
    await setDoc(doc(db, 'chats', 'group_cl_group'), {
      type: 'group', groupId: 'cl_group', participants: [], participantNames: {},
      lastMessage: 'מחר ב-20:00 בספורטק', lastMessageAt: new Date(),
    });
    // A DM, for the regression check that participant-based reads still work.
    await setDoc(doc(db, 'chats', 'cl_dm'), {
      type: 'dm', participants: ['cl_dm_a', 'cl_dm_b'], participantNames: {},
      lastMessage: 'hey', lastMessageAt: new Date(),
    });
  });

  await it('CL1 — a completely uninvolved, non-member authenticated user reads the group chat → DENY', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    await assertFails(getDoc(doc(ctx.firestore(), 'chats', 'group_cl_group')));
  });

  await it('CL2 — a genuine community_groups member (not yet in participants[]) reads the group chat → ALLOW', async () => {
    const ctx = env.authenticatedContext('cl_member');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'chats', 'group_cl_group')));
  });

  await it('CL3 — admin reads the group chat despite not being a member → ALLOW (global isAdmin() catch-all, unaffected by this change)', async () => {
    const ctx = env.authenticatedContext('tenant_admin_user');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'chats', 'group_cl_group')));
  });

  await it('CL4 — DM participant still reads their own thread → ALLOW (unrelated path, regression check)', async () => {
    const ctx = env.authenticatedContext('cl_dm_a');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'chats', 'cl_dm')));
  });

  await it('CL5 — a non-participant reads someone else\'s DM → DENY (regression check, unaffected)', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    await assertFails(getDoc(doc(ctx.firestore(), 'chats', 'cl_dm')));
  });

  await it('CL6 — a real participant LISTS their own inbox (participants array-contains, the actual useChatInbox query shape) → ALLOW, finds their group chat', async () => {
    const ctx = env.authenticatedContext('cl_dm_a');
    // cl_dm_a is only in the DM's participants, not the group chat's — this
    // just proves the list query itself still works post-fix (the
    // second OR-clause didn't break the array-contains list-safety proof).
    const snap = await assertSucceeds(
      getDocs(query(collection(ctx.firestore(), 'chats'), where('participants', 'array-contains', 'cl_dm_a')))
    );
    if (snap.size !== 1 || snap.docs[0].id !== 'cl_dm') {
      throw new Error(`expected exactly the cl_dm thread, got ${snap.size} docs: ${snap.docs.map((d) => d.id).join(',')}`);
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
  await testPendingUnits();
  await testPersonaAudienceCollection();
  await testPersonaGatedMembershipBlock();
  await testChatLeakClosed();

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
