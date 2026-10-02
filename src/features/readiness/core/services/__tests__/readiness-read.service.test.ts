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
        r1: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 't1', outcome: 'pass', recordedAt: recent, thresholdSnapshot: { validityDays: 365 } },
        r2: { soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 't2', outcome: 'fail', recordedAt: recent, thresholdSnapshot: { validityDays: 365 } },
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
        r1: { soldierId: 'SOME-OTHER-soldier', tenantId: 'tenant-1', unitId: 'battalion-1', testId: 't1', outcome: 'fail', recordedAt: recent, thresholdSnapshot: { validityDays: 365 } },
      },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.soldiers[0].currentStatus).toBe('not_yet_tested');
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

  it('self-declared but NOT YET approved by an officer → excluded (David\'s explicit decision)', async () => {
    const db = makeFakeDb({
      users: { u1: { core: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'X', unitMembershipSource: 'self_declared', unitApprovedByOfficer: false } } },
    });
    const result = await computeUnitRoster(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.pending).toEqual([]);
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
