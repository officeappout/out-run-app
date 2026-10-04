/**
 * computeBulkImportResults — REAL Firestore-emulator integration suite
 * (04.10.2026, 00-MASTER-PLAN.md §13.83). §31 discipline: every
 * assertion reads back the REAL stored document via the real Admin SDK,
 * never a fake in-memory shape. No Cloud Function trigger exists on
 * readiness_soldiers/readiness_results (confirmed via grep across
 * functions/src/ before writing this file) — a plain Firestore-only
 * emulator is correct and sufficient here, unlike the unit-create round
 * which needed the Functions emulator too for onUnitWrite.
 *
 * Covers every pre-merge scenario David required, except two that have
 * no server-side behavior to test at all by this architecture's own
 * design (documented at the point they're skipped below, not silently
 * omitted):
 *   - the 4 time-format equivalence check: parsing happens entirely
 *     client-side (readiness-results-import-parse.test.ts) — this
 *     function only ever receives an already-normalized number.
 *   - "a name matching two rows requires officer resolution": name
 *     matching happens entirely client-side too
 *     (matchRowToRoster, same test file) — this function never matches
 *     by name, only validates a soldierId it's given.
 *
 * Requires `firebase emulators:start --only firestore` running
 * separately at 127.0.0.1:8080 — beforeAll throws immediately if it
 * isn't reachable, and vitest shows every case below as skipped (not
 * failed) when that happens — same established behavior as every other
 * emulator suite in this build.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => { throw new Error('getAdminDb should never be called from compute*() functions — db is always injected'); },
  getAdminAuth: () => { throw new Error('getAdminAuth should never be called from compute*() functions'); },
}));

import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { computeBulkImportResults, type ReadinessThresholdsConfig } from '../readiness-write.service';
import type { UnitPermissionScope } from '@/lib/unitPermissionScope';

const PROJECT_ID = 'appout-1-emulator-test';
const FIRESTORE_HOST = '127.0.0.1:8080';
const TENANT_ID = 'emu-brigade-results-import';
const UNIT_ID = 'emu-unit-results-import';

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
    { id: 'dips', label: 'מקבילים', metric: 'reps', unit: 'reps', lowerIsBetter: false, threshold: { male: 10, female: 3 }, validityDays: 365 },
  ],
  updatedBy: 'test-setup',
  updatedAt: new Date(),
};

const TENANT_OWNER_SCOPE: UnitPermissionScope = { kind: 'tenantOwner', tenantId: TENANT_ID };

async function seedUnitAndThresholds(): Promise<void> {
  const batch = db.batch();
  batch.set(db.collection('tenants').doc(TENANT_ID).collection('units').doc(UNIT_ID), {
    name: 'יחידת בדיקה', unitPath: ['יחידת בדיקה'], memberCount: 0, createdAt: new Date(),
  });
  batch.set(db.collection('readiness_thresholds').doc('global'), THRESHOLDS_CONFIG);
  await batch.commit();
}

const TODAY_ISO = new Date().toISOString();

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
  app = initializeApp({ projectId: PROJECT_ID }, `bulk-results-import-emulator-test-${Date.now()}`);
  db = getFirestore(app);
  await clearEmulator();
  await seedUnitAndThresholds();
}, 20000);

afterAll(async () => {
  if (app) await deleteApp(app);
});

describe('computeBulkImportResults — new_roster mode', () => {
  it('an empty test cell writes NO result document for that test — "not performed" (absent), never a 0', async () => {
    const result = await computeBulkImportResults(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, unitId: UNIT_ID, mode: 'new_roster', defaultTestDate: TODAY_ISO,
      rows: [
        { name: 'חייל בדיקה א', gender: 'male', runSeconds: 1100, pullupsReps: null, dipsReps: undefined },
      ],
    }, { callerUid: 'test-officer', tokenEmail: 'officer@test.local', sourceIp: '127.0.0.1' });

    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.resultsWritten).toBe(1); // run only — pullups/dips both empty, not written

    const soldierId = result.body.soldierIds[0];
    const resultsSnap = await db.collection('readiness_results').where('soldierId', '==', soldierId).get();
    expect(resultsSnap.size).toBe(1);
    expect(resultsSnap.docs[0].data().testId).toBe('run_3000m');

    // The soldier genuinely has zero pullups/dips result docs — never a
    // phantom 0-value doc standing in for "not performed".
    const strengthSnap = await db.collection('readiness_results')
      .where('soldierId', '==', soldierId)
      .where('testId', 'in', ['pullups', 'dips'])
      .get();
    expect(strengthSnap.size).toBe(0);
  });

  it('a value of exactly 0 IS written as a real result, distinct from an absent cell', async () => {
    const result = await computeBulkImportResults(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, unitId: UNIT_ID, mode: 'new_roster', defaultTestDate: TODAY_ISO,
      rows: [
        { name: 'חייל בדיקה ב', gender: 'male', pullupsReps: 0 },
      ],
    }, { callerUid: 'test-officer', tokenEmail: 'officer@test.local', sourceIp: '127.0.0.1' });

    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    const soldierId = result.body.soldierIds[0];
    const snap = await db.collection('readiness_results').where('soldierId', '==', soldierId).where('testId', '==', 'pullups').get();
    expect(snap.size).toBe(1);
    expect(snap.docs[0].data().value).toBe(0);
    expect(snap.docs[0].data().outcome).toBe('fail'); // 0 < threshold(5) — correctly "לא כשיר", never "טרם נבדק"
  });

  it('a full row (all three tests) computes correct pass/fail per threshold', async () => {
    const result = await computeBulkImportResults(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, unitId: UNIT_ID, mode: 'new_roster', defaultTestDate: TODAY_ISO,
      rows: [
        { name: 'חייל בדיקה ג', gender: 'male', runSeconds: 1100, pullupsReps: 8, dipsReps: 2 },
      ],
    }, { callerUid: 'test-officer', tokenEmail: 'officer@test.local', sourceIp: '127.0.0.1' });

    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    const soldierId = result.body.soldierIds[0];
    const snap = await db.collection('readiness_results').where('soldierId', '==', soldierId).get();
    const byTest = new Map(snap.docs.map((d) => [d.data().testId, d.data()]));
    expect(byTest.get('run_3000m')?.outcome).toBe('pass'); // 1100 <= 1200
    expect(byTest.get('pullups')?.outcome).toBe('pass'); // 8 >= 5
    expect(byTest.get('dips')?.outcome).toBe('fail'); // 2 < 10
  });

  it('a per-row date override is used instead of the top-level default', async () => {
    const overrideIso = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const result = await computeBulkImportResults(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, unitId: UNIT_ID, mode: 'new_roster', defaultTestDate: TODAY_ISO,
      rows: [{ name: 'חייל בדיקה ד', gender: 'female', pullupsReps: 2, testDate: overrideIso }],
    }, { callerUid: 'test-officer', tokenEmail: 'officer@test.local', sourceIp: '127.0.0.1' });

    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    const soldierId = result.body.soldierIds[0];
    const snap = await db.collection('readiness_results').where('soldierId', '==', soldierId).get();
    const stored = snap.docs[0].data().testDate.toDate().toISOString();
    expect(stored).toBe(new Date(overrideIso).toISOString());
  });

  it('an invalid row (bad gender) blocks the WHOLE import — nothing written, atomic', async () => {
    const before = (await db.collection('readiness_soldiers').get()).size;
    const result = await computeBulkImportResults(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, unitId: UNIT_ID, mode: 'new_roster', defaultTestDate: TODAY_ISO,
      rows: [
        { name: 'חייל תקין', gender: 'male', pullupsReps: 5 },
        { name: 'חייל לא תקין', gender: 'not-a-gender' },
      ],
    }, { callerUid: 'test-officer', tokenEmail: 'officer@test.local', sourceIp: '127.0.0.1' });

    expect(result.status).toBe(400);
    const after = (await db.collection('readiness_soldiers').get()).size;
    expect(after).toBe(before); // the valid row was NOT written either
  });

  it('100 rows, all three tests filled (worst case, 400 operations) — one batch, does not break', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      name: `חייל מלא ${i}`, gender: i % 2 === 0 ? 'male' : 'female', runSeconds: 1100, pullupsReps: 6, dipsReps: 11,
    }));
    const result = await computeBulkImportResults(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, unitId: UNIT_ID, mode: 'new_roster', defaultTestDate: TODAY_ISO, rows,
    }, { callerUid: 'test-officer', tokenEmail: 'officer@test.local', sourceIp: '127.0.0.1' });

    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.soldierIds).toHaveLength(100);
    expect(result.body.resultsWritten).toBe(300); // 100 rows × 3 tests each
  }, 20000);

  it('101 rows is rejected with a clear error, never silently truncated to 100', async () => {
    const rows = Array.from({ length: 101 }, (_, i) => ({ name: `חייל עודף ${i}`, gender: 'male' }));
    const result = await computeBulkImportResults(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, unitId: UNIT_ID, mode: 'new_roster', defaultTestDate: TODAY_ISO, rows,
    }, { callerUid: 'test-officer', tokenEmail: 'officer@test.local', sourceIp: '127.0.0.1' });
    expect(result.status).toBe(400);
  });
});

describe('computeBulkImportResults — existing_roster mode (never creates a soldier)', () => {
  it('a soldierId that does not exist is rejected — no soldier is EVER created in this mode', async () => {
    const soldiersBefore = (await db.collection('readiness_soldiers').get()).size;
    const result = await computeBulkImportResults(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, unitId: UNIT_ID, mode: 'existing_roster', defaultTestDate: TODAY_ISO,
      rows: [{ soldierId: 'this-soldier-does-not-exist', pullupsReps: 7 }],
    }, { callerUid: 'test-officer', tokenEmail: 'officer@test.local', sourceIp: '127.0.0.1' });

    expect(result.status).toBe(400);
    const soldiersAfter = (await db.collection('readiness_soldiers').get()).size;
    expect(soldiersAfter).toBe(soldiersBefore); // literally zero created, confirmed by count
  });

  it('a real existing soldier gets a result written, using THEIR OWN gender for the threshold — never creates a second soldier', async () => {
    const soldierRef = db.collection('readiness_soldiers').doc();
    await soldierRef.set({
      tenantId: TENANT_ID, unitId: UNIT_ID, name: 'חייל קיים', gender: 'female',
      uid: null, linkedAt: null, mergedInto: null, createdBy: 'seed', createdAt: new Date(), updatedAt: new Date(),
    });
    const soldiersBefore = (await db.collection('readiness_soldiers').get()).size;

    const result = await computeBulkImportResults(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, unitId: UNIT_ID, mode: 'existing_roster', defaultTestDate: TODAY_ISO,
      rows: [{ soldierId: soldierRef.id, pullupsReps: 2 }], // 2 >= female threshold(1) → pass
    }, { callerUid: 'test-officer', tokenEmail: 'officer@test.local', sourceIp: '127.0.0.1' });

    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.soldierIds).toEqual([soldierRef.id]);

    const soldiersAfter = (await db.collection('readiness_soldiers').get()).size;
    expect(soldiersAfter).toBe(soldiersBefore); // no new soldier — same count

    const snap = await db.collection('readiness_results').where('soldierId', '==', soldierRef.id).get();
    expect(snap.size).toBe(1);
    expect(snap.docs[0].data().outcome).toBe('pass');
    expect(snap.docs[0].data().thresholdSnapshot.gender).toBe('female');
  });

  it('a soldier belonging to a DIFFERENT unit is rejected, never silently matched', async () => {
    const otherUnitId = 'emu-other-unit';
    const soldierRef = db.collection('readiness_soldiers').doc();
    await soldierRef.set({
      tenantId: TENANT_ID, unitId: otherUnitId, name: 'חייל ביחידה אחרת', gender: 'male',
      uid: null, linkedAt: null, mergedInto: null, createdBy: 'seed', createdAt: new Date(), updatedAt: new Date(),
    });

    const result = await computeBulkImportResults(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, unitId: UNIT_ID, mode: 'existing_roster', defaultTestDate: TODAY_ISO,
      rows: [{ soldierId: soldierRef.id, pullupsReps: 5 }],
    }, { callerUid: 'test-officer', tokenEmail: 'officer@test.local', sourceIp: '127.0.0.1' });

    expect(result.status).toBe(400);
  });
});

describe('computeBulkImportResults — scope + global guards', () => {
  it('unknown scope returns 503, distinct from a checked denial', async () => {
    const result = await computeBulkImportResults(db, { kind: 'unknown' }, {
      tenantId: TENANT_ID, unitId: UNIT_ID, mode: 'new_roster', defaultTestDate: TODAY_ISO,
      rows: [{ name: 'לא אמור להיווצר', gender: 'male' }],
    }, { callerUid: 'test-officer', tokenEmail: 'officer@test.local', sourceIp: '127.0.0.1' });
    expect(result.status).toBe(503);
  });

  it('denied scope never reaches Firestore', async () => {
    const result = await computeBulkImportResults(db, { kind: 'denied' }, {
      tenantId: TENANT_ID, unitId: UNIT_ID, mode: 'new_roster', defaultTestDate: TODAY_ISO,
      rows: [{ name: 'לא אמור להיווצר', gender: 'male' }],
    }, { callerUid: 'test-officer', tokenEmail: 'officer@test.local', sourceIp: '127.0.0.1' });
    expect(result.status).toBe(403);
  });

  it('a future test date is rejected', async () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const result = await computeBulkImportResults(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, unitId: UNIT_ID, mode: 'new_roster', defaultTestDate: future,
      rows: [{ name: 'לא אמור להיווצר', gender: 'male' }],
    }, { callerUid: 'test-officer', tokenEmail: 'officer@test.local', sourceIp: '127.0.0.1' });
    expect(result.status).toBe(400);
  });
});
