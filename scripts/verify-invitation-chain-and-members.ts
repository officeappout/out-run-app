#!/usr/bin/env npx tsx
/**
 * scripts/verify-invitation-chain-and-members.ts
 *
 * Emulator-only (no --prod, by design — see scripts/verify-unit-join-
 * requests.ts for the same convention) verification of Stage 2 (the
 * invitation chain: tenant_owner/unit_admin creation + acceptance) and
 * Stage 3 (the members + pending-requests list) of the military/school
 * vertical build — see .claude/plans/tenant-military-school-vertical-
 * model.md §ח.
 *
 * Covers every scenario David explicitly required, positive AND negative:
 *   Stage 2 positive — root creates tenant_owner → accept → tenantOwner
 *     scope; that tenant_owner creates unit_admin (own tenant) → accept →
 *     unitAdmin scope, managerIds arrayUnion on the actual unit doc.
 *   Stage 2 negative 1 — tenant_owner invites unit_admin to a DIFFERENT
 *     tenant's unit → denied.
 *   Stage 2 negative 2 — unit_admin tries to invite anyone → denied.
 *   Stage 2 extra negatives — tenant_owner inviting another tenant_owner
 *     (root-only); root inviting unit_admin directly (tenant_owner-only,
 *     David's literal "root מזמין tenant_owner בלבד"); pre-existing
 *     authority_manager/platform_member root-only paths still work
 *     unchanged.
 *   Stage 2 defense-in-depth — a unit_admin invitation whose creating
 *     tenant_owner has since been revoked fails at ACCEPT time (live
 *     re-check, not a stored snapshot).
 *   Stage 3 positive — unit_admin sees only their own unit's approved
 *     members (with names) + pending requests (with names); tenant_owner
 *     sees every unit under their tenant; root sees whatever tenantId (and
 *     optional unitId) it explicitly asks for.
 *   Stage 3 negative 3 — unit_admin requests another unit's list → denied.
 *   Stage 3 negative 4 — a regular (denied-scope) user requests the list
 *     → denied.
 *   Stage 3 negative 5 — a pending request never appears in the approved-
 *     members array.
 *   Stage 3 root-without-tenantId — 400, not a security denial.
 *
 * Usage:
 *   firebase emulators:start --only firestore
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/verify-invitation-chain-and-members.ts
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
  admin.initializeApp({ projectId: 'demo-outrun-invitation-chain-verify' });
}
const db = admin.firestore();

let passed = 0;
let failed = 0;
function assert(label: string, condition: boolean, detail?: string) {
  if (condition) { console.log(`  ✅  ${label}`); passed++; }
  else { console.error(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`); failed++; }
}

async function main() {
  const { resolveUnitPermissionScope } = await import('../src/lib/unitPermissionScope');
  const { computeCreateInvitation } = await import('../src/app/api/admin/invitations/route');
  const { computeAcceptInvitation } = await import('../src/app/api/auth/accept-invitation/route');
  const { computeUnitMembers } = await import('../src/app/api/units/members/route');
  const { computeCreateJoinRequest } = await import('../src/app/api/units/join-requests/route');

  const run = Date.now();
  const tenantA = `tenant-a-${run}`;
  const tenantB = `tenant-b-${run}`;
  const unitA1 = `unit-a1-${run}`;
  const unitA2 = `unit-a2-${run}`;
  const unitB1 = `unit-b1-${run}`;

  const rootUid = `root-${run}`;
  const rootEmail = 'david@appout.co.il';
  const regularUid = `regular-${run}`;

  // ── Seed ──────────────────────────────────────────────────────────────
  await db.collection('users').doc(rootUid).set({ core: { email: rootEmail } });
  await db.collection('users').doc(regularUid).set({ core: {} });

  await db.collection('authorities').doc(tenantA).set({ type: 'military_unit', name: 'Tenant A', managerIds: [] });
  await db.collection('authorities').doc(tenantB).set({ type: 'military_unit', name: 'Tenant B', managerIds: [] });

  await db.collection('tenants').doc(tenantA).collection('units').doc(unitA1)
    .set({ name: 'Unit A1', unitPath: ['Tenant A', 'Unit A1'], unitType: 'battalion', memberCount: 0 });
  await db.collection('tenants').doc(tenantA).collection('units').doc(unitA2)
    .set({ name: 'Unit A2', unitPath: ['Tenant A', 'Unit A2'], unitType: 'battalion', memberCount: 0 });
  await db.collection('tenants').doc(tenantB).collection('units').doc(unitB1)
    .set({ name: 'Unit B1', unitPath: ['Tenant B', 'Unit B1'], unitType: 'battalion', memberCount: 0 });

  const rootCaller = { uid: rootUid, email: rootEmail };

  // ══════════════════════════════════════════════════════════════════════
  console.log('── Stage 2 positive: root → tenant_owner → accept ────────────');
  let tenantOwnerAUid = '';
  {
    const createResult = await computeCreateInvitation(db, rootCaller, { email: 'owner-a@example.com', role: 'tenant_owner', tenantId: tenantA });
    assert('root creates tenant_owner invitation: 200', createResult.status === 200);
    const invitationId = (createResult.body as any).invitationId as string;

    tenantOwnerAUid = `tenant-owner-a-${run}`;
    const acceptResult = await computeAcceptInvitation(
      db,
      { uid: tenantOwnerAUid, email: 'owner-a@example.com', emailVerified: true, name: 'Owner A' },
      invitationId,
    );
    assert('tenant_owner accepts: 200', acceptResult.status === 200);

    const userSnap = await db.collection('users').doc(tenantOwnerAUid).get();
    const core = userSnap.data()?.core ?? {};
    assert('accepted tenant_owner: core.tenantId written', core.tenantId === tenantA);
    assert('accepted tenant_owner: core.isTenantOwner written', core.isTenantOwner === true);
    assert('accepted tenant_owner: core.tenantType resolved to military', core.tenantType === 'military');

    const authoritySnap = await db.collection('authorities').doc(tenantA).get();
    assert('authorities/{tenantA}.managerIds includes the new tenant_owner', (authoritySnap.data()?.managerIds ?? []).includes(tenantOwnerAUid));

    const scope = await resolveUnitPermissionScope(tenantOwnerAUid);
    assert('resolveUnitPermissionScope now resolves the new user to tenantOwner', scope.kind === 'tenantOwner');
    assert('tenantOwner scope points at tenant A', scope.kind === 'tenantOwner' && scope.tenantId === tenantA);
  }
  const tenantOwnerACaller = { uid: tenantOwnerAUid, email: 'owner-a@example.com' };

  console.log('\n── Stage 2 positive: tenant_owner → unit_admin → accept ──────');
  let unitAdminA1Uid = '';
  {
    const createResult = await computeCreateInvitation(db, tenantOwnerACaller, { email: 'admin-a1@example.com', role: 'unit_admin', unitId: unitA1 });
    assert('tenant_owner creates unit_admin invitation for their OWN unit: 200', createResult.status === 200);
    const invitationId = (createResult.body as any).invitationId as string;

    unitAdminA1Uid = `unit-admin-a1-${run}`;
    const acceptResult = await computeAcceptInvitation(
      db,
      { uid: unitAdminA1Uid, email: 'admin-a1@example.com', emailVerified: true, name: 'Admin A1' },
      invitationId,
    );
    assert('unit_admin accepts: 200', acceptResult.status === 200);

    const userSnap = await db.collection('users').doc(unitAdminA1Uid).get();
    const core = userSnap.data()?.core ?? {};
    assert('accepted unit_admin: core.tenantId written', core.tenantId === tenantA);
    assert('accepted unit_admin: core.unitId written', core.unitId === unitA1);
    assert('accepted unit_admin: core.authorityId written (mirrors tenantId)', core.authorityId === tenantA);
    assert('accepted unit_admin: core.unitPath written as an array', Array.isArray(core.unitPath) && core.unitPath.length > 0);

    const unitSnap = await db.collection('tenants').doc(tenantA).collection('units').doc(unitA1).get();
    assert('unit doc managerIds includes the new unit_admin', (unitSnap.data()?.managerIds ?? []).includes(unitAdminA1Uid));

    const scope = await resolveUnitPermissionScope(unitAdminA1Uid);
    assert('resolveUnitPermissionScope now resolves the new user to unitAdmin', scope.kind === 'unitAdmin');
    assert('unitAdmin scope includes unit A1', scope.kind === 'unitAdmin' && scope.unitIds.includes(unitA1));
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── Stage 2 negative 1: tenant_owner invites into ANOTHER tenant ──');
  {
    // unitB1 exists, but under tenant B — tenantOwnerA's own resolved
    // tenantId is tenant A, so this must be rejected purely from the
    // caller's OWN scope, never from anything the request names.
    const result = await computeCreateInvitation(db, tenantOwnerACaller, { email: 'sneaky@example.com', role: 'unit_admin', unitId: unitB1 });
    assert('tenant_owner A inviting a unit_admin for tenant B\'s unit: rejected (403)', result.status === 403);
  }

  console.log('\n── Stage 2 negative 2: unit_admin tries to invite anyone ─────');
  {
    const unitAdminCaller = { uid: unitAdminA1Uid, email: 'admin-a1@example.com' };
    const asUnitAdmin = await computeCreateInvitation(db, unitAdminCaller, { email: 'x@example.com', role: 'unit_admin', unitId: unitA2 });
    assert('unit_admin inviting another unit_admin: rejected (403)', asUnitAdmin.status === 403);
    const asAuthorityManager = await computeCreateInvitation(db, unitAdminCaller, { email: 'x2@example.com', role: 'authority_manager', authorityId: tenantA });
    assert('unit_admin inviting ANY role (authority_manager): rejected', asAuthorityManager.status === 403);
  }

  console.log('\n── Stage 2 extra negative: tenant_owner invites another tenant_owner ──');
  {
    const result = await computeCreateInvitation(db, tenantOwnerACaller, { email: 'owner-b@example.com', role: 'tenant_owner', tenantId: tenantB });
    assert('tenant_owner inviting ANOTHER tenant_owner: rejected (only root can)', result.status === 403);
  }

  console.log('\n── Stage 2 extra negative: root invites unit_admin DIRECTLY ──');
  {
    const result = await computeCreateInvitation(db, rootCaller, { email: 'shortcut@example.com', role: 'unit_admin', unitId: unitA1 });
    assert('root inviting unit_admin directly (bypassing tenant_owner): rejected — David: "root מזמין tenant_owner בלבד"', result.status === 403);
  }

  console.log('\n── Stage 2 regression: root still creates authority_manager/platform_member ──');
  {
    const cityAuthorityId = `city-${run}`;
    await db.collection('authorities').doc(cityAuthorityId).set({ type: 'city', name: 'Some City', managerIds: [] });
    const am = await computeCreateInvitation(db, rootCaller, { email: 'am@example.com', role: 'authority_manager', authorityId: cityAuthorityId });
    assert('root creates authority_manager (unchanged path): 200', am.status === 200);
    const pm = await computeCreateInvitation(db, rootCaller, { email: 'pm@example.com', role: 'platform_member', allowedSections: ['product'] });
    assert('root creates platform_member (unchanged path): 200', pm.status === 200);
  }

  console.log('\n── Stage 2 defense-in-depth: revoked tenant_owner, pending invite ──');
  {
    const createResult = await computeCreateInvitation(db, tenantOwnerACaller, { email: 'late-admin@example.com', role: 'unit_admin', unitId: unitA2 });
    assert('unit_admin invitation created while tenant_owner is still valid: 200', createResult.status === 200);
    const invitationId = (createResult.body as any).invitationId as string;

    // Revoke: remove tenantOwnerA from authorities/{tenantA}.managerIds —
    // simulates a replacement/departure between invite-creation and accept.
    await db.collection('authorities').doc(tenantA).update({ managerIds: admin.firestore.FieldValue.arrayRemove(tenantOwnerAUid) });

    const lateUid = `late-admin-${run}`;
    const acceptResult = await computeAcceptInvitation(
      db,
      { uid: lateUid, email: 'late-admin@example.com', emailVerified: true, name: 'Late Admin' },
      invitationId,
    );
    assert('accept AFTER the creating tenant_owner was revoked: rejected (live re-check, not a stored snapshot)', acceptResult.status === 403);

    // Restore for the rest of the script (tenant_owner A is still used below).
    await db.collection('authorities').doc(tenantA).update({ managerIds: admin.firestore.FieldValue.arrayUnion(tenantOwnerAUid) });
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── Stage 3 setup: an approved member + a pending request ─────');
  const approvedMemberUid = `member-a1-${run}`;
  const pendingRequesterUid = `pending-a1-${run}`;
  {
    await db.collection('users').doc(approvedMemberUid).set({ core: { name: 'חייל מאושר', tenantId: tenantA, unitId: unitA1 } });
    await db.collection('users').doc(pendingRequesterUid).set({ core: { name: 'ממתין לאישור' } });
    const createResult = await computeCreateJoinRequest(db, pendingRequesterUid, { tenantId: tenantA, unitId: unitA1 });
    assert('seed: pending join-request created', createResult.status === 200);
  }

  console.log('\n── Stage 3 positive: unit_admin sees only their own unit ─────');
  {
    const scope = await resolveUnitPermissionScope(unitAdminA1Uid);
    const result = await computeUnitMembers(db, scope, {});
    assert('unit_admin members list: 200', result.status === 200);
    if (result.status === 200) {
      const units = (result.body as any).units;
      assert('unit_admin sees exactly 1 unit (their own)', units.length === 1);
      const block = units[0];
      assert('unit_admin\'s block is unit A1', block.unitId === unitA1);
      const approvedUids = block.approvedMembers.map((m: any) => m.uid);
      const pendingUids = block.pendingRequests.map((p: any) => p.uid);
      assert('approved member appears with their real name', block.approvedMembers.some((m: any) => m.uid === approvedMemberUid && m.name === 'חייל מאושר'));
      assert('pending requester appears in pendingRequests with their real name', block.pendingRequests.some((p: any) => p.uid === pendingRequesterUid && p.name === 'ממתין לאישור'));
      assert('pending requester does NOT appear in approvedMembers', !approvedUids.includes(pendingRequesterUid));
      assert('approved member does NOT appear in pendingRequests', !pendingUids.includes(approvedMemberUid));
    }
  }

  console.log('\n── Stage 3 positive: tenant_owner sees every unit under their tenant ──');
  {
    const scope = await resolveUnitPermissionScope(tenantOwnerAUid);
    const result = await computeUnitMembers(db, scope, {});
    assert('tenant_owner members list: 200', result.status === 200);
    if (result.status === 200) {
      const units = (result.body as any).units;
      const unitIds = units.map((u: any) => u.unitId);
      assert('tenant_owner sees unit A1', unitIds.includes(unitA1));
      assert('tenant_owner sees unit A2 too (no members yet, still listed)', unitIds.includes(unitA2));
      assert('tenant_owner does NOT see tenant B\'s unit', !unitIds.includes(unitB1));
    }
  }

  console.log('\n── Stage 3 positive: root with explicit tenantId ──────────────');
  {
    const scope = await resolveUnitPermissionScope(rootUid);
    const result = await computeUnitMembers(db, scope, { tenantId: tenantA });
    assert('root with tenantId: 200', result.status === 200);
    if (result.status === 200) {
      const unitIds = (result.body as any).units.map((u: any) => u.unitId);
      assert('root sees unit A1 when given tenantId=tenantA', unitIds.includes(unitA1));
    }
  }

  console.log('\n── Stage 3: root WITHOUT tenantId → 400, not a denial ──────────');
  {
    const scope = await resolveUnitPermissionScope(rootUid);
    const result = await computeUnitMembers(db, scope, {});
    assert('root without tenantId: 400 (parameter validation, not a security denial)', result.status === 400);
  }

  console.log('\n── Stage 3 negative 3: unit_admin requests ANOTHER unit ────────');
  {
    const scope = await resolveUnitPermissionScope(unitAdminA1Uid);
    const result = await computeUnitMembers(db, scope, { unitId: unitB1 });
    assert('unit_admin requesting unit B1 (not their own): rejected (403)', result.status === 403);

    const resultOwnTenantOtherUnit = await computeUnitMembers(db, scope, { unitId: unitA2 });
    assert('unit_admin requesting unit A2 (same tenant, but not their own unit): rejected (403)', resultOwnTenantOtherUnit.status === 403);
  }

  console.log('\n── Stage 3 negative 4: a regular (denied-scope) user requests the list ──');
  {
    const scope = await resolveUnitPermissionScope(regularUid);
    assert('regular user resolves to denied scope', scope.kind === 'denied');
    const result = await computeUnitMembers(db, scope, {});
    assert('regular user requesting the members list: rejected (403)', result.status === 403);
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error running verify-invitation-chain-and-members:', err);
  process.exit(1);
});
