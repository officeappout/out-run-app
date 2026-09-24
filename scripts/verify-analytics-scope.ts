#!/usr/bin/env npx tsx
/**
 * scripts/verify-analytics-scope.ts
 *
 * Emulator-only (no --prod, by design — see scripts/verify-rate-limit.ts
 * for the same convention) verification of resolveAdminAnalyticsScope
 * (src/lib/adminAnalyticsScope.ts), the server-side role→scope resolver
 * behind /api/admin/statistics-summary and /api/admin/insights-summary
 * (00-MASTER-PLAN.md §13.11 P1).
 *
 * Covers every scenario David asked to verify:
 *   1. root/super_admin → 'platform'
 *   2. authority_manager → 'authority', scoped to exactly their own city
 *   3. authority_manager with no authority at all → 'denied' (not zeros)
 *   4. vertical_admin → 'vertical', authorityIds = exactly that vertical's
 *      authorities (military_unit → 'military', school → 'educational',
 *      everything else → 'municipal' — tenantTypeOf, reused from
 *      src/app/api/admin/authorities/route.ts, not reinvented)
 *   5. platform_member with 'product' or 'system' in allowedSections →
 *      'platform' (internal team access, documented decision)
 *   6. platform_member WITHOUT either section → 'denied'
 *
 * "A manager sending a different authority's id gets no data" is proven
 * separately, at the route (HTTP) level, in src/app/api/admin/
 * insights-summary/__tests__/route.test.ts and statistics-summary's
 * sibling — resolveAdminAnalyticsScope takes only a uid, so there is no
 * authorityId parameter here to even attempt sending one through.
 *
 * Usage:
 *   firebase emulators:start --only firestore,auth   (or just firestore —
 *     this script only needs Firestore; verifyIdToken/Auth is tested
 *     separately at the route level with a mocked getAdminAuth)
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/verify-analytics-scope.ts
 */
import * as admin from 'firebase-admin';
import { createRequire } from 'module';

// src/lib/firebase-admin.ts (imported transitively by adminAnalyticsScope.ts)
// does `import 'server-only'`, which throws unconditionally outside a
// Next.js Server Component bundle — neutralized the same way
// scripts/verify-push-pipeline.ts mocks firebase-functions via a
// Module._load intercept.
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
  admin.initializeApp({ projectId: 'demo-outrun-analytics-scope-verify' });
}
const db = admin.firestore();

let passed = 0;
let failed = 0;
function assert(label: string, condition: boolean, detail?: string) {
  if (condition) { console.log(`  ✅  ${label}`); passed++; }
  else { console.error(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`); failed++; }
}

async function main() {
  const { resolveAdminAnalyticsScope } = await import('../src/lib/adminAnalyticsScope');
  const { computeInsightsSummary } = await import('../src/app/api/admin/insights-summary/route');
  const { computeStatisticsSummary } = await import('../src/app/api/admin/statistics-summary/route');

  // ── Seed ────────────────────────────────────────────────────────────────
  const run = Date.now();
  const cityA = `city-a-${run}`;
  const cityB = `city-b-${run}`;
  const milUnit = `mil-unit-${run}`;
  const school = `school-${run}`;

  await db.collection('authorities').doc(cityA).set({ type: 'city', managerIds: [`mgr-a-${run}`] });
  await db.collection('authorities').doc(cityB).set({ type: 'city', managerIds: [`mgr-b-${run}`] });
  await db.collection('authorities').doc(milUnit).set({ type: 'military_unit', managerIds: [] });
  await db.collection('authorities').doc(school).set({ type: 'school', managerIds: [] });

  await db.collection('users').doc(`root-${run}`).set({ core: { isSuperAdmin: true } });
  await db.collection('users').doc(`mgr-a-${run}`).set({ core: { authorityId: cityA } });
  await db.collection('users').doc(`mgr-b-${run}`).set({ core: { authorityId: cityB } });
  await db.collection('users').doc(`no-role-${run}`).set({ core: {} });
  await db.collection('users').doc(`vertical-admin-${run}`).set({ core: { isVerticalAdmin: true, managedVertical: 'military' } });
  await db.collection('users').doc(`platform-member-yes-${run}`).set({ core: { allowedSections: ['product'] } });
  await db.collection('users').doc(`platform-member-no-${run}`).set({ core: { allowedSections: ['marketing'] } });
  await db.collection('users').doc(`system-admin-${run}`).set({ core: { role: 'system_admin' } });

  // Neighborhood-level authorities + residents, so computeInsightsSummary's
  // per-neighborhood output can prove real city-level data isolation, not
  // just an empty/trivial response.
  const neighA = `neigh-a-${run}`;
  const neighB = `neigh-b-${run}`;
  await db.collection('authorities').doc(neighA).set({ type: 'neighborhood', parentAuthorityId: cityA, name: 'Neighborhood A', userCount: 100, managerIds: [] });
  await db.collection('authorities').doc(neighB).set({ type: 'neighborhood', parentAuthorityId: cityB, name: 'Neighborhood B', userCount: 100, managerIds: [] });
  for (let i = 0; i < 3; i++) {
    await db.collection('users').doc(`resident-a-${i}-${run}`).set({ core: { authorityId: neighA }, onboardingStatus: 'COMPLETED' });
  }
  for (let i = 0; i < 5; i++) {
    await db.collection('users').doc(`resident-b-${i}-${run}`).set({ core: { authorityId: neighB }, onboardingStatus: 'COMPLETED' });
  }

  // ── 1. root/super_admin → platform ────────────────────────────────────────
  {
    const scope = await resolveAdminAnalyticsScope(`root-${run}`);
    assert('root/super_admin resolves to platform scope', scope.kind === 'platform');
  }

  // ── system_admin (alternate path, core.role) → platform ──────────────────
  {
    const scope = await resolveAdminAnalyticsScope(`system-admin-${run}`);
    assert('system_admin (core.role) resolves to platform scope', scope.kind === 'platform');
  }

  // ── 2. authority_manager → authority scope, own city only ────────────────
  {
    const scopeA = await resolveAdminAnalyticsScope(`mgr-a-${run}`);
    assert('city A manager resolves to authority scope', scopeA.kind === 'authority');
    assert('city A manager scoped to city A specifically', scopeA.kind === 'authority' && scopeA.authorityId === cityA);
    assert('city A manager NOT scoped to city B', scopeA.kind === 'authority' && scopeA.authorityId !== cityB);

    const scopeB = await resolveAdminAnalyticsScope(`mgr-b-${run}`);
    assert('city B manager scoped to city B specifically', scopeB.kind === 'authority' && scopeB.authorityId === cityB);
  }

  // ── 3. authority_manager-shaped uid with NO authority at all → denied ────
  {
    const scope = await resolveAdminAnalyticsScope(`no-role-${run}`);
    assert('uid with no role/authority resolves to denied (not silently platform or zeros)', scope.kind === 'denied');
  }

  // ── 4. vertical_admin → vertical scope, correct authority set ────────────
  {
    const scope = await resolveAdminAnalyticsScope(`vertical-admin-${run}`);
    assert('vertical_admin resolves to vertical scope', scope.kind === 'vertical');
    if (scope.kind === 'vertical') {
      assert('vertical is "military"', scope.vertical === 'military');
      assert('vertical authorityIds include the military unit', scope.authorityIds.includes(milUnit));
      assert('vertical authorityIds do NOT include the school (different vertical)', !scope.authorityIds.includes(school));
      assert('vertical authorityIds do NOT include either city (different vertical)', !scope.authorityIds.includes(cityA) && !scope.authorityIds.includes(cityB));
    }
  }

  // ── 5/6. platform_member with vs without the relevant section ────────────
  {
    const withAccess = await resolveAdminAnalyticsScope(`platform-member-yes-${run}`);
    assert('platform_member with "product" section resolves to platform scope', withAccess.kind === 'platform');

    const withoutAccess = await resolveAdminAnalyticsScope(`platform-member-no-${run}`);
    assert('platform_member without "product"/"system" resolves to denied', withoutAccess.kind === 'denied');
  }

  // ── computeInsightsSummary: real city-level data isolation ───────────────
  {
    const cityAScope = { kind: 'authority' as const, authorityId: cityA };
    const resultA = await computeInsightsSummary(db, cityAScope);
    assert('city A authority scope: 200 status', resultA.status === 200);
    if (resultA.status === 200) {
      const neighborhoodIdsSeenA = resultA.body.sleepyNeighborhoods.map((n: any) => n.neighborhoodId);
      assert('city A response includes neighborhood A (its own child)', neighborhoodIdsSeenA.includes(neighA));
      assert('city A response does NOT include neighborhood B (a different city\'s child)', !neighborhoodIdsSeenA.includes(neighB));
      const neighARow = resultA.body.sleepyNeighborhoods.find((n: any) => n.neighborhoodId === neighA);
      assert('city A neighborhood A shows exactly 3 residents (only its own)', neighARow?.userCount === 3);
    }

    const cityBScope = { kind: 'authority' as const, authorityId: cityB };
    const resultB = await computeInsightsSummary(db, cityBScope);
    if (resultB.status === 200) {
      const neighBRow = resultB.body.sleepyNeighborhoods.find((n: any) => n.neighborhoodId === neighB);
      assert('city B neighborhood B shows exactly 5 residents (only its own)', neighBRow?.userCount === 5);
      const neighborhoodIdsSeenB = resultB.body.sleepyNeighborhoods.map((n: any) => n.neighborhoodId);
      assert('city B response does NOT include neighborhood A', !neighborhoodIdsSeenB.includes(neighA));
    }

    // "A manager sending a different authority's id gets no data" — the
    // scope object is the ONLY input; there is no separate authorityId
    // parameter to send. Proven by construction: even a scope object with
    // an extra, unexpected property attached (simulating a hypothetical
    // future bug that tried to read one) produces IDENTICAL output, because
    // the function only ever reads `.authorityId`.
    const tamperedScope = { kind: 'authority' as const, authorityId: cityA, injectedAuthorityId: cityB } as any;
    const resultTampered = await computeInsightsSummary(db, tamperedScope);
    assert(
      'a scope object carrying an extra "injectedAuthorityId" field is ignored — output identical to the clean city-A scope',
      JSON.stringify(resultTampered) === JSON.stringify(resultA),
    );
  }

  // ── computeStatisticsSummary: platform vs vertical vs authority-denied ───
  {
    const platformResult = await computeStatisticsSummary(db, { kind: 'platform' });
    assert('platform scope: 200 status', platformResult.status === 200);
    if (platformResult.status === 200) {
      assert('platform scope: activeAuthorities is a real number, not null', typeof platformResult.body.executiveSummary.activeAuthorities === 'number');
      assert('platform scope: premiumMetrics present', platformResult.body.premiumMetrics !== null);
      assert('platform scope: notApplicable is empty', platformResult.body.notApplicable.length === 0);
    }

    const verticalResult = await computeStatisticsSummary(db, { kind: 'vertical', vertical: 'military', authorityIds: [milUnit] });
    assert('vertical scope: 200 status', verticalResult.status === 200);
    if (verticalResult.status === 200) {
      assert('vertical scope: activeAuthorities is null (not applicable)', verticalResult.body.executiveSummary.activeAuthorities === null);
      assert('vertical scope: premiumMetrics is null (not applicable)', verticalResult.body.premiumMetrics === null);
      assert('vertical scope: notApplicable lists the platform-only fields', verticalResult.body.notApplicable.includes('activeAuthorities') && verticalResult.body.notApplicable.includes('premiumMetrics'));
      assert('vertical scope: notApplicableMessage is a non-empty string, not silently 0', typeof verticalResult.body.notApplicableMessage === 'string' && verticalResult.body.notApplicableMessage.length > 0);
    }

    const authorityResult = await computeStatisticsSummary(db, { kind: 'authority', authorityId: cityA });
    assert('authority scope: statistics-summary denied entirely (403), not a zero-filled 200', authorityResult.status === 403);
    const authorityErrorMessage = (authorityResult.body as { error?: string }).error ?? '';
    assert('authority scope: denial message present, not empty', authorityErrorMessage.length > 0);
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error running verify-analytics-scope:', err);
  process.exit(1);
});
