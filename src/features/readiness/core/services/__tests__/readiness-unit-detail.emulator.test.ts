/**
 * Unit-detail screen — REAL emulator integration suite (Stage 7,
 * 03.10.2026, David's explicit requirement: "vitest על אמולטור נקי,
 * שלוש הרצות זהות"). Unlike every other test in this build (fake-db,
 * in-memory — never a real Firestore round-trip), this exercises the
 * genuine Admin SDK against a REAL (emulated) Firestore: real
 * Timestamp coercion, real query behavior — same reasoning as axiom
 * §31's write-then-read integration test, applied to this round's new
 * aggregation (own vs. cumulative counting, hierarchy resolution via
 * unitDirectory).
 *
 * Requires `firebase emulators:start --only firestore` running
 * separately at 127.0.0.1:8080 — beforeAll throws immediately if it
 * isn't reachable, and vitest automatically shows every case below as
 * skipped (not failed) when that happens — same established behavior
 * as tests/firestore-rules.test.ts (empirically confirmed: connection
 * refused there produces exactly "28 skipped", not 28 failures).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// readiness-unit-detail.service.ts imports @/lib/unitPermissionScope for
// UNIT_SCOPE_UNKNOWN_MESSAGE (a real, runtime import) — and that module
// itself imports @/lib/firebase-admin at the top level, guarded by
// 'server-only'. Same mock every other readiness test file in this build
// already carries (see readiness-write.service.test.ts's own header
// comment) — this suite never calls getAdminDb() itself either; db is
// always the real emulator-backed Firestore instance, injected directly.
vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => { throw new Error('getAdminDb should never be called from compute*() functions — db is always injected'); },
}));

import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { computeUnitDetail } from '../readiness-unit-detail.service';
import type { UnitPermissionScope } from '@/lib/unitPermissionScope';

const PROJECT_ID = 'appout-1-emulator-test';
const EMULATOR_HOST = '127.0.0.1:8080';
const TENANT_ID = 'emu-tenant-1';

let app: App;
let db: Firestore;

async function clearEmulator(): Promise<void> {
  const res = await fetch(
    `http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Failed to clear emulator (status ${res.status}) — is it actually running at ${EMULATOR_HOST}?`);
}

const THRESHOLD_SNAPSHOT_BASE = { thresholdVersion: 1, lowerIsBetter: false, validityDays: 365 };

function resultDoc(params: {
  soldierId: string; unitId: string; testId: string; outcome: 'pass' | 'fail';
  value: number; thresholdValue: number; lowerIsBetter: boolean; gender: 'male' | 'female';
}) {
  const now = new Date();
  return {
    soldierId: params.soldierId,
    tenantId: TENANT_ID,
    unitId: params.unitId,
    testId: params.testId,
    outcome: params.outcome,
    value: params.value,
    notPerformedReason: null,
    source: 'organized_test',
    thresholdSnapshot: { ...THRESHOLD_SNAPSHOT_BASE, gender: params.gender, thresholdValue: params.thresholdValue, lowerIsBetter: params.lowerIsBetter },
    recordedBy: 'emulator-seed-script',
    recordedAt: now,
    testDate: now,
  };
}

/**
 * One rich, shared fixture covering all four required scenarios at
 * once (read-only queries against it — no cross-test contamination
 * risk): battalion-1 (2 own soldiers: one full-pass, one who fails
 * BOTH run and strength — scenario 3) with two real children,
 * company-a (3 own soldiers, all pass) and company-b (1 own soldier,
 * fail) — together proving scenario 1 (own-only cards + correct
 * cumulative sum across the subtree). battalion-2 stands alone with
 * one soldier who has no results at all — scenario 2. No
 * names/emails/uids beyond synthetic test-fixture ids.
 */
async function seedFixture(): Promise<void> {
  const batch = db.batch();

  batch.set(db.collection('unitDirectory').doc(TENANT_ID), {
    name: 'Emulator Test Brigade', parentId: null, level: 'brigade', orgId: TENANT_ID, unitId: null,
  });
  batch.set(db.collection('unitDirectory').doc(`${TENANT_ID}__battalion-1`), {
    name: 'Emulator Test Battalion', parentId: TENANT_ID, level: 'battalion', orgId: TENANT_ID, unitId: 'battalion-1',
  });
  batch.set(db.collection('unitDirectory').doc(`${TENANT_ID}__battalion-2`), {
    name: 'Emulator Test Battalion 2', parentId: TENANT_ID, level: 'battalion', orgId: TENANT_ID, unitId: 'battalion-2',
  });
  batch.set(db.collection('unitDirectory').doc(`${TENANT_ID}__company-a`), {
    name: 'Company A', parentId: `${TENANT_ID}__battalion-1`, level: 'company', orgId: TENANT_ID, unitId: 'company-a',
  });
  batch.set(db.collection('unitDirectory').doc(`${TENANT_ID}__company-b`), {
    name: 'Company B', parentId: `${TENANT_ID}__battalion-1`, level: 'company', orgId: TENANT_ID, unitId: 'company-b',
  });

  batch.set(db.collection('tenants').doc(TENANT_ID).collection('units').doc('battalion-1'), { name: 'Emulator Test Battalion' });
  batch.set(db.collection('tenants').doc(TENANT_ID).collection('units').doc('battalion-2'), { name: 'Emulator Test Battalion 2' });
  batch.set(db.collection('tenants').doc(TENANT_ID).collection('units').doc('company-a'), { name: 'Company A', parentUnitId: 'battalion-1' });
  batch.set(db.collection('tenants').doc(TENANT_ID).collection('units').doc('company-b'), { name: 'Company B', parentUnitId: 'battalion-1' });

  batch.set(db.collection('readiness_thresholds').doc('global'), {
    id: 'global', version: 1, updatedBy: 'emulator-seed-script', updatedAt: new Date(),
    tests: [
      { id: 'run_3000m', label: "ריצת 3,000 מ'", metric: 'time_seconds', unit: 'seconds', lowerIsBetter: true, threshold: { male: 1080, female: 1200 }, validityDays: 365 },
      { id: 'pullups', label: 'עליות מתח', metric: 'reps', unit: 'reps', lowerIsBetter: false, threshold: { male: 3, female: 3 }, validityDays: 365 },
      { id: 'dips', label: 'מקבילים', metric: 'reps', unit: 'reps', lowerIsBetter: false, threshold: { male: 5, female: 5 }, validityDays: 365 },
    ],
  });

  // battalion-1 own soldiers
  batch.set(db.collection('readiness_soldiers').doc('s-b1-pass'), { tenantId: TENANT_ID, unitId: 'battalion-1', name: 'Soldier B1-Pass', gender: 'male', uid: null, linkedAt: null, mergedInto: null, createdBy: 'seed', createdAt: new Date(), updatedAt: new Date() });
  batch.set(db.collection('readiness_soldiers').doc('s-b1-doublefail'), { tenantId: TENANT_ID, unitId: 'battalion-1', name: 'Soldier B1-DoubleFail', gender: 'male', uid: null, linkedAt: null, mergedInto: null, createdBy: 'seed', createdAt: new Date(), updatedAt: new Date() });
  // company-a: 3 own soldiers, all pass
  for (const id of ['s-ca-1', 's-ca-2', 's-ca-3']) {
    batch.set(db.collection('readiness_soldiers').doc(id), { tenantId: TENANT_ID, unitId: 'company-a', name: id, gender: 'male', uid: null, linkedAt: null, mergedInto: null, createdBy: 'seed', createdAt: new Date(), updatedAt: new Date() });
  }
  // company-b: 1 own soldier, fail
  batch.set(db.collection('readiness_soldiers').doc('s-cb-1'), { tenantId: TENANT_ID, unitId: 'company-b', name: 'Soldier CB-1', gender: 'male', uid: null, linkedAt: null, mergedInto: null, createdBy: 'seed', createdAt: new Date(), updatedAt: new Date() });
  // battalion-2: 1 soldier, zero results at all
  batch.set(db.collection('readiness_soldiers').doc('s-b2-untested'), { tenantId: TENANT_ID, unitId: 'battalion-2', name: 'Soldier B2-Untested', gender: 'male', uid: null, linkedAt: null, mergedInto: null, createdBy: 'seed', createdAt: new Date(), updatedAt: new Date() });

  await batch.commit();

  const resultsBatch = db.batch();
  // s-b1-pass: passes all three
  resultsBatch.set(db.collection('readiness_results').doc(), resultDoc({ soldierId: 's-b1-pass', unitId: 'battalion-1', testId: 'run_3000m', outcome: 'pass', value: 900, thresholdValue: 1080, lowerIsBetter: true, gender: 'male' }));
  resultsBatch.set(db.collection('readiness_results').doc(), resultDoc({ soldierId: 's-b1-pass', unitId: 'battalion-1', testId: 'pullups', outcome: 'pass', value: 5, thresholdValue: 3, lowerIsBetter: false, gender: 'male' }));
  resultsBatch.set(db.collection('readiness_results').doc(), resultDoc({ soldierId: 's-b1-pass', unitId: 'battalion-1', testId: 'dips', outcome: 'pass', value: 6, thresholdValue: 5, lowerIsBetter: false, gender: 'male' }));
  // s-b1-doublefail: fails run AND pullups (strength group), passes dips — scenario 3's exact subject
  resultsBatch.set(db.collection('readiness_results').doc(), resultDoc({ soldierId: 's-b1-doublefail', unitId: 'battalion-1', testId: 'run_3000m', outcome: 'fail', value: 1300, thresholdValue: 1080, lowerIsBetter: true, gender: 'male' }));
  resultsBatch.set(db.collection('readiness_results').doc(), resultDoc({ soldierId: 's-b1-doublefail', unitId: 'battalion-1', testId: 'pullups', outcome: 'fail', value: 1, thresholdValue: 3, lowerIsBetter: false, gender: 'male' }));
  resultsBatch.set(db.collection('readiness_results').doc(), resultDoc({ soldierId: 's-b1-doublefail', unitId: 'battalion-1', testId: 'dips', outcome: 'pass', value: 5, thresholdValue: 5, lowerIsBetter: false, gender: 'male' }));
  // company-a: all 3 pass everything
  for (const id of ['s-ca-1', 's-ca-2', 's-ca-3']) {
    resultsBatch.set(db.collection('readiness_results').doc(), resultDoc({ soldierId: id, unitId: 'company-a', testId: 'run_3000m', outcome: 'pass', value: 900, thresholdValue: 1080, lowerIsBetter: true, gender: 'male' }));
    resultsBatch.set(db.collection('readiness_results').doc(), resultDoc({ soldierId: id, unitId: 'company-a', testId: 'pullups', outcome: 'pass', value: 5, thresholdValue: 3, lowerIsBetter: false, gender: 'male' }));
    resultsBatch.set(db.collection('readiness_results').doc(), resultDoc({ soldierId: id, unitId: 'company-a', testId: 'dips', outcome: 'pass', value: 6, thresholdValue: 5, lowerIsBetter: false, gender: 'male' }));
  }
  // company-b: fails run (rest never attempted -> not_yet_tested per-test, overall still 'fail' since any fail wins)
  resultsBatch.set(db.collection('readiness_results').doc(), resultDoc({ soldierId: 's-cb-1', unitId: 'company-b', testId: 'run_3000m', outcome: 'fail', value: 1400, thresholdValue: 1080, lowerIsBetter: true, gender: 'male' }));
  // s-b2-untested: deliberately zero results

  await resultsBatch.commit();
}

const TENANT_OWNER_SCOPE: UnitPermissionScope = { kind: 'tenantOwner', tenantId: TENANT_ID };

describe('computeUnitDetail — REAL emulator integration (03.10.2026, Stage 7)', () => {
  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
    app = initializeApp({ projectId: PROJECT_ID }, `unit-detail-emulator-test-${Date.now()}`);
    db = getFirestore(app);
    await clearEmulator();
    await seedFixture();
  });

  afterAll(async () => {
    await clearEmulator();
    await deleteApp(app);
  });

  it('scenario 1 — a battalion with companies: own cards count only its own soldiers, and the cumulative row sums the whole subtree correctly', async () => {
    const result = await computeUnitDetail(db, TENANT_OWNER_SCOPE, { unitId: 'battalion-1' });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;

    // Own: exactly battalion-1's 2 own soldiers (1 pass, 1 fail) — NOT 6 (2+3+1).
    expect(result.body.ownSoldierCount).toBe(2);
    expect(result.body.own.overall.totalCount).toBe(2);
    expect(result.body.own.overall.passCount).toBe(1);
    expect(result.body.own.overall.failCount).toBe(1);

    // Cumulative: battalion-1(2) + company-a(3) + company-b(1) = 6 total, pass=1+3+0=4, fail=1+0+1=2.
    expect(result.body.childUnitCount).toBe(2);
    expect(result.body.cumulative).not.toBeNull();
    expect(result.body.cumulative!.totalCount).toBe(6);
    expect(result.body.cumulative!.passCount).toBe(4);
    expect(result.body.cumulative!.failCount).toBe(2);
    expect(result.body.cumulative!.testedCount).toBe(6);

    // The mandatory explanation sentences are both present and level-correct.
    expect(result.body.childrenSectionNote).toContain('הגדוד עצמו');
    expect(result.body.childrenSectionNote).toContain('הפלוגות');
    expect(result.body.cumulativeNote).toContain('הפלוגות');
    expect(result.body.cumulativeNote).toContain('6 חיילים');
  });

  it('scenario 2 — a unit with zero results shows passPercent null ("טרם נבדקה"), never 0%', async () => {
    const result = await computeUnitDetail(db, TENANT_OWNER_SCOPE, { unitId: 'battalion-2' });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;

    expect(result.body.own.overall.totalCount).toBe(1); // the one untested soldier IS there
    expect(result.body.own.overall.testedCount).toBe(0);
    expect(result.body.own.overall.passPercent).toBeNull(); // not 0
    expect(result.body.childUnitCount).toBe(0);
    expect(result.body.cumulative).toBeNull(); // no children -> no cumulative row at all
  });

  it('scenario 3 — a soldier who failed two components (run + strength) gets two red-flagged cells and one status tag naming both', async () => {
    const result = await computeUnitDetail(db, TENANT_OWNER_SCOPE, { unitId: 'battalion-1' });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;

    const soldier = result.body.soldiers.find((s) => s.soldierId === 's-b1-doublefail');
    expect(soldier).toBeDefined();
    expect(soldier!.statusLabel).toBe('לא כשיר — ריצה, כוח'); // ONE tag naming both failed groups
    const runCell = soldier!.tests.find((t) => t.testId === 'run_3000m');
    const pullupsCell = soldier!.tests.find((t) => t.testId === 'pullups');
    const dipsCell = soldier!.tests.find((t) => t.testId === 'dips');
    expect(runCell?.isFailCause).toBe(true); // red cell #1
    expect(pullupsCell?.isFailCause).toBe(true); // red cell #2
    expect(dipsCell?.isFailCause).toBe(false); // passed — never highlighted
  });

  it('scenario 4 — a unitId outside the officer\'s own scope returns a server error (403), never an empty/silent screen', async () => {
    const restrictedScope: UnitPermissionScope = { kind: 'unitAdmin', tenantId: TENANT_ID, unitIds: ['company-a'] };
    const result = await computeUnitDetail(db, restrictedScope, { unitId: 'battalion-1' }); // outside their own scope.unitIds
    expect(result.status).toBe(403);
    if (result.status === 403) {
      expect(typeof result.body.error).toBe('string');
      expect(result.body.error.length).toBeGreaterThan(0);
    }
  });

  it('a soldier with testDetails confirms real Firestore Timestamp coercion works end-to-end (axiom §31\'s own concern, re-verified for this round\'s new aggregation)', async () => {
    const result = await computeUnitDetail(db, TENANT_OWNER_SCOPE, { unitId: 'battalion-1' });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    const soldier = result.body.soldiers.find((s) => s.soldierId === 's-b1-pass');
    expect(soldier!.latestTestDate).not.toBeNull();
    expect(() => new Date(soldier!.latestTestDate!).toISOString()).not.toThrow();
  });
});
