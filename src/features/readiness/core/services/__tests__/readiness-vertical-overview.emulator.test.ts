/**
 * "Chief fitness officer" cross-brigade overview — REAL Firestore-
 * emulator integration suite (06.10.2026). §31 discipline: every
 * assertion exercises the real Admin SDK read path.
 *
 * The negative cases outnumber the positive ones on purpose (David's
 * explicit instruction) — this feature's entire risk is cross-
 * organization data leakage, so "every write path refuses a vertical
 * scope" and "a non-vertical caller is denied, not shown an empty list"
 * matter more than "the happy path returns the right numbers."
 *
 * Requires `firebase emulators:start --only firestore` running
 * separately at 127.0.0.1:8080. Run ONLY this file, never together with
 * another *.emulator.test.ts in the same vitest invocation (they share
 * one emulator database and each wipes it all).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => { throw new Error('getAdminDb should never be called from compute*() functions — db is always injected'); },
  getAdminAuth: () => { throw new Error('getAdminAuth should never be called from compute*() functions'); },
}));

import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { computeReadinessVerticalOverview } from '../readiness-vertical-overview.service';
import { computeBrigadeDashboard } from '../readiness-dashboard.service';
import {
  computeRecordResult,
  computeRecordResultWithCorrectionChoice,
  computeBulkImportResults,
  computeBulkImportResultsWithCorrectionChoice,
  computeLinkSoldier,
  type ReadinessThresholdsConfig,
} from '../readiness-write.service';
import { computeCreateUnit } from '@/app/api/units/create/route';
import type { UnitPermissionScope } from '@/lib/unitPermissionScope';

const PROJECT_ID = 'appout-1-emulator-test';
const FIRESTORE_HOST = '127.0.0.1:8080';

const TENANT_MIL_1 = 'emu-vert-mil-1'; // has real data
const TENANT_MIL_2 = 'emu-vert-mil-2'; // zero soldiers — "hasData: false"
const TENANT_SCHOOL = 'emu-vert-school-1'; // deliberately included in the hand-built scope below, to prove the defensive re-filter works
const UNIT_ID = 'emu-vert-unit';

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
  id: 'global', version: 1, updatedBy: 'test', updatedAt: new Date(),
  tests: [
    { id: 'run_3000m', label: 'ריצת 3,000 מ', metric: 'time', unit: 'seconds', lowerIsBetter: true, threshold: { male: 1080, female: 1200 } },
    { id: 'pullups', label: 'עליות מתח', metric: 'reps', unit: 'reps', lowerIsBetter: false, threshold: { male: 5, female: 1 } },
  ],
} as ReadinessThresholdsConfig;

/** This caller's grant: a real chief-fitness-officer scope. TENANT_SCHOOL is deliberately present here — a hand-built scope lets us prove the readiness-vertical-overview.service.ts's OWN re-filter (not just resolveUnitPermissionScope's upstream one) keeps it out of the list. */
const VERTICAL_SCOPE: UnitPermissionScope = { kind: 'vertical', vertical: 'military', authorityIds: [TENANT_MIL_1, TENANT_MIL_2, TENANT_SCHOOL] };
const CTX = { callerUid: 'test-officer', tokenEmail: 'officer@test.local', sourceIp: '127.0.0.1' };

async function seedAuthoritiesAndThresholds(): Promise<void> {
  const batch = db.batch();
  batch.set(db.collection('authorities').doc(TENANT_MIL_1), { name: 'חטיבה א', type: 'military_unit' });
  batch.set(db.collection('authorities').doc(TENANT_MIL_2), { name: 'חטיבה ב', type: 'military_unit' });
  batch.set(db.collection('authorities').doc(TENANT_SCHOOL), { name: 'בית ספר', type: 'school' });
  batch.set(db.collection('readiness_thresholds').doc('global'), THRESHOLDS_CONFIG);
  await batch.commit();
}

/** Seeds a soldier with BOTH configured tests at the given outcome — "all tests must pass" means a single test's outcome alone never determines the soldier's overall pass/fail. */
async function seedSoldierAndResult(tenantId: string, soldierId: string, outcome: 'pass' | 'fail'): Promise<void> {
  await db.collection('readiness_soldiers').doc(soldierId).set({
    tenantId, unitId: UNIT_ID, name: 'חייל', gender: 'male', uid: null, linkedAt: null, mergedInto: null,
    createdBy: 'test', createdAt: new Date(), updatedAt: new Date(),
  });
  for (const [testId, value] of [['run_3000m', outcome === 'pass' ? 1000 : 1500], ['pullups', outcome === 'pass' ? 8 : 0]] as const) {
    await db.collection('readiness_results').doc(`${soldierId}-${testId}`).set({
      soldierId, tenantId, unitId: UNIT_ID, testId, outcome, value,
      notPerformedReason: null, source: 'organized_test',
      thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 1080, lowerIsBetter: true, validityDays: 365 },
      recordedBy: 'test-officer', recordedAt: new Date(), testDate: new Date(), uid: null,
    });
  }
}

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
  app = initializeApp({ projectId: PROJECT_ID }, `vertical-overview-emulator-test-${Date.now()}`);
  db = getFirestore(app);
  await clearEmulator();
  await seedAuthoritiesAndThresholds();
}, 20000);

beforeEach(async () => {
  await clearEmulator();
  await seedAuthoritiesAndThresholds();
});

afterAll(async () => {
  if (app) await deleteApp(app);
});

describe('computeReadinessVerticalOverview — authorization', () => {
  it('a user without the vertical grant is DENIED, never shown an empty list — the core distinction David drew', async () => {
    const result = await computeReadinessVerticalOverview(db, { kind: 'denied' });
    expect(result.status).toBe(403);
  });

  it('root is ALSO denied here — this screen has exactly one door, not a root bypass', async () => {
    const result = await computeReadinessVerticalOverview(db, { kind: 'root' });
    expect(result.status).toBe(403);
  });

  it('a regular tenantOwner is denied here too — this is not an alternate route into the same data', async () => {
    const result = await computeReadinessVerticalOverview(db, { kind: 'tenantOwner', tenantId: TENANT_MIL_1 });
    expect(result.status).toBe(403);
  });

  it('a vertical grant for a DIFFERENT vertical (educational) is denied, not an empty military list', async () => {
    const result = await computeReadinessVerticalOverview(db, { kind: 'vertical', vertical: 'educational', authorityIds: [TENANT_SCHOOL] });
    expect(result.status).toBe(403);
  });

  it('unknown scope → 503, the "could not verify" message, distinct from a real denial', async () => {
    const result = await computeReadinessVerticalOverview(db, { kind: 'unknown' });
    expect(result.status).toBe(503);
  });
});

describe('computeReadinessVerticalOverview — the real list', () => {
  it('returns every military tenant in scope, including a zero-data one marked hasData:false — never hidden', async () => {
    await seedSoldierAndResult(TENANT_MIL_1, 's1', 'pass');

    const result = await computeReadinessVerticalOverview(db, VERTICAL_SCOPE);
    expect(result.status).toBe(200);
    if (result.status !== 200) return;

    expect(result.body.rows.length).toBe(2); // TENANT_MIL_1 + TENANT_MIL_2 — NEVER TENANT_SCHOOL
    const row1 = result.body.rows.find((r) => r.tenantId === TENANT_MIL_1);
    const row2 = result.body.rows.find((r) => r.tenantId === TENANT_MIL_2);
    expect(row1).toBeDefined();
    expect(row2).toBeDefined();
    expect(row1!.totalCount).toBe(1);
    expect(row1!.passCount).toBe(1);
    expect(row1!.hasData).toBe(true);
    expect(row2!.totalCount).toBe(0);
    expect(row2!.hasData).toBe(false); // "טרם הוזנו נתונים" — a real row, not a missing one
  });

  it('never returns a municipal/educational tenant, even if one is (incorrectly) present in scope.authorityIds', async () => {
    const result = await computeReadinessVerticalOverview(db, VERTICAL_SCOPE); // VERTICAL_SCOPE includes TENANT_SCHOOL on purpose
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.rows.some((r) => r.tenantId === TENANT_SCHOOL)).toBe(false);
  });
});

describe('computeBrigadeDashboard — the new validated vertical branch (click-through)', () => {
  it('a vertical officer CAN open one specific in-scope brigade\'s real dashboard', async () => {
    await seedSoldierAndResult(TENANT_MIL_1, 's1', 'pass');
    const result = await computeBrigadeDashboard(db, VERTICAL_SCOPE, { tenantId: TENANT_MIL_1 });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.tenantId).toBe(TENANT_MIL_1);
    expect(result.body.overall.totalCount).toBe(1);
  });

  it('a vertical officer is DENIED a tenant outside their own authorityIds — not root-like blind trust', async () => {
    const OUTSIDE_TENANT = 'emu-vert-outside-mil';
    const narrowScope: UnitPermissionScope = { kind: 'vertical', vertical: 'military', authorityIds: [TENANT_MIL_1] };
    const result = await computeBrigadeDashboard(db, narrowScope, { tenantId: OUTSIDE_TENANT });
    expect(result.status).toBe(403);
  });

  it('regression: a regular brigade tenantOwner requesting ANOTHER brigade\'s tenantId still only ever gets their OWN brigade\'s data', async () => {
    await seedSoldierAndResult(TENANT_MIL_1, 's1', 'pass');
    await seedSoldierAndResult(TENANT_MIL_2, 's2', 'fail');
    const tenantAScope: UnitPermissionScope = { kind: 'tenantOwner', tenantId: TENANT_MIL_1 };
    const result = await computeBrigadeDashboard(db, tenantAScope, { tenantId: TENANT_MIL_2 }); // ignored by design
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.tenantId).toBe(TENANT_MIL_1); // never TENANT_MIL_2 — query.tenantId is NEVER consulted for tenantOwner
  });
});

describe('the synthetic scope cannot leak into a later write (David\'s explicit review, 06.10.2026)', () => {
  it('the FULL click-through sequence — list, then that brigade\'s dashboard, then a write attempt — a write is STILL 403, using the real vertical scope throughout', async () => {
    await seedSoldierAndResult(TENANT_MIL_1, 's1', 'pass');
    await db.collection('readiness_soldiers').doc('leak-test-s1').set({
      tenantId: TENANT_MIL_1, unitId: UNIT_ID, name: 'חייל', gender: 'male', uid: null, linkedAt: null, mergedInto: null,
      createdBy: 'test', createdAt: new Date(), updatedAt: new Date(),
    });

    // Step 1 — the list screen. Internally constructs-and-discards a
    // synthetic {kind:'tenantOwner'} scope per row, once per call; never
    // returned (the result body below is plain strings/numbers, not a
    // scope object) and never stored anywhere this test — or any real
    // caller — could later read back.
    const listResult = await computeReadinessVerticalOverview(db, VERTICAL_SCOPE);
    expect(listResult.status).toBe(200);

    // Step 2 — "clicking" TENANT_MIL_1's row: a SEPARATE call, using the
    // REAL vertical scope (not anything step 1 produced) — this is
    // exactly what the real /api/units/readiness/dashboard route does,
    // since it re-resolves scope fresh from Firestore on every request.
    const dashboardResult = await computeBrigadeDashboard(db, VERTICAL_SCOPE, { tenantId: TENANT_MIL_1 });
    expect(dashboardResult.status).toBe(200);
    if (dashboardResult.status === 200) expect(dashboardResult.body.tenantId).toBe(TENANT_MIL_1);

    // Step 3 — a write attempt, same real vertical scope, same uid,
    // immediately after "landing" on that brigade's dashboard. If the
    // synthetic from step 1 had leaked or elevated anything, this would
    // be the place it would show up as an unexpected 200. It does not.
    const writeResult = await computeRecordResult(
      db, VERTICAL_SCOPE,
      { soldierId: 'leak-test-s1', testId: 'run_3000m', source: 'organized_test', testDate: new Date().toISOString(), value: 1000 },
      CTX,
    );
    expect(writeResult.status).toBe(403);
  });
});

describe('every write path refuses a vertical scope — explicit, in-code, not "we just won\'t add a button" (06.10.2026)', () => {
  /** computeRecordResult/computeRecordResultWithCorrectionChoice fetch a REAL soldier doc before checking scope at all (they need soldier.tenantId/unitId to check isMemberWithinScope against) — an empty requestBody 400s on `soldierId is required` before ever reaching that check, which would prove nothing about the vertical-rejection itself. A minimally valid body against a real soldier is required to actually exercise the scope gate. */
  async function validRecordResultBody(soldierId: string): Promise<Record<string, unknown>> {
    return { soldierId, testId: 'run_3000m', source: 'organized_test', testDate: new Date().toISOString(), value: 1000 };
  }

  it('רישום תוצאה (computeRecordResult) → 403', async () => {
    await db.collection('readiness_soldiers').doc('write-test-s1').set({
      tenantId: TENANT_MIL_1, unitId: UNIT_ID, name: 'חייל', gender: 'male', uid: null, linkedAt: null, mergedInto: null,
      createdBy: 'test', createdAt: new Date(), updatedAt: new Date(),
    });
    const result = await computeRecordResult(db, VERTICAL_SCOPE, await validRecordResultBody('write-test-s1'), CTX);
    expect(result.status).toBe(403);
  });

  it('תיקון (computeRecordResultWithCorrectionChoice) → 403', async () => {
    await db.collection('readiness_soldiers').doc('write-test-s2').set({
      tenantId: TENANT_MIL_1, unitId: UNIT_ID, name: 'חייל', gender: 'male', uid: null, linkedAt: null, mergedInto: null,
      createdBy: 'test', createdAt: new Date(), updatedAt: new Date(),
    });
    const result = await computeRecordResultWithCorrectionChoice(db, VERTICAL_SCOPE, await validRecordResultBody('write-test-s2'), CTX);
    expect(result.status).toBe(403);
  });

  it('ייבוא (computeBulkImportResults) → 403', async () => {
    const result = await computeBulkImportResults(db, VERTICAL_SCOPE, {}, CTX);
    expect(result.status).toBe(403);
  });

  it('ייבוא עם תיקון (computeBulkImportResultsWithCorrectionChoice) → 403', async () => {
    const result = await computeBulkImportResultsWithCorrectionChoice(db, VERTICAL_SCOPE, {}, CTX);
    expect(result.status).toBe(403);
  });

  it('קישור חשבון (computeLinkSoldier) → 403', async () => {
    const result = await computeLinkSoldier(db, VERTICAL_SCOPE, {}, CTX);
    expect(result.status).toBe(403);
  });

  it('יצירת יחידה (computeCreateUnit) → 403, via isMemberWithinScope — zero code change to that gate', async () => {
    const result = await computeCreateUnit(db, VERTICAL_SCOPE, { tenantId: TENANT_MIL_1, name: 'יחידה חדשה', parentUnitId: null });
    expect(result.status).toBe(403);
  });
});
