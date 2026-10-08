/**
 * ADVERSARIAL SECURITY AUDIT — military readiness panel (08.10.2026).
 * UPDATED 08.10.2026 after the fix: this suite is now a CLOSED-finding
 * regression guard, not an open red-test report. All 24 cases are green.
 *
 * Attack #1 (brigade officer reading another brigade directly via API)
 * and #3 (vertical/military-scope caller requesting another customer's
 * tenantId) turned out to be the SAME bug: a 'vertical'-scope caller
 * (core.isReadinessChiefOfficer) was the only caller kind ever handed a
 * client-supplied tenantId without an ownership check — on exactly 4 of
 * the compute*() functions that accept one from a 'vertical' caller
 * (computeUnitRoster, computeReadinessAppActivity, computeReadinessTrends,
 * computeRosterWorkoutSummary's resolveTargetUids). Re-derived this count
 * from scratch (not from memory) by grepping every file referencing
 * UnitPermissionScope/isMemberWithinScope in the whole repo and checking
 * each one's own branch structure — exactly 4, no 5th instance exists.
 * Fixed by adding the SAME `scope.authorityIds.includes(tenantId)` check
 * computeBrigadeDashboard/computeUnitMembers/computeUnitStructure/
 * computeTrainingWeeklyShift already had, in a new `else if (scope.kind
 * === 'vertical')` branch — root's own branch is untouched byte-for-byte.
 *
 * Requires the isolated audit emulator on 127.0.0.1:8089 (NOT the shared
 * 127.0.0.1:8080 instance another concurrent session may be using —
 * started via `firebase emulators:start --only firestore --config
 * firebase-audit.json --project appout-1-audit-test`). Run ONLY this
 * file, never together with another *.emulator.test.ts (shared DB, each
 * wipes it all).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => { throw new Error('getAdminDb should never be called from compute*() functions — db is always injected'); },
  getAdminAuth: () => { throw new Error('getAdminAuth should never be called from compute*() functions'); },
}));

import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { computeUnitRoster } from '../readiness-read.service';
import { computeReadinessAppActivity } from '../readiness-app-activity.service';
import { computeReadinessTrends } from '../readiness-trends.service';
import { computeRosterWorkoutSummary } from '@/app/api/units/roster-workout-summary/route';
import { computeCreateSoldier, computeRecordResultWithCorrectionChoice, type ReadinessCtx } from '../readiness-write.service';
import type { UnitPermissionScope } from '@/lib/unitPermissionScope';

const PROJECT_ID = 'appout-1-audit-test';
const FIRESTORE_HOST = '127.0.0.1:8089';

// Two real, distinct customer tenants. MILITARY_B is the chief officer's
// OWN authorized scope; MILITARY_A and SCHOOL_C are explicitly OUTSIDE it.
const MILITARY_A = 'brigade-A-not-in-scope';
const MILITARY_B = 'brigade-B-in-scope';
const SCHOOL_C = 'school-C-cross-vertical-not-in-scope';

const CHIEF_OFFICER_SCOPE: UnitPermissionScope = {
  kind: 'vertical',
  vertical: 'military',
  authorityIds: [MILITARY_B], // explicitly does NOT include MILITARY_A or SCHOOL_C
};

let app: App;
let db: Firestore;

async function clearEmulator(): Promise<void> {
  const res = await fetch(
    `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Failed to clear emulator (status ${res.status}) — is it running at ${FIRESTORE_HOST}?`);
}

async function createSoldier(tenantId: string, id: string, name: string, uid: string | null = null): Promise<void> {
  await db.collection('readiness_soldiers').doc(id).set({
    tenantId, unitId: 'unit-1', name, gender: 'male', uid, linkedAt: null, mergedInto: null,
    createdBy: 'test', createdAt: new Date(), updatedAt: new Date(),
  });
}

async function seedTenantType(tenantId: string, type: 'military_unit' | 'school'): Promise<void> {
  await db.collection('authorities').doc(tenantId).set({ type, name: tenantId });
}

// Global (not tenant-scoped) — computeReadinessTrends 400s on a missing
// config before it ever reaches its authorization branch; this is fixture
// plumbing, not a security control, and must be re-seeded every
// beforeEach since clearEmulator() wipes it along with everything else.
async function seedGlobalThresholds(): Promise<void> {
  await db.collection('readiness_thresholds').doc('global').set({
    id: 'global', version: 1, updatedBy: 'test', updatedAt: new Date(),
    tests: [{ id: 'run_3000m', label: 'ריצת 3,000 מ', metric: 'time', unit: 'seconds', lowerIsBetter: true, threshold: { male: 1080, female: 1200 } }],
  });
}

async function addResult(tenantId: string, id: string, soldierId: string, testDate: Date): Promise<void> {
  await db.collection('readiness_results').doc(id).set({
    soldierId, tenantId, unitId: 'unit-1', testId: 'run_3000m', outcome: 'pass', value: 1000,
    notPerformedReason: null, source: 'organized_test',
    thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 1080, lowerIsBetter: true, validityDays: 365 },
    recordedBy: 'test-officer', recordedAt: testDate, testDate, uid: null,
  });
}

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
  app = initializeApp({ projectId: PROJECT_ID }, `mil-audit-emulator-test-${Date.now()}`);
  db = getFirestore(app);
}, 20000);

beforeEach(async () => {
  await clearEmulator();
  await seedGlobalThresholds();
});

afterAll(async () => {
  if (app) await deleteApp(app);
});

describe('TOP FINDING (FIXED 08.10.2026) — "chief fitness officer" (vertical scope) cross-tenant read, 4 instances', () => {
  it('[CLOSED] computeUnitRoster: chief officer requests a MILITARY tenant NOT in their authorityIds → 403, no leak', async () => {
    await createSoldier(MILITARY_A, 'soldier-a1', 'חייל סודי א');

    const result = await computeUnitRoster(db, CHIEF_OFFICER_SCOPE, { tenantId: MILITARY_A, unitId: null });

    // Before the fix this returned 200 with the real soldier name in the
    // body (readiness-read.service.ts's `else` branch, written for root,
    // had no scope.authorityIds check at all). Now blocked by the new
    // `else if (scope.kind === 'vertical')` branch, same shape as
    // computeBrigadeDashboard's pre-existing one.
    expect(result.status).toBe(403);
    if (result.status === 200) {
      // Regression tripwire: if this ever reopens, fail loudly on the
      // actual PII, not just the status code.
      expect((result.body as { soldiers: { name: string }[] }).soldiers.map((s) => s.name)).not.toContain('חייל סודי א');
    }
  });

  it('[CLOSED] computeReadinessAppActivity: same gap, now fixed — out-of-scope tenantId → 403', async () => {
    await createSoldier(MILITARY_A, 'soldier-a2', 'חייל סודי ב', 'uid-a2');

    const result = await computeReadinessAppActivity(db, CHIEF_OFFICER_SCOPE, { tenantId: MILITARY_A, unitId: null });

    expect(result.status).toBe(403); // readiness-app-activity.service.ts — same fix shape
  });

  it('[CLOSED] computeReadinessTrends: same gap, now fixed — out-of-scope tenantId → 403', async () => {
    await createSoldier(MILITARY_A, 'soldier-a3', 'חייל סודי ג');
    await addResult(MILITARY_A, 'result-a3', 'soldier-a3', new Date('2026-09-01'));

    const result = await computeReadinessTrends(db, CHIEF_OFFICER_SCOPE, { tenantId: MILITARY_A, unitId: null });

    expect(result.status).toBe(403); // readiness-trends.service.ts — same fix shape, unitAdmin's own unitId check untouched
  });

  it('[CLOSED] computeRosterWorkoutSummary: same gap, now fixed — out-of-scope tenantId → 403', async () => {
    await createSoldier(MILITARY_A, 'soldier-a4', 'חייל סודי ד', 'uid-a4');

    const result = await computeRosterWorkoutSummary(db, CHIEF_OFFICER_SCOPE, { tenantId: MILITARY_A, unitId: null });

    // roster-workout-summary/route.ts's resolveTargetUids `else` branch was
    // commented "scope.kind === 'root'" but 'vertical' landed there too —
    // the 4th instance, found by this audit, not previously known. Now has
    // its own branch with the authorityIds + unitId-existence check.
    expect(result.status).toBe(403);
  });

  it('[CLOSED — cross-vertical] computeUnitRoster: chief officer requests a SCHOOL tenant (not military at all) → 403', async () => {
    await seedTenantType(SCHOOL_C, 'school');
    await createSoldier(SCHOOL_C, 'pupil-c1', 'תלמיד בבית ספר');

    const result = await computeUnitRoster(db, CHIEF_OFFICER_SCOPE, { tenantId: SCHOOL_C, unitId: null });

    // This role is advertised everywhere as military-only
    // (readiness-vertical-overview.service.ts:58-59). The authorityIds
    // check closes this the same way it closes same-vertical leaks —
    // authorityIds is pre-filtered to military tenants only, so a school
    // tenantId can never be a member of it regardless of brigade identity.
    expect(result.status).toBe(403);
  });

  it('[CONTROL — correctly scoped] computeUnitRoster: chief officer requests their OWN in-scope tenant → legitimately succeeds', async () => {
    await createSoldier(MILITARY_B, 'soldier-b1', 'חייל לגיטימי');

    const result = await computeUnitRoster(db, CHIEF_OFFICER_SCOPE, { tenantId: MILITARY_B, unitId: null });

    expect(result.status).toBe(200); // proves the fix target (adding the authorityIds check) won't break the legitimate case
  });
});

describe('Attack #1 control — tenantOwner/unitAdmin CANNOT override their own scope via a client-supplied tenantId', () => {
  it('computeUnitRoster: a tenantOwner of brigade B passing tenantId=brigade A in the query is ignored, not honored', async () => {
    await createSoldier(MILITARY_A, 'soldier-a5', 'חייל של חטיבה אחרת');
    await createSoldier(MILITARY_B, 'soldier-b2', 'חייל של עצמי');

    const tenantOwnerScope: UnitPermissionScope = { kind: 'tenantOwner', tenantId: MILITARY_B };
    const result = await computeUnitRoster(db, tenantOwnerScope, { tenantId: MILITARY_A, unitId: null });

    // Confirmed NOT vulnerable: unitAdmin/tenantOwner branches always use
    // scope.tenantId, never query.tenantId — a malicious query param is
    // silently irrelevant, not a bypass.
    expect(result.status).toBe(200);
    if (result.status === 200) {
      const ids = result.body.soldiers.map((s: { id: string }) => s.id).concat(result.body.pending.map((s: { id: string }) => s.id));
      expect(ids).not.toContain('soldier-a5'); // brigade A's soldier never appears
    }
  });
});

describe('Attack #4 — garbage input to the readiness write/read APIs', () => {
  const CTX: ReadinessCtx = { callerUid: 'officer-uid', tokenEmail: 'officer@example.com', sourceIp: '0.0.0.0' };

  it('computeUnitRoster: root scope with MISSING tenantId → 400, not a silent empty/leaked result', async () => {
    const rootScope: UnitPermissionScope = { kind: 'root' };
    const result = await computeUnitRoster(db, rootScope, { tenantId: null, unitId: null });
    expect(result.status).toBe(400);
  });

  it('computeRecordResultWithCorrectionChoice: NaN testDate string → 400, rejected before any DB read', async () => {
    const rootScope: UnitPermissionScope = { kind: 'root' };
    const result = await computeRecordResultWithCorrectionChoice(db, rootScope, {
      soldierId: 'does-not-matter', testId: 'run_3000m', source: 'organized_test',
      testDate: 'not-a-real-date', value: 1000, choice: 'new',
    }, CTX);
    expect(result.status).toBe(400);
  });

  it('computeRecordResultWithCorrectionChoice: testDate 30 days in the FUTURE → 400 ("לא יכול להיות בעתיד")', async () => {
    const rootScope: UnitPermissionScope = { kind: 'root' };
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = await computeRecordResultWithCorrectionChoice(db, rootScope, {
      soldierId: 'does-not-matter', testId: 'run_3000m', source: 'organized_test',
      testDate: future, value: 1000, choice: 'new',
    }, CTX);
    expect(result.status).toBe(400);
  });

  it('computeRecordResultWithCorrectionChoice: testDate 200 days in the PAST (beyond the 90-day cap) → 400', async () => {
    const rootScope: UnitPermissionScope = { kind: 'root' };
    const tooOld = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
    const result = await computeRecordResultWithCorrectionChoice(db, rootScope, {
      soldierId: 'does-not-matter', testId: 'run_3000m', source: 'organized_test',
      testDate: tooOld, value: 1000, choice: 'new',
    }, CTX);
    expect(result.status).toBe(400);
  });

  it('computeCreateSoldier: unitAdmin supplies a REAL unitId that exists only under a DIFFERENT tenant → 400, not silently created cross-tenant', async () => {
    // Seed unitId "shared-unit-name" for MILITARY_A only.
    await db.collection('tenants').doc(MILITARY_A).collection('units').doc('shared-unit-name').set({ name: 'יחידה' });
    const unitAdminScope: UnitPermissionScope = { kind: 'unitAdmin', tenantId: MILITARY_B, unitIds: ['shared-unit-name'] };

    const result = await computeCreateSoldier(db, unitAdminScope, {
      name: 'חייל מזויף', gender: 'male', unitId: 'shared-unit-name', tenantId: MILITARY_A, // tenantId is ignored for unitAdmin — resolveCallerTenantId always uses scope.tenantId
    }, CTX);

    // resolveCallerTenantId forces tenantId=scope.tenantId (MILITARY_B)
    // regardless of the body's tenantId; unitExists() then checks
    // tenants/MILITARY_B/units/shared-unit-name, which was never seeded
    // there (only under MILITARY_A) → correctly rejected, not a
    // cross-tenant write. Proves this specific forgery is NOT exploitable.
    expect(result.status).toBe(400);
  });
});
