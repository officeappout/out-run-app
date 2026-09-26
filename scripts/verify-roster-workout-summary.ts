#!/usr/bin/env npx tsx
/**
 * scripts/verify-roster-workout-summary.ts
 *
 * Emulator-only verification of GET /api/units/roster-workout-summary —
 * Slice F of the persona-unit-unification build (26.09.2026, see
 * docs/audit-2026-09/00-MASTER-PLAN.md §13.31).
 *
 * Covers every scenario David required:
 *   - a unit_admin's own-domain query returns a real workoutsLast7Days +
 *     lastWorkoutDateThisWeek for a member who trained this week, and a
 *     real 0/null for one who didn't — a genuine 0 renders identically
 *     to any other real number (the failure case, tested separately, is
 *     what must look different, not this).
 *   - downward inheritance still applies (a unit_admin sees a descendant
 *     unit's members too, per §13.28) — inherited automatically from
 *     resolveUnitPermissionScope, no special-casing in this endpoint.
 *   - cross-tenant / cross-unit denial, matching every other route.
 *   - chunking: a roster of MORE than 30 members is split into multiple
 *     'in' queries and correctly re-aggregated — not silently truncated
 *     to the first 30.
 *   - fail-closed: a chunk-query failure rejects the WHOLE request, never
 *     a partial summaries array.
 *   - zero geographic field anywhere in the response.
 *   - rate limiting.
 *
 * Usage:
 *   firebase emulators:start --only firestore
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/verify-roster-workout-summary.ts
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
  admin.initializeApp({ projectId: 'demo-outrun-roster-workout-summary-verify' });
}
const db = admin.firestore();

let passed = 0;
let failed = 0;
function assert(label: string, condition: boolean, detail?: string) {
  if (condition) { console.log(`  ✅  ${label}`); passed++; }
  else { console.error(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`); failed++; }
}

async function clearAll() {
  for (const col of ['authorities', 'users', 'workouts']) {
    const snap = await db.collection(col).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  const tenantsSnap = await db.collection('tenants').get();
  for (const t of tenantsSnap.docs) {
    const unitsSnap = await t.ref.collection('units').get();
    await Promise.all(unitsSnap.docs.map((d) => d.ref.delete()));
    await t.ref.delete();
  }
}

async function main() {
  const { computeRosterWorkoutSummary } = await import('../src/app/api/units/roster-workout-summary/route');
  const { resolveUnitPermissionScope } = await import('../src/lib/unitPermissionScope');
  const { isRateLimited } = await import('../src/lib/rateLimit');
  const { RATE_LIMITS } = await import('../src/lib/rateLimitConfig');

  const run = Date.now();
  await clearAll();

  // ══════════════════════════════════════════════════════════════════════
  console.log('── seed: 2-level hierarchy + a soldier who trained this week, one who did not ──');
  const tenantA = `tenant-a-${run}`;
  const tenantB = `tenant-b-${run}`;
  const battalionA1 = 'battalion_a1';
  const companyA1a = 'company_a1a'; // descendant of battalionA1, not directly managed
  const unitB1 = 'unit_b1';

  const unitAdminUid = `unit-admin-${run}`;
  const tenantOwnerUid = `tenant-owner-${run}`;
  const activeMemberUid = `active-member-${run}`; // trained 2 days ago
  const inactiveMemberUid = `inactive-member-${run}`; // trained 20 days ago (outside the 7-day window)
  const neverTrainedUid = `never-trained-${run}`; // zero workouts docs at all
  const descendantMemberUid = `descendant-member-${run}`; // in companyA1a

  await db.collection('authorities').doc(tenantA).set({ name: 'Tenant A', type: 'military_unit', managerIds: [tenantOwnerUid] });
  await db.collection('authorities').doc(tenantB).set({ name: 'Tenant B', type: 'military_unit', managerIds: [] });

  await db.collection('tenants').doc(tenantA).collection('units').doc(battalionA1)
    .set({ name: 'גדוד 101', parentUnitId: null, managerIds: [unitAdminUid] });
  await db.collection('tenants').doc(tenantA).collection('units').doc(companyA1a)
    .set({ name: 'פלוגה א', parentUnitId: battalionA1, managerIds: [] });
  await db.collection('tenants').doc(tenantB).collection('units').doc(unitB1)
    .set({ name: 'יחידה ב1', parentUnitId: null, managerIds: [] });

  await db.collection('users').doc(activeMemberUid).set({ core: { name: 'חייל פעיל', tenantId: tenantA, unitId: battalionA1 } });
  await db.collection('users').doc(inactiveMemberUid).set({ core: { name: 'חייל לא פעיל', tenantId: tenantA, unitId: battalionA1 } });
  await db.collection('users').doc(neverTrainedUid).set({ core: { name: 'חייל חדש', tenantId: tenantA, unitId: battalionA1 } });
  await db.collection('users').doc(descendantMemberUid).set({ core: { name: 'חייל בפלוגה', tenantId: tenantA, unitId: companyA1a } });

  const now = admin.firestore.Timestamp.now();
  const twoDaysAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const twentyDaysAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 20 * 24 * 60 * 60 * 1000);

  // Real field shape (§13.30's rule) — date/duration/workoutType, plus a
  // real location-identifying field (routePath) to prove it's excluded.
  await db.collection('workouts').add({
    userId: activeMemberUid, date: twoDaysAgo, duration: 1800, workoutType: 'strength',
    routePath: [{ lat: 31.5, lng: 34.7 }],
  });
  await db.collection('workouts').add({
    userId: activeMemberUid, date: now, duration: 1200, workoutType: 'running',
    routePath: [{ lat: 31.5, lng: 34.7 }],
  });
  await db.collection('workouts').add({
    userId: inactiveMemberUid, date: twentyDaysAgo, duration: 1500, workoutType: 'strength',
  });
  await db.collection('workouts').add({
    userId: descendantMemberUid, date: twoDaysAgo, duration: 900, workoutType: 'hybrid',
  });

  const unitAdminScope = await resolveUnitPermissionScope(unitAdminUid);
  const tenantOwnerScope = await resolveUnitPermissionScope(tenantOwnerUid);
  assert('seed: unit_admin resolves, scope includes descendant company (§13.28 downward inheritance)', unitAdminScope.kind === 'unitAdmin' && unitAdminScope.unitIds.includes(companyA1a));
  assert('seed: tenant_owner resolves', tenantOwnerScope.kind === 'tenantOwner');

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── unit_admin: own-domain query, real numbers per member ──');
  {
    const result = await computeRosterWorkoutSummary(db, unitAdminScope, {});
    assert('200', result.status === 200);
    if (result.status === 200) {
      const byUid = new Map(result.body.summaries.map((s) => [s.uid, s]));
      assert('active member: workoutsLast7Days = 2', byUid.get(activeMemberUid)?.workoutsLast7Days === 2);
      assert('active member: lastWorkoutDateThisWeek is set (not null)', byUid.get(activeMemberUid)?.lastWorkoutDateThisWeek !== null);
      assert('inactive member (trained 20 days ago): workoutsLast7Days = 0, a REAL zero', byUid.get(inactiveMemberUid)?.workoutsLast7Days === 0);
      assert('inactive member: lastWorkoutDateThisWeek is null (not this week, not a fabricated date)', byUid.get(inactiveMemberUid)?.lastWorkoutDateThisWeek === null);
      assert('never-trained member: workoutsLast7Days = 0 too — a real 0 looks the same whether from "no recent activity" or "no history at all"', byUid.get(neverTrainedUid)?.workoutsLast7Days === 0);
      assert('descendant-unit member (company, not directly managed) IS included — downward inheritance applies here too', byUid.has(descendantMemberUid));
      assert('descendant member: workoutsLast7Days = 1', byUid.get(descendantMemberUid)?.workoutsLast7Days === 1);
    }
  }

  console.log('\n── tenant_owner: sees the whole tenant, not the other tenant ──');
  {
    const result = await computeRosterWorkoutSummary(db, tenantOwnerScope, {});
    assert('200', result.status === 200);
    if (result.status === 200) {
      const uids = result.body.summaries.map((s) => s.uid);
      assert('sees all 4 members under tenant A', uids.length === 4);
    }
  }

  console.log('\n── zero geographic field anywhere in the response ──');
  {
    const result = await computeRosterWorkoutSummary(db, unitAdminScope, {});
    const bodyStr = JSON.stringify(result.status === 200 ? result.body : {});
    assert('routePath never appears, even though it was seeded on real docs', !bodyStr.includes('routePath') && !bodyStr.includes('lat'));
    assert('response fields are exactly uid/workoutsLast7Days/lastWorkoutDateThisWeek', result.status === 200 && result.body.summaries.every((s) => JSON.stringify(Object.keys(s).sort()) === JSON.stringify(['lastWorkoutDateThisWeek', 'uid', 'workoutsLast7Days'].sort())));
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── negative: cross-tenant / cross-unit denial ──');
  {
    const crossTenant = await computeRosterWorkoutSummary(db, unitAdminScope, { unitId: unitB1 });
    assert('unit_admin requesting a unit in a DIFFERENT tenant: 403', crossTenant.status === 403);
    const strangerScope = await resolveUnitPermissionScope(`stranger-${run}`);
    const denied = await computeRosterWorkoutSummary(db, strangerScope, {});
    assert('denied scope: 403', denied.status === 403);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── chunking: a roster of 35 members (> 30, the Firestore `in` cap) ──');
  {
    const bigUnit = `big_unit_${run}`;
    await db.collection('tenants').doc(tenantA).collection('units').doc(bigUnit)
      .set({ name: 'יחידה גדולה', parentUnitId: null, managerIds: [] });
    const bigUnitMemberUids: string[] = [];
    for (let i = 0; i < 35; i++) {
      const memberUid = `big-unit-member-${i}-${run}`;
      bigUnitMemberUids.push(memberUid);
      await db.collection('users').doc(memberUid).set({ core: { name: `חייל ${i}`, tenantId: tenantA, unitId: bigUnit } });
      // Every 5th member trained this week — a mix, not all-or-nothing.
      if (i % 5 === 0) {
        await db.collection('workouts').add({ userId: memberUid, date: twoDaysAgo, duration: 600, workoutType: 'strength' });
      }
    }
    const result = await computeRosterWorkoutSummary(db, tenantOwnerScope, { unitId: bigUnit });
    assert('200', result.status === 200);
    if (result.status === 200) {
      assert('all 35 members present, none silently dropped by chunking', result.body.summaries.length === 35);
      const trainedCount = result.body.summaries.filter((s) => s.workoutsLast7Days > 0).length;
      assert('exactly 7 of 35 (every 5th) correctly show a trained week, spanning the 30-cap boundary', trainedCount === 7);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── fail-closed: a chunk query failure rejects the WHOLE request ──');
  {
    // computeRosterWorkoutSummary's chunk query chains TWO .where() calls
    // (.where('userId','in',chunk).where('date','>=',X)) — the SECOND one
    // runs on the Query object the FIRST one returns, not on the original
    // CollectionReference, so patching CollectionReference.prototype (the
    // technique unitPermissionScope's own fail-closed test uses, correct
    // there because that query has only ONE .where() in its chain) never
    // intercepts it. Patching the shared Query.prototype instead — where
    // .where() is actually an own property (confirmed empirically) — and
    // still filtering by field name so this only fires for the 'date'
    // range filter specifically, not every .where() call system-wide
    // (which would also hit resolveUnitPermissionScope's own queries).
    const proto = Object.getPrototypeOf(Object.getPrototypeOf(db.collection('workouts')));
    const originalWhere = proto.where;
    let fired = 0;
    proto.where = function simulateChunkFailure(this: unknown, field: string, ...rest: unknown[]) {
      if (field === 'date') {
        fired++;
        throw new Error('simulated: workouts chunk query failure');
      }
      return originalWhere.call(this, field, ...rest);
    };
    try {
      let threw = false;
      try {
        await computeRosterWorkoutSummary(db, unitAdminScope, {});
      } catch {
        threw = true;
      }
      assert('a chunk-query failure throws out of computeRosterWorkoutSummary — never a partial/silent result', threw);
      assert('the simulated failure actually fired', fired > 0);
    } finally {
      proto.where = originalWhere;
    }
    const resultAfterRestore = await computeRosterWorkoutSummary(db, unitAdminScope, {});
    assert('after restoring: a normal call succeeds again', resultAfterRestore.status === 200);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── Rate limit: uid-based, reusing isRateLimited as-is ────────');
  {
    const uid = `rate-limited-${run}`;
    const window = RATE_LIMITS.rosterWorkoutSummary.uidHourly();
    const results: boolean[] = [];
    for (let i = 0; i < window.maxRequests + 1; i++) {
      results.push(await isRateLimited(db, `roster-workout-summary:${uid}`, window));
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
  console.error('Fatal error running verify-roster-workout-summary:', err);
  process.exit(1);
});
