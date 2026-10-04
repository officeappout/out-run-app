/**
 * computeRecordResultWithCorrectionChoice /
 * computeBulkImportResultsWithCorrectionChoice — REAL Firestore-emulator
 * integration suite (04.10.2026, §13.87, "תיקון מוצהר"). §31 discipline:
 * every assertion reads back the REAL stored document via the real
 * Admin SDK, never a fake in-memory shape — this round's own new code
 * reads back `recordedAt` for the first time anywhere in
 * readiness-write.service.ts (every prior function only ever WROTE it),
 * which is exactly the class of bug a fake db cannot catch (a plain JS
 * Date compares fine against another plain JS Date; a real Admin SDK
 * Timestamp does not have `.getTime()` at all).
 *
 * Requires `firebase emulators:start --only firestore` running
 * separately at 127.0.0.1:8080 — beforeAll throws immediately if it
 * isn't reachable, and vitest shows every case below as skipped (not
 * failed) when that happens — same established behavior as every other
 * emulator suite in this build.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => { throw new Error('getAdminDb should never be called from compute*() functions — db is always injected'); },
  getAdminAuth: () => { throw new Error('getAdminAuth should never be called from compute*() functions'); },
}));

import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  computeRecordResultWithCorrectionChoice,
  computeBulkImportResultsWithCorrectionChoice,
  type ReadinessThresholdsConfig,
} from '../readiness-write.service';
import { computeUnitRoster } from '../readiness-read.service';
import { computeBrigadeDashboard } from '../readiness-dashboard.service';
import type { UnitPermissionScope } from '@/lib/unitPermissionScope';

const PROJECT_ID = 'appout-1-emulator-test';
const FIRESTORE_HOST = '127.0.0.1:8080';
const TENANT_ID = 'emu-brigade-result-correction';
const UNIT_ID = 'emu-unit-result-correction';

let app: App;
let db: Firestore;

async function clearEmulator(): Promise<void> {
  const res = await fetch(
    `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Failed to clear emulator (status ${res.status}) — is it actually running at ${FIRESTORE_HOST}?`);
}

const THRESHOLDS_CONFIG: ReadinessThresholdsConfig = {
  id: 'global',
  version: 1,
  tests: [
    { id: 'run_3000m', label: 'ריצת 3,000 מ', metric: 'time', unit: 'seconds', lowerIsBetter: true, threshold: { male: 1200, female: 1320 }, validityDays: 365 },
    { id: 'pullups', label: 'עליות מתח', metric: 'reps', unit: 'reps', lowerIsBetter: false, threshold: { male: 5, female: 1 }, validityDays: 365 },
  ],
  updatedBy: 'test-setup',
  updatedAt: new Date(),
};

const TENANT_OWNER_SCOPE: UnitPermissionScope = { kind: 'tenantOwner', tenantId: TENANT_ID };
const CTX = { callerUid: 'test-officer', tokenEmail: 'officer@test.local', sourceIp: '127.0.0.1' };
const TODAY_ISO = new Date().toISOString();

async function seedUnitAndThresholds(): Promise<void> {
  const batch = db.batch();
  batch.set(db.collection('tenants').doc(TENANT_ID).collection('units').doc(UNIT_ID), {
    name: 'יחידת בדיקה', unitPath: ['יחידת בדיקה'], memberCount: 0, createdAt: new Date(),
  });
  batch.set(db.collection('readiness_thresholds').doc('global'), THRESHOLDS_CONFIG);
  await batch.commit();
}

async function createSoldier(name: string): Promise<string> {
  const ref = db.collection('readiness_soldiers').doc();
  await ref.set({
    tenantId: TENANT_ID, unitId: UNIT_ID, name, gender: 'male', uid: null, linkedAt: null, mergedInto: null,
    createdBy: CTX.callerUid, createdAt: new Date(), updatedAt: new Date(),
  });
  return ref.id;
}

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
  app = initializeApp({ projectId: PROJECT_ID }, `result-correction-emulator-test-${Date.now()}`);
  db = getFirestore(app);
  await clearEmulator();
  await seedUnitAndThresholds();
}, 20000);

beforeEach(async () => {
  await clearEmulator();
  await seedUnitAndThresholds();
});

afterAll(async () => {
  if (app) await deleteApp(app);
});

describe('computeRecordResultWithCorrectionChoice — single entry', () => {
  it('a first-ever result for a soldier+test needs no choice at all', async () => {
    const soldierId = await createSoldier('חייל ראשון');
    const result = await computeRecordResultWithCorrectionChoice(db, TENANT_OWNER_SCOPE, {
      soldierId, testId: 'run_3000m', source: 'organized_test', testDate: TODAY_ISO, value: 1100,
    }, CTX);
    expect(result.status).toBe(200);
  });

  it('a conflicting second result with NO choice → blocked, nothing written', async () => {
    const soldierId = await createSoldier('חייל ללא בחירה');
    await computeRecordResultWithCorrectionChoice(db, TENANT_OWNER_SCOPE, {
      soldierId, testId: 'run_3000m', source: 'organized_test', testDate: TODAY_ISO, value: 1100,
    }, CTX);

    const result = await computeRecordResultWithCorrectionChoice(db, TENANT_OWNER_SCOPE, {
      soldierId, testId: 'run_3000m', source: 'organized_test', testDate: TODAY_ISO, value: 900,
      // no `choice` field at all
    }, CTX);
    expect(result.status).toBe(400);

    const snap = await db.collection('readiness_results').where('soldierId', '==', soldierId).get();
    expect(snap.size).toBe(1); // still just the first one — nothing new written
  });

  it('"מבדק חדש" (new_test) → BOTH results exist, neither superseded, current status reflects the LATEST', async () => {
    const soldierId = await createSoldier('חייל מבדק חדש');
    const first = await computeRecordResultWithCorrectionChoice(db, TENANT_OWNER_SCOPE, {
      soldierId, testId: 'run_3000m', source: 'organized_test', testDate: TODAY_ISO, value: 1300, // fail
    }, CTX);
    expect(first.status).toBe(200);
    if (first.status !== 200) return;

    // Second write must have a strictly later recordedAt for "the latest" ordering to be unambiguous.
    await new Promise((r) => setTimeout(r, 5));
    const second = await computeRecordResultWithCorrectionChoice(db, TENANT_OWNER_SCOPE, {
      soldierId, testId: 'run_3000m', source: 'organized_test', testDate: TODAY_ISO, value: 1100, choice: 'new_test', // pass
    }, CTX);
    expect(second.status).toBe(200);
    if (second.status !== 200) return;

    const snap = await db.collection('readiness_results').where('soldierId', '==', soldierId).get();
    expect(snap.size).toBe(2);
    snap.docs.forEach((d) => expect(d.data().supersededByResultId ?? null).toBeNull());

    const rosterResult = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(rosterResult.status).toBe(200);
    if (rosterResult.status !== 200) return;
    const soldier = rosterResult.body.soldiers.find((s) => s.id === soldierId);
    // Asserting on THIS test's own status, not the collapsed overall one
    // — THRESHOLDS_CONFIG has a second test (pullups) with zero results
    // for this soldier, so overall is correctly 'not_yet_tested' per the
    // locked "pass requires ALL tests" doctrine — unrelated to what
    // this test actually verifies (the latest result wins for run_3000m).
    expect(soldier?.testDetails.find((t) => t.testId === 'run_3000m')?.status).toBe('pass'); // the SECOND (latest) result wins
  });

  it('"תיקון של הקודמת" (correction) → the OLD result is marked superseded, by whom, and excluded from status', async () => {
    const soldierId = await createSoldier('חייל תיקון');
    const first = await computeRecordResultWithCorrectionChoice(db, TENANT_OWNER_SCOPE, {
      soldierId, testId: 'run_3000m', source: 'organized_test', testDate: TODAY_ISO, value: 1300, // fail (typo)
    }, CTX);
    expect(first.status).toBe(200);
    if (first.status !== 200) return;

    const second = await computeRecordResultWithCorrectionChoice(db, TENANT_OWNER_SCOPE, {
      soldierId, testId: 'run_3000m', source: 'organized_test', testDate: TODAY_ISO, value: 1100, choice: 'correction', // the real value, pass
    }, CTX);
    expect(second.status).toBe(200);
    if (second.status !== 200) return;

    const oldSnap = await db.collection('readiness_results').doc(first.body.resultId).get();
    expect(oldSnap.exists).toBe(true); // point 9 — never deleted
    const oldData = oldSnap.data()!;
    expect(oldData.supersededByResultId).toBe(second.body.resultId);
    expect(oldData.supersededByUid).toBe(CTX.callerUid);
    expect(oldData.supersededAt).toBeTruthy();

    const newSnap = await db.collection('readiness_results').doc(second.body.resultId).get();
    expect(newSnap.data()!.correctsResultId).toBe(first.body.resultId);

    // Never counted again, anywhere:
    const rosterResult = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(rosterResult.status).toBe(200);
    if (rosterResult.status !== 200) return;
    const soldier = rosterResult.body.soldiers.find((s) => s.id === soldierId);
    expect(soldier?.testDetails.find((t) => t.testId === 'run_3000m')?.status).toBe('pass'); // only the correction counts
    expect(soldier?.testDetails.find((t) => t.testId === 'run_3000m')?.value).toBe(1100); // not 1300

    const dashboardResult = await computeBrigadeDashboard(db, TENANT_OWNER_SCOPE, {});
    expect(dashboardResult.status).toBe(200);
    if (dashboardResult.status !== 200) return;
    const runComponent = dashboardResult.body.components.find((c) => c.testId === 'run_3000m');
    expect(runComponent?.passCount).toBe(1); // the correction
    expect(runComponent?.failCount).toBe(0); // the superseded fail never counts
  });

  it('three sequential corrections always target the CURRENT most-recent-active result, never re-targeting an already-superseded one', async () => {
    const soldierId = await createSoldier('חייל שלוש תיקונים');
    const first = await computeRecordResultWithCorrectionChoice(db, TENANT_OWNER_SCOPE, {
      soldierId, testId: 'run_3000m', source: 'organized_test', testDate: TODAY_ISO, value: 1300,
    }, CTX);
    if (first.status !== 200) throw new Error('setup failed');
    const second = await computeRecordResultWithCorrectionChoice(db, TENANT_OWNER_SCOPE, {
      soldierId, testId: 'run_3000m', source: 'organized_test', testDate: TODAY_ISO, value: 1150, choice: 'correction',
    }, CTX);
    if (second.status !== 200) throw new Error('setup failed');
    const third = await computeRecordResultWithCorrectionChoice(db, TENANT_OWNER_SCOPE, {
      soldierId, testId: 'run_3000m', source: 'organized_test', testDate: TODAY_ISO, value: 1050, choice: 'correction',
    }, CTX);
    expect(third.status).toBe(200);
    if (third.status !== 200) return;

    // The chain: first <- second <- third. Exactly one is active.
    const snap = await db.collection('readiness_results').where('soldierId', '==', soldierId).get();
    expect(snap.size).toBe(3);
    const active = snap.docs.filter((d) => !d.data().supersededByResultId);
    expect(active.length).toBe(1);
    expect(active[0].id).toBe(third.body.resultId);
  });
});

describe('computeBulkImportResultsWithCorrectionChoice — conflictMode', () => {
  it('no conflictMode when a row conflicts → the whole import is blocked, nothing written', async () => {
    const soldierId = await createSoldier('חייל קיים א');
    await db.collection('readiness_results').add({
      soldierId, tenantId: TENANT_ID, unitId: UNIT_ID, testId: 'run_3000m', outcome: 'fail', value: 1300,
      notPerformedReason: null, source: 'organized_test', thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 1200, lowerIsBetter: true, validityDays: 365 },
      recordedBy: CTX.callerUid, recordedAt: new Date(), testDate: new Date(), uid: null,
    });

    const result = await computeBulkImportResultsWithCorrectionChoice(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, unitId: UNIT_ID, mode: 'existing_roster', defaultTestDate: TODAY_ISO,
      rows: [{ soldierId, runSeconds: 1100 }],
      // no conflictMode
    }, CTX);
    expect(result.status).toBe(400);

    const snap = await db.collection('readiness_results').where('soldierId', '==', soldierId).get();
    expect(snap.size).toBe(1); // only the pre-seeded one
  });

  it('conflictMode "correction" → every conflicting row replaces its existing result; non-conflicting rows just get added', async () => {
    const soldierA = await createSoldier('חייל קיים ב'); // has an existing run result — will be corrected
    const soldierB = await createSoldier('חייל חדש בלבד'); // no existing result — plain add, no conflict
    const existingRef = db.collection('readiness_results').doc();
    await existingRef.set({
      soldierId: soldierA, tenantId: TENANT_ID, unitId: UNIT_ID, testId: 'run_3000m', outcome: 'fail', value: 1300,
      notPerformedReason: null, source: 'organized_test', thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 1200, lowerIsBetter: true, validityDays: 365 },
      recordedBy: CTX.callerUid, recordedAt: new Date(), testDate: new Date(), uid: null,
    });

    const result = await computeBulkImportResultsWithCorrectionChoice(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, unitId: UNIT_ID, mode: 'existing_roster', defaultTestDate: TODAY_ISO,
      rows: [
        { soldierId: soldierA, runSeconds: 1100 },
        { soldierId: soldierB, pullupsReps: 6 },
      ],
      conflictMode: 'correction',
    }, CTX);
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.resultsWritten).toBe(2);
    expect(result.body.resultsCorrected).toBe(1);

    const oldSnap = await existingRef.get();
    expect(oldSnap.data()!.supersededByResultId).toBeTruthy();

    const bSnap = await db.collection('readiness_results').where('soldierId', '==', soldierB).get();
    expect(bSnap.size).toBe(1);
    expect(bSnap.docs[0].data().correctsResultId ?? null).toBeNull(); // plain add, nothing to correct
  });

  it('conflictMode "new_test" → the conflicting row is added ALONGSIDE the existing one, nothing superseded', async () => {
    const soldierId = await createSoldier('חייל קיים ג');
    const existingRef = db.collection('readiness_results').doc();
    await existingRef.set({
      soldierId, tenantId: TENANT_ID, unitId: UNIT_ID, testId: 'run_3000m', outcome: 'fail', value: 1300,
      notPerformedReason: null, source: 'organized_test', thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 1200, lowerIsBetter: true, validityDays: 365 },
      recordedBy: CTX.callerUid, recordedAt: new Date(), testDate: new Date(), uid: null,
    });

    const result = await computeBulkImportResultsWithCorrectionChoice(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, unitId: UNIT_ID, mode: 'existing_roster', defaultTestDate: TODAY_ISO,
      rows: [{ soldierId, runSeconds: 1100 }],
      conflictMode: 'new_test',
    }, CTX);
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.resultsCorrected).toBe(0);

    const snap = await db.collection('readiness_results').where('soldierId', '==', soldierId).get();
    expect(snap.size).toBe(2);
    snap.docs.forEach((d) => expect(d.data().supersededByResultId ?? null).toBeNull());
  });

  it('a "new_roster" import never conflicts — brand new soldiers can\'t already have a result', async () => {
    const result = await computeBulkImportResultsWithCorrectionChoice(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, unitId: UNIT_ID, mode: 'new_roster', defaultTestDate: TODAY_ISO,
      rows: [{ name: 'חייל חדש לגמרי', gender: 'male', runSeconds: 1100 }],
      // no conflictMode — must not be required
    }, CTX);
    expect(result.status).toBe(200);
  });
});
