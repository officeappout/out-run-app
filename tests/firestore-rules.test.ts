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
 * Run: `firebase emulators:start --only firestore,auth` in one terminal,
 * `npm test` in another. Every case below fails immediately if the emulator
 * isn't reachable at 127.0.0.1:8080 — this is an emulator integration
 * suite, not a pure-logic unit test (see vitest.config.ts).
 */

import { describe, beforeAll, afterAll, it as vitestIt } from 'vitest';
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
//
// Each case below is registered through this hand-rolled `it()`, not
// vitest's — it runs its case immediately and swallows the failure so the
// suite can report every case in one pass, matching how this file ran
// before it was wired into vitest (see wrapSuite() near the bottom, which
// re-throws for vitest if any case a suite ran did fail).

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
      inviteCode: 'SECRET42', // legacy field — still written for the backward-compat overlap period
    });
    // SPEC-01 task 2 — the private/invite copy every real writer now creates
    // alongside the group doc; the members/{uid} create rule (Phase G below)
    // validates against THIS, not the legacy field above.
    await setDoc(doc(db, 'community_groups', 'grp_test', 'private', 'invite'), {
      code: 'SECRET42',
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

  // David's proof #1: does an UNFILTERED list (no where clause at all — the
  // exact shape subscribeToAllChats uses for the admin master inbox) still
  // work? This is the query shape that actually stresses whether Firestore
  // can prove the rule from query metadata alone — CL6 above has a `where`
  // filter that already satisfies clause A, so it doesn't test this.
  await it('CL7 — a NON-ADMIN attempts an unfiltered list() on chats (no where clause) → DENY (neither clause is provable with no query filter, no catch-all applies)', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    await assertFails(getDocs(collection(ctx.firestore(), 'chats')));
  });

  await it('CL8 — an ADMIN attempts the SAME unfiltered list() (the real subscribeToAllChats shape) → ALLOW, returns every chat including ones they are not a participant of', async () => {
    const ctx = env.authenticatedContext('tenant_admin_user');
    const snap = await assertSucceeds(getDocs(collection(ctx.firestore(), 'chats')));
    if (!snap.docs.some((d) => d.id === 'cl_dm') || !snap.docs.some((d) => d.id === 'group_cl_group')) {
      throw new Error(`admin unfiltered list missing expected docs, got: ${snap.docs.map((d) => d.id).join(',')}`);
    }
  });

  // David's proof #3: production audit found 5 real users in a group chat's
  // participants[] but NOT in that group's community_groups/{id}/members/{uid}
  // (legacy drift — chat.service.ts writes participants independently of the
  // members subcollection in a few code paths). This is the FIRST clause
  // (request.auth.uid in resource.data.participants) — pre-existing,
  // untouched by today's fix — not the new members-based clause. The two
  // `allow read` statements on this match block are OR'd, so a mismatched
  // user should still pass via the first one alone.
  await it('CL9 — a user in participants[] but NOT in community_groups/{groupId}/members/{uid} (the exact real-world mismatch shape) reads their chat → ALLOW (via the untouched participants clause)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'community_groups', 'cl_mismatch_group'), { name: 'Mismatch Group', isPublic: true, isLocked: false, createdBy: 'someone_else' });
      // Deliberately NO members/{uid} doc for cl_mismatch_member.
      await setDoc(doc(db, 'chats', 'group_cl_mismatch_group'), {
        type: 'group', groupId: 'cl_mismatch_group', participants: ['cl_mismatch_member'], participantNames: {},
        lastMessage: 'legacy chat', lastMessageAt: new Date(),
      });
    });
    const ctx = env.authenticatedContext('cl_mismatch_member');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'chats', 'group_cl_mismatch_group')));
  });
}

// David's proof #2: chats/{chatId}'s new clause does a get() on
// community_groups/{groupId}/members/{uid} — Firestore rules cap
// get()/exists() calls at 10 for a single-doc request, 20 for a
// query/list. If that clause were actually EVALUATED per matched document
// (not short-circuited away by clause A already being provable from the
// query's own `where` filter), a user with more chats than the cap would
// see their entire inbox query rejected outright, not slowly — a total,
// silent failure for exactly the users who use the app most. Seeds 25
// group chats a single user is a genuine participant AND community_groups
// member of, then runs the EXACT useChatInbox query shape against all 25.
async function testChatListScale() {
  console.log('\nchat-list-scale — useChatInbox\'s real query shape at 25 chats (proof #2)');

  const STRESS_UID = 'stress_user';
  const N = 25;

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (let i = 0; i < N; i++) {
      const groupId = `stress_group_${i}`;
      const chatId = `group_${groupId}`;
      await setDoc(doc(db, 'community_groups', groupId), { name: `Stress ${i}`, isPublic: true, isLocked: false, createdBy: STRESS_UID });
      await setDoc(doc(db, 'community_groups', groupId, 'members', STRESS_UID), { uid: STRESS_UID, role: 'member', joinedAt: new Date() });
      await setDoc(doc(db, 'chats', chatId), {
        type: 'group', groupId, participants: [STRESS_UID], participantNames: {},
        lastMessage: `msg ${i}`, lastMessageAt: new Date(),
      });
    }
  });

  await it(`CSCALE1 — a user in ${N} group chats LISTS their inbox via array-contains (the real useChatInbox shape) → ALLOW, all ${N} returned`, async () => {
    const ctx = env.authenticatedContext(STRESS_UID);
    const snap = await assertSucceeds(
      getDocs(query(collection(ctx.firestore(), 'chats'), where('participants', 'array-contains', STRESS_UID)))
    );
    if (snap.size !== N) {
      throw new Error(`expected ${N} chats, got ${snap.size} — if this is LESS than ${N} or the call threw, the get()-budget concern is real`);
    }
  });

  await it(`CSCALE2 — a real member reads ONE of those ${N} group chats directly via getDoc → ALLOW (confirms the get()-based clause itself still works at this scale, not just the array-contains path)`, async () => {
    const ctx = env.authenticatedContext(STRESS_UID);
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'chats', 'group_stress_group_0')));
  });
}

// SPEC-01 (docs/audit-2026-09/SPEC-01-close-guest-leaks.md) task 1: this used
// to be `allow read: if isAuthenticated()`. Since anonymous sign-in is open,
// that meant any guest — signed in or not — could dump every admin invitation
// (emails, roles, live 64-char tokens) via a plain unfiltered `list`, or the
// exact `where('email', ...)`/`where('token', ...)` query shapes the client
// used to run directly. AI1-AI3 reproduce those; AI4-AI6 prove a real admin
// (client SDK, not just the new Admin-SDK routes) is unaffected.
async function testAdminInvitationsLockdown() {
  console.log('\nadmin-invitations-lockdown — SPEC-01 task 1 (admin_invitations no longer world-readable)');

  const FIXTURE = {
    email: 'invited-city@example.gov.il',
    role: 'authority_manager',
    authorityId: 'authority_test',
    token: 'a'.repeat(64),
    isUsed: false,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    createdBy: 'tenant_admin_user',
  };

  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'admin_invitations', 'ai_test_1'), FIXTURE);
  });

  // AI1/AI2 model the real exploit: `signInAnonymously` is open (see spec
  // background), so "guest" in production means a signed-in-anonymous user —
  // request.auth != null, no email/provider. authenticatedContext(uid) here
  // stands in for that; a truly unauthenticatedContext() was ALREADY denied
  // under the old `isAuthenticated()` rule too, so it wouldn't prove anything.
  await it('AI1 — a signed-in guest (anonymous-sign-in equivalent) LISTS admin_invitations with no filter → DENY', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    await assertFails(getDocs(collection(ctx.firestore(), 'admin_invitations')));
  });

  await it('AI2 — a signed-in guest GETs a known admin_invitations doc by id → DENY', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    await assertFails(getDoc(doc(ctx.firestore(), 'admin_invitations', 'ai_test_1')));
  });

  await it('AI3 — a signed-in NON-admin user runs the exact old where(email==) query shape → DENY', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    await assertFails(getDocs(query(
      collection(ctx.firestore(), 'admin_invitations'),
      where('email', '==', FIXTURE.email),
      where('isUsed', '==', false),
    )));
  });

  await it('AI4 — a signed-in NON-admin user runs the exact old where(token==) query shape → DENY', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    await assertFails(getDocs(query(
      collection(ctx.firestore(), 'admin_invitations'),
      where('token', '==', FIXTURE.token),
      where('isUsed', '==', false),
    )));
  });

  await it('AI5 — an admin GETs the same doc by id → ALLOW (real admins are unaffected)', async () => {
    const ctx = env.authenticatedContext('tenant_admin_user');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'admin_invitations', 'ai_test_1')));
  });

  await it('AI6 — an admin LISTS admin_invitations with no filter → ALLOW (admin panel management pages)', async () => {
    const ctx = env.authenticatedContext('tenant_admin_user');
    const snap = await assertSucceeds(getDocs(collection(ctx.firestore(), 'admin_invitations')));
    if (!snap.docs.some((d) => d.id === 'ai_test_1')) {
      throw new Error('admin list is missing the fixture doc — admin read must still see real invitations');
    }
  });

  await it('AI7 — anonymous tries to WRITE (create) an admin_invitations doc → DENY (write was already isAdmin()-gated, unchanged by this fix — regression check)', async () => {
    const ctx = env.unauthenticatedContext();
    await assertFails(setDoc(doc(ctx.firestore(), 'admin_invitations', 'ai_spoofed'), {
      ...FIXTURE,
      email: 'attacker@example.com',
    }));
  });
}

// SPEC-01 task 2: the invite code moved off community_groups/{id}'s plain
// (world-readable-to-any-signed-in-guest) `inviteCode` field into a
// locked-down community_groups/{id}/private/invite doc. Two things must
// hold at once, proven together here because David flagged the interaction
// as a real blocker (08.09.2026): the members/{uid} create rule (Phase G)
// must actually validate against the NEW location — not silently keep
// working off the legacy field — or private-group joins would break
// silently the moment a real writer stops keeping the legacy field
// authoritative; and the new subcollection's OWN read rule must match
// David's exact ruling: member-readable for an ordinary private group
// (knowing the code is already how they got in — see groupInviteCode() in
// firestore.rules), but owner/admin-only for isLocked and the reserve
// league, where membership comes through a different channel entirely.
async function testPrivateInviteSubcollection() {
  console.log('\nprivate-invite-subcollection — SPEC-01 task 2');

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    // Deliberately DIVERGENT legacy field vs. new location — the only way
    // to prove the rule reads the new doc specifically, not the old field
    // (a fixture where both hold the same value, like grp_test's, can't
    // distinguish "reads the new location" from "still reads the old one").
    await setDoc(doc(db, 'community_groups', 'pi_group_divergent'), {
      name: 'Divergent', createdBy: 'group_owner', isPublic: false,
      isLocked: false, source: 'user', inviteCode: 'OLDWRONG',
    });
    await setDoc(doc(db, 'community_groups', 'pi_group_divergent', 'private', 'invite'), {
      code: 'NEWCODE1',
    });

    await setDoc(doc(db, 'community_groups', 'pi_group_locked'), {
      name: 'Locked Institutional', createdBy: 'pi_locked_owner', isPublic: false,
      isLocked: true, source: 'authority',
    });
    await setDoc(doc(db, 'community_groups', 'pi_group_locked', 'private', 'invite'), {
      code: 'LOCKEDCODE',
    });
    await setDoc(doc(db, 'community_groups', 'pi_group_locked', 'members', 'pi_locked_owner'), {
      uid: 'pi_locked_owner', role: 'admin', joinedAt: new Date(),
    });
    await setDoc(doc(db, 'community_groups', 'pi_group_locked', 'members', 'pi_locked_member'), {
      uid: 'pi_locked_member', role: 'member', joinedAt: new Date(),
    });

    // Reserve league already has military_reserve_general + reservist_member
    // from the global setup() — just add the private/invite doc it would
    // realistically get from a real writer.
    await setDoc(doc(db, 'community_groups', 'military_reserve_general', 'private', 'invite'), {
      code: 'RESERVECODE',
    });
  });

  // ── The actual bug David described: does the JOIN itself use the new location? ──

  await it('PI1 — join with the code from the NEW location (private/invite) → ALLOW', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    await assertSucceeds(setDoc(
      doc(ctx.firestore(), 'community_groups', 'pi_group_divergent', 'members', 'reader_outsider'),
      { uid: 'reader_outsider', role: 'member', inviteCode: 'NEWCODE1', joinedAt: new Date() },
    ));
  });

  await it('PI2 — join with the STALE legacy-field value → DENY (proves the rule no longer consults the old field at all)', async () => {
    const ctx = env.authenticatedContext('reader_member');
    await assertFails(setDoc(
      doc(ctx.firestore(), 'community_groups', 'pi_group_divergent', 'members', 'reader_member'),
      { uid: 'reader_member', role: 'member', inviteCode: 'OLDWRONG', joinedAt: new Date() },
    ));
  });

  await it('PI3 — join with no code at all → DENY (regression: still fails closed)', async () => {
    const ctx = env.authenticatedContext('broadcaster2');
    await assertFails(setDoc(
      doc(ctx.firestore(), 'community_groups', 'pi_group_divergent', 'members', 'broadcaster2'),
      { uid: 'broadcaster2', role: 'member', joinedAt: new Date() },
    ));
  });

  // ── private/invite read rule: ordinary private group → member-readable ──

  await it('PI4 — a genuine (non-owner, non-admin) member of an ordinary private group reads private/invite → ALLOW', async () => {
    const ctx = env.authenticatedContext('regular_member');
    const snap = await assertSucceeds(getDoc(doc(ctx.firestore(), 'community_groups', 'grp_test', 'private', 'invite')));
    if (snap.data()?.code !== 'SECRET42') throw new Error('member read the wrong code');
  });

  await it('PI5 — a non-member reads the same doc → DENY', async () => {
    // NOT reader_outsider — Phase G's G2 test joins them to grp_test earlier
    // in this same run, so by now they'd be a genuine (if incidental)
    // member. A dedicated, never-joined uid is the only way to test
    // "non-member" here without depending on suite run order.
    const ctx = env.authenticatedContext('pi_never_member');
    await assertFails(getDoc(doc(ctx.firestore(), 'community_groups', 'grp_test', 'private', 'invite')));
  });

  await it('PI6 — the group owner reads it → ALLOW', async () => {
    const ctx = env.authenticatedContext('group_owner');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'community_groups', 'grp_test', 'private', 'invite')));
  });

  await it('PI7 — an OUT admin reads it despite not being a member → ALLOW', async () => {
    const ctx = env.authenticatedContext('tenant_admin_user');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'community_groups', 'grp_test', 'private', 'invite')));
  });

  // ── isLocked exception: member is NOT enough, owner/admin only ──

  await it('PI8 — a plain member of an isLocked group reads private/invite → DENY (membership came via an access code, not this code — reading it back would hand out what the lock exists to withhold)', async () => {
    const ctx = env.authenticatedContext('pi_locked_member');
    await assertFails(getDoc(doc(ctx.firestore(), 'community_groups', 'pi_group_locked', 'private', 'invite')));
  });

  await it('PI9 — the owner of that same isLocked group reads it → ALLOW', async () => {
    const ctx = env.authenticatedContext('pi_locked_owner');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'community_groups', 'pi_group_locked', 'private', 'invite')));
  });

  await it('PI10 — an OUT admin reads the isLocked group\'s code → ALLOW', async () => {
    const ctx = env.authenticatedContext('tenant_admin_user');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'community_groups', 'pi_group_locked', 'private', 'invite')));
  });

  // ── reserve-league exception: same shape as isLocked, keyed on the fixed docId ──

  await it('PI11 — a genuine reserve-league roster member reads its private/invite → DENY (persona-declaration membership, not code knowledge)', async () => {
    const ctx = env.authenticatedContext('reservist_member');
    await assertFails(getDoc(doc(ctx.firestore(), 'community_groups', 'military_reserve_general', 'private', 'invite')));
  });

  await it('PI12 — an OUT admin reads the reserve league\'s code → ALLOW', async () => {
    const ctx = env.authenticatedContext('tenant_admin_user');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'community_groups', 'military_reserve_general', 'private', 'invite')));
  });

  // ── write: admin-only, regression check ──

  await it('PI13 — the group owner (non-admin) tries to WRITE private/invite directly → DENY', async () => {
    const ctx = env.authenticatedContext('group_owner');
    await assertFails(setDoc(doc(ctx.firestore(), 'community_groups', 'grp_test', 'private', 'invite'), { code: 'HACKED' }));
  });

  await it('PI14 — an OUT admin writes private/invite directly → ALLOW', async () => {
    const ctx = env.authenticatedContext('tenant_admin_user');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'community_groups', 'pi_group_divergent', 'private', 'invite'), { code: 'NEWCODE1' }));
  });
}

// SPEC-02 Wave A — closing the "allow read: if isAuthenticated() on a
// collection holding PII" pattern for the items that don't have a live
// cross-user feature dependency (sessions, attendance, group_invitations,
// leaderboard_shards/snapshots). SEC-02 (dailyActivity)/F-09 (streaks)/
// F-10 (planned_sessions)/F-12 (registrations) are deliberately NOT here —
// each has a real, currently-working feature (steps/streak leaderboards,
// partner-finder) that a naive owner-only lockdown would break; reported
// separately as stop-C items, not silently skipped.
// SPEC-02 Wave B / SEC-01 — connections/{userId}. PARTIAL fix, see the
// rule's own comment: self-insertion into someone's followers (the
// spec's actually-named exploit, since it feeds straight into presence's
// squad-mode trust check) is UNCHANGED here — closing that is a product
// decision (reported as a stop-C item), not implemented. What these
// tests prove is narrower and unambiguous: a non-owner can no longer
// forge a THIRD PARTY's entry, wipe someone else's real followers, touch
// `following`/`followingCount` on a doc they don't own, or otherwise
// abuse the old "any of these field names changed" check that had no
// ownership guard on it at all.
async function testConnectionsSec01() {
  console.log('\nconnections SEC-01 — non-owner update restricted to self-toggle on followers only (partial fix)');

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'connections', 'conn_victim'), {
      followers: ['conn_real_follower'], following: [], followerCount: 1, followingCount: 0,
    });
  });

  await it('CN1 — a non-owner adds their OWN uid to someone else\'s followers → ALLOW (unchanged — the live one-sided follow feature; NOT a fix, a preserved regression)', async () => {
    const ctx = env.authenticatedContext('conn_attacker');
    await assertSucceeds(updateDoc(doc(ctx.firestore(), 'connections', 'conn_victim'), {
      followers: ['conn_real_follower', 'conn_attacker'],
    }));
  });

  await it('CN2 — a non-owner injects a THIRD PARTY uid (not their own) as a fake follower → DENY (was ALLOW under the old rule — this is the actual fix)', async () => {
    const ctx = env.authenticatedContext('conn_attacker');
    await assertFails(updateDoc(doc(ctx.firestore(), 'connections', 'conn_victim'), {
      followers: ['conn_real_follower', 'conn_framed_third_party'],
    }));
  });

  await it('CN3 — a non-owner wipes someone else\'s real followers list down to just themselves → DENY (removes conn_real_follower, not just adding self)', async () => {
    const ctx = env.authenticatedContext('conn_attacker');
    await assertFails(updateDoc(doc(ctx.firestore(), 'connections', 'conn_victim'), {
      followers: ['conn_attacker'],
    }));
  });

  await it('CN4 — a non-owner touches `following` on someone else\'s doc → DENY (only the owner manages who they follow)', async () => {
    const ctx = env.authenticatedContext('conn_attacker');
    await assertFails(updateDoc(doc(ctx.firestore(), 'connections', 'conn_victim'), {
      following: ['conn_attacker'],
    }));
  });

  await it('CN5 — a non-owner sets followerCount to an arbitrary number → DENY', async () => {
    const ctx = env.authenticatedContext('conn_attacker');
    await assertFails(updateDoc(doc(ctx.firestore(), 'connections', 'conn_victim'), {
      followerCount: 99999,
    }));
  });

  await it('CN6 — a non-owner removes someone ELSE\'s uid from the followers list (not their own) → DENY', async () => {
    const ctx = env.authenticatedContext('conn_attacker');
    await assertFails(updateDoc(doc(ctx.firestore(), 'connections', 'conn_victim'), {
      followers: [],
    }));
  });

  await it('CN7 — the owner freely manages their own doc\'s following/counts → ALLOW (regression, unaffected)', async () => {
    const ctx = env.authenticatedContext('conn_victim');
    await assertSucceeds(updateDoc(doc(ctx.firestore(), 'connections', 'conn_victim'), {
      following: ['someone_they_follow'], followingCount: 1,
    }));
  });
}

// SPEC-02 Wave B / F-18 — analytics_events, referrals, kudos: all had
// `allow create: if isAuthenticated()` with no check that the acting
// user is who the document claims. Verified the real owner field per
// collection via grep before writing each rule.
async function testF18Forgery() {
  console.log('\nF-18 forgery — analytics_events, referrals, kudos ownership on create');

  await it('F18_1 — analytics_events: create with userId == caller → ALLOW', async () => {
    const ctx = env.authenticatedContext('f18_user_a');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'analytics_events', 'ev1'), {
      eventType: 'test', userId: 'f18_user_a', timestamp: new Date(),
    }));
  });
  await it('F18_2 — analytics_events: create with NO userId field at all → ALLOW (the real writer\'s pre-login shape)', async () => {
    const ctx = env.authenticatedContext('f18_user_a');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'analytics_events', 'ev2'), {
      eventType: 'test', timestamp: new Date(),
    }));
  });
  await it('F18_3 — analytics_events: create with userId forged to someone else → DENY (was ALLOW under the old rule)', async () => {
    const ctx = env.authenticatedContext('f18_user_a');
    await assertFails(setDoc(doc(ctx.firestore(), 'analytics_events', 'ev3'), {
      eventType: 'test', userId: 'f18_victim', timestamp: new Date(),
    }));
  });

  await it('F18_4 — referrals: create with inviteeUid == caller → ALLOW (any referrerUid — that\'s the whole point)', async () => {
    const ctx = env.authenticatedContext('f18_invitee');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'referrals', 'f18_referrer_f18_invitee'), {
      referrerUid: 'f18_referrer', inviteeUid: 'f18_invitee', inviteeName: 'X',
    }));
  });
  await it('F18_5 — referrals: create with inviteeUid forged to someone else → DENY (was ALLOW under the old rule)', async () => {
    const ctx = env.authenticatedContext('f18_invitee');
    await assertFails(setDoc(doc(ctx.firestore(), 'referrals', 'f18_referrer_f18_victim'), {
      referrerUid: 'f18_referrer', inviteeUid: 'f18_victim', inviteeName: 'X',
    }));
  });

  await it('F18_6 — kudos: create with fromUid == caller → ALLOW', async () => {
    const ctx = env.authenticatedContext('f18_sender');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'kudos', 'f18_recipient', 'inbox', 'k1'), {
      fromUid: 'f18_sender', fromName: 'Sender', type: 'high_five',
    }));
  });
  await it('F18_7 — kudos: create with fromUid forged to someone else → DENY (was ALLOW under the old rule)', async () => {
    const ctx = env.authenticatedContext('f18_sender');
    await assertFails(setDoc(doc(ctx.firestore(), 'kudos', 'f18_recipient', 'inbox', 'k2'), {
      fromUid: 'f18_someone_else', fromName: 'Sender', type: 'high_five',
    }));
  });
}

async function testWaveASpec02() {
  console.log('\nWave A (SPEC-02) — sessions, attendance, group_invitations, leaderboard shards/snapshots, private/legal');

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    // F-07 sessions (park check-ins)
    await setDoc(doc(db, 'sessions', 'sess_1'), { userId: 'broadcaster1', parkId: 'park_x', authorityId: 'city_a' });

    // F-11 attendance (community_groups/grp_test/attendance/{sessionId})
    await setDoc(doc(db, 'community_groups', 'grp_test', 'attendance', '2026-09-10_08-00'), {
      attendees: ['group_owner'], waitlist: [],
    });

    // F-13 group_invitations
    await setDoc(doc(db, 'group_invitations', 'tok_abc123'), {
      hostUid: 'group_owner', groupId: 'grp_test', useCount: 0, expiresAt: new Date(Date.now() + 86400000),
    });

    // F-04 leaderboard_shards / leaderboard_snapshots + the two authority-scoped users
    await setDoc(doc(db, 'users', 'authority_a_user'), { core: { name: 'A-User', discoverable: true, authorityId: 'city_a' } });
    await setDoc(doc(db, 'users', 'authority_b_user'), { core: { name: 'B-User', discoverable: true, authorityId: 'city_b' } });
    await setDoc(doc(db, 'leaderboard_shards', 'city_a_unit1_2026-09_u1_0'), {
      tenantId: 'city_a', unitId: 'unit1', period: '2026-09', uid: 'u1', shard: 0, xp: 10,
    });
    await setDoc(doc(db, 'leaderboard_snapshots', 'city_a_unit1_2026-09'), {
      period: '2026-09', rankings: [{ uid: 'u1', rank: 1, xp: 10 }], totalParticipants: 1,
    });

    // SEC-06 private/legal
    await setDoc(doc(db, 'users', 'broadcaster1', 'private', 'legal'), {
      healthDeclarationPdfUrl: 'https://storage.example/health/broadcaster1.pdf',
    });
  });

  // ── F-07 sessions ──
  await it('WA1 — the check-in\'s owner reads their own session → ALLOW', async () => {
    const ctx = env.authenticatedContext('broadcaster1');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'sessions', 'sess_1')));
  });
  await it('WA2 — a different authenticated user reads someone else\'s session → DENY (was ALLOW under the old `isAuthenticated()` rule)', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    await assertFails(getDoc(doc(ctx.firestore(), 'sessions', 'sess_1')));
  });
  await it('WA3 — an OUT admin reads any session → ALLOW (heatmap tooling, unaffected)', async () => {
    const ctx = env.authenticatedContext('tenant_admin_user');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'sessions', 'sess_1')));
  });

  // ── F-11 attendance ──
  await it('WA4 — a genuine member of the group reads its attendance doc → ALLOW', async () => {
    const ctx = env.authenticatedContext('regular_member');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'community_groups', 'grp_test', 'attendance', '2026-09-10_08-00')));
  });
  await it('WA5 — a non-member reads it → DENY', async () => {
    const ctx = env.authenticatedContext('pi_never_member');
    await assertFails(getDoc(doc(ctx.firestore(), 'community_groups', 'grp_test', 'attendance', '2026-09-10_08-00')));
  });

  // ── F-13 group_invitations ──
  await it('WA6 — get by known token → ALLOW (knowledge of the token remains the authorization)', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'group_invitations', 'tok_abc123')));
  });
  await it('WA7 — LIST with no filter → DENY (the actual leak: dumping every open invitation without knowing any token)', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    await assertFails(getDocs(collection(ctx.firestore(), 'group_invitations')));
  });

  // ── F-04 leaderboard_shards ──
  await it('WA8 — same-authority reader LISTS shards filtered by tenantId (the real getTenantLeaderboard query shape) → ALLOW', async () => {
    const ctx = env.authenticatedContext('authority_a_user');
    const snap = await assertSucceeds(
      getDocs(query(collection(ctx.firestore(), 'leaderboard_shards'), where('tenantId', '==', 'city_a')))
    );
    if (snap.empty) throw new Error('expected the shard to be visible to a same-authority reader');
  });
  await it('WA9 — different-authority reader gets the SAME shard doc directly → DENY', async () => {
    const ctx = env.authenticatedContext('authority_b_user');
    await assertFails(getDoc(doc(ctx.firestore(), 'leaderboard_shards', 'city_a_unit1_2026-09_u1_0')));
  });
  await it('WA10 — an OUT admin reads the shard despite a different/no authorityId → ALLOW', async () => {
    const ctx = env.authenticatedContext('tenant_admin_user');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'leaderboard_shards', 'city_a_unit1_2026-09_u1_0')));
  });

  // ── F-04 leaderboard_snapshots ──
  await it('WA11 — same-authority reader gets the snapshot (docId-prefix match) → ALLOW', async () => {
    const ctx = env.authenticatedContext('authority_a_user');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'leaderboard_snapshots', 'city_a_unit1_2026-09')));
  });
  await it('WA12 — different-authority reader gets the same snapshot → DENY', async () => {
    const ctx = env.authenticatedContext('authority_b_user');
    await assertFails(getDoc(doc(ctx.firestore(), 'leaderboard_snapshots', 'city_a_unit1_2026-09')));
  });

  // ── SEC-06 private/legal ──
  //
  // Important honesty note (found empirically while writing WA13-17):
  // origin/main ALREADY has a recursive wildcard on users/{userId} —
  // `match /{subCollection}/{subPaths=**} { allow read, write: if
  // request.auth.uid == userId || isAdmin(); }` (see its own comment:
  // covers exerciseHistory/dailyStats/etc). That wildcard ALONE already
  // locks down owner/admin-only access to ANY subcollection under a
  // user's doc, including private/legal, with or without the explicit
  // `match /private/legal` block this fix adds. WA13/WA15/WA16 below
  // therefore pass identically on origin/main's rules — they are NOT
  // discriminating tests for THIS fix, just regression coverage that the
  // new location is (and was always going to be) properly locked down.
  // The explicit block is kept anyway, matching this file's own
  // established convention for notification_clicks ("declare explicitly
  // even though the wildcard also matches... makes intent clear").
  //
  // The ACTUAL SEC-06 leak was never a rules gap on users/{userId} itself
  // (that rule is UNCHANGED — discoverable profiles are still fully
  // readable) — it was a DATA-PLACEMENT bug: healthDeclarationPdfUrl used
  // to be a field ON that fully-readable document. Firestore rules can't
  // redact individual fields on a read, so there is no rules-only
  // "fails on old, passes on new" expression of this specific fix — WA18
  // below is the closest thing: it demonstrates the actual mechanism
  // (if this field were EVER put back on the main doc, it leaks
  // instantly to anyone) and passes identically on both old and new
  // rules, since it's exercising a rule this fix deliberately did NOT
  // touch. The real fix is verified at the code level (see the SPEC-02
  // Wave 0 commit — 2 writers, 2 readers, all repointed to private/legal).
  await it('WA13 — the owner reads their own private/legal doc → ALLOW', async () => {
    const ctx = env.authenticatedContext('broadcaster1');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'users', 'broadcaster1', 'private', 'legal')));
  });
  await it('WA14 — a different authenticated user reads it, even though broadcaster1 is discoverable → DENY (the actual SEC-06 leak: this used to be a plain field on the discoverable-readable user doc)', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    await assertFails(getDoc(doc(ctx.firestore(), 'users', 'broadcaster1', 'private', 'legal')));
  });
  await it('WA15 — an OUT admin reads it → ALLOW', async () => {
    const ctx = env.authenticatedContext('tenant_admin_user');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'users', 'broadcaster1', 'private', 'legal')));
  });
  await it('WA16 — the owner writes their own private/legal doc → ALLOW (real onboarding write path)', async () => {
    const ctx = env.authenticatedContext('broadcaster2');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'users', 'broadcaster2', 'private', 'legal'), {
      healthDeclarationPdfUrl: 'https://storage.example/health/broadcaster2.pdf',
    }));
  });
  await it('WA17 — a different authenticated user writes to someone else\'s private/legal → DENY', async () => {
    const ctx = env.authenticatedContext('reader_outsider');
    await assertFails(setDoc(doc(ctx.firestore(), 'users', 'broadcaster1', 'private', 'legal'), {
      healthDeclarationPdfUrl: 'https://evil.example/hacked.pdf',
    }));
  });

  await it('WA18 — regression tripwire, NOT a fix-proof (see comment above): if healthDeclarationPdfUrl were ever put back on the discoverable users/{uid} doc itself, a total stranger reads it in full → this MUST stay true (the rule is deliberately unchanged) — it is exactly why the field had to move, not a bug in this test', async () => {
    await env.withSecurityRulesDisabled(async (dbCtx) => {
      await setDoc(doc(dbCtx.firestore(), 'users', 'wa18_regressed_user'), {
        core: { name: 'Regressed', discoverable: true },
        healthDeclarationPdfUrl: 'https://storage.example/should-not-be-here.pdf',
      });
    });
    const ctx = env.authenticatedContext('reader_outsider');
    const snap = await assertSucceeds(getDoc(doc(ctx.firestore(), 'users', 'wa18_regressed_user')));
    if (snap.data()?.healthDeclarationPdfUrl !== 'https://storage.example/should-not-be-here.pdf') {
      throw new Error('expected the mechanism to still be live — if this ever fails, someone tightened the discoverable grant, which is good news worth updating this comment for');
    }
  });
}

// ─── Vitest wiring ──────────────────────────────────────────────────────────
//
// The harness's own `it()` (above) never throws — it catches each case's
// failure so the suite can keep going and report all of them, not just the
// first. That means a suite function like testPresenceGroup() always
// RETURNS normally even when cases inside it failed, so wrapSuite() diffs
// `failures` before/after and throws for vitest if the count grew — that's
// what makes a vitest `it()` actually go red when a rule regresses.

function wrapSuite(fn: () => Promise<void>) {
  return async () => {
    const before = failures.length;
    await fn();
    const newFailures = failures.slice(before);
    if (newFailures.length > 0) {
      throw new Error(`${newFailures.length} case(s) failed:\n  - ${newFailures.join('\n  - ')}`);
    }
  };
}

describe('Firestore Rules — Cumulative Integration Test Suite', () => {
  beforeAll(async () => {
    console.log('Setting up test environment...');
    await setup();
  });

  afterAll(async () => {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Results: ${pass} passed, ${fail} failed`);
    if (failures.length > 0) {
      console.log('\nFailed tests:');
      failures.forEach((f) => console.log(`  ✗ ${f}`));
    }
    await env.cleanup();
  });

  vitestIt('presence-group', wrapSuite(testPresenceGroup));
  vitestIt('Phase G — inviteCode + admin-remove', wrapSuite(testPhaseG));
  vitestIt('H2 — role-change guards', wrapSuite(testH2Roles));
  vitestIt('sessions — scheduleSlots/meetingLocation hasOnly guard', wrapSuite(testSessions));
  vitestIt('activity — dailyActivity + streaks (auth-timing invariant)', wrapSuite(testActivityRules));
  vitestIt('tenant-unit-lockdown', wrapSuite(testTenantUnitLockdown));
  vitestIt('military-declarations lockdown', wrapSuite(testMilitaryDeclarationLockdown));
  vitestIt('unitDirectory', wrapSuite(testUnitDirectory));
  vitestIt('unit-league-aggregates', wrapSuite(testUnitLeagueAggregates));
  vitestIt('reserve-league lockdown', wrapSuite(testReserveLeagueLockdown));
  vitestIt('no-users-doc-leak', wrapSuite(testNoUsersDocLeak));
  vitestIt('pending_units', wrapSuite(testPendingUnits));
  vitestIt('persona-audience collection', wrapSuite(testPersonaAudienceCollection));
  vitestIt('persona-gated membership block', wrapSuite(testPersonaGatedMembershipBlock));
  vitestIt('chat leak closed', wrapSuite(testChatLeakClosed));
  vitestIt('chat list scale', wrapSuite(testChatListScale));
  vitestIt('admin-invitations lockdown (SPEC-01 task 1)', wrapSuite(testAdminInvitationsLockdown));
  vitestIt('private-invite subcollection (SPEC-01 task 2)', wrapSuite(testPrivateInviteSubcollection));
  vitestIt('Wave A (SPEC-02)', wrapSuite(testWaveASpec02));
  vitestIt('connections SEC-01 (SPEC-02, partial)', wrapSuite(testConnectionsSec01));
  vitestIt('F-18 forgery (SPEC-02)', wrapSuite(testF18Forgery));
});
