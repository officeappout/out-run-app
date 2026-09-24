#!/usr/bin/env npx tsx
/**
 * scripts/verify-access-layer.ts
 *
 * Emulator-only (no --prod, by design — see scripts/verify-unit-join-
 * requests.ts for the same convention) verification of Stage 4 of the
 * military/school vertical build (.claude/plans/tenant-military-school-
 * vertical-model.md §ח): the access-layer fix in src/lib/firebase-admin.ts
 * (computeAdminScope) and src/middleware.ts (decideAdminGateAction).
 *
 * The two problems this stage fixes (found investigating the officer
 * panel screens, 24.09.2026):
 *   1. unit_admin was invisible to identity resolution — no admin flag, no
 *      scope — middleware bounced them straight to /admin/login, forever.
 *   2. tenant_owner got FULL admin:true (via core.isTenantOwner folded
 *      into the blanket admin check) — no domain restriction at all,
 *      contradicting "the officer sees only their own body."
 *
 * Covers every scenario David explicitly required, positive AND negative:
 *   - unit_admin resolves to scope:'unit_admin' (was: locked out entirely).
 *   - tenant_owner resolves to admin:false, scope:'tenant_owner' (was:
 *     admin:true, unrestricted — this is the regression-in-reverse: the
 *     OLD behavior must NOT reappear).
 *   - tenant_owner (and unit_admin) denied a path outside their role
 *     (David's own example: /admin/users/all) — /api/admin/* is a
 *     SEPARATE, pre-existing mechanism (AGENT_API_KEY, not the session
 *     cookie) untouched by this stage — verified structurally below, not
 *     re-implemented.
 *   - No regression: root / super_admin / system_admin / vertical_admin /
 *     authority_manager / a plain user with no role at all ("cali") all
 *     resolve EXACTLY as before this stage.
 *
 * Usage:
 *   firebase emulators:start --only firestore
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/verify-access-layer.ts
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
  admin.initializeApp({ projectId: 'demo-outrun-access-layer-verify' });
}
const db = admin.firestore();

let passed = 0;
let failed = 0;
function assert(label: string, condition: boolean, detail?: string) {
  if (condition) { console.log(`  ✅  ${label}`); passed++; }
  else { console.error(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`); failed++; }
}

async function main() {
  const { computeAdminScope } = await import('../src/lib/firebase-admin');
  const { decideAdminGateAction } = await import('../src/middleware');
  const { resolveUnitPermissionScope } = await import('../src/lib/unitPermissionScope');

  const run = Date.now();
  const rootEmail = 'david@appout.co.il';
  const rootUid = `root-${run}`;
  const superAdminUid = `super-${run}`;
  const systemAdminUid = `system-${run}`;
  const verticalAdminUid = `vertical-${run}`;
  const municipalAuthorityUid = `authority-mgr-${run}`;
  const tenantOwnerUid = `tenant-owner-${run}`;
  const unitAdminUid = `unit-admin-${run}`;
  const regularUid = `cali-${run}`; // a plain end-user with no admin/manager role at all

  const tenantId = `tenant-${run}`;
  const unitId = `unit-${run}`;
  const municipalAuthorityId = `city-${run}`;

  // ── Seed ──────────────────────────────────────────────────────────────
  await db.collection('users').doc(rootUid).set({ core: { email: rootEmail } });
  await db.collection('users').doc(superAdminUid).set({ core: { isSuperAdmin: true } });
  await db.collection('users').doc(systemAdminUid).set({ core: { isSystemAdmin: true } });
  await db.collection('users').doc(verticalAdminUid).set({ core: { isVerticalAdmin: true, managedVertical: 'military' } });
  await db.collection('users').doc(municipalAuthorityUid).set({ core: {} });
  await db.collection('users').doc(tenantOwnerUid).set({ core: { isTenantOwner: true, tenantId, tenantType: 'military' } });
  await db.collection('users').doc(unitAdminUid).set({ core: { tenantId, unitId, authorityId: tenantId } });
  await db.collection('users').doc(regularUid).set({ core: { name: 'Cali' } });

  await db.collection('authorities').doc(municipalAuthorityId).set({ type: 'city', managerIds: [municipalAuthorityUid] });
  await db.collection('authorities').doc(tenantId).set({ type: 'military_unit', managerIds: [tenantOwnerUid] });
  await db.collection('tenants').doc(tenantId).collection('units').doc(unitId)
    .set({ name: 'Unit', unitPath: ['Tenant', 'Unit'], unitType: 'battalion', memberCount: 0, managerIds: [unitAdminUid] });

  // ══════════════════════════════════════════════════════════════════════
  console.log('── computeAdminScope: regression — roles unaffected by this stage ──');
  {
    const scope = await computeAdminScope(rootUid, rootEmail, false);
    assert('root email: admin=true (unchanged)', scope.admin === true);
  }
  {
    const scope = await computeAdminScope(superAdminUid, null, false);
    assert('core.isSuperAdmin: admin=true (unchanged)', scope.admin === true);
  }
  {
    const scope = await computeAdminScope(systemAdminUid, null, false);
    assert('core.isSystemAdmin: admin=true (unchanged)', scope.admin === true);
  }
  {
    const scope = await computeAdminScope(verticalAdminUid, null, false);
    assert('core.isVerticalAdmin: admin=true (unchanged)', scope.admin === true);
  }
  {
    const scope = await computeAdminScope(municipalAuthorityUid, null, false);
    assert('authority_manager (municipal): admin=false (unchanged)', scope.admin === false);
    assert('authority_manager (municipal): scope="authority_manager" (unchanged)', scope.scope === 'authority_manager');
  }
  {
    const scope = await computeAdminScope(regularUid, null, false);
    assert('regular user ("cali"), no role at all: admin=false (unchanged)', scope.admin === false);
    assert('regular user ("cali"): scope=undefined (unchanged)', scope.scope === undefined);
  }
  {
    // The `admin` custom claim path (decoded.admin === true on the token
    // itself) is preserved as a parameter, independent of Firestore state.
    const scope = await computeAdminScope(regularUid, null, true);
    assert('tokenClaimAdmin=true overrides everything: admin=true', scope.admin === true);
  }

  console.log('\n── computeAdminScope: THE FIX — unit_admin now recognized ─────');
  {
    const scope = await computeAdminScope(unitAdminUid, null, false);
    assert('unit_admin: admin=false (never blanket admin)', scope.admin === false);
    assert('unit_admin: scope="unit_admin" (was: undefined — total lockout before this stage)', scope.scope === 'unit_admin');
  }

  console.log('\n── computeAdminScope: THE FIX — tenant_owner narrowed from admin:true ──');
  {
    const scope = await computeAdminScope(tenantOwnerUid, null, false);
    assert('tenant_owner: admin=false (was TRUE before this stage — the actual regression being fixed)', scope.admin === false);
    assert('tenant_owner: scope="tenant_owner" (narrow grant, not blanket admin)', scope.scope === 'tenant_owner');
  }

  console.log('\n── Consistency: computeAdminScope agrees with resolveUnitPermissionScope ──');
  {
    const unitScope = await resolveUnitPermissionScope(tenantOwnerUid);
    assert('tenant_owner: resolveUnitPermissionScope independently confirms tenantOwner/tenantId', unitScope.kind === 'tenantOwner' && unitScope.tenantId === tenantId);
  }
  {
    const unitScope = await resolveUnitPermissionScope(unitAdminUid);
    assert('unit_admin: resolveUnitPermissionScope independently confirms unitAdmin/unit', unitScope.kind === 'unitAdmin' && unitScope.unitIds.includes(unitId));
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── decideAdminGateAction: regression — unchanged behavior ─────');
  {
    const result = decideAdminGateAction('/admin/anything-at-all', { admin: true });
    assert('admin:true: allow on any path (root/super/system, unchanged)', result.action === 'allow');
  }
  {
    const result = decideAdminGateAction('/admin/authority/units', { admin: false, scope: 'authority_manager' });
    assert('authority_manager: allowed path → allow (unchanged)', result.action === 'allow');
  }
  {
    const result = decideAdminGateAction('/admin/users/all', { admin: false, scope: 'authority_manager' });
    assert('authority_manager: disallowed path (/admin/users/all) → redirect (unchanged baseline)', result.action === 'redirect');
  }
  {
    const result = decideAdminGateAction('/admin/authority/units', null);
    assert('no session at all ("cali", not logged in): redirect to /admin/login (unchanged)', result.action === 'redirect' && (result as any).to === '/admin/login');
  }
  {
    const result = decideAdminGateAction('/admin/authority/units', { admin: false });
    assert('session with neither admin nor scope: redirect to /admin/login (unchanged)', result.action === 'redirect' && (result as any).to === '/admin/login');
  }

  console.log('\n── decideAdminGateAction: THE FIX — tenant_owner scoped in, not admin ──');
  {
    const result = decideAdminGateAction('/admin/authority/team', { admin: false, scope: 'tenant_owner' });
    assert('tenant_owner: allowed path (/admin/authority/team) → allow', result.action === 'allow');
  }
  {
    const result = decideAdminGateAction('/admin/users/all', { admin: false, scope: 'tenant_owner' });
    assert('tenant_owner: David\'s explicit example (/admin/users/all) → redirect, NOT allow', result.action === 'redirect');
  }
  {
    const result = decideAdminGateAction('/admin/system-settings', { admin: false, scope: 'tenant_owner' });
    assert('tenant_owner: a second disallowed platform-wide path (/admin/system-settings) → redirect', result.action === 'redirect');
  }

  console.log('\n── decideAdminGateAction: THE FIX — unit_admin scoped in, was locked out ──');
  {
    const result = decideAdminGateAction('/admin/authority/units', { admin: false, scope: 'unit_admin' });
    assert('unit_admin: allowed path (/admin/authority/units) → allow (was: no scope value existed at all)', result.action === 'allow');
  }
  {
    const result = decideAdminGateAction('/admin/users/all', { admin: false, scope: 'unit_admin' });
    assert('unit_admin: David\'s explicit example (/admin/users/all) → redirect, NOT allow', result.action === 'redirect');
  }

  console.log('\n── /api/admin/* — a SEPARATE, pre-existing mechanism, untouched ─');
  {
    // middleware.ts's own top-level branch returns early for every
    // pathname.startsWith('/api/') BEFORE decideAdminGateAction ever runs
    // (Capacitor-CORS handling, src/middleware.ts's own early-return block)
    // — /api/admin/* routes are gated by their own requireAdminApi()
    // (AGENT_API_KEY header), a completely different mechanism this stage
    // does not touch. The one thing actually checkable here without a full
    // NextRequest mock: this stage did not (and must not) add any '/api'
    // entry to the allowlist decideAdminGateAction itself consults.
    const fs = await import('fs');
    const path = await import('path');
    const middlewareSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/middleware.ts'), 'utf8');
    const allowlistBlock = middlewareSrc.slice(
      middlewareSrc.indexOf('const AUTHORITY_MANAGER_ALLOWED_PATHS'),
      middlewareSrc.indexOf('export interface GateSessionInfo'),
    );
    assert('AUTHORITY_MANAGER_ALLOWED_PATHS contains no /api path (that gate is separate, untouched)', !allowlistBlock.includes("'/api"));
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error running verify-access-layer:', err);
  process.exit(1);
});
