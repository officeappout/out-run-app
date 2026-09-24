#!/usr/bin/env npx tsx
/**
 * scripts/verify-unit-join-requests.ts
 *
 * Emulator-only (no --prod, by design — see scripts/verify-rate-limit.ts /
 * verify-analytics-scope.ts for the same convention) verification of Stage
 * 0 (resolveUnitPermissionScope, src/lib/unitPermissionScope.ts) and Stage
 * 1 (the join-request loop: src/app/api/units/join-requests/{route,decide/
 * route,me/route}.ts) of the military/school vertical build — see
 * .claude/plans/tenant-military-school-vertical-model.md §ח.
 *
 * Covers every scenario David explicitly required, positive AND negative:
 *   Stage 0 — root / tenantOwner / unitAdmin / denied resolution.
 *   Stage 1 positive — create → approve → "me" reflects it + core fields
 *     written; create → reject → "me" reflects it, re-request allowed.
 *   Negative 1 — unit A's manager tries to approve unit B's request →
 *     rejected.
 *   Negative 2 — a regular (non-manager) user tries to approve their own
 *     request → rejected.
 *   Negative 3 — a user has no way to read another uid's status (structural
 *     — "me" takes no identifier parameter at all).
 *   Negative 4 — a request for a unit that doesn't exist is rejected with
 *     the SAME generic message as any other invalid-target failure (no
 *     existence-leak).
 *   Negative 5 — two concurrent create calls from the same user → exactly
 *     one request doc exists afterward.
 *   Fail-closed (24.09.2026) — if the collectionGroup('units') query itself
 *     throws (simulated: missing index / Firestore outage / timeout in
 *     production), resolveUnitPermissionScope resolves to 'denied', not a
 *     permissive default and not an uncaught exception.
 *   Plus: rate-limit cap (ד.5, 3 attempts / rolling 24h) actually trips.
 *
 * Usage:
 *   firebase emulators:start --only firestore
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/verify-unit-join-requests.ts
 */
import * as admin from 'firebase-admin';
import { createRequire } from 'module';

// src/lib/firebase-admin.ts (imported transitively by every module under
// test here) does `import 'server-only'`, which throws unconditionally
// outside a Next.js Server Component bundle — neutralized the same way
// scripts/verify-analytics-scope.ts / verify-push-pipeline.ts do.
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
  admin.initializeApp({ projectId: 'demo-outrun-unit-join-requests-verify' });
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
  const { computeCreateJoinRequest } = await import('../src/app/api/units/join-requests/route');
  const { computeDecideJoinRequest } = await import('../src/app/api/units/join-requests/decide/route');
  const { computeMyJoinRequestStatus } = await import('../src/app/api/units/join-requests/me/route');
  const { isRateLimited } = await import('../src/lib/rateLimit');
  const { RATE_LIMITS } = await import('../src/lib/rateLimitConfig');

  const run = Date.now();
  const tenantA = `tenant-a-${run}`;
  const tenantB = `tenant-b-${run}`;
  const unitA1 = `unit-a1-${run}`;
  const unitB1 = `unit-b1-${run}`;
  const rootUid = `root-${run}`;
  const tenantOwnerUid = `tenant-owner-${run}`;
  const unitAdminAUid = `unit-admin-a-${run}`;
  const unitAdminBUid = `unit-admin-b-${run}`;
  const regularUid = `regular-${run}`;
  const requesterUid = `requester-${run}`;
  const requesterRejectedUid = `requester-rejected-${run}`;

  // ── Seed ──────────────────────────────────────────────────────────────
  // Stage 0 subjects.
  await db.collection('users').doc(rootUid).set({ core: { email: 'david@appout.co.il' } });
  await db.collection('users').doc(tenantOwnerUid).set({ core: {} });
  await db.collection('users').doc(unitAdminAUid).set({ core: {} });
  await db.collection('users').doc(unitAdminBUid).set({ core: {} });
  await db.collection('users').doc(regularUid).set({ core: {} });
  await db.collection('users').doc(requesterUid).set({ core: {} });
  await db.collection('users').doc(requesterRejectedUid).set({ core: {} });

  await db.collection('authorities').doc(tenantA).set({ type: 'military_unit', managerIds: [tenantOwnerUid] });
  await db.collection('authorities').doc(tenantB).set({ type: 'military_unit', managerIds: [] });

  // unit_admin seeded DIRECTLY in the emulator — no invitation chain exists
  // yet (Stage 2), exactly as David authorized: "unit_admin נזרע ישירות
  // באמולטור".
  await db
    .collection('tenants').doc(tenantA)
    .collection('units').doc(unitA1)
    .set({ name: 'Unit A1', unitPath: ['Tenant A', 'Unit A1'], unitType: 'battalion', memberCount: 0, managerIds: [unitAdminAUid] });
  await db
    .collection('tenants').doc(tenantB)
    .collection('units').doc(unitB1)
    .set({ name: 'Unit B1', unitPath: ['Tenant B', 'Unit B1'], unitType: 'battalion', memberCount: 0, managerIds: [unitAdminBUid] });

  // ══════════════════════════════════════════════════════════════════════
  console.log('── Stage 0: resolveUnitPermissionScope ──────────────────────');
  {
    const scope = await resolveUnitPermissionScope(rootUid);
    assert('root email resolves to root scope', scope.kind === 'root');
  }
  {
    const scope = await resolveUnitPermissionScope(tenantOwnerUid);
    assert('tenant A manager resolves to tenantOwner scope', scope.kind === 'tenantOwner');
    assert('tenantOwner scoped to tenant A specifically', scope.kind === 'tenantOwner' && scope.tenantId === tenantA);
  }
  {
    const scope = await resolveUnitPermissionScope(unitAdminAUid);
    assert('unit A1 manager resolves to unitAdmin scope', scope.kind === 'unitAdmin');
    assert('unitAdmin scoped to tenant A', scope.kind === 'unitAdmin' && scope.tenantId === tenantA);
    assert('unitAdmin unitIds include unit A1', scope.kind === 'unitAdmin' && scope.unitIds.includes(unitA1));
    assert('unitAdmin unitIds do NOT include unit B1', scope.kind === 'unitAdmin' && !scope.unitIds.includes(unitB1));
  }
  {
    const scope = await resolveUnitPermissionScope(regularUid);
    assert('a user with no role at all resolves to denied', scope.kind === 'denied');
  }

  console.log('\n── Stage 0 fail-closed: collectionGroup query throws ─────────');
  {
    // Simulates exactly what happens in production before the required
    // units.managerIds collection-group index (firestore.indexes.json) is
    // deployed — or any other reason the query itself throws (outage,
    // timeout). Patched at the shared prototype level (not on this
    // script's own `db` instance) so it also intercepts the SEPARATE
    // Firestore instance resolveUnitPermissionScope obtains internally via
    // getAdminDb() — the two are backed by the same emulator project, but
    // are not guaranteed to be the literal same JS object.
    const proto = Object.getPrototypeOf(db);
    const originalCollectionGroup = proto.collectionGroup;
    proto.collectionGroup = function simulateIndexFailure() {
      throw new Error('simulated: FAILED_PRECONDITION — the query requires an index (units.managerIds)');
    };
    try {
      // unitAdminAUid would resolve to 'unitAdmin' under normal conditions
      // (asserted above) — this proves the failure produces 'denied', not
      // a silent fallback to some OTHER scope and not an uncaught throw
      // that escapes this function.
      const scope = await resolveUnitPermissionScope(unitAdminAUid);
      assert('collectionGroup query throwing resolves to denied, not a permissive default', scope.kind === 'denied');
    } finally {
      proto.collectionGroup = originalCollectionGroup;
    }

    // Restored correctly — the same uid resolves back to unitAdmin.
    const scopeAfterRestore = await resolveUnitPermissionScope(unitAdminAUid);
    assert('after restoring the query: unit A1 manager resolves to unitAdmin again (patch cleanly reverted)', scopeAfterRestore.kind === 'unitAdmin');
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── Stage 1 positive: create → approve → me ──────────────────');
  {
    const createResult = await computeCreateJoinRequest(db, requesterUid, { tenantId: tenantA, unitId: unitA1 });
    assert('create: 200 status', createResult.status === 200);
    assert('create: status is pending', (createResult.body as any).status === 'pending');

    const meBefore = await computeMyJoinRequestStatus(db, requesterUid);
    assert('me (before decision): shows pending', (meBefore.body as any).status === 'pending');

    const scopeA = await resolveUnitPermissionScope(unitAdminAUid);
    const decideResult = await computeDecideJoinRequest(db, scopeA, unitAdminAUid, requesterUid, 'approve');
    assert('decide (correct unit admin, approve): 200 status', decideResult.status === 200);
    assert('decide (approve): status is approved', (decideResult.body as any).status === 'approved');

    const meAfter = await computeMyJoinRequestStatus(db, requesterUid);
    assert('me (after approval): shows approved', (meAfter.body as any).status === 'approved');

    const userSnap = await db.collection('users').doc(requesterUid).get();
    const core = userSnap.data()?.core ?? {};
    assert('approved user: core.tenantId written', core.tenantId === tenantA);
    assert('approved user: core.unitId written', core.unitId === unitA1);
    assert('approved user: core.authorityId written (mirrors tenantId)', core.authorityId === tenantA);
    assert('approved user: core.unitPath written as an array', Array.isArray(core.unitPath) && core.unitPath.length > 0);
  }

  console.log('\n── Stage 1 positive: create → reject → re-request allowed ───');
  {
    const createResult = await computeCreateJoinRequest(db, requesterRejectedUid, { tenantId: tenantA, unitId: unitA1 });
    assert('create (2nd requester): 200 status', createResult.status === 200);

    const scopeA = await resolveUnitPermissionScope(unitAdminAUid);
    const decideResult = await computeDecideJoinRequest(db, scopeA, unitAdminAUid, requesterRejectedUid, 'reject');
    assert('decide (reject): 200 status', decideResult.status === 200);
    assert('decide (reject): status is rejected', (decideResult.body as any).status === 'rejected');

    const meAfter = await computeMyJoinRequestStatus(db, requesterRejectedUid);
    assert('me (after rejection): shows rejected', (meAfter.body as any).status === 'rejected');

    const userSnap = await db.collection('users').doc(requesterRejectedUid).get();
    assert('rejected user: core.tenantId NOT written', userSnap.data()?.core?.tenantId === undefined);

    // Re-request allowed after rejection (bypassing the HTTP-layer rate
    // limiter here — that's tested separately below; this proves the
    // compute function's own state machine allows it).
    const reRequest = await computeCreateJoinRequest(db, requesterRejectedUid, { tenantId: tenantA, unitId: unitA1 });
    assert('re-request after rejection: 200 status (allowed)', reRequest.status === 200);
    assert('re-request after rejection: back to pending', (reRequest.body as any).status === 'pending');
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── Negative 1: unit A admin approves unit B\'s request ───────');
  {
    const bRequesterUid = `b-requester-${run}`;
    await computeCreateJoinRequest(db, bRequesterUid, { tenantId: tenantB, unitId: unitB1 });

    const scopeA = await resolveUnitPermissionScope(unitAdminAUid); // manages tenant A / unit A1 only
    const decideResult = await computeDecideJoinRequest(db, scopeA, unitAdminAUid, bRequesterUid, 'approve');
    assert('unit A admin approving unit B\'s request: rejected (403)', decideResult.status === 403);

    const meAfter = await computeMyJoinRequestStatus(db, bRequesterUid);
    assert('unit B\'s request: still pending after the cross-unit attempt', (meAfter.body as any).status === 'pending');
  }

  console.log('\n── Negative 2: regular user approves their own request ───────');
  {
    const selfRequesterUid = `self-requester-${run}`;
    await computeCreateJoinRequest(db, selfRequesterUid, { tenantId: tenantA, unitId: unitA1 });

    const scopeSelf = await resolveUnitPermissionScope(selfRequesterUid); // no manager role anywhere → denied
    assert('the requester themself has no manager scope', scopeSelf.kind === 'denied');
    const decideResult = await computeDecideJoinRequest(db, scopeSelf, selfRequesterUid, selfRequesterUid, 'approve');
    assert('regular user approving their own request: rejected (403)', decideResult.status === 403);

    const meAfter = await computeMyJoinRequestStatus(db, selfRequesterUid);
    assert('self-approval attempt: request still pending', (meAfter.body as any).status === 'pending');
  }

  console.log('\n── Negative 3: no way to read another uid\'s status ───────────');
  {
    // computeMyJoinRequestStatus takes ONLY a uid — there is no
    // targetUid/identifier parameter to even attempt passing a different
    // uid through. Proven by construction: calling it as uidA returns
    // uidA's own doc, never uidB's, no matter what uidB's state is.
    const otherUid = `other-status-${run}`;
    await computeCreateJoinRequest(db, otherUid, { tenantId: tenantA, unitId: unitA1 });

    const asRegular = await computeMyJoinRequestStatus(db, regularUid); // regularUid never created a request
    assert('a user with no request of their own: "me" shows none', (asRegular.body as any).status === 'none');
    assert(
      'a user with no request of their own: "me" body never contains another user\'s tenantId/unitId',
      (asRegular.body as any).tenantId === undefined && (asRegular.body as any).unitId === undefined,
    );
  }

  console.log('\n── Negative 4: request for a nonexistent unit ─────────────────');
  {
    const ghostRequesterUid = `ghost-requester-${run}`;
    const nonexistentResult = await computeCreateJoinRequest(db, ghostRequesterUid, { tenantId: tenantA, unitId: `no-such-unit-${run}` });
    assert('request for a nonexistent unit: rejected (400)', nonexistentResult.status === 400);

    const malformedResult = await computeCreateJoinRequest(db, ghostRequesterUid, { tenantId: '', unitId: '' });
    assert('request with a malformed/missing target: rejected (400)', malformedResult.status === 400);

    assert(
      'nonexistent-unit rejection message is IDENTICAL to a malformed-target rejection — no existence leak',
      JSON.stringify(nonexistentResult.body) === JSON.stringify(malformedResult.body),
    );
  }

  console.log('\n── Negative 5: two concurrent creates, same user ───────────────');
  {
    const concurrentUid = `concurrent-${run}`;
    const [r1, r2] = await Promise.all([
      computeCreateJoinRequest(db, concurrentUid, { tenantId: tenantA, unitId: unitA1 }),
      computeCreateJoinRequest(db, concurrentUid, { tenantId: tenantB, unitId: unitB1 }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    assert('concurrent creates: exactly one succeeded (200) and one was rejected as already-pending (409)', statuses[0] === 200 && statuses[1] === 409);

    const finalSnap = await db.collection('unit_join_requests').doc(concurrentUid).get();
    assert('concurrent creates: exactly one request document exists afterward', finalSnap.exists);
  }

  console.log('\n── Rate limit: ד.5 (max 3 create attempts / rolling 24h) ───────');
  {
    const rlUid = `ratelimit-${run}`;
    const window = RATE_LIMITS.unitJoinRequest.uidDaily();
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      results.push(await isRateLimited(db, `join-request-retry:${rlUid}`, window));
    }
    assert('attempts 1-3 are NOT rate-limited', results[0] === false && results[1] === false && results[2] === false);
    assert('attempt 4 (within the same window) IS rate-limited', results[3] === true);
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error running verify-unit-join-requests:', err);
  process.exit(1);
});
