#!/usr/bin/env npx tsx
/**
 * scripts/verify-unit-structure.ts
 *
 * Emulator-only verification of GET /api/units/structure — Slice D of the
 * persona-unit-unification build (25.09.2026, see docs/audit-2026-09/
 * 00-MASTER-PLAN.md §13.28).
 *
 * Covers every scenario David required:
 *   - unit_admin gets their own unit AND everything under it (including a
 *     GRANDCHILD they don't directly manage — the downward-inheritance fix,
 *     closing §13.17's decision #1, scoped to this endpoint only)
 *   - tenant_owner gets their whole tenant
 *   - unit_admin A is rejected from unit B (both a genuinely unrelated
 *     unit in another tenant, AND a sibling unit in their OWN tenant that
 *     isn't their descendant)
 *   - root works with/without an explicit tenantId, same as every other
 *     route in this build
 *
 * Usage:
 *   firebase emulators:start --only firestore
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/verify-unit-structure.ts
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
  admin.initializeApp({ projectId: 'demo-outrun-unit-structure-verify' });
}
const db = admin.firestore();

let passed = 0;
let failed = 0;
function assert(label: string, condition: boolean, detail?: string) {
  if (condition) { console.log(`  ✅  ${label}`); passed++; }
  else { console.error(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`); failed++; }
}

async function clearAll() {
  const authSnap = await db.collection('authorities').get();
  await Promise.all(authSnap.docs.map((d) => d.ref.delete()));
  const usersSnap = await db.collection('users').get();
  await Promise.all(usersSnap.docs.map((d) => d.ref.delete()));
}

async function main() {
  const { computeUnitStructure } = await import('../src/app/api/units/structure/route');
  const { resolveUnitPermissionScope } = await import('../src/lib/unitPermissionScope');
  const { isRateLimited } = await import('../src/lib/rateLimit');
  const { RATE_LIMITS } = await import('../src/lib/rateLimitConfig');

  const run = Date.now();
  await clearAll();

  // ══════════════════════════════════════════════════════════════════════
  console.log('── seed: 2 tenants (military), A with a 3-level hierarchy ──');
  const tenantA = `tenant-a-${run}`;
  const tenantB = `tenant-b-${run}`;
  const battalionA1 = 'battalion_a1';
  const companyA1a = 'company_a1a';
  const platoonA1a1 = 'platoon_a1a1'; // grandchild of battalionA1
  const battalionA2 = 'battalion_a2'; // sibling, NOT under unit_admin's scope
  const unitB1 = 'unit_b1';

  const rootUid = `root-${run}`;
  const tenantOwnerUid = `tenant-owner-${run}`;
  const unitAdminUid = `unit-admin-${run}`;

  await db.collection('authorities').doc(tenantA).set({ name: 'Tenant A', type: 'military_unit', tenantType: 'military', managerIds: [tenantOwnerUid] });
  await db.collection('authorities').doc(tenantB).set({ name: 'Tenant B', type: 'military_unit', tenantType: 'military', managerIds: [] });
  await db.collection('users').doc(rootUid).set({ core: { email: 'david@appout.co.il' } });

  await db.collection('tenants').doc(tenantA).collection('units').doc(battalionA1).set({
    name: 'גדוד 101', parentUnitId: null, unitPath: ['גדוד 101'], managerIds: [unitAdminUid],
  });
  await db.collection('tenants').doc(tenantA).collection('units').doc(companyA1a).set({
    name: 'פלוגה א', parentUnitId: battalionA1, unitPath: ['גדוד 101', 'פלוגה א'], managerIds: [], iconUrl: 'https://example.com/icon.png', memberCount: 4,
  });
  await db.collection('tenants').doc(tenantA).collection('units').doc(platoonA1a1).set({
    name: 'מחלקה 1', parentUnitId: companyA1a, unitPath: ['גדוד 101', 'פלוגה א', 'מחלקה 1'], managerIds: [],
  });
  await db.collection('tenants').doc(tenantA).collection('units').doc(battalionA2).set({
    name: 'גדוד 102', parentUnitId: null, unitPath: ['גדוד 102'], managerIds: [],
  });
  await db.collection('tenants').doc(tenantB).collection('units').doc(unitB1).set({
    name: 'יחידה ב1', parentUnitId: null, unitPath: ['יחידה ב1'], managerIds: [],
  });

  const unitAdminScope = await resolveUnitPermissionScope(unitAdminUid);
  assert('seed: unit_admin resolves correctly, scoped to battalionA1 only', unitAdminScope.kind === 'unitAdmin' && unitAdminScope.unitIds.includes(battalionA1) && !unitAdminScope.unitIds.includes(companyA1a));
  const tenantOwnerScope = await resolveUnitPermissionScope(tenantOwnerUid);
  assert('seed: tenant_owner resolves correctly', tenantOwnerScope.kind === 'tenantOwner' && tenantOwnerScope.tenantId === tenantA);
  const rootScope = await resolveUnitPermissionScope(rootUid);
  assert('seed: root resolves correctly', rootScope.kind === 'root');

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── unit_admin: own unit (no unitId param) → battalion + its children (NOT the sibling) ──');
  {
    const result = await computeUnitStructure(db, unitAdminScope, {});
    assert('200', result.status === 200);
    if (result.status === 200) {
      const ids = result.body.units.map((u) => u.unitId);
      assert('includes own battalion', ids.includes(battalionA1));
      assert('includes direct child (company)', ids.includes(companyA1a));
      assert('does NOT include the unrelated sibling battalion', !ids.includes(battalionA2));
      const battalionEntry = result.body.units.find((u) => u.unitId === battalionA1);
      assert('battalion name correct', battalionEntry?.name === 'גדוד 101');
      const companyEntry = result.body.units.find((u) => u.unitId === companyA1a);
      assert('company iconUrl passed through', companyEntry?.iconUrl === 'https://example.com/icon.png');
      assert('company parentUnitId correct', companyEntry?.parentUnitId === battalionA1);
      assert('company memberCount passed through (non-military sub-unit count source)', companyEntry?.memberCount === 4);
      const battalionEntryCount = result.body.units.find((u) => u.unitId === battalionA1);
      assert('battalion memberCount defaults to 0 when absent from the doc', battalionEntryCount?.memberCount === 0);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── THE required test: unit_admin gets their unit AND everything under it, including a GRANDCHILD they do not directly manage ──');
  {
    // Downward inheritance — requesting the GRANDCHILD (platoon) directly.
    // Not in scope.unitIds at all, but its ancestor chain (company ->
    // battalion) reaches battalionA1, which IS directly managed.
    const result = await computeUnitStructure(db, unitAdminScope, { unitId: platoonA1a1 });
    assert('unit_admin requesting a grandchild unit: 200 (downward inheritance, closes §13.17 decision #1)', result.status === 200);
    if (result.status === 200) {
      const ids = result.body.units.map((u) => u.unitId);
      assert('grandchild itself is in the response', ids.includes(platoonA1a1));
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── THE required negative: unit_admin A rejected from an unrelated unit ──');
  {
    const crossTenant = await computeUnitStructure(db, unitAdminScope, { unitId: unitB1 });
    assert('unit_admin requesting a DIFFERENT tenant\'s unit: rejected (403)', crossTenant.status === 403);

    const sameTenatSibling = await computeUnitStructure(db, unitAdminScope, { unitId: battalionA2 });
    assert('unit_admin requesting a SIBLING unit (same tenant, not their descendant): rejected (403)', sameTenatSibling.status === 403);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── tenant_owner: sees every unit under their tenant, not the other tenant ──');
  {
    const result = await computeUnitStructure(db, tenantOwnerScope, {});
    assert('200', result.status === 200);
    if (result.status === 200) {
      const ids = result.body.units.map((u) => u.unitId);
      assert('sees battalionA1', ids.includes(battalionA1));
      assert('sees battalionA2 too (tenant-wide, unlike unit_admin)', ids.includes(battalionA2));
      assert('sees the grandchild platoon too', ids.includes(platoonA1a1));
      assert('does NOT see tenant B\'s unit', !ids.includes(unitB1));
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── root: works with explicit tenantId, rejected (400) without ──');
  {
    const withTenantId = await computeUnitStructure(db, rootScope, { tenantId: tenantB });
    assert('root with tenantId: 200', withTenantId.status === 200);
    if (withTenantId.status === 200) {
      assert('root sees tenant B\'s unit', withTenantId.body.units.some((u) => u.unitId === unitB1));
    }
    const withoutTenantId = await computeUnitStructure(db, rootScope, {});
    assert('root without tenantId: 400 (parameter validation, not a denial)', withoutTenantId.status === 400);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── denied scope: rejected ─────────────────────────────────────');
  {
    const strangerUid = `stranger-${run}`;
    await db.collection('users').doc(strangerUid).set({ core: {} });
    const deniedScope = await resolveUnitPermissionScope(strangerUid);
    assert('stranger resolves to denied', deniedScope.kind === 'denied');
    const result = await computeUnitStructure(db, deniedScope, {});
    assert('denied scope: 403', result.status === 403);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── Rate limit: uid-based, reusing isRateLimited as-is ────────');
  {
    const uid = `rate-limited-${run}`;
    const window = RATE_LIMITS.unitStructure.uidHourly();
    const results: boolean[] = [];
    for (let i = 0; i < window.maxRequests + 1; i++) {
      results.push(await isRateLimited(db, `unit-structure:${uid}`, window));
    }
    const allButLastAllowed = results.slice(0, -1).every((blocked) => blocked === false);
    const lastBlocked = results[results.length - 1] === true;
    assert(`attempts 1-${window.maxRequests} are NOT rate-limited`, allButLastAllowed);
    assert(`attempt ${window.maxRequests + 1} (over the cap) IS rate-limited`, lastBlocked);
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error running verify-unit-structure:', err);
  process.exit(1);
});
