import { describe, it, expect, vi } from 'vitest';

// Same convention as readiness-dashboard.service.test.ts — mocking
// @/lib/firebase-admin transitively protects unitPermissionScope.ts
// (which imports getAdminDb at module top level) from ever loading the
// real firebase-admin.ts, whose top-level `import 'server-only'` throws
// outside a real Next.js server-component boundary.
vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => { throw new Error('getAdminDb should never be called from compute*() functions — db is always injected'); },
}));

// computeDemonstratedStrengthLevels/computeDemonstratedRunLevels are
// themselves already tested elsewhere for their own correctness (real
// workout-derivation logic) — this suite tests the NEW bucketing/gating
// logic computeTrainingWeeklyShift adds on top, by controlling exactly
// what those two functions return for "now" vs "7 days ago" via a
// mock keyed on the asOf argument. Re-deriving real workout history
// through the emulator would re-test code this file doesn't touch.
const strengthByAsOf = new Map<string, Record<string, { pull: { level: number | null; reps: number | null }; push: { level: number | null; reps: number | null } }>>();
const runByAsOf = new Map<string, Record<string, { normalizedTimeSeconds: number | null }>>();

function keyFor(asOf: Date): string {
  return asOf.toISOString().slice(0, 10); // day-granularity key — enough to distinguish "now" from "7 days ago" in these fixtures
}

vi.mock('../readiness-strength-level.service', () => ({
  computeDemonstratedStrengthLevels: vi.fn(async (_db: unknown, uids: string[], asOf?: Date) => {
    const fixture = strengthByAsOf.get(keyFor(asOf ?? new Date())) ?? {};
    const out: Record<string, { pull: { level: number | null; reps: number | null }; push: { level: number | null; reps: number | null } }> = {};
    for (const uid of uids) out[uid] = fixture[uid] ?? { pull: { level: null, reps: null }, push: { level: null, reps: null } };
    return out;
  }),
}));

vi.mock('../readiness-run-level.service', () => ({
  computeDemonstratedRunLevels: vi.fn(async (_db: unknown, uids: string[], asOf?: Date) => {
    const fixture = runByAsOf.get(keyFor(asOf ?? new Date())) ?? {};
    const out: Record<string, { normalizedTimeSeconds: number | null }> = {};
    for (const uid of uids) out[uid] = fixture[uid] ?? { normalizedTimeSeconds: null };
    return out;
  }),
}));

import { computeTrainingWeeklyShift } from '../readiness-training-weekly-shift.service';
import type { UnitPermissionScope } from '@/lib/unitPermissionScope';

const TENANT_OWNER_SCOPE: UnitPermissionScope = { kind: 'tenantOwner', tenantId: 'tenant-1' };

const NOW = new Date();
const WEEK_AGO = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);
const NOW_KEY = keyFor(NOW);
const WEEK_AGO_KEY = keyFor(WEEK_AGO);

// Thresholds: run lowerIsBetter (seconds), pull/push higherIsBetter (reps). MIN_QUALIFYING_LEVEL is pull:11, push:10 (readiness-training-status.service.ts).
const CONFIG = {
  id: 'global',
  version: 1,
  tests: [
    { id: 'run_3000m', label: 'ריצה', unit: 'seconds', lowerIsBetter: true, threshold: { male: 1080, female: 1200 }, validityDays: 180 },
    { id: 'pullups', label: 'מתח', unit: 'reps', lowerIsBetter: false, threshold: { male: 10, female: 5 }, validityDays: 180 },
    { id: 'dips', label: 'מקבילים', unit: 'reps', lowerIsBetter: false, threshold: { male: 15, female: 8 }, validityDays: 180 },
  ],
  updatedBy: 'test',
  updatedAt: new Date(),
};

function makeFakeDb(soldiers: Record<string, unknown>[], config: unknown = CONFIG) {
  return {
    collection(name: string) {
      if (name === 'readiness_soldiers') {
        return { where: () => ({ get: async () => ({ docs: soldiers.map((s: any) => ({ id: s.id, data: () => s })) }) }) };
      }
      if (name === 'readiness_thresholds') {
        return { doc: () => ({ get: async () => ({ exists: config !== null, data: () => config }) }) };
      }
      throw new Error(`unexpected collection: ${name}`);
    },
  } as unknown as import('firebase-admin/firestore').Firestore;
}

// pull (pullups, male threshold 10) and push (dips, male threshold 15)
// have DIFFERENT rep thresholds — a single shared `reps` value can pass
// one and fail the other. Separate values avoid that whole class of
// fixture mistake.
function fit(level: number, pullReps: number, pushReps: number, timeSeconds: number) {
  return { pull: { level, reps: pullReps }, push: { level, reps: pushReps }, run: timeSeconds };
}
// Comfortably clears every threshold in CONFIG (run<=1080, pullups>=10, dips>=15).
function passingFit() { return fit(11, 12, 16, 1000); }
// Fails every component (run too slow, reps too low on both).
function failingFit() { return fit(11, 5, 5, 1300); }

function setFixture(key: string, uid: string, fixture: ReturnType<typeof fit> | null) {
  if (!strengthByAsOf.has(key)) strengthByAsOf.set(key, {});
  if (!runByAsOf.has(key)) runByAsOf.set(key, {});
  if (fixture === null) {
    strengthByAsOf.get(key)![uid] = { pull: { level: null, reps: null }, push: { level: null, reps: null } };
    runByAsOf.get(key)![uid] = { normalizedTimeSeconds: null };
    return;
  }
  strengthByAsOf.get(key)![uid] = { pull: { level: fixture.pull.level, reps: fixture.pull.reps }, push: { level: fixture.push.level, reps: fixture.push.reps } };
  runByAsOf.get(key)![uid] = { normalizedTimeSeconds: fixture.run };
}

// Each test seeds only its own uniquely-named uid via setFixture — uid
// namespacing per test avoids cross-test bleed without needing a shared
// beforeEach/afterEach to clear the fixture maps.
describe('computeTrainingWeeklyShift', () => {
  it('zero linked soldiers — determinableCount 0, every bucket 0 (no training data yet, not a false transition)', async () => {
    const db = makeFakeDb([]);
    const result = await computeTrainingWeeklyShift(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body).toEqual({ becameFitCount: 0, nearThresholdCount: 0, stayedFitCount: 0, droppedCount: 0, determinableCount: 0 });
  });

  it('no thresholds config at all — same empty result, not a throw', async () => {
    const db = makeFakeDb([{ id: 's1', uid: 'u-no-config', gender: 'male', tenantId: 'tenant-1', unitId: 'unit-1' }], null);
    const result = await computeTrainingWeeklyShift(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.determinableCount).toBe(0);
  });

  it('prior fail, now pass — becameFitCount (the "no baseline" exclusion does not apply here, both points are determinable)', async () => {
    const uid = 'u-became-fit';
    setFixture(WEEK_AGO_KEY, uid, failingFit());
    setFixture(NOW_KEY, uid, passingFit());
    const db = makeFakeDb([{ id: 's1', uid, gender: 'male', tenantId: 'tenant-1', unitId: 'unit-1' }]);
    const result = await computeTrainingWeeklyShift(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body).toEqual({ becameFitCount: 1, nearThresholdCount: 0, stayedFitCount: 0, droppedCount: 0, determinableCount: 1 });
  });

  it('prior pass, now pass — stayedFitCount, not becameFitCount', async () => {
    const uid = 'u-stayed-fit';
    setFixture(WEEK_AGO_KEY, uid, passingFit());
    setFixture(NOW_KEY, uid, passingFit());
    const db = makeFakeDb([{ id: 's1', uid, gender: 'male', tenantId: 'tenant-1', unitId: 'unit-1' }]);
    const result = await computeTrainingWeeklyShift(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.stayedFitCount).toBe(1);
    expect(result.body.becameFitCount).toBe(0);
  });

  it('prior pass, now fail — droppedCount', async () => {
    const uid = 'u-dropped';
    setFixture(WEEK_AGO_KEY, uid, passingFit());
    setFixture(NOW_KEY, uid, fit(11, 3, 3, 1000)); // pullups/dips reps collapsed below both thresholds
    const db = makeFakeDb([{ id: 's1', uid, gender: 'male', tenantId: 'tenant-1', unitId: 'unit-1' }]);
    const result = await computeTrainingWeeklyShift(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.droppedCount).toBe(1);
  });

  it('prior fail, now fail, close on every failed component (pullups 1 rep below threshold, push/run both pass) — nearThresholdCount', async () => {
    const uid = 'u-near';
    setFixture(WEEK_AGO_KEY, uid, fit(11, 9, 16, 1000)); // fails only pullups (9 < 10 male threshold)
    setFixture(NOW_KEY, uid, fit(11, 9, 16, 1000)); // still 1 rep short — within the default 1-rep tolerance
    const db = makeFakeDb([{ id: 's1', uid, gender: 'male', tenantId: 'tenant-1', unitId: 'unit-1' }]);
    const result = await computeTrainingWeeklyShift(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.nearThresholdCount).toBe(1);
    expect(result.body.determinableCount).toBe(1);
  });

  it('prior fail, now fail, NOT close (pullups far below threshold, push/run both pass) — excluded from nearThresholdCount, still counted in determinableCount', async () => {
    const uid = 'u-far';
    setFixture(WEEK_AGO_KEY, uid, fit(11, 2, 16, 1000));
    setFixture(NOW_KEY, uid, fit(11, 2, 16, 1000)); // 8 reps short of the 10-rep pullups threshold — far outside the 1-rep tolerance
    const db = makeFakeDb([{ id: 's1', uid, gender: 'male', tenantId: 'tenant-1', unitId: 'unit-1' }]);
    const result = await computeTrainingWeeklyShift(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.nearThresholdCount).toBe(0);
    expect(result.body.determinableCount).toBe(1);
  });

  it('a failure that is a LEVEL gap (below MIN_QUALIFYING_LEVEL), not a reps gap — never counted as near-threshold even with a tiny numeric rep difference', async () => {
    const uid = 'u-level-gap';
    // level 9 < MIN_QUALIFYING_LEVEL.pull (11) AND < MIN_QUALIFYING_LEVEL.push (10) — strengthMeetsStatus fails on level alone for both, reps is irrelevant.
    setFixture(WEEK_AGO_KEY, uid, fit(9, 9, 9, 1000));
    setFixture(NOW_KEY, uid, fit(9, 9, 9, 1000));
    const db = makeFakeDb([{ id: 's1', uid, gender: 'male', tenantId: 'tenant-1', unitId: 'unit-1' }]);
    const result = await computeTrainingWeeklyShift(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.nearThresholdCount).toBe(0);
    expect(result.body.determinableCount).toBe(1); // still determinable (fail-fail), just not "near"
  });

  it('a soldier with no training evidence at all (not_yet_tested both times) is excluded entirely — determinableCount does not increment', async () => {
    const uid = 'u-no-evidence';
    setFixture(WEEK_AGO_KEY, uid, null);
    setFixture(NOW_KEY, uid, null);
    const db = makeFakeDb([{ id: 's1', uid, gender: 'male', tenantId: 'tenant-1', unitId: 'unit-1' }]);
    const result = await computeTrainingWeeklyShift(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body).toEqual({ becameFitCount: 0, nearThresholdCount: 0, stayedFitCount: 0, droppedCount: 0, determinableCount: 0 });
  });

  it('a soldier newly measurable this week (prior not_yet_tested, now pass) is excluded, NOT counted as "became fit" — no real baseline to compare against', async () => {
    const uid = 'u-newly-measurable';
    setFixture(WEEK_AGO_KEY, uid, null);
    setFixture(NOW_KEY, uid, passingFit());
    const db = makeFakeDb([{ id: 's1', uid, gender: 'male', tenantId: 'tenant-1', unitId: 'unit-1' }]);
    const result = await computeTrainingWeeklyShift(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.becameFitCount).toBe(0);
    expect(result.body.determinableCount).toBe(0);
  });

  it('a soldier with mergedInto is excluded, same as every other readiness aggregation', async () => {
    const uid = 'u-merged';
    setFixture(WEEK_AGO_KEY, uid, failingFit());
    setFixture(NOW_KEY, uid, passingFit());
    const db = makeFakeDb([{ id: 's1', uid, gender: 'male', tenantId: 'tenant-1', unitId: 'unit-1', mergedInto: 'other-soldier' }]);
    const result = await computeTrainingWeeklyShift(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.determinableCount).toBe(0);
  });

  it('a soldier outside the scoped unitIds (unitAdmin scope) is excluded', async () => {
    const uid = 'u-outside-scope';
    setFixture(WEEK_AGO_KEY, uid, failingFit());
    setFixture(NOW_KEY, uid, passingFit());
    const db = makeFakeDb([{ id: 's1', uid, gender: 'male', tenantId: 'tenant-1', unitId: 'unit-outside' }]);
    const scope: UnitPermissionScope = { kind: 'unitAdmin', tenantId: 'tenant-1', unitIds: ['unit-inside'] };
    const result = await computeTrainingWeeklyShift(db, scope, {});
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.determinableCount).toBe(0);
  });

  it('vertical scope without a tenantId query param — 400, matches computeBrigadeDashboard\'s own contract', async () => {
    const db = makeFakeDb([]);
    const scope: UnitPermissionScope = { kind: 'vertical', vertical: 'military', authorityIds: ['tenant-1'] };
    const result = await computeTrainingWeeklyShift(db, scope, {});
    expect(result.status).toBe(400);
  });

  // 07.10.2026 (range picker) — explicit priorAsOf/nowAsOf override the
  // default "now vs 7 days ago" pair, and a too-short gap between them
  // is rejected (400) rather than silently computed — each asOf point
  // is itself derived from a 30-day lookback window, so two points
  // closer together than MIN_GAP_DAYS would produce a technically-near-
  // zero delta for a reason that has nothing to do with real training
  // change.
  describe('custom priorAsOf/nowAsOf (range picker)', () => {
    it('explicit 30-day-apart points are used instead of the "now vs 7 days ago" default', async () => {
      const uid = 'u-custom-month';
      const nowAsOf = new Date();
      const priorAsOf = new Date(nowAsOf.getTime() - 30 * 24 * 60 * 60 * 1000);
      setFixture(keyFor(priorAsOf), uid, failingFit());
      setFixture(keyFor(nowAsOf), uid, passingFit());
      const db = makeFakeDb([{ id: 's1', uid, gender: 'male', tenantId: 'tenant-1', unitId: 'unit-1' }]);
      const result = await computeTrainingWeeklyShift(db, TENANT_OWNER_SCOPE, { priorAsOf, nowAsOf });
      expect(result.status).toBe(200);
      if (result.status !== 200) return;
      expect(result.body.becameFitCount).toBe(1);
    });

    it('a gap shorter than MIN_GAP_DAYS (e.g. 3 days) is rejected — 400, never a computed-but-caveated delta', async () => {
      const nowAsOf = new Date();
      const priorAsOf = new Date(nowAsOf.getTime() - 3 * 24 * 60 * 60 * 1000);
      const db = makeFakeDb([{ id: 's1', uid: 'u-irrelevant', gender: 'male', tenantId: 'tenant-1', unitId: 'unit-1' }]);
      const result = await computeTrainingWeeklyShift(db, TENANT_OWNER_SCOPE, { priorAsOf, nowAsOf });
      expect(result.status).toBe(400);
    });

    it('a gap of EXACTLY MIN_GAP_DAYS (7 days) is accepted — the floor is inclusive', async () => {
      const nowAsOf = new Date();
      const priorAsOf = new Date(nowAsOf.getTime() - 7 * 24 * 60 * 60 * 1000);
      const db = makeFakeDb([]);
      const result = await computeTrainingWeeklyShift(db, TENANT_OWNER_SCOPE, { priorAsOf, nowAsOf });
      expect(result.status).toBe(200);
    });

    it('nowAsOf before priorAsOf (reversed) is also rejected — a negative gap is still "too short"', async () => {
      const nowAsOf = new Date();
      const priorAsOf = new Date(nowAsOf.getTime() + 30 * 24 * 60 * 60 * 1000); // later than "now"
      const db = makeFakeDb([{ id: 's1', uid: 'u-irrelevant-2', gender: 'male', tenantId: 'tenant-1', unitId: 'unit-1' }]);
      const result = await computeTrainingWeeklyShift(db, TENANT_OWNER_SCOPE, { priorAsOf, nowAsOf });
      expect(result.status).toBe(400);
    });
  });
});
