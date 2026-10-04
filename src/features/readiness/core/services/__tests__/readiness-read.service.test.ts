import { describe, it, expect, vi } from 'vitest';

// Same reason as readiness-write.service.test.ts: @/lib/unitPermissionScope
// imports @/lib/firebase-admin at the top level ('server-only' guard) even
// though computeUnitRoster never calls getAdminDb() itself.
vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => { throw new Error('getAdminDb should never be called from compute*() functions — db is always injected'); },
}));

import { computeUnitRoster } from '../readiness-read.service';
import type { UnitPermissionScope } from '@/lib/unitPermissionScope';

interface FakeDoc { [key: string]: unknown }

function makeFakeDb(seed: {
  soldiers?: Record<string, FakeDoc>;
  results?: Record<string, FakeDoc>;
  thresholds?: Record<string, FakeDoc>;
  users?: Record<string, FakeDoc>;
  units?: Record<string, Record<string, FakeDoc>>; // units[tenantId][unitId]
}) {
  const stores: Record<string, Map<string, FakeDoc>> = {
    readiness_soldiers: new Map(Object.entries(seed.soldiers ?? {})),
    readiness_results: new Map(Object.entries(seed.results ?? {})),
    readiness_thresholds: new Map(Object.entries(seed.thresholds ?? {})),
    users: new Map(Object.entries(seed.users ?? {})),
  };
  const unitsByTenant: Record<string, Map<string, FakeDoc>> = {};
  for (const [tenantId, units] of Object.entries(seed.units ?? {})) {
    unitsByTenant[tenantId] = new Map(Object.entries(units));
  }

  function docSnap(collName: string, id: string) {
    const d = stores[collName]?.get(id);
    return { id, exists: d !== undefined, data: () => (d ? { ...d } : undefined) };
  }

  function getByDotPath(obj: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
      return undefined;
    }, obj);
  }

  function collection(name: string): any {
    if (name === 'tenants') {
      return {
        doc: (tenantId: string) => ({
          collection: (sub: string) => {
            if (sub !== 'units') throw new Error(`unexpected subcollection: ${sub}`);
            const unitsMap = unitsByTenant[tenantId] ?? new Map();
            return {
              doc: (unitId: string) => ({
                get: async () => {
                  const u = unitsMap.get(unitId);
                  return { id: unitId, exists: u !== undefined, data: () => u };
                },
              }),
              get: async () => ({
                docs: Array.from(unitsMap.entries()).map(([id, d]) => ({ id, data: () => ({ ...d }) })),
              }),
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
            .filter(([, d]) => getByDotPath(d, field) === value)
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

describe('computeUnitRoster — units (addressable targets for add-soldier)', () => {
  it('unitAdmin gets real unit docs for exactly their own scope.unitIds, name-resolved', async () => {
    const db = makeFakeDb({
      units: { 'tenant-1': { 'battalion-1': { name: 'Battalion One' }, 'company-1': { name: 'Company One' }, 'OTHER-unit': { name: 'Not In Scope' } } },
    });
    const result = await computeUnitRoster(db, UNIT_ADMIN_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.body.units.map((u) => u.id).sort()).toEqual(['battalion-1', 'company-1']);
      expect(result.body.units.find((u) => u.id === 'battalion-1')?.name).toBe('Battalion One');
    }
  });

  it('tenantOwner gets every real unit under their tenant', async () => {
    const db = makeFakeDb({
      units: { 'tenant-1': { a: { name: 'A' }, b: { name: 'B' } } },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.units.map((u) => u.id).sort()).toEqual(['a', 'b']);
  });
});

describe('computeUnitRoster — scope resolution', () => {
  it('unknown scope → 503', async () => {
    const db = makeFakeDb({});
    const result = await computeUnitRoster(db, UNKNOWN_SCOPE, {});
    expect(result.status).toBe(503);
  });

  it('denied scope → 403', async () => {
    const db = makeFakeDb({});
    const result = await computeUnitRoster(db, DENIED_SCOPE, {});
    expect(result.status).toBe(403);
  });

  it('root without tenantId → 400', async () => {
    const db = makeFakeDb({});
    const result = await computeUnitRoster(db, ROOT_SCOPE, {});
    expect(result.status).toBe(400);
  });

  it('unitAdmin sees soldiers across ALL units in their scope.unitIds, combined — no per-unit filter needed', async () => {
    const db = makeFakeDb({
      soldiers: {
        s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Aaa', gender: 'male', uid: null, mergedInto: null },
        s2: { tenantId: 'tenant-1', unitId: 'company-1', name: 'Bbb', gender: 'female', uid: null, mergedInto: null },
        s3: { tenantId: 'tenant-1', unitId: 'OTHER-unit', name: 'Ccc', gender: 'male', uid: null, mergedInto: null },
      },
    });
    const result = await computeUnitRoster(db, UNIT_ADMIN_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      const ids = result.body.soldiers.map((s) => s.id);
      expect(ids).toContain('s1');
      expect(ids).toContain('s2');
      expect(ids).not.toContain('s3');
    }
  });

  it('tenantOwner sees every unit under their tenant with no unitIds restriction', async () => {
    const db = makeFakeDb({
      soldiers: {
        s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Aaa', gender: 'male', uid: null, mergedInto: null },
        s2: { tenantId: 'tenant-1', unitId: 'some-other-battalion-not-in-unitadmin-scope', name: 'Bbb', gender: 'female', uid: null, mergedInto: null },
      },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.soldiers.map((s) => s.id).sort()).toEqual(['s1', 's2']);
  });

  it('a soldier from a different tenant never appears, regardless of scope', async () => {
    const db = makeFakeDb({
      soldiers: {
        s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Aaa', gender: 'male', uid: null, mergedInto: null },
        other: { tenantId: 'OTHER-tenant', unitId: 'battalion-1', name: 'Zzz', gender: 'male', uid: null, mergedInto: null },
      },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.soldiers.map((s) => s.id)).toEqual(['s1']);
  });

  it('a merged-away soldier record never appears in the roster', async () => {
    const db = makeFakeDb({
      soldiers: {
        s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Aaa', gender: 'male', uid: null, mergedInto: 'survivor-1' },
      },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.soldiers).toEqual([]);
  });

  it('soldiers are sorted alphabetically by name', async () => {
    const db = makeFakeDb({
      soldiers: {
        s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'זאב', gender: 'male', uid: null, mergedInto: null },
        s2: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'אבי', gender: 'male', uid: null, mergedInto: null },
      },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.soldiers.map((s) => s.name)).toEqual(['אבי', 'זאב']);
  });

  it("each soldier entry carries its own real unitId (03.10.2026 — the results-entry screen filters by this)", async () => {
    const db = makeFakeDb({
      soldiers: {
        s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Aaa', gender: 'male', uid: null, mergedInto: null },
        s2: { tenantId: 'tenant-1', unitId: 'company-1', name: 'Bbb', gender: 'male', uid: null, mergedInto: null },
      },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      const byId = Object.fromEntries(result.body.soldiers.map((s) => [s.id, s.unitId]));
      expect(byId.s1).toBe('battalion-1');
      expect(byId.s2).toBe('company-1');
    }
  });
});

describe('computeUnitRoster — currentStatus derivation', () => {
  it('no global thresholds config exists → currentStatus is null for every soldier (not "not_yet_tested")', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Aaa', gender: 'male', uid: null, mergedInto: null } },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.soldiers[0].currentStatus).toBeNull();
  });

  it('a configured test with no results for this soldier → not_yet_tested', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Aaa', gender: 'male', uid: null, mergedInto: null } },
      thresholds: { global: { id: 'global', version: 1, tests: [{ id: 't1' }] } },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.soldiers[0].currentStatus).toBe('not_yet_tested');
  });

  it('any failing test wins the overall status, even if another test passed', async () => {
    const recent = new Date();
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Aaa', gender: 'male', uid: null, mergedInto: null } },
      thresholds: { global: { id: 'global', version: 1, tests: [{ id: 't1' }, { id: 't2' }] } },
      results: {
        r1: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 't1', outcome: 'pass', recordedAt: recent, testDate: recent, thresholdSnapshot: { validityDays: 365 } },
        r2: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 't2', outcome: 'fail', recordedAt: recent, testDate: recent, thresholdSnapshot: { validityDays: 365 } },
      },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.soldiers[0].currentStatus).toBe('fail');
  });

  it('results from a soldier outside scope never leak into another soldier\'s status (grouped correctly by soldierId)', async () => {
    const recent = new Date();
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Aaa', gender: 'male', uid: null, mergedInto: null } },
      thresholds: { global: { id: 'global', version: 1, tests: [{ id: 't1' }] } },
      results: {
        r1: { soldierId: 'SOME-OTHER-soldier', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 't1', outcome: 'fail', recordedAt: recent, testDate: recent, thresholdSnapshot: { validityDays: 365 } },
      },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.soldiers[0].currentStatus).toBe('not_yet_tested');
  });

  it('David\'s locked doctrine, 02.10.2026: pass requires ALL tests passing — one test passed + one never attempted is NOT overall "pass"', async () => {
    const recent = new Date();
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Aaa', gender: 'male', uid: null, mergedInto: null } },
      thresholds: { global: { id: 'global', version: 1, tests: [{ id: 't1' }, { id: 't2' }] } },
      results: {
        r1: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 't1', outcome: 'pass', recordedAt: recent, testDate: recent, thresholdSnapshot: { validityDays: 365 } },
        // t2 has no result at all — this is exactly the bug the old "any pass -> pass" policy would have gotten wrong.
      },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.soldiers[0].currentStatus).toBe('not_yet_tested');
  });

  it('overall "pass" only when EVERY configured test currently reads pass', async () => {
    const recent = new Date();
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Aaa', gender: 'male', uid: null, mergedInto: null } },
      thresholds: { global: { id: 'global', version: 1, tests: [{ id: 't1' }, { id: 't2' }] } },
      results: {
        r1: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 't1', outcome: 'pass', recordedAt: recent, testDate: recent, thresholdSnapshot: { validityDays: 365 } },
        r2: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 't2', outcome: 'pass', recordedAt: recent, testDate: recent, thresholdSnapshot: { validityDays: 365 } },
      },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.soldiers[0].currentStatus).toBe('pass');
  });

  it('"not_performed" is distinct from "not_yet_tested" and carries its reason (point 1, 02.10.2026 — never conflate the two)', async () => {
    const recent = new Date();
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Aaa', gender: 'male', uid: null, mergedInto: null } },
      thresholds: { global: { id: 'global', version: 1, tests: [{ id: 't1' }] } },
      results: {
        r1: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 't1', outcome: 'not_performed', notPerformedReason: 'medical_exemption', recordedAt: recent, testDate: recent, thresholdSnapshot: { validityDays: 365 } },
      },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.body.soldiers[0].currentStatus).toBe('not_performed');
      expect(result.body.soldiers[0].notPerformedReason).toBe('medical_exemption');
    }
  });

  it('notPerformedReason stays null for a plain not_yet_tested soldier (no result at all)', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Aaa', gender: 'male', uid: null, mergedInto: null } },
      thresholds: { global: { id: 'global', version: 1, tests: [{ id: 't1' }] } },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.soldiers[0].notPerformedReason).toBeNull();
  });

  it('not_performed on one test beats a pass on another (no fail present) — matches the priority order, not just "any pass"', async () => {
    const recent = new Date();
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Aaa', gender: 'male', uid: null, mergedInto: null } },
      thresholds: { global: { id: 'global', version: 1, tests: [{ id: 't1' }, { id: 't2' }] } },
      results: {
        r1: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 't1', outcome: 'pass', recordedAt: recent, testDate: recent, thresholdSnapshot: { validityDays: 365 } },
        r2: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 't2', outcome: 'not_performed', notPerformedReason: 'no_show', recordedAt: recent, testDate: recent, thresholdSnapshot: { validityDays: 365 } },
      },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.body.soldiers[0].currentStatus).toBe('not_performed');
      expect(result.body.soldiers[0].notPerformedReason).toBe('no_show');
    }
  });
});

describe('computeUnitRoster — testDetails (03.10.2026, David\'s live-test finding: no verdict without the evidence behind it)', () => {
  it('the exact production scenario: one genuinely-failing component (value below threshold) correctly produces overall fail, AND testDetails shows the real value/threshold/date that caused it — not a stale-data bug, a missing-evidence problem', async () => {
    const recent = new Date();
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Aaa', gender: 'male', uid: null, mergedInto: null } },
      thresholds: {
        global: {
          id: 'global', version: 1,
          tests: [
            { id: 'run_3000m', lowerIsBetter: true, threshold: { male: 1080, female: 1200 } },
            { id: 'pullups', lowerIsBetter: false, threshold: { male: 3, female: 3 } },
            { id: 'dips', lowerIsBetter: false, threshold: { male: 5, female: 5 } },
          ],
        },
      },
      results: {
        r1: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 'run_3000m', outcome: 'pass', value: 900, recordedAt: recent, testDate: recent, thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 1080, lowerIsBetter: true, validityDays: 365 } },
        r2: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 'pullups', outcome: 'pass', value: 5, recordedAt: recent, testDate: recent, thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 3, lowerIsBetter: false, validityDays: 365 } },
        // dips genuinely fails — 4 reps does not meet a 5-rep threshold.
        r3: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 'dips', outcome: 'fail', value: 4, recordedAt: recent, testDate: recent, thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 5, lowerIsBetter: false, validityDays: 365 } },
      },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    const soldier = result.body.soldiers[0];
    expect(soldier.currentStatus).toBe('fail');

    // The evidence the UI needs to explain WHY, without guessing:
    const byTestId = Object.fromEntries(soldier.testDetails.map((t) => [t.testId, t]));
    expect(byTestId.run_3000m.status).toBe('pass');
    expect(byTestId.pullups.status).toBe('pass');
    expect(byTestId.dips.status).toBe('fail');
    expect(byTestId.dips.value).toBe(4);
    expect(byTestId.dips.thresholdValue).toBe(5);
    expect(byTestId.dips.lowerIsBetter).toBe(false);
    expect(byTestId.dips.testDate).toBe(recent.toISOString());

    // The UI can identify exactly which test(s) caused the overall fail:
    const culprits = soldier.testDetails.filter((t) => t.status === 'fail').map((t) => t.testId);
    expect(culprits).toEqual(['dips']);
  });

  it('an untested component still shows the live threshold (so "what do I need to beat" is visible even with no result yet) but null value/testDate', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Aaa', gender: 'female', uid: null, mergedInto: null } },
      thresholds: { global: { id: 'global', version: 1, tests: [{ id: 't1', lowerIsBetter: true, threshold: { male: 1080, female: 1200 } }] } },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      const detail = result.body.soldiers[0].testDetails[0];
      expect(detail.status).toBe('not_yet_tested');
      expect(detail.value).toBeNull();
      expect(detail.testDate).toBeNull();
      expect(detail.thresholdValue).toBe(1200); // her gender's threshold, shown even though untested
    }
  });

  it('testDetails carries one entry per configured test, in the same order as the global config', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Aaa', gender: 'male', uid: null, mergedInto: null } },
      thresholds: { global: { id: 'global', version: 1, tests: [{ id: 'run_3000m' }, { id: 'pullups' }, { id: 'dips' }] } },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.soldiers[0].testDetails.map((t) => t.testId)).toEqual(['run_3000m', 'pullups', 'dips']);
  });
});

describe('computeUnitRoster — nearThreshold (04.10.2026, §13.85, "קרובים לרף")', () => {
  it('"כשיר" (pass) never gets a near-threshold tag — already passed, nothing to be "close" to', async () => {
    const recent = new Date();
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Aaa', gender: 'male', uid: null, mergedInto: null } },
      thresholds: { global: { id: 'global', version: 1, tests: [{ id: 'run_3000m', label: 'ריצה', unit: 'seconds', lowerIsBetter: true, threshold: { male: 1080, female: 1200 } }] } },
      results: {
        r1: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 'run_3000m', outcome: 'pass', value: 900, recordedAt: recent, testDate: recent, thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 1080, lowerIsBetter: true, validityDays: 365 } },
      },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.soldiers[0].nearThreshold).toEqual({ isNear: false, note: null });
  });

  it('"טרם נבדק" (no result at all) never gets a near-threshold tag — no data, no distance', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Aaa', gender: 'male', uid: null, mergedInto: null } },
      thresholds: { global: { id: 'global', version: 1, tests: [{ id: 'run_3000m', label: 'ריצה', unit: 'seconds', lowerIsBetter: true, threshold: { male: 1080, female: 1200 } }] } },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.soldiers[0].nearThreshold).toEqual({ isNear: false, note: null });
  });

  it('"לא כשיר" (fail) by 30s against a 60s default tolerance → near-threshold tag with the real distance', async () => {
    const recent = new Date();
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Aaa', gender: 'male', uid: null, mergedInto: null } },
      thresholds: { global: { id: 'global', version: 1, tests: [{ id: 'run_3000m', label: 'ריצה', unit: 'seconds', lowerIsBetter: true, threshold: { male: 1080, female: 1200 } }] } },
      results: {
        r1: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 'run_3000m', outcome: 'fail', value: 1110, recordedAt: recent, testDate: recent, thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 1080, lowerIsBetter: true, validityDays: 365 } },
      },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.body.soldiers[0].nearThreshold.isNear).toBe(true);
      expect(result.body.soldiers[0].nearThreshold.note).toBe('ריצה · 30 שניות מהסף');
    }
  });

  it('"לא כשיר" far from the threshold (4 minutes over) → no near-threshold tag', async () => {
    const recent = new Date();
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Aaa', gender: 'male', uid: null, mergedInto: null } },
      thresholds: { global: { id: 'global', version: 1, tests: [{ id: 'run_3000m', label: 'ריצה', unit: 'seconds', lowerIsBetter: true, threshold: { male: 1080, female: 1200 } }] } },
      results: {
        r1: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 'run_3000m', outcome: 'fail', value: 1080 + 240, recordedAt: recent, testDate: recent, thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 1080, lowerIsBetter: true, validityDays: 365 } },
      },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.soldiers[0].nearThreshold).toEqual({ isNear: false, note: null });
  });

  it('failed on two components, close on only one → NOT near (David\'s locked "all failed components must be close" rule)', async () => {
    const recent = new Date();
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Aaa', gender: 'male', uid: null, mergedInto: null } },
      thresholds: {
        global: {
          id: 'global', version: 1,
          tests: [
            { id: 'run_3000m', label: 'ריצה', unit: 'seconds', lowerIsBetter: true, threshold: { male: 1080, female: 1200 } },
            { id: 'pullups', label: 'עליות מתח', unit: 'reps', lowerIsBetter: false, threshold: { male: 3, female: 3 } },
          ],
        },
      },
      results: {
        // run: close (30s over a 60s tolerance)
        r1: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 'run_3000m', outcome: 'fail', value: 1110, recordedAt: recent, testDate: recent, thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 1080, lowerIsBetter: true, validityDays: 365 } },
        // pullups: far (3 reps short of a 1-rep tolerance)
        r2: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 'pullups', outcome: 'fail', value: 0, recordedAt: recent, testDate: recent, thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 3, lowerIsBetter: false, validityDays: 365 } },
      },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.soldiers[0].nearThreshold).toEqual({ isNear: false, note: null });
  });
});

describe('computeUnitRoster — pending-link candidates', () => {
  it('self-declared AND officer-approved AND unlinked → appears as pending', async () => {
    const db = makeFakeDb({
      users: { u1: { core: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Pending Person', unitMembershipSource: 'self_declared', unitApprovedByOfficer: true } } },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.pending.map((p) => p.uid)).toEqual(['u1']);
  });

  it('pending entries carry gender from core.gender when clean male/female, null when other/missing (feeds the add-modal auto-fill)', async () => {
    const db = makeFakeDb({
      users: {
        u1: { core: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'A', unitMembershipSource: 'self_declared', unitApprovedByOfficer: true, gender: 'female' } },
        u2: { core: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'B', unitMembershipSource: 'self_declared', unitApprovedByOfficer: true, gender: 'other' } },
        u3: { core: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'C', unitMembershipSource: 'self_declared', unitApprovedByOfficer: true } },
      },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      const byUid = Object.fromEntries(result.body.pending.map((p) => [p.uid, p.gender]));
      expect(byUid.u1).toBe('female');
      expect(byUid.u2).toBeNull();
      expect(byUid.u3).toBeNull();
    }
  });

  it('self-declared but NOT YET approved by an officer → excluded from the linkable list, but counted in unapprovedPendingCount (02.10.2026 fix — never invisible)', async () => {
    const db = makeFakeDb({
      users: { u1: { core: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'X', unitMembershipSource: 'self_declared', unitApprovedByOfficer: false } } },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.body.pending).toEqual([]);
      expect(result.body.unapprovedPendingCount).toBe(1);
    }
  });

  it('an already-linked soldier\'s account is never double-counted in unapprovedPendingCount even if still unapproved', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Already Linked', gender: 'male', uid: 'u1', mergedInto: null } },
      users: { u1: { core: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'X', unitMembershipSource: 'self_declared', unitApprovedByOfficer: false } } },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.unapprovedPendingCount).toBe(0);
  });

  it('not self-declared at all (e.g. access-code join) → excluded regardless of approval flag', async () => {
    const db = makeFakeDb({
      users: { u1: { core: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'X', unitMembershipSource: null, unitApprovedByOfficer: true } } },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.pending).toEqual([]);
  });

  it('already linked to a readiness_soldiers record → excluded from pending even though still self_declared/approved', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Already Linked', gender: 'male', uid: 'u1', mergedInto: null } },
      users: { u1: { core: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'X', unitMembershipSource: 'self_declared', unitApprovedByOfficer: true } } },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.pending).toEqual([]);
  });

  it('a pending candidate outside the unitAdmin\'s unitIds never appears', async () => {
    const db = makeFakeDb({
      users: { u1: { core: { tenantId: 'tenant-1', unitId: 'OTHER-unit-not-in-scope', name: 'X', unitMembershipSource: 'self_declared', unitApprovedByOfficer: true } } },
    });
    const result = await computeUnitRoster(db, UNIT_ADMIN_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.pending).toEqual([]);
  });
});
