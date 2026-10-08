/**
 * ADVERSARIAL SECURITY AUDIT — military panel, Firestore-rules layer
 * (08.10.2026). Read-only recon + real emulator red/green tests, no
 * production contact, report-only. Companion to
 * src/features/readiness/core/services/__tests__/military-panel-adversarial-audit.emulator.test.ts
 * (the API/compute*() layer, where the one confirmed vulnerability lives).
 *
 * Attack #2 — a regular authenticated user self-grants an admin
 * permission field via a direct client-SDK updateDoc/setDoc (every
 * core.* field noAdminFieldsChanged()/the create-path check locks).
 * tests/firestore-rules.test.ts already proves this for
 * core.isReadinessChiefOfficer (RCO1-3) and core.tenantId/unitId (T1-T5)
 * — this file sweeps the REMAINING fields in the same blocklist that had
 * no dedicated test: role, core.role, core.isSuperAdmin,
 * core.isSystemAdmin, core.isVerticalAdmin, core.isTenantOwner,
 * core.isApproved, core.managedVertical.
 *
 * Also confirms a structural point load-bearing for the companion file's
 * finding: core.isTenantOwner/core.isVerticalAdmin/
 * core.isReadinessChiefOfficer satisfy NEITHER isAdmin() NOR hasTenant()
 * at the rules layer (firestore.rules:49-66's isAdmin() checks only
 * role/core.role/core.isSuperAdmin/core.isSystemAdmin) — so the
 * compute*() leak found in the companion file is reachable ONLY through
 * the server-side API route (Admin SDK bypasses rules entirely), never
 * through a direct Firestore client-SDK call. That distinction matters
 * for remediation scope.
 *
 * Run: isolated emulator on 127.0.0.1:8089 (NOT the shared 8080 instance
 * another concurrent session may be using) — start with:
 *   firebase emulators:start --only firestore --config firebase-audit.json --project appout-1-audit-test
 */
import { describe, beforeAll, afterAll, it as vitestIt } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc } from 'firebase/firestore';

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

const PROJECT_ID = 'appout-1-audit-test';
const rules = readFileSync('firestore.rules', 'utf8');
let env: RulesTestEnvironment;

async function setup() {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8089 },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'plain_user'), {
      core: { name: 'Plain', discoverable: true },
    });
    await setDoc(doc(db, 'users', 'root_user'), {
      core: { name: 'Root' }, // identity comes from the token email, not this doc
    });
    await setDoc(doc(db, 'users', 'chief_officer_user'), {
      core: { name: 'Chief', isReadinessChiefOfficer: true },
    });
    await setDoc(doc(db, 'users', 'tenant_owner_user'), {
      core: { name: 'TenantOwner', isTenantOwner: true, tenantId: 'brigade-owned' },
    });
    await setDoc(doc(db, 'users', 'vertical_admin_user'), {
      core: { name: 'VerticalAdmin', isVerticalAdmin: true, managedVertical: 'military' },
    });
    await setDoc(doc(db, 'readiness_soldiers', 'victim-soldier'), {
      tenantId: 'some-other-brigade', unitId: 'unit-1', name: 'חייל קורבן', gender: 'male', uid: null,
    });
  });
}

// ─── Attack #2: self-grant sweep — every core.* admin field NOT already
// covered by tests/firestore-rules.test.ts's RCO1-3 / T1-T5. ─────────────
async function testAdminFieldSelfGrantSweep() {
  console.log('\nattack#2 — admin-field self-grant sweep (fields with no prior dedicated test)');

  const FIELDS: Array<{ key: string; value: unknown }> = [
    { key: 'role', value: 'admin' },
    { key: 'core.role', value: 'admin' },
    { key: 'core.isSuperAdmin', value: true },
    { key: 'core.isSystemAdmin', value: true },
    { key: 'core.isVerticalAdmin', value: true },
    { key: 'core.isTenantOwner', value: true },
    { key: 'core.isApproved', value: true },
    { key: 'core.managedVertical', value: 'military' },
  ];

  for (const { key, value } of FIELDS) {
    await it(`SG-UPDATE ${key} — non-admin self-grants via updateDoc → DENY`, async () => {
      const ctx = env.authenticatedContext('plain_user');
      await assertFails(updateDoc(doc(ctx.firestore(), 'users', 'plain_user'), { [key]: value }));
    });
  }

  for (const { key, value } of FIELDS) {
    await it(`SG-CREATE ${key} — a brand-new user bakes the grant into doc CREATE → DENY`, async () => {
      const dottedPath = key.split('.');
      const docBody: Record<string, unknown> =
        dottedPath.length === 1
          ? { [dottedPath[0]]: value, core: { name: 'Sneaky' } }
          : { core: { name: 'Sneaky', [dottedPath[1]]: value } };
      const uid = `sg_create_${key.replace(/\./g, '_')}`;
      const ctx = env.authenticatedContext(uid);
      await assertFails(setDoc(doc(ctx.firestore(), 'users', uid), docBody));
    });
  }

  // Control — an OUT admin (root) can still flip any of these on someone
  // else's doc. Proves the sweep above is testing the self-grant hole,
  // not accidentally proving the whole field is unwritable by anyone.
  await it('SG-CONTROL — root admin sets core.isSuperAdmin on another user\'s doc → ALLOW', async () => {
    const ctx = env.authenticatedContext('root_user', { email: 'david@appout.co.il' });
    await assertSucceeds(updateDoc(doc(ctx.firestore(), 'users', 'plain_user'), {
      'core.isSuperAdmin': true,
    }));
  });
}

// ─── Structural confirmation: the vertical/tenant/chief-officer flags do
// NOT satisfy isAdmin(), so the companion file's API-layer leak cannot be
// reproduced via a direct Firestore client call — only via the server
// route's own compute*() logic (Admin SDK, bypasses rules entirely). ────
async function testVerticalFlagsDoNotGrantRulesAccess() {
  console.log('\nstructural — isTenantOwner/isVerticalAdmin/isReadinessChiefOfficer do NOT satisfy isAdmin() at the rules layer');

  await it('a chief officer (core.isReadinessChiefOfficer=true) reads ANOTHER tenant\'s readiness_soldiers doc directly via client SDK → DENY', async () => {
    const ctx = env.authenticatedContext('chief_officer_user');
    await assertFails(getDoc(doc(ctx.firestore(), 'readiness_soldiers', 'victim-soldier')));
  });

  await it('a chief officer LISTS readiness_soldiers with no filter at all → DENY (not a silent empty result)', async () => {
    const ctx = env.authenticatedContext('chief_officer_user');
    await assertFails(getDocs(collection(ctx.firestore(), 'readiness_soldiers')));
  });

  await it('a tenantOwner (core.isTenantOwner=true) reads a DIFFERENT tenant\'s readiness_soldiers doc → DENY', async () => {
    const ctx = env.authenticatedContext('tenant_owner_user');
    await assertFails(getDoc(doc(ctx.firestore(), 'readiness_soldiers', 'victim-soldier')));
  });

  await it('a verticalAdmin (core.isVerticalAdmin=true, legacy flag) reads readiness_soldiers directly → DENY', async () => {
    const ctx = env.authenticatedContext('vertical_admin_user');
    await assertFails(getDoc(doc(ctx.firestore(), 'readiness_soldiers', 'victim-soldier')));
  });

  await it('same tenantOwner reads tenants/{their own tenantId} directly (hasTenant\'s dead 3rd branch) → DENY — confirms server route is mandatory even for their own data', async () => {
    const ctx = env.authenticatedContext('tenant_owner_user');
    await assertFails(getDoc(doc(ctx.firestore(), 'tenants', 'brigade-owned')));
  });
}

// ─── readiness_thresholds: does the collection's own `allow read, write:
// if false` actually block a ROOT admin, or does the catch-all
// `{document=**} { allow read, write: if isRootAdmin() }` OR in and
// override it? firestore.rules' own comment (lines ~2720-2729) says
// Firestore ORs every matching rule block and a narrower rule never
// overrides a broader fallback — this proves that claim empirically
// rather than trusting the comment. ──────────────────────────────────────
async function testReadinessThresholdsCatchAllInteraction() {
  console.log('\nreadiness_thresholds — explicit if:false vs the root catch-all');

  await it('root admin reads readiness_thresholds/global DESPITE the collection\'s own "allow read: if false" → ALLOWED via the catch-all (confirms the comment\'s claim, not just trusting it)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'readiness_thresholds', 'global'), { id: 'global', version: 1 });
    });
    const ctx = env.authenticatedContext('root_user', { email: 'david@appout.co.il' });
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'readiness_thresholds', 'global')));
  });

  await it('a plain core.role=="admin" user (satisfies isAdmin() but NOT isRootAdmin(), post-20.09.2026 narrowing) reads readiness_thresholds/global → DENY (catch-all no longer covers non-root admins)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'plain_admin_user'), { core: { name: 'PlainAdmin', role: 'admin' } });
    });
    const ctx = env.authenticatedContext('plain_admin_user');
    await assertFails(getDoc(doc(ctx.firestore(), 'readiness_thresholds', 'global')));
  });
}

function wrapSuite(name: string, fn: () => Promise<void>) {
  describe(name, () => {
    vitestIt('runs', async () => {
      const before = fail;
      await fn();
      if (fail > before) {
        throw new Error(`${fail - before} case(s) failed in "${name}" — see console output above for details`);
      }
    }, 60_000);
  });
}

beforeAll(async () => {
  await setup();
}, 30_000);

afterAll(async () => {
  console.log(`\n=== military-panel-adversarial-audit.rules.test.ts: ${pass} passed, ${fail} failed ===`);
  if (failures.length) console.log('Failed:', failures.join(', '));
  if (env) await env.cleanup();
});

wrapSuite('attack#2 — admin field self-grant sweep', testAdminFieldSelfGrantSweep);
wrapSuite('structural — vertical/tenant flags vs isAdmin()', testVerticalFlagsDoNotGrantRulesAccess);
wrapSuite('readiness_thresholds vs root catch-all', testReadinessThresholdsCatchAllInteraction);
