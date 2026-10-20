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
import { computeUnitRoster } from '../readiness-read.service';
import { computeReadinessTrends } from '../readiness-trends.service';
import { computeUnitDetail } from '../readiness-unit-detail.service';
import {
  computeRecordResult,
  computeRecordResultWithCorrectionChoice,
  computeBulkImportResults,
  computeBulkImportResultsWithCorrectionChoice,
  computeLinkSoldier,
  computeCreateSoldier,
  type ReadinessThresholdsConfig,
} from '../readiness-write.service';
import { computeCreateUnit } from '@/app/api/units/create/route';
import type { UnitPermissionScope } from '@/lib/unitPermissionScope';

const PROJECT_ID = 'appout-1-emulator-test';
const FIRESTORE_HOST = '127.0.0.1:8080';

const TENANT_MIL_1 = 'emu-vert-mil-1'; // has real data
const TENANT_MIL_2 = 'emu-vert-mil-2'; // zero soldiers — "hasData: false"
const TENANT_SCHOOL = 'emu-vert-school-1'; // deliberately included in the hand-built scope below, to prove the defensive re-filter works
const TENANT_MUNICIPAL = 'emu-vert-municipal-1'; // a REAL city authority, NEVER in VERTICAL_SCOPE's authorityIds — 06.10.2026 drill-down check
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
    { id: 'run_3000m', label: 'ריצת 3,000 מ', metric: 'time', unit: 'seconds', lowerIsBetter: true, threshold: { male: 1080, female: 1200 }, validityDays: 365 },
    { id: 'pullups', label: 'עליות מתח', metric: 'reps', unit: 'reps', lowerIsBetter: false, threshold: { male: 5, female: 1 }, validityDays: 365 },
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
  batch.set(db.collection('authorities').doc(TENANT_MUNICIPAL), { name: 'עיר', type: 'city' });
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

  it('06.10.2026 (David\'s explicit review) — root now sees the SAME list a chief officer sees: every military tenant, never municipal/educational. This screen has two doors now, not one — root is no longer refused here.', async () => {
    await seedSoldierAndResult(TENANT_MIL_1, 's1', 'pass');
    const result = await computeReadinessVerticalOverview(db, { kind: 'root' });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.rows.length).toBe(2); // TENANT_MIL_1 + TENANT_MIL_2 only
    expect(result.body.rows.some((r) => r.tenantId === TENANT_SCHOOL)).toBe(false);
    expect(result.body.rows.some((r) => r.tenantId === TENANT_MUNICIPAL)).toBe(false);
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

  it('demo world (20.10.2026): a demo military unit never appears — not for root, not for a vertical grant listing it', async () => {
    await db.collection('authorities').doc('demo-unit').set({ name: 'יחידת דמו', type: 'military_unit', isDemo: true });
    await db.collection('authorities').doc('emu-flagged-demo').set({ name: 'דמו מסומן', type: 'military_unit', isDemo: true });
    const scope: UnitPermissionScope = { kind: 'vertical', vertical: 'military', authorityIds: [TENANT_MIL_1, TENANT_MIL_2, 'demo-unit', 'emu-flagged-demo'] };
    for (const s of [scope, { kind: 'root' } as UnitPermissionScope]) {
      const result = await computeReadinessVerticalOverview(db, s);
      expect(result.status).toBe(200);
      if (result.status !== 200) return;
      const ids = result.body.rows.map((r) => r.tenantId).sort();
      expect(ids).toEqual([TENANT_MIL_1, TENANT_MIL_2].sort());
    }
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

  it('06.10.2026 — a chief fitness officer requesting a REAL municipal tenant\'s dashboard is DENIED, not just "absent from the list" — /admin/dashboard is a shared page across every vertical, and this is the real cross-vertical leak path that matters', async () => {
    const result = await computeBrigadeDashboard(db, VERTICAL_SCOPE, { tenantId: TENANT_MUNICIPAL });
    expect(result.status).toBe(403); // TENANT_MUNICIPAL is a real, existing authority — just never in scope.authorityIds (military-only, by resolveUnitPermissionScope's own tenantTypeOf filter)
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

// 15.10.2026 (owner, explicit) — REPLACES the 06.10.2026 "every write path
// refuses a vertical scope" rule: the chief fitness officer outranks every
// brigade officer and may do whatever they can, in any MILITARY brigade of
// his scope — and nowhere else. These tests pin both halves.
describe('the chief officer writes in his own brigades, and only there (15.10.2026)', () => {
  async function seedSoldier(tenantId: string, soldierId: string): Promise<void> {
    await db.collection('readiness_soldiers').doc(soldierId).set({
      tenantId, unitId: UNIT_ID, name: 'חייל', gender: 'male', uid: null, linkedAt: null, mergedInto: null,
      createdBy: 'test', createdAt: new Date(), updatedAt: new Date(),
    });
  }
  function recordBody(soldierId: string): Record<string, unknown> {
    return { soldierId, testId: 'run_3000m', source: 'organized_test', testDate: new Date().toISOString(), value: 1000 };
  }

  it('click-through then write: list → brigade dashboard → recording a result in that brigade succeeds', async () => {
    await seedSoldier(TENANT_MIL_1, 'chief-s1');
    expect((await computeReadinessVerticalOverview(db, VERTICAL_SCOPE)).status).toBe(200);
    expect((await computeBrigadeDashboard(db, VERTICAL_SCOPE, { tenantId: TENANT_MIL_1 })).status).toBe(200);
    const writeResult = await computeRecordResult(db, VERTICAL_SCOPE, recordBody('chief-s1'), CTX);
    expect(writeResult.status).toBe(200);
  });

  it('recording a result for a soldier OUTSIDE his scope (a city tenant) → 403', async () => {
    await seedSoldier(TENANT_MUNICIPAL, 'chief-out-1');
    expect((await computeRecordResult(db, VERTICAL_SCOPE, recordBody('chief-out-1'), CTX)).status).toBe(403);
    expect((await computeRecordResultWithCorrectionChoice(db, VERTICAL_SCOPE, recordBody('chief-out-1'), CTX)).status).toBe(403);
  });

  it('bulk import / link name the brigade explicitly — empty or out-of-scope requests are refused, never root-like', async () => {
    expect((await computeBulkImportResults(db, VERTICAL_SCOPE, {}, CTX)).status).not.toBe(200);
    expect((await computeBulkImportResultsWithCorrectionChoice(db, VERTICAL_SCOPE, { tenantId: TENANT_MUNICIPAL, unitId: UNIT_ID }, CTX)).status).not.toBe(200);
    expect((await computeLinkSoldier(db, VERTICAL_SCOPE, {}, CTX)).status).not.toBe(200);
  });

  it('a school listed in a (malformed) scope is still refused for writes — military brigades only', async () => {
    await db.collection('tenants').doc(TENANT_SCHOOL).collection('units').doc(UNIT_ID).set({ name: 'כיתה' });
    const r = await computeCreateSoldier(db, VERTICAL_SCOPE, { name: 'תלמיד', gender: 'male', tenantId: TENANT_SCHOOL, unitId: UNIT_ID }, CTX);
    expect(r.status).toBe(403);
    // and the same call in his real brigade goes through
    await db.collection('tenants').doc(TENANT_MIL_1).collection('units').doc(UNIT_ID).set({ name: 'פלוגה' });
    const ok = await computeCreateSoldier(db, VERTICAL_SCOPE, { name: 'חייל', gender: 'male', tenantId: TENANT_MIL_1, unitId: UNIT_ID }, CTX);
    expect(ok.status).toBe(200);
  });

  it('creating a unit: allowed in his brigade, refused in a city tenant (isMemberWithinScope)', async () => {
    const own = await computeCreateUnit(db, VERTICAL_SCOPE, { tenantId: TENANT_MIL_1, name: 'יחידה חדשה', parentUnitId: null });
    expect(own.status).toBe(200);
    const other = await computeCreateUnit(db, VERTICAL_SCOPE, { tenantId: TENANT_MUNICIPAL, name: 'יחידה', parentUnitId: null });
    expect(other.status).toBe(403);
  });
});

describe('root and a chief officer get IDENTICAL results for the same brigade (06.10.2026, David\'s explicit test)', () => {
  it('computeBrigadeDashboard: root vs vertical scope, same tenantId → same numbers', async () => {
    await seedSoldierAndResult(TENANT_MIL_1, 's1', 'pass');
    await seedSoldierAndResult(TENANT_MIL_1, 's2', 'fail');
    const rootResult = await computeBrigadeDashboard(db, { kind: 'root' }, { tenantId: TENANT_MIL_1 });
    const verticalResult = await computeBrigadeDashboard(db, VERTICAL_SCOPE, { tenantId: TENANT_MIL_1 });
    expect(rootResult.status).toBe(200);
    expect(verticalResult.status).toBe(200);
    if (rootResult.status !== 200 || verticalResult.status !== 200) return;
    expect(rootResult.body.overall).toEqual(verticalResult.body.overall);
    expect(rootResult.body.units).toEqual(verticalResult.body.units);
  });

  it('computeReadinessVerticalOverview: root vs vertical scope → same rows (same brigades, same numbers)', async () => {
    await seedSoldierAndResult(TENANT_MIL_1, 's1', 'pass');
    const rootResult = await computeReadinessVerticalOverview(db, { kind: 'root' });
    const verticalResult = await computeReadinessVerticalOverview(db, VERTICAL_SCOPE);
    expect(rootResult.status).toBe(200);
    expect(verticalResult.status).toBe(200);
    if (rootResult.status !== 200 || verticalResult.status !== 200) return;
    const byId = (rows: typeof rootResult.body.rows) => [...rows].sort((a, b) => a.tenantId.localeCompare(b.tenantId));
    expect(byId(rootResult.body.rows)).toEqual(byId(verticalResult.body.rows));
  });
});

describe('root with no tenantId yet — the server-side half of "pick a brigade" (06.10.2026)', () => {
  /**
   * This 400 is UNCHANGED by this round — computeBrigadeDashboard's own
   * root branch already required an explicit tenantId before today
   * (readiness-dashboard.service.ts's pre-existing root/vertical shared
   * branch). The actual fix for "root sees a raw English server error"
   * is entirely CLIENT-side (never issue this call before a brigade is
   * picked, per useMilitaryTenantSelection + each screen's own empty
   * state) — untestable here (no jsdom in this vitest config, see
   * vitest-node-only-no-jsdom). This test anchors the one thing that
   * IS testable at this layer: the 400 the client must avoid triggering
   * still fires exactly where expected, so the client-side guard has a
   * real, unchanged condition to guard against.
   */
  it('computeBrigadeDashboard: root with no tenantId → 400 "tenantId is required"', async () => {
    const result = await computeBrigadeDashboard(db, { kind: 'root' }, {});
    expect(result.status).toBe(400);
  });
  it('computeUnitRoster: root with no tenantId → 400, same reasoning', async () => {
    const result = await computeUnitRoster(db, { kind: 'root' }, {});
    expect(result.status).toBe(400);
  });
  it('computeReadinessTrends: root with no tenantId → 400, same reasoning', async () => {
    const result = await computeReadinessTrends(db, { kind: 'root' }, {});
    expect(result.status).toBe(400);
  });
});

describe('the full click-through chain works for root — list, then a brigade, then a battalion (06.10.2026, David\'s explicit test)', () => {
  it('list → brigade dashboard → unit detail, all as root, all consistent', async () => {
    await seedSoldierAndResult(TENANT_MIL_1, 's1', 'pass');

    const listResult = await computeReadinessVerticalOverview(db, { kind: 'root' });
    expect(listResult.status).toBe(200);
    if (listResult.status !== 200) return;
    expect(listResult.body.rows.some((r) => r.tenantId === TENANT_MIL_1)).toBe(true);

    const dashboardResult = await computeBrigadeDashboard(db, { kind: 'root' }, { tenantId: TENANT_MIL_1 });
    expect(dashboardResult.status).toBe(200);
    if (dashboardResult.status !== 200) return;
    const unitRow = dashboardResult.body.units.find((u) => u.unitId === UNIT_ID);
    expect(unitRow).toBeDefined();

    const detailResult = await computeUnitDetail(db, { kind: 'root' }, { unitId: UNIT_ID, tenantId: TENANT_MIL_1 });
    expect(detailResult.status).toBe(200);
    if (detailResult.status !== 200) return;
    expect(detailResult.body.unitId).toBe(UNIT_ID);
    expect(detailResult.body.ownSoldierCount).toBe(1);
  });
});

describe('a real brigade officer — tenant_owner/unit_admin — is completely unaffected by any of this round\'s changes (06.10.2026)', () => {
  it('computeReadinessVerticalOverview still refuses a tenantOwner — not a new door opened by the root branch', async () => {
    const result = await computeReadinessVerticalOverview(db, { kind: 'tenantOwner', tenantId: TENANT_MIL_1 });
    expect(result.status).toBe(403);
  });

  it('computeBrigadeDashboard: a tenantOwner with NO query.tenantId (exactly how every real screen has always called it) still resolves their own brigade, unchanged', async () => {
    await seedSoldierAndResult(TENANT_MIL_1, 's1', 'pass');
    const result = await computeBrigadeDashboard(db, { kind: 'tenantOwner', tenantId: TENANT_MIL_1 }, {});
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.tenantId).toBe(TENANT_MIL_1);
    expect(result.body.overall.totalCount).toBe(1);
  });
});
