#!/usr/bin/env npx tsx
/**
 * scripts/verify-unit-member-actions.ts
 *
 * Emulator-only verification of POST /api/units/members/approve and
 * POST /api/units/members/remove — Slice G of the persona-unit-
 * unification build (26.09.2026, see docs/audit-2026-09/00-MASTER-PLAN.md
 * §13.32).
 *
 * Covers every scenario David explicitly required:
 *   - unit_admin A removing a member of unit B → rejected (403).
 *   - after removal, the same person's re-declaration on the SAME unit
 *     → rejected (403, /api/units/declare's own pre-existing
 *     blockedUnitIds check — this script only proves the WRITE side,
 *     the read-side check has existed since Slice A).
 *   - the commander manually lifting the block (simulating the future
 *     "explicit approval" action §13.32's report defers, not built here)
 *     → the SAME person's re-declaration on the SAME unit now succeeds.
 *   - a mid-removal failure leaves NO half-state — user doc unchanged,
 *     military_declarations doc unchanged, no audit log entry created.
 *   - downward inheritance (§13.28) applies to both actions with zero
 *     extra code — a battalion commander can approve/remove a member of
 *     a company they don't directly manage.
 *   - approval never changes assignment, only unitApprovedByOfficer.
 *   - every removal is logged (unit_removals): who removed, whom, from
 *     which unit, when.
 *
 * Usage:
 *   firebase emulators:start --only firestore
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/verify-unit-member-actions.ts
 */
import * as admin from 'firebase-admin';
import { createRequire } from 'module';

function neutralizeServerOnly(): void {
  const cjsRequire = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const NodeMod = cjsRequire('module') as any;
  const origLoad = NodeMod._load.bind(NodeMod);
  NodeMod._load = function (id: string, ...args: unknown[]) {
    if (id === 'server-only') return {};
    return origLoad(id, ...args);
  };
}
neutralizeServerOnly();

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
console.log(`🧪  Firestore → emulator ONLY (${EMULATOR_HOST}) — this script never targets production.\n`);

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'demo-outrun-unit-member-actions-verify' });
}
const db = admin.firestore();

let passed = 0;
let failed = 0;
function assert(label: string, condition: boolean, detail?: string) {
  if (condition) { console.log(`  ✅  ${label}`); passed++; }
  else { console.error(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`); failed++; }
}

async function main() {
  const { computeApproveMember } = await import('../src/app/api/units/members/approve/route');
  const { computeRemoveMember } = await import('../src/app/api/units/members/remove/route');
  const { computeUnitDeclaration } = await import('../src/app/api/units/declare/route');
  const { resolveUnitPermissionScope } = await import('../src/lib/unitPermissionScope');
  const { isRateLimited } = await import('../src/lib/rateLimit');
  const { RATE_LIMITS } = await import('../src/lib/rateLimitConfig');

  const run = Date.now();

  // ══════════════════════════════════════════════════════════════════════
  console.log('── seed: 2-level hierarchy (battalion → company) + a self-declared soldier ──');
  const tenantA = `tenant-a-${run}`;
  const tenantB = `tenant-b-${run}`;
  const battalionA1 = `battalion_a1_${run}`;
  const companyA1a = `company_a1a_${run}`; // descendant of battalionA1, not directly managed
  const unitB1 = `unit_b1_${run}`;

  const battalionCommanderUid = `battalion-cmd-${run}`;
  const tenantOwnerUid = `tenant-owner-${run}`;
  const unitBAdminUid = `unit-b-admin-${run}`;
  const soldierUid = `soldier-${run}`; // self-declared, in the DESCENDANT company

  await db.collection('authorities').doc(tenantA).set({ name: 'Tenant A', type: 'military_unit', managerIds: [tenantOwnerUid] });
  await db.collection('authorities').doc(tenantB).set({ name: 'Tenant B', type: 'military_unit', managerIds: [] });

  await db.collection('tenants').doc(tenantA).collection('units').doc(battalionA1)
    .set({ name: 'גדוד 101', parentUnitId: null, managerIds: [battalionCommanderUid] });
  await db.collection('tenants').doc(tenantA).collection('units').doc(companyA1a)
    .set({ name: 'פלוגה א', parentUnitId: battalionA1, managerIds: [] });
  await db.collection('tenants').doc(tenantB).collection('units').doc(unitB1)
    .set({ name: 'יחידה ב1', parentUnitId: null, managerIds: [unitBAdminUid] });

  await db.collection('users').doc(soldierUid).set({
    core: {
      name: 'חייל מוצהר', tenantId: tenantA, unitId: companyA1a, unitPath: ['גדוד 101', 'פלוגה א'],
      tenantType: 'military', unitMembershipSource: 'self_declared', unitApprovedByOfficer: false,
      unitDeclaredAt: admin.firestore.Timestamp.now(),
    },
  });
  await db.collection('military_declarations').doc(soldierUid).set({
    orgId: tenantA, unitId: companyA1a, unitPathIds: [battalionA1, companyA1a], updatedAt: admin.firestore.Timestamp.now(),
  });

  // unitDirectory — needed for /api/units/declare's own lookup (re-
  // declaration test below). Mirrors onUnitWrite.ts's real directoryId
  // scheme (${orgId}__${unitId}) and parentId chain, seeded directly
  // since this script never runs the real Cloud Functions.
  await db.collection('unitDirectory').doc(`${tenantA}__${battalionA1}`)
    .set({ name: 'גדוד 101', unitId: battalionA1, parentId: null, orgId: tenantA });
  await db.collection('unitDirectory').doc(`${tenantA}__${companyA1a}`)
    .set({ name: 'פלוגה א', unitId: companyA1a, parentId: `${tenantA}__${battalionA1}`, orgId: tenantA });

  const battalionCommanderScope = await resolveUnitPermissionScope(battalionCommanderUid);
  const tenantOwnerScope = await resolveUnitPermissionScope(tenantOwnerUid);
  const unitBAdminScope = await resolveUnitPermissionScope(unitBAdminUid);
  assert('seed: battalion commander scope includes the descendant company (§13.28)', battalionCommanderScope.kind === 'unitAdmin' && battalionCommanderScope.unitIds.includes(companyA1a));
  assert('seed: tenant_owner resolves', tenantOwnerScope.kind === 'tenantOwner');
  assert('seed: unit-B admin resolves, scoped only to unit B', unitBAdminScope.kind === 'unitAdmin' && !unitBAdminScope.unitIds.includes(companyA1a));

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── אישור: downward inheritance, no assignment change ──');
  {
    const result = await computeApproveMember(db, battalionCommanderScope, soldierUid);
    assert('battalion commander approves a member of a descendant company (not directly managed): 200', result.status === 200);
    const snap = await db.collection('users').doc(soldierUid).get();
    const core = snap.data()?.core ?? {};
    assert('unitApprovedByOfficer flipped to true', core.unitApprovedByOfficer === true);
    assert('assignment itself unchanged (tenantId)', core.tenantId === tenantA);
    assert('assignment itself unchanged (unitId)', core.unitId === companyA1a);
    assert('unitMembershipSource unchanged (still self_declared — approval does not alter provenance)', core.unitMembershipSource === 'self_declared');
  }

  console.log('\n── אישור: cross-unit denial ──');
  {
    const result = await computeApproveMember(db, unitBAdminScope, soldierUid);
    assert('unit-B admin approving a member of tenant A: 403', result.status === 403);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── הסרה: unit-A commander removing a unit-B member → rejected ──');
  {
    // Seed a unit-B member for this specific negative.
    const unitBMemberUid = `unit-b-member-${run}`;
    await db.collection('users').doc(unitBMemberUid).set({ core: { name: 'חבר ב', tenantId: tenantB, unitId: unitB1 } });
    const result = await computeRemoveMember(db, battalionCommanderScope, battalionCommanderUid, unitBMemberUid);
    assert('battalion commander (tenant A) removing a tenant-B member: 403', result.status === 403);
    const snap = await db.collection('users').doc(unitBMemberUid).get();
    assert('the rejected removal left the target untouched', snap.data()?.core?.tenantId === tenantB);
  }

  console.log('\n── הסרה: successful removal — fields cleared, declaration deleted, logged ──');
  {
    const result = await computeRemoveMember(db, battalionCommanderScope, battalionCommanderUid, soldierUid);
    assert('battalion commander removes a member of a descendant company: 200', result.status === 200);

    const userSnap = await db.collection('users').doc(soldierUid).get();
    const core = userSnap.data()?.core ?? {};
    assert('core.tenantId cleared', !('tenantId' in core));
    assert('core.unitId cleared', !('unitId' in core));
    assert('core.unitMembershipSource cleared', !('unitMembershipSource' in core));
    assert('core.unitApprovedByOfficer cleared', !('unitApprovedByOfficer' in core));
    assert('core.blockedUnitIds now contains the directoryId', Array.isArray(core.blockedUnitIds) && core.blockedUnitIds.includes(`${tenantA}__${companyA1a}`));

    const declSnap = await db.collection('military_declarations').doc(soldierUid).get();
    assert('military_declarations/{uid} deleted', !declSnap.exists);

    const logSnap = await db.collection('unit_removals').where('removedUid', '==', soldierUid).get();
    assert('exactly one unit_removals entry created', logSnap.size === 1);
    if (logSnap.size === 1) {
      const log = logSnap.docs[0].data();
      assert('log: removedBy is the acting commander', log.removedBy === battalionCommanderUid);
      assert('log: tenantId matches', log.tenantId === tenantA);
      assert('log: unitId matches the member\'s OWN unit (the descendant company, not the commander\'s own battalion)', log.unitId === companyA1a);
      assert('log: removedAt is set', log.removedAt !== undefined);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── THE required test: removed member declares again on the SAME unit → rejected ──');
  {
    const result = await computeUnitDeclaration(db, soldierUid, { orgId: tenantA, unitId: companyA1a });
    assert('re-declaration on the same unit after removal: rejected (403)', result.status === 403);
  }

  console.log('\n── THE required test: commander manually lifts the block → re-declaration succeeds ──');
  {
    // Simulates the future "explicit commander approval" action (§13.32's
    // own report proposes what that action/endpoint should look like —
    // not built yet). Directly manipulating blockedUnitIds here is
    // exactly what that action would eventually do server-side.
    await db.collection('users').doc(soldierUid).update({
      'core.blockedUnitIds': admin.firestore.FieldValue.arrayRemove(`${tenantA}__${companyA1a}`),
    });
    const result = await computeUnitDeclaration(db, soldierUid, { orgId: tenantA, unitId: companyA1a });
    assert('re-declaration after the block is manually lifted: succeeds (200)', result.status === 200);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── THE required test: a mid-removal failure leaves NO half-state ──');
  {
    // Fresh member for this test — the previous soldierUid has already
    // re-declared above and would confuse the "before/after" comparison.
    const secondSoldierUid = `soldier-2-${run}`;
    await db.collection('users').doc(secondSoldierUid).set({
      core: { name: 'חייל שני', tenantId: tenantA, unitId: companyA1a, unitMembershipSource: 'self_declared', unitApprovedByOfficer: false },
    });
    await db.collection('military_declarations').doc(secondSoldierUid).set({ orgId: tenantA, unitId: companyA1a, updatedAt: admin.firestore.Timestamp.now() });

    const beforeUser = (await db.collection('users').doc(secondSoldierUid).get()).data();
    const beforeDecl = (await db.collection('military_declarations').doc(secondSoldierUid).get()).data();

    // Simulate a batch-commit failure — patches WriteBatch.prototype.commit,
    // the single call computeRemoveMember makes to persist all three
    // writes atomically.
    const batch = db.batch();
    const proto = Object.getPrototypeOf(batch);
    const originalCommit = proto.commit;
    proto.commit = async function simulateCommitFailure() {
      throw new Error('simulated: batch commit failure');
    };
    let result: any;
    try {
      result = await computeRemoveMember(db, battalionCommanderScope, battalionCommanderUid, secondSoldierUid);
    } finally {
      proto.commit = originalCommit;
    }
    assert('a simulated commit failure returns 500, not a fake success', result.status === 500);

    const afterUser = (await db.collection('users').doc(secondSoldierUid).get()).data();
    const afterDecl = (await db.collection('military_declarations').doc(secondSoldierUid).get()).data();
    assert('user doc completely unchanged after the failed commit', JSON.stringify(afterUser) === JSON.stringify(beforeUser));
    assert('military_declarations doc completely unchanged after the failed commit', JSON.stringify(afterDecl) === JSON.stringify(beforeDecl));
    const logSnap = await db.collection('unit_removals').where('removedUid', '==', secondSoldierUid).get();
    assert('no unit_removals entry was created for the failed attempt', logSnap.empty);

    // Restored correctly — the same removal now succeeds.
    const resultAfterRestore = await computeRemoveMember(db, battalionCommanderScope, battalionCommanderUid, secondSoldierUid);
    assert('after restoring commit: the removal succeeds normally', resultAfterRestore.status === 200);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── negatives: denied scope, nonexistent uid ──');
  {
    const strangerScope = await resolveUnitPermissionScope(`stranger-${run}`);
    const approveResult = await computeApproveMember(db, strangerScope, soldierUid);
    assert('denied scope approving: 403', approveResult.status === 403);
    const removeResult = await computeRemoveMember(db, strangerScope, `stranger-${run}`, soldierUid);
    assert('denied scope removing: 403', removeResult.status === 403);

    const nonexistentResult = await computeRemoveMember(db, battalionCommanderScope, battalionCommanderUid, `nonexistent-${run}`);
    assert('removing a nonexistent uid: 403, not a crash', nonexistentResult.status === 403);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── Rate limit: both endpoints, uid-based ────────');
  {
    const uid = `rate-limited-${run}`;
    for (const [name, window] of [
      ['approve', RATE_LIMITS.unitMemberApprove.uidHourly()],
      ['remove', RATE_LIMITS.unitMemberRemove.uidHourly()],
    ] as const) {
      const results: boolean[] = [];
      for (let i = 0; i < window.maxRequests + 1; i++) {
        results.push(await isRateLimited(db, `unit-member-${name}:${uid}`, window));
      }
      const allButLastAllowed = results.slice(0, -1).every((blocked) => blocked === false);
      const lastBlocked = results[results.length - 1] === true;
      assert(`${name}: attempts 1-${window.maxRequests} are NOT rate-limited`, allButLastAllowed);
      assert(`${name}: attempt ${window.maxRequests + 1} (over the cap) IS rate-limited`, lastBlocked);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error running verify-unit-member-actions:', err);
  process.exit(1);
});
