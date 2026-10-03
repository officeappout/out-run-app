import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => { throw new Error('getAdminDb should never be called from compute*() functions — db is always injected'); },
}));

import { computeBrigadeDashboard } from '../readiness-dashboard.service';
import type { UnitPermissionScope } from '@/lib/unitPermissionScope';

interface FakeDoc { [key: string]: unknown }

function makeFakeDb(seed: {
  soldiers?: Record<string, FakeDoc>;
  results?: Record<string, FakeDoc>;
  thresholds?: Record<string, FakeDoc>;
  units?: Record<string, Record<string, FakeDoc>>; // units[tenantId][unitId]
}) {
  const stores: Record<string, Map<string, FakeDoc>> = {
    readiness_soldiers: new Map(Object.entries(seed.soldiers ?? {})),
    readiness_results: new Map(Object.entries(seed.results ?? {})),
    readiness_thresholds: new Map(Object.entries(seed.thresholds ?? {})),
  };
  const unitsByTenant: Record<string, Map<string, FakeDoc>> = {};
  for (const [tenantId, units] of Object.entries(seed.units ?? {})) {
    unitsByTenant[tenantId] = new Map(Object.entries(units));
  }

  function docSnap(collName: string, id: string) {
    const d = stores[collName]?.get(id);
    return { id, exists: d !== undefined, data: () => (d ? { ...d } : undefined) };
  }

  function collection(name: string): any {
    if (name === 'tenants') {
      return {
        doc: (tenantId: string) => ({
          collection: (sub: string) => {
            if (sub !== 'units') throw new Error(`unexpected subcollection: ${sub}`);
            const unitsMap = unitsByTenant[tenantId] ?? new Map();
            return {
              doc: (unitId: string) => ({ get: async () => { const u = unitsMap.get(unitId); return { id: unitId, exists: u !== undefined, data: () => u }; } }),
              get: async () => ({ docs: Array.from(unitsMap.entries()).map(([id, d]) => ({ id, data: () => ({ ...d }) })) }),
            };
          },
        }),
      };
    }
    const store = stores[name];
    if (!store) throw new Error(`unexpected collection: ${name}`);
    return {
      doc: (id: string) => ({ get: async () => docSnap(name, id) }),
      where: (field: string, op: string, value: unknown) => ({
        get: async () => {
          if (op !== '==') throw new Error(`unexpected op: ${op}`);
          const docs = Array.from(store.entries())
            .filter(([, d]) => d[field] === value)
            .map(([id, d]) => ({ id, data: () => ({ ...d }) }));
          return { docs, empty: docs.length === 0 };
        },
      }),
    };
  }

  return { collection } as any;
}

const UNIT_ADMIN_SCOPE: UnitPermissionScope = { kind: 'unitAdmin', tenantId: 'tenant-1', unitIds: ['battalion-1', 'company-1'] };
const TENANT_OWNER_SCOPE: UnitPermissionScope = { kind: 'tenantOwner', tenantId: 'tenant-1' };
const ROOT_SCOPE: UnitPermissionScope = { kind: 'root' };
const DENIED_SCOPE: UnitPermissionScope = { kind: 'denied' };
const UNKNOWN_SCOPE: UnitPermissionScope = { kind: 'unknown' };

const THRESHOLDS = {
  global: {
    id: 'global', version: 1, updatedBy: 'root', updatedAt: new Date(),
    tests: [
      { id: 'run_3000m', label: "ריצת 3,000 מ'", metric: 'time_seconds', unit: 'seconds', lowerIsBetter: true, threshold: { male: 1080, female: 1200 }, validityDays: 365 },
      { id: 'pullups', label: 'עליות מתח', metric: 'reps', unit: 'reps', lowerIsBetter: false, threshold: { male: 3, female: 3 }, validityDays: 365 },
    ],
  },
};

const THREE_TESTS = {
  global: {
    id: 'global', version: 1, updatedBy: 'root', updatedAt: new Date(),
    tests: [
      { id: 'run_3000m', label: "ריצת 3,000 מ'", metric: 'time_seconds', unit: 'seconds', lowerIsBetter: true, threshold: { male: 1080, female: 1200 }, validityDays: 365 },
      { id: 'pullups', label: 'עליות מתח', metric: 'reps', unit: 'reps', lowerIsBetter: false, threshold: { male: 3, female: 3 }, validityDays: 365 },
      { id: 'dips', label: 'מקבילים', metric: 'reps', unit: 'reps', lowerIsBetter: false, threshold: { male: 5, female: 5 }, validityDays: 365 },
    ],
  },
};

function resultDoc(soldierId: string, testId: string, outcome: 'pass' | 'fail', value: number): FakeDoc {
  const recent = new Date();
  return {
    soldierId, tenantId: 'tenant-1', unitId: 'battalion-1', testId, outcome, value,
    source: 'organized_test', recordedAt: recent, testDate: recent,
    thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 1, lowerIsBetter: false, validityDays: 365 },
  };
}

describe('computeBrigadeDashboard — scope resolution', () => {
  it('unknown scope → 503', async () => {
    const db = makeFakeDb({});
    const result = await computeBrigadeDashboard(db, UNKNOWN_SCOPE, {});
    expect(result.status).toBe(503);
  });

  it('denied scope → 403', async () => {
    const db = makeFakeDb({});
    const result = await computeBrigadeDashboard(db, DENIED_SCOPE, {});
    expect(result.status).toBe(403);
  });

  it('root without tenantId → 400', async () => {
    const db = makeFakeDb({});
    const result = await computeBrigadeDashboard(db, ROOT_SCOPE, {});
    expect(result.status).toBe(400);
  });

  it('unitAdmin only sees soldiers/units within their own scope.unitIds', async () => {
    const db = makeFakeDb({
      soldiers: {
        s1: { tenantId: 'tenant-1', unitId: 'battalion-1', gender: 'male', mergedInto: null },
        s2: { tenantId: 'tenant-1', unitId: 'OTHER-unit-outside-scope', gender: 'male', mergedInto: null },
      },
      units: { 'tenant-1': { 'battalion-1': { name: 'Battalion One' }, 'company-1': { name: 'Company One' }, 'OTHER-unit-outside-scope': { name: 'Not mine' } } },
    });
    const result = await computeBrigadeDashboard(db, UNIT_ADMIN_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.body.overall.totalCount).toBe(1);
      expect(result.body.units.map((u) => u.unitId).sort()).toEqual(['battalion-1', 'company-1']);
    }
  });
});

describe('computeBrigadeDashboard — point 1: not-yet-tested is a primary datum', () => {
  it('counts not_yet_tested and not_performed as SEPARATE buckets, never folded into pass/fail', async () => {
    const recent = new Date();
    const db = makeFakeDb({
      soldiers: {
        s1: { tenantId: 'tenant-1', unitId: 'battalion-1', gender: 'male', mergedInto: null }, // untested
        s2: { tenantId: 'tenant-1', unitId: 'battalion-1', gender: 'male', mergedInto: null }, // not_performed on run, no pullups result
      },
      thresholds: THRESHOLDS,
      results: {
        r1: { soldierId: 's2', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 'run_3000m', outcome: 'not_performed', notPerformedReason: 'medical_exemption', value: null, source: 'organized_test', recordedAt: recent, testDate: recent, thresholdSnapshot: null },
      },
      units: { 'tenant-1': { 'battalion-1': { name: 'Battalion One' } } },
    });
    const result = await computeBrigadeDashboard(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.body.overall.totalCount).toBe(2);
      expect(result.body.overall.notYetTestedCount).toBe(1);
      expect(result.body.overall.notPerformedCount).toBe(1);
      expect(result.body.overall.passCount).toBe(0);
      expect(result.body.overall.failCount).toBe(0);
    }
  });
});

describe('computeBrigadeDashboard — point 2: percentage denominator is TESTED soldiers, not total', () => {
  it('passPercent is computed over passCount+failCount, excluding not_yet_tested/not_performed from the denominator', async () => {
    const recent = new Date();
    // Single-test config deliberately — s1/s2 only need ONE component
    // each to get a genuine overall pass/fail; a multi-test config would
    // correctly force "not_yet_tested" for any soldier missing even one
    // component (the "all tests must pass" rule, already covered
    // elsewhere) — irrelevant noise for what THIS test is checking.
    const singleTestThresholds = {
      global: { id: 'global', version: 1, updatedBy: 'root', updatedAt: new Date(), tests: [THRESHOLDS.global.tests[0]] },
    };
    const db = makeFakeDb({
      soldiers: {
        s1: { tenantId: 'tenant-1', unitId: 'battalion-1', gender: 'male', mergedInto: null }, // passes
        s2: { tenantId: 'tenant-1', unitId: 'battalion-1', gender: 'male', mergedInto: null }, // fails
        s3: { tenantId: 'tenant-1', unitId: 'battalion-1', gender: 'male', mergedInto: null }, // never tested — must NOT dilute the percentage
      },
      thresholds: singleTestThresholds,
      results: {
        r1: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 'run_3000m', outcome: 'pass', value: 900, source: 'organized_test', recordedAt: recent, testDate: recent, thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 1080, lowerIsBetter: true, validityDays: 365 } },
        r2: { soldierId: 's2', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 'run_3000m', outcome: 'fail', value: 1200, source: 'organized_test', recordedAt: recent, testDate: recent, thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 1080, lowerIsBetter: true, validityDays: 365 } },
      },
      units: { 'tenant-1': { 'battalion-1': { name: 'Battalion One' } } },
    });
    const result = await computeBrigadeDashboard(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.body.overall.totalCount).toBe(3);
      expect(result.body.overall.testedCount).toBe(2); // NOT 3
      expect(result.body.overall.passPercent).toBe(50); // 1/2, not 1/3
    }
  });
});

describe('computeBrigadeDashboard — point 3: a unit with zero tested soldiers reports null, never 0%', () => {
  it('a real unit with zero readiness_soldiers records still appears as a row, with passPercent null', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', gender: 'male', mergedInto: null } },
      units: { 'tenant-1': { 'battalion-1': { name: 'Battalion One' }, 'empty-unit': { name: 'Empty Unit' } } },
    });
    const result = await computeBrigadeDashboard(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      const emptyRow = result.body.units.find((u) => u.unitId === 'empty-unit');
      expect(emptyRow).toBeDefined();
      expect(emptyRow!.totalCount).toBe(0);
      expect(emptyRow!.views.all.testedCount).toBe(0);
      expect(emptyRow!.views.all.passPercent).toBeNull();
    }
  });

  it('a unit with soldiers but none of them tested ALSO reports null, not 0%', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', gender: 'male', mergedInto: null } },
      units: { 'tenant-1': { 'battalion-1': { name: 'Battalion One' } } },
    });
    const result = await computeBrigadeDashboard(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      const row = result.body.units.find((u) => u.unitId === 'battalion-1')!;
      expect(row.totalCount).toBe(1);
      expect(row.views.all.testedCount).toBe(0);
      expect(row.views.all.passPercent).toBeNull(); // not 0
    }
  });
});

describe('computeBrigadeDashboard — point 4: every unit carries its own last-test date', () => {
  it('lastTestDate is the most recent testDate among the unit\'s organized_test results', async () => {
    const older = new Date('2026-01-01');
    const newer = new Date('2026-09-01');
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', gender: 'male', mergedInto: null } },
      thresholds: THRESHOLDS,
      results: {
        r1: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 'run_3000m', outcome: 'pass', value: 900, source: 'organized_test', recordedAt: older, testDate: older, thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 1080, lowerIsBetter: true, validityDays: 365 } },
        r2: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 'pullups', outcome: 'pass', value: 5, source: 'organized_test', recordedAt: newer, testDate: newer, thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 3, lowerIsBetter: false, validityDays: 365 } },
      },
      units: { 'tenant-1': { 'battalion-1': { name: 'Battalion One' } } },
    });
    const result = await computeBrigadeDashboard(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      const row = result.body.units.find((u) => u.unitId === 'battalion-1')!;
      expect(row.lastTestDate).toBe(newer.toISOString());
    }
  });

  it('a unit with no results at all has lastTestDate: null', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', gender: 'male', mergedInto: null } },
      units: { 'tenant-1': { 'battalion-1': { name: 'Battalion One' } } },
    });
    const result = await computeBrigadeDashboard(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.units[0].lastTestDate).toBeNull();
  });
});

describe('computeBrigadeDashboard — point 5: only organized_test counts here', () => {
  it('an app_measurement or self_report result is excluded from every count on this screen', async () => {
    const recent = new Date();
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', gender: 'male', mergedInto: null } },
      thresholds: THRESHOLDS,
      results: {
        r1: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 'run_3000m', outcome: 'pass', value: 900, source: 'app_measurement', recordedAt: recent, testDate: recent, thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 1080, lowerIsBetter: true, validityDays: 365 } },
        r2: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 'pullups', outcome: 'pass', value: 5, source: 'self_report', recordedAt: recent, testDate: recent, thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 3, lowerIsBetter: false, validityDays: 365 } },
      },
      units: { 'tenant-1': { 'battalion-1': { name: 'Battalion One' } } },
    });
    const result = await computeBrigadeDashboard(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.body.overall.testedCount).toBe(0);
      expect(result.body.overall.notYetTestedCount).toBe(1);
      expect(result.body.overall.passCount).toBe(0);
      expect(result.body.units[0].lastTestDate).toBeNull(); // not organized_test -> doesn't count as "last update" either
    }
  });

  it('a mix of organized_test (counted) and self_report (excluded) for the SAME soldier only counts the organized_test one', async () => {
    const recent = new Date();
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', gender: 'male', mergedInto: null } },
      thresholds: THRESHOLDS,
      results: {
        r1: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 'run_3000m', outcome: 'pass', value: 900, source: 'organized_test', recordedAt: recent, testDate: recent, thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 1080, lowerIsBetter: true, validityDays: 365 } },
        r2: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 'pullups', outcome: 'fail', value: 1, source: 'self_report', recordedAt: recent, testDate: recent, thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 3, lowerIsBetter: false, validityDays: 365 } },
      },
      units: { 'tenant-1': { 'battalion-1': { name: 'Battalion One' } } },
    });
    const result = await computeBrigadeDashboard(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      // run_3000m (organized_test, pass) counts; pullups has no
      // organized_test result at all, so overall must be not_yet_tested
      // (missing a required component), never "pass" from run alone.
      expect(result.body.overall.notYetTestedCount).toBe(1);
      expect(result.body.overall.passCount).toBe(0);
      const runComponent = result.body.components.find((c) => c.testId === 'run_3000m')!;
      expect(runComponent.testedCount).toBe(1);
      expect(runComponent.passCount).toBe(1);
      const pullupsComponent = result.body.components.find((c) => c.testId === 'pullups')!;
      expect(pullupsComponent.testedCount).toBe(0);
    }
  });
});

describe('computeBrigadeDashboard — unit views (03.10.2026, table filter round: הכל/ריצה/כוח)', () => {
  it('"strength" view requires BOTH pullups and dips to pass — one failure is enough, never an average of the two percentages', async () => {
    const db = makeFakeDb({
      soldiers: {
        s1: { tenantId: 'tenant-1', unitId: 'battalion-1', gender: 'male', mergedInto: null }, // passes both
        s2: { tenantId: 'tenant-1', unitId: 'battalion-1', gender: 'male', mergedInto: null }, // passes pullups, fails dips
      },
      thresholds: THREE_TESTS,
      results: {
        s1p: resultDoc('s1', 'pullups', 'pass', 5),
        s1d: resultDoc('s1', 'dips', 'pass', 6),
        s2p: resultDoc('s2', 'pullups', 'pass', 5),
        s2d: resultDoc('s2', 'dips', 'fail', 2),
      },
      units: { 'tenant-1': { 'battalion-1': { name: 'Battalion One' } } },
    });
    const result = await computeBrigadeDashboard(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      const row = result.body.units.find((u) => u.unitId === 'battalion-1')!;
      expect(row.views.strength.passCount).toBe(1);
      expect(row.views.strength.failCount).toBe(1);
      // Pullups alone would be 100%, dips alone 50% — an averaged "75%"
      // would be the exact wrong-shape bug §13.68 already caught once.
      expect(row.views.strength.passPercent).toBe(50);
    }
  });

  it('"run" view reads run_3000m alone, independent of the soldier\'s strength results', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', gender: 'male', mergedInto: null } }, // passes run, fails dips
      thresholds: THREE_TESTS,
      results: {
        s1r: resultDoc('s1', 'run_3000m', 'pass', 900),
        s1p: resultDoc('s1', 'pullups', 'pass', 5),
        s1d: resultDoc('s1', 'dips', 'fail', 1),
      },
      units: { 'tenant-1': { 'battalion-1': { name: 'Battalion One' } } },
    });
    const result = await computeBrigadeDashboard(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      const row = result.body.units.find((u) => u.unitId === 'battalion-1')!;
      expect(row.views.run.passPercent).toBe(100); // run alone passes
      expect(row.views.all.failCount).toBe(1); // but overall fails (dips failed, all-must-pass)
    }
  });

  it('a soldier missing one of the two strength tests resolves to not_yet_tested under "strength" — never a lone-test pass', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', gender: 'male', mergedInto: null } }, // only pullups tested, no dips result at all
      thresholds: THREE_TESTS,
      results: { s1p: resultDoc('s1', 'pullups', 'pass', 5) },
      units: { 'tenant-1': { 'battalion-1': { name: 'Battalion One' } } },
    });
    const result = await computeBrigadeDashboard(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      const row = result.body.units.find((u) => u.unitId === 'battalion-1')!;
      expect(row.views.strength.passCount).toBe(0);
      expect(row.views.strength.failCount).toBe(0);
      expect(row.views.strength.notYetTestedCount).toBe(1);
    }
  });

  it('"all", "run" and "strength" are independent per-unit counters that can disagree for the same unit at once', async () => {
    const db = makeFakeDb({
      soldiers: {
        s1: { tenantId: 'tenant-1', unitId: 'battalion-1', gender: 'male', mergedInto: null }, // passes everything
        s2: { tenantId: 'tenant-1', unitId: 'battalion-1', gender: 'male', mergedInto: null }, // fails run, passes strength
      },
      thresholds: THREE_TESTS,
      results: {
        s1r: resultDoc('s1', 'run_3000m', 'pass', 900),
        s1p: resultDoc('s1', 'pullups', 'pass', 5),
        s1d: resultDoc('s1', 'dips', 'pass', 6),
        s2r: resultDoc('s2', 'run_3000m', 'fail', 1300),
        s2p: resultDoc('s2', 'pullups', 'pass', 5),
        s2d: resultDoc('s2', 'dips', 'pass', 6),
      },
      units: { 'tenant-1': { 'battalion-1': { name: 'Battalion One' } } },
    });
    const result = await computeBrigadeDashboard(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      const row = result.body.units.find((u) => u.unitId === 'battalion-1')!;
      expect(row.views.all.passPercent).toBe(50); // s1 pass, s2 fail (run fails -> overall fail)
      expect(row.views.run.passPercent).toBe(50); // s1 pass, s2 fail
      expect(row.views.strength.passPercent).toBe(100); // both pass strength
    }
  });

  it('rule 3 unchanged under every view: a unit where nobody has any result at all reports null for all three views, never 0%', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', gender: 'male', mergedInto: null } },
      thresholds: THREE_TESTS,
      units: { 'tenant-1': { 'battalion-1': { name: 'Battalion One' } } },
    });
    const result = await computeBrigadeDashboard(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      const row = result.body.units.find((u) => u.unitId === 'battalion-1')!;
      expect(row.views.all.passPercent).toBeNull();
      expect(row.views.run.passPercent).toBeNull();
      expect(row.views.strength.passPercent).toBeNull();
    }
  });
});

describe('computeBrigadeDashboard — components breakdown', () => {
  it('reports one entry per configured test with its own threshold values', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', gender: 'male', mergedInto: null } },
      thresholds: THRESHOLDS,
      units: { 'tenant-1': { 'battalion-1': {} } },
    });
    const result = await computeBrigadeDashboard(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.body.components.map((c) => c.testId)).toEqual(['run_3000m', 'pullups']);
      expect(result.body.components[0].thresholdMale).toBe(1080);
      expect(result.body.components[1].thresholdFemale).toBe(3);
    }
  });
});
