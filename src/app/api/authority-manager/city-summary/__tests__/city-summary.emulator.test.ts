/**
 * city-summary — chokepoint migration + golden-equivalence guard
 * (authority-manager report-only audit round 2, 11.10.2026).
 *
 * Until this fix, city-summary inlined its own byte-for-byte copy of
 * resolveAuthorityManagerScope's query instead of calling the shared
 * helper every other authority-manager route uses — harmless in practice
 * (identical logic) but a real structural risk: a future fix to the
 * chokepoint would silently not apply here. Migrated to close that gap.
 *
 * The "golden-equivalence" test originally proposed in the audit report
 * compared TWO independent implementations (the inline copy vs. the
 * chokepoint) to catch drift between them. That premise is gone now that
 * the duplicate has been eliminated — there is only one implementation.
 * Reframed accordingly: these tests pin computeCitySummary's observable
 * behavior through the chokepoint (403 for non-managers, correct
 * authorityId + aggregate counts for a real manager, first-match
 * resolution when a uid is in more than one authority's managerIds) so a
 * regression — someone reverting to an inline copy, or a chokepoint change
 * this route doesn't expect — gets caught here.
 *
 * Run: isolated emulator on 127.0.0.1:8089 (NOT the shared 8080 instance
 * another concurrent session may be using) — start with:
 *   firebase emulators:start --only firestore --config firebase-audit.json --project appout-1-audit-test
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// route.ts imports '@/lib/firebase-admin' at module scope, which does
// `import 'server-only'` — throws unconditionally outside Next's
// server-component bundler (confirmed empirically this engagement).
// computeCitySummary itself never calls getAdminDb()/getAdminAuth() (db is
// always injected) — this mock exists purely so importing route.ts at all
// doesn't crash vitest.
vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => { throw new Error('getAdminDb should never be called from computeCitySummary — db is always injected'); },
  getAdminAuth: () => { throw new Error('getAdminAuth should never be called from computeCitySummary'); },
}));

import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { computeCitySummary } from '../route';
import { resolveAuthorityManagerScope } from '@/lib/authorityManagerScope';

const PROJECT_ID = 'appout-1-city-summary-emulator-test';
const FIRESTORE_HOST = '127.0.0.1:8089';

let app: App;
let db: Firestore;

async function clearEmulator(): Promise<void> {
  const res = await fetch(
    `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!res.ok) {
    throw new Error(`Failed to clear emulator (status ${res.status}) — is it actually running at ${FIRESTORE_HOST}?`);
  }
}

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
  app = initializeApp({ projectId: PROJECT_ID }, `city-summary-emulator-test-${Date.now()}`);
  db = getFirestore(app);
}, 20000);

beforeEach(async () => {
  await clearEmulator();
});

afterAll(async () => {
  if (app) await deleteApp(app);
});

describe('computeCitySummary — chokepoint migration (real Firestore)', () => {
  it('[DENY] uid not present in any authority\'s managerIds → 403, "Not an authority manager"', async () => {
    await db.doc('authorities/cityA').set({ name: 'City A', managerIds: ['realManagerUid'] });

    const result = await computeCitySummary(db, 'randomNonManagerUid');
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: 'Not an authority manager' });
  });

  it('[CONTROL] a real manager → 200, correct authorityId/authorityName, counts exclude mock+test accounts', async () => {
    await db.doc('authorities/cityA').set({ name: 'City A', managerIds: ['realManagerUid'] });
    await db.doc('users/resident1').set({ core: { authorityId: 'cityA', isApproved: true } });
    await db.doc('users/resident2').set({ core: { authorityId: 'cityA', isApproved: false } });
    await db.doc('users/mockResident').set({ core: { authorityId: 'cityA', isApproved: true, isMockData: true } });
    await db.doc('users/testResident').set({ core: { authorityId: 'cityA', isApproved: true, isTestData: true } });
    // A resident of a DIFFERENT city must never be counted.
    await db.doc('users/otherCityResident').set({ core: { authorityId: 'cityB', isApproved: true } });

    const result = await computeCitySummary(db, 'realManagerUid');
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.authorityId).toBe('cityA');
    expect(result.body.authorityName).toBe('City A');
    expect(result.body.totalUsers).toBe(2); // resident1 + resident2, mock/test excluded
    expect(result.body.approvedUsers).toBe(1); // resident1 only
  });

  it('[GOLDEN] uid present in TWO authorities\' managerIds → computeCitySummary resolves the SAME authorityId resolveAuthorityManagerScope would on its own (pins the chokepoint-routing behavior; would catch a regression to an inline copy or a chokepoint change this route silently stops matching)', async () => {
    await db.doc('authorities/cityA').set({ name: 'City A', managerIds: ['multiCityManagerUid'] });
    await db.doc('authorities/cityB').set({ name: 'City B', managerIds: ['multiCityManagerUid'] });

    const directScope = await resolveAuthorityManagerScope(db, 'multiCityManagerUid');
    const result = await computeCitySummary(db, 'multiCityManagerUid');

    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(directScope).not.toBeNull();
    expect(result.body.authorityId).toBe(directScope!.authorityId);
  });
});
