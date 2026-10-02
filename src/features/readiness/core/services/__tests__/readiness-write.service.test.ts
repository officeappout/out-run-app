import { describe, it, expect, vi } from 'vitest';

// readiness-write.service.ts imports @/lib/unitPermissionScope for the
// UnitPermissionScope type only — but that module itself imports
// @/lib/firebase-admin at the top level (which guards with 'server-only'),
// so the import chain still needs this mocked even though this service
// never calls getAdminDb() itself (every function takes `db` as a plain
// parameter). Same convention as unitPermissionScope.test.ts.
vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => { throw new Error('getAdminDb should never be called from compute*() functions — db is always injected'); },
}));

import {
  computeCreateSoldier,
  computeLinkSoldier,
  computeUnlinkSoldier,
  computeMergeSoldiers,
  computeGetThresholds,
  computeSetThresholds,
  computeRecordResult,
  computeSoldierCurrentStatus,
  type ReadinessCtx,
  type ReadinessResult,
} from '../readiness-write.service';
import type { UnitPermissionScope } from '@/lib/unitPermissionScope';

// David's explicit mandate (carried over from park-write.service.test.ts,
// 30.09.2026, applied identically here, 01.10.2026): these tests must
// prove DENIAL, not just acceptance — a server route bypasses
// firestore.rules entirely, there is no safety net underneath it.

interface FakeDoc {
  [key: string]: unknown;
}

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
    audit_logs: new Map(),
  };
  const unitsByTenant: Record<string, Map<string, FakeDoc>> = {};
  for (const [tenantId, units] of Object.entries(seed.units ?? {})) {
    unitsByTenant[tenantId] = new Map(Object.entries(units));
  }
  let nextId = 1;

  function applyUpdate(collName: string, id: string, data: FakeDoc) {
    const store = stores[collName];
    const existing = store.get(id) ?? {};
    store.set(id, { ...existing, ...data });
  }

  function makeDocRef(collName: string, id: string): any {
    return {
      id,
      collName,
      get: async () => docSnap(collName, id),
      update: async (data: FakeDoc) => applyUpdate(collName, id, data),
      set: async (data: FakeDoc) => stores[collName].set(id, { ...data }),
    };
  }

  function docSnap(collName: string, id: string) {
    const store = stores[collName];
    const d = store?.get(id);
    return { id, exists: d !== undefined, data: () => (d ? { ...d } : undefined), ref: makeDocRef(collName, id) };
  }

  function runQuery(collName: string, filters: Array<{ field: string; op: string; value: unknown }>, limitN?: number) {
    const store = stores[collName];
    let entries = Array.from(store.entries());
    for (const f of filters) {
      entries = entries.filter(([, d]) => {
        if (f.op === '==') return d[f.field] === f.value;
        throw new Error(`unexpected op: ${f.op}`);
      });
    }
    if (typeof limitN === 'number') entries = entries.slice(0, limitN);
    const docs = entries.map(([id, d]) => ({ id, exists: true, data: () => ({ ...d }), ref: makeDocRef(collName, id) }));
    return { empty: docs.length === 0, size: docs.length, docs };
  }

  function makeQuery(collName: string, filters: Array<{ field: string; op: string; value: unknown }>, limitN?: number): any {
    return {
      where: (field: string, op: string, value: unknown) => makeQuery(collName, [...filters, { field, op, value }], limitN),
      limit: (n: number) => makeQuery(collName, filters, n),
      get: async () => runQuery(collName, filters, limitN),
    };
  }

  function collection(name: string): any {
    if (name === 'tenants') {
      return {
        doc: (tenantId: string) => ({
          collection: (sub: string) => {
            if (sub !== 'units') throw new Error(`unexpected subcollection: ${sub}`);
            return {
              doc: (unitId: string) => ({
                get: async () => {
                  const u = unitsByTenant[tenantId]?.get(unitId);
                  return { id: unitId, exists: u !== undefined, data: () => u };
                },
              }),
            };
          },
        }),
      };
    }
    const store = stores[name];
    if (!store) throw new Error(`unexpected collection: ${name}`);
    return {
      doc: (id?: string) => makeDocRef(name, id ?? `${name}_generated_${nextId++}`),
      add: async (data: FakeDoc) => {
        const id = `${name}_generated_${nextId++}`;
        store.set(id, { ...data });
        return { id };
      },
      where: (field: string, op: string, value: unknown) => makeQuery(name, [{ field, op, value }]),
    };
  }

  const db: any = {
    collection,
    runTransaction: async (fn: (tx: any) => Promise<unknown>) => {
      const tx = {
        get: async (refOrQuery: any) => refOrQuery.get(),
        update: (ref: any, data: FakeDoc) => applyUpdate(ref.collName, ref.id, data),
      };
      return fn(tx);
    },
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        update: (ref: any, data: FakeDoc) => ops.push(() => applyUpdate(ref.collName, ref.id, data)),
        commit: async () => ops.forEach((op) => op()),
      };
    },
    _stores: stores,
  };
  return db;
}

const CTX: ReadinessCtx = { callerUid: 'officer-uid', tokenEmail: 'officer@example.com', sourceIp: '203.0.113.1' };

const UNIT_ADMIN_SCOPE: UnitPermissionScope = { kind: 'unitAdmin', tenantId: 'tenant-1', unitIds: ['battalion-1'] };
const TENANT_OWNER_SCOPE: UnitPermissionScope = { kind: 'tenantOwner', tenantId: 'tenant-1' };
const ROOT_SCOPE: UnitPermissionScope = { kind: 'root' };
const DENIED_SCOPE: UnitPermissionScope = { kind: 'denied' };
const UNKNOWN_SCOPE: UnitPermissionScope = { kind: 'unknown' };

describe('computeCreateSoldier', () => {
  it('unknown scope → 503, nothing created', async () => {
    const db = makeFakeDb({});
    const result = await computeCreateSoldier(db, UNKNOWN_SCOPE, { name: 'X', tenantId: 'tenant-1', unitId: 'battalion-1' }, CTX);
    expect(result.status).toBe(503);
    expect(db._stores.readiness_soldiers.size).toBe(0);
  });

  it('denied scope → 403, nothing created', async () => {
    const db = makeFakeDb({});
    const result = await computeCreateSoldier(db, DENIED_SCOPE, { name: 'X', tenantId: 'tenant-1', unitId: 'battalion-1' }, CTX);
    expect(result.status).toBe(403);
    expect(db._stores.readiness_soldiers.size).toBe(0);
  });

  it('unitAdmin creating in their own unit → 200, correct tenantId/unitId stored', async () => {
    const db = makeFakeDb({ units: { 'tenant-1': { 'battalion-1': { name: 'Battalion 1' } } } });
    const result = await computeCreateSoldier(db, UNIT_ADMIN_SCOPE, { name: 'Soldier A', unitId: 'battalion-1', gender: 'male' }, CTX);
    expect(result.status).toBe(200);
    if (result.status === 200) {
      const stored = db._stores.readiness_soldiers.get(result.body.soldierId);
      expect(stored.tenantId).toBe('tenant-1');
      expect(stored.unitId).toBe('battalion-1');
      expect(stored.uid).toBeNull();
    }
  });

  it('unitAdmin creating in a unit outside their unitIds → 403, nothing created', async () => {
    const db = makeFakeDb({ units: { 'tenant-1': { 'company-9': {} } } });
    const result = await computeCreateSoldier(db, UNIT_ADMIN_SCOPE, { name: 'Soldier A', unitId: 'company-9', gender: 'male' }, CTX);
    expect(result.status).toBe(403);
    expect(db._stores.readiness_soldiers.size).toBe(0);
  });

  it('unitId does not exist as a real unit doc → 400', async () => {
    const db = makeFakeDb({});
    const result = await computeCreateSoldier(db, UNIT_ADMIN_SCOPE, { name: 'Soldier A', unitId: 'battalion-1', gender: 'male' }, CTX);
    expect(result.status).toBe(400);
  });

  it('missing name → 400', async () => {
    const db = makeFakeDb({ units: { 'tenant-1': { 'battalion-1': {} } } });
    const result = await computeCreateSoldier(db, UNIT_ADMIN_SCOPE, { unitId: 'battalion-1', gender: 'male' }, CTX);
    expect(result.status).toBe(400);
  });

  it('root without tenantId in body → 400', async () => {
    const db = makeFakeDb({});
    const result = await computeCreateSoldier(db, ROOT_SCOPE, { name: 'X', unitId: 'battalion-1', gender: 'male' }, CTX);
    expect(result.status).toBe(400);
  });

  it('immediate uid link to a user outside caller scope → 403, no soldier created', async () => {
    const db = makeFakeDb({
      units: { 'tenant-1': { 'battalion-1': {} } },
      users: { 'pending-uid': { core: { tenantId: 'tenant-1', unitId: 'OTHER-battalion', gender: 'male' } } },
    });
    const result = await computeCreateSoldier(db, UNIT_ADMIN_SCOPE, { name: 'Soldier A', unitId: 'battalion-1', uid: 'pending-uid' }, CTX);
    expect(result.status).toBe(403);
    expect(db._stores.readiness_soldiers.size).toBe(0);
  });

  it("immediate uid link auto-fills gender from the account's core.gender when not supplied", async () => {
    const db = makeFakeDb({
      units: { 'tenant-1': { 'battalion-1': {} } },
      users: { 'pending-uid': { core: { tenantId: 'tenant-1', unitId: 'battalion-1', gender: 'female' } } },
    });
    const result = await computeCreateSoldier(db, UNIT_ADMIN_SCOPE, { name: 'Soldier A', unitId: 'battalion-1', uid: 'pending-uid' }, CTX);
    expect(result.status).toBe(200);
    if (result.status === 200) {
      const stored = db._stores.readiness_soldiers.get(result.body.soldierId);
      expect(stored.gender).toBe('female');
      expect(stored.uid).toBe('pending-uid');
      expect(stored.linkedAt).not.toBeNull();
    }
  });

  it("account's core.gender === 'other' does NOT auto-fill — explicit gender required, 400 when absent", async () => {
    const db = makeFakeDb({
      units: { 'tenant-1': { 'battalion-1': {} } },
      users: { 'pending-uid': { core: { tenantId: 'tenant-1', unitId: 'battalion-1', gender: 'other' } } },
    });
    const result = await computeCreateSoldier(db, UNIT_ADMIN_SCOPE, { name: 'Soldier A', unitId: 'battalion-1', uid: 'pending-uid' }, CTX);
    expect(result.status).toBe(400);
    expect(db._stores.readiness_soldiers.size).toBe(0);
  });

  it('every creation writes an audit_logs entry', async () => {
    const db = makeFakeDb({ units: { 'tenant-1': { 'battalion-1': {} } } });
    await computeCreateSoldier(db, UNIT_ADMIN_SCOPE, { name: 'Soldier A', unitId: 'battalion-1', gender: 'male' }, CTX);
    expect(db._stores.audit_logs.size).toBe(1);
  });
});

describe('computeLinkSoldier', () => {
  it('already-linked soldier → 409, no second link applied', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: 'existing-uid', mergedInto: null } },
      users: { 'new-uid': { core: { tenantId: 'tenant-1', unitId: 'battalion-1' } } },
    });
    const result = await computeLinkSoldier(db, UNIT_ADMIN_SCOPE, { soldierId: 's1', uid: 'new-uid' }, CTX);
    expect(result.status).toBe(409);
    expect(db._stores.readiness_soldiers.get('s1').uid).toBe('existing-uid');
  });

  it('target uid already linked to a DIFFERENT soldier record → 409 (uniqueness rule b)', async () => {
    const db = makeFakeDb({
      soldiers: {
        s1: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: null, mergedInto: null },
        s2: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: 'dup-uid', mergedInto: null },
      },
      users: { 'dup-uid': { core: { tenantId: 'tenant-1', unitId: 'battalion-1' } } },
    });
    const result = await computeLinkSoldier(db, UNIT_ADMIN_SCOPE, { soldierId: 's1', uid: 'dup-uid' }, CTX);
    expect(result.status).toBe(409);
    expect(db._stores.readiness_soldiers.get('s1').uid).toBeNull();
  });

  it('soldier outside caller scope → 403, not linked', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'OTHER-battalion', uid: null, mergedInto: null } },
      users: { 'new-uid': { core: { tenantId: 'tenant-1', unitId: 'OTHER-battalion' } } },
    });
    const result = await computeLinkSoldier(db, UNIT_ADMIN_SCOPE, { soldierId: 's1', uid: 'new-uid' }, CTX);
    expect(result.status).toBe(403);
  });

  it('target account outside caller scope → 403, not linked', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: null, mergedInto: null } },
      users: { 'new-uid': { core: { tenantId: 'tenant-1', unitId: 'OTHER-battalion' } } },
    });
    const result = await computeLinkSoldier(db, UNIT_ADMIN_SCOPE, { soldierId: 's1', uid: 'new-uid' }, CTX);
    expect(result.status).toBe(403);
  });

  it('merged-away record → 409, not linked', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: null, mergedInto: 'survivor-1' } },
      users: { 'new-uid': { core: { tenantId: 'tenant-1', unitId: 'battalion-1' } } },
    });
    const result = await computeLinkSoldier(db, UNIT_ADMIN_SCOPE, { soldierId: 's1', uid: 'new-uid' }, CTX);
    expect(result.status).toBe(409);
  });

  it('happy path → 200, uid set, audit written', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: null, mergedInto: null } },
      users: { 'new-uid': { core: { tenantId: 'tenant-1', unitId: 'battalion-1' } } },
    });
    const result = await computeLinkSoldier(db, UNIT_ADMIN_SCOPE, { soldierId: 's1', uid: 'new-uid' }, CTX);
    expect(result.status).toBe(200);
    expect(db._stores.readiness_soldiers.get('s1').uid).toBe('new-uid');
    expect(db._stores.audit_logs.size).toBe(1);
  });

  it("linking updates the denormalized uid on ALL of this soldier's existing results atomically (David's requirement, 01.10.2026) — not just the first, not just the soldier doc", async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: null, mergedInto: null } },
      users: { 'new-uid': { core: { tenantId: 'tenant-1', unitId: 'battalion-1' } } },
      results: {
        r1: { soldierId: 's1', uid: null, testId: 't1' },
        r2: { soldierId: 's1', uid: null, testId: 't2' },
        r3: { soldierId: 's1', uid: null, testId: 't3' },
        other: { soldierId: 's2', uid: null, testId: 't1' }, // a different soldier's result — must stay untouched
      },
    });
    const result = await computeLinkSoldier(db, UNIT_ADMIN_SCOPE, { soldierId: 's1', uid: 'new-uid' }, CTX);
    expect(result.status).toBe(200);
    expect(db._stores.readiness_results.get('r1').uid).toBe('new-uid');
    expect(db._stores.readiness_results.get('r2').uid).toBe('new-uid');
    expect(db._stores.readiness_results.get('r3').uid).toBe('new-uid');
    expect(db._stores.readiness_results.get('other').uid).toBeNull();
  });
});

describe('computeUnlinkSoldier', () => {
  it('not linked → 400', async () => {
    const db = makeFakeDb({ soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: null } } });
    const result = await computeUnlinkSoldier(db, UNIT_ADMIN_SCOPE, { soldierId: 's1' }, CTX);
    expect(result.status).toBe(400);
  });

  it('out of scope → 403, uid untouched', async () => {
    const db = makeFakeDb({ soldiers: { s1: { tenantId: 'tenant-1', unitId: 'OTHER-battalion', uid: 'u1' } } });
    const result = await computeUnlinkSoldier(db, UNIT_ADMIN_SCOPE, { soldierId: 's1' }, CTX);
    expect(result.status).toBe(403);
    expect(db._stores.readiness_soldiers.get('s1').uid).toBe('u1');
  });

  it('happy path clears uid/linkedAt and leaves results\' soldierId untouched (point 5)', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: 'u1', linkedAt: new Date() } },
      results: { r1: { soldierId: 's1', outcome: 'pass', uid: 'u1' } },
    });
    const result = await computeUnlinkSoldier(db, UNIT_ADMIN_SCOPE, { soldierId: 's1' }, CTX);
    expect(result.status).toBe(200);
    expect(db._stores.readiness_soldiers.get('s1').uid).toBeNull();
    expect(db._stores.readiness_soldiers.get('s1').linkedAt).toBeNull();
    expect(db._stores.readiness_results.get('r1').soldierId).toBe('s1');
    expect(db._stores.audit_logs.size).toBe(1);
  });

  it("unlinking clears the denormalized uid to null on ALL of this soldier's existing results atomically — the exact failure David named: a soldier must never see PART of their history and not the rest", async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: 'u1', linkedAt: new Date() } },
      results: {
        r1: { soldierId: 's1', uid: 'u1', testId: 't1' },
        r2: { soldierId: 's1', uid: 'u1', testId: 't2' },
        r3: { soldierId: 's1', uid: 'u1', testId: 't3' },
        other: { soldierId: 's2', uid: 'u1', testId: 't1' }, // same uid, different soldier — must stay untouched
      },
    });
    const result = await computeUnlinkSoldier(db, UNIT_ADMIN_SCOPE, { soldierId: 's1' }, CTX);
    expect(result.status).toBe(200);
    expect(db._stores.readiness_results.get('r1').uid).toBeNull();
    expect(db._stores.readiness_results.get('r2').uid).toBeNull();
    expect(db._stores.readiness_results.get('r3').uid).toBeNull();
    expect(db._stores.readiness_results.get('other').uid).toBe('u1');
  });
});

describe('computeMergeSoldiers', () => {
  it('non-root caller → 403, nothing moved', async () => {
    const db = makeFakeDb({
      soldiers: {
        survivor: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: null, mergedInto: null },
        dup: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: null, mergedInto: null },
      },
    });
    const result = await computeMergeSoldiers(db, TENANT_OWNER_SCOPE, { survivorId: 'survivor', mergedId: 'dup' }, CTX);
    expect(result.status).toBe(403);
  });

  it('moves results from the merged record to the survivor, never deletes them (point 9)', async () => {
    const db = makeFakeDb({
      soldiers: {
        survivor: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: null, mergedInto: null },
        dup: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: null, mergedInto: null },
      },
      results: {
        r1: { soldierId: 'dup', outcome: 'pass', testId: 't1' },
        r2: { soldierId: 'dup', outcome: 'fail', testId: 't2' },
      },
    });
    const result = await computeMergeSoldiers(db, ROOT_SCOPE, { survivorId: 'survivor', mergedId: 'dup' }, CTX);
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.movedResults).toBe(2);
    expect(db._stores.readiness_results.get('r1').soldierId).toBe('survivor');
    expect(db._stores.readiness_results.get('r2').soldierId).toBe('survivor');
    expect(db._stores.readiness_soldiers.get('dup').mergedInto).toBe('survivor');
  });

  it('conflicting linked uids on both sides → 409, no merge applied', async () => {
    const db = makeFakeDb({
      soldiers: {
        survivor: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: 'uid-A', mergedInto: null },
        dup: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: 'uid-B', mergedInto: null },
      },
    });
    const result = await computeMergeSoldiers(db, ROOT_SCOPE, { survivorId: 'survivor', mergedId: 'dup' }, CTX);
    expect(result.status).toBe(409);
    expect(db._stores.readiness_soldiers.get('dup').mergedInto).toBeNull();
  });

  it("merging reconciles the denormalized uid on BOTH the moved results AND the survivor's own pre-existing results to the final survivor uid", async () => {
    const db = makeFakeDb({
      soldiers: {
        // survivor had no account linked yet; the duplicate did — the
        // merge inherits merged's uid onto the survivor record.
        survivor: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: null, mergedInto: null },
        dup: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: 'uid-X', mergedInto: null },
      },
      results: {
        survivorsOwn: { soldierId: 'survivor', uid: null, testId: 't1' }, // recorded before survivor had any account
        dupResult: { soldierId: 'dup', uid: 'uid-X', testId: 't2' },
      },
    });
    const result = await computeMergeSoldiers(db, ROOT_SCOPE, { survivorId: 'survivor', mergedId: 'dup' }, CTX);
    expect(result.status).toBe(200);
    expect(db._stores.readiness_soldiers.get('survivor').uid).toBe('uid-X');
    expect(db._stores.readiness_results.get('survivorsOwn').uid).toBe('uid-X');
    expect(db._stores.readiness_results.get('dupResult').uid).toBe('uid-X');
    expect(db._stores.readiness_results.get('dupResult').soldierId).toBe('survivor');
  });
});

describe('computeSetThresholds / computeGetThresholds', () => {
  const VALID_TESTS = [{ id: 't1', label: 'Push-ups', metric: 'reps', unit: 'count', lowerIsBetter: false, threshold: { male: 40, female: 25 } }];

  it('non-root caller cannot set thresholds → 403', async () => {
    const db = makeFakeDb({});
    const result = await computeSetThresholds(db, TENANT_OWNER_SCOPE, { tests: VALID_TESTS }, CTX);
    expect(result.status).toBe(403);
  });

  it('root sets thresholds → version increments on repeated writes, single global doc', async () => {
    const db = makeFakeDb({});
    const first = await computeSetThresholds(db, ROOT_SCOPE, { tests: VALID_TESTS }, CTX);
    expect(first.status).toBe(200);
    if (first.status === 200) expect(first.body.version).toBe(1);
    const second = await computeSetThresholds(db, ROOT_SCOPE, { tests: VALID_TESTS }, CTX);
    if (second.status === 200) expect(second.body.version).toBe(2);
    expect(db._stores.readiness_thresholds.size).toBe(1);
  });

  it('a tenantOwner/unitAdmin can read the global config', async () => {
    const db = makeFakeDb({});
    await computeSetThresholds(db, ROOT_SCOPE, { tests: VALID_TESTS }, CTX);
    const result = await computeGetThresholds(db, TENANT_OWNER_SCOPE);
    expect(result.status).toBe(200);
  });

  it('denied scope cannot read the config', async () => {
    const db = makeFakeDb({});
    const result = await computeGetThresholds(db, DENIED_SCOPE);
    expect(result.status).toBe(403);
  });
});

describe('computeRecordResult', () => {
  const THRESHOLDS = {
    global: { id: 'global', version: 3, tests: [{ id: 't1', label: 'Push-ups', metric: 'reps', unit: 'count', lowerIsBetter: false, threshold: { male: 40, female: 25 }, validityDays: 180 }], updatedBy: 'root', updatedAt: new Date() },
  };
  // Computed fresh at test-run time (never hardcoded) so these tests never
  // drift into the 90-day-back rejection window as real time passes —
  // exactly the kind of date-relative-to-"now" flakiness already seen
  // elsewhere in this repo's broader suite (getWindowStart).
  const TODAY_ISO = new Date().toISOString().slice(0, 10);

  it('officer in scope records a measured value → outcome computed server-side (pass)', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: null, gender: 'male', mergedInto: null } },
      thresholds: THRESHOLDS,
    });
    const result = await computeRecordResult(db, UNIT_ADMIN_SCOPE, { soldierId: 's1', testId: 't1', source: 'organized_test', value: 45, testDate: TODAY_ISO }, CTX);
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.outcome).toBe('pass');
  });

  it("a newly-recorded result carries the denormalized uid snapshotted from the soldier record at write time (linked soldier)", async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: 'linked-uid', gender: 'male', mergedInto: null } },
      thresholds: THRESHOLDS,
    });
    const result = await computeRecordResult(db, UNIT_ADMIN_SCOPE, { soldierId: 's1', testId: 't1', source: 'organized_test', value: 45, testDate: TODAY_ISO }, CTX);
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(db._stores.readiness_results.get(result.body.resultId).uid).toBe('linked-uid');
    }
  });

  it('a newly-recorded result carries uid: null for an unlinked soldier record', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: null, gender: 'male', mergedInto: null } },
      thresholds: THRESHOLDS,
    });
    const result = await computeRecordResult(db, UNIT_ADMIN_SCOPE, { soldierId: 's1', testId: 't1', source: 'organized_test', value: 45, testDate: TODAY_ISO }, CTX);
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(db._stores.readiness_results.get(result.body.resultId).uid).toBeNull();
    }
  });

  it("a client-supplied 'outcome'/'status' field in the body is ignored — server recomputes from value regardless (point 2)", async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: null, gender: 'male', mergedInto: null } },
      thresholds: THRESHOLDS,
    });
    const result = await computeRecordResult(
      db,
      UNIT_ADMIN_SCOPE,
      { soldierId: 's1', testId: 't1', source: 'organized_test', value: 10, outcome: 'pass', status: 'pass', testDate: TODAY_ISO },
      CTX,
    );
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.outcome).toBe('fail'); // 10 < 40 male threshold — body's claimed 'pass' never read
  });

  it('soldier self-reporting their own linked result works even with scope=denied (ordinary soldier has no managerial scope)', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: 'soldier-uid', gender: 'female', mergedInto: null } },
      thresholds: THRESHOLDS,
    });
    const selfCtx: ReadinessCtx = { callerUid: 'soldier-uid', tokenEmail: undefined, sourceIp: '203.0.113.1' };
    const result = await computeRecordResult(db, DENIED_SCOPE, { soldierId: 's1', testId: 't1', source: 'self_report', value: 30, testDate: TODAY_ISO }, selfCtx);
    expect(result.status).toBe(200);
  });

  it('a caller who is neither the linked soldier nor an in-scope officer → 403', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: 'soldier-uid', gender: 'female', mergedInto: null } },
      thresholds: THRESHOLDS,
    });
    const randomCtx: ReadinessCtx = { callerUid: 'random-uid', tokenEmail: undefined, sourceIp: '203.0.113.1' };
    const result = await computeRecordResult(db, DENIED_SCOPE, { soldierId: 's1', testId: 't1', source: 'self_report', value: 30, testDate: TODAY_ISO }, randomCtx);
    expect(result.status).toBe(403);
  });

  it("'not_performed' is recorded as a full state, not a fail, with no value (point 11)", async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: null, gender: 'male', mergedInto: null } },
      thresholds: THRESHOLDS,
    });
    const result = await computeRecordResult(db, UNIT_ADMIN_SCOPE, { soldierId: 's1', testId: 't1', source: 'organized_test', notPerformedReason: 'medical_exemption', testDate: TODAY_ISO }, CTX);
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.outcome).toBe('not_performed');
  });

  it('no global threshold config exists → 400 for a measured value', async () => {
    const db = makeFakeDb({ soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: null, gender: 'male', mergedInto: null } } });
    const result = await computeRecordResult(db, UNIT_ADMIN_SCOPE, { soldierId: 's1', testId: 't1', source: 'organized_test', value: 45, testDate: TODAY_ISO }, CTX);
    expect(result.status).toBe(400);
  });

  it('result carries a frozen threshold snapshot matching the config version at write time (point 12)', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: null, gender: 'male', mergedInto: null } },
      thresholds: THRESHOLDS,
    });
    const result = await computeRecordResult(db, UNIT_ADMIN_SCOPE, { soldierId: 's1', testId: 't1', source: 'organized_test', value: 45, testDate: TODAY_ISO }, CTX);
    expect(result.status).toBe(200);
    if (result.status === 200) {
      const stored = db._stores.readiness_results.get(result.body.resultId);
      expect(stored.thresholdSnapshot.thresholdVersion).toBe(3);
      expect(stored.thresholdSnapshot.thresholdValue).toBe(40);
    }
  });

  // David's 4 explicit test requirements, 03.10.2026 — testDate is
  // separate from recordedAt because an organized test happens on paper
  // in the field and is typed in days later; "now" is never the right
  // date for when the test actually took place.

  it('testDate in the future → rejected', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: null, gender: 'male', mergedInto: null } },
      thresholds: THRESHOLDS,
    });
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const result = await computeRecordResult(db, UNIT_ADMIN_SCOPE, { soldierId: 's1', testId: 't1', source: 'organized_test', value: 45, testDate: tomorrow }, CTX);
    expect(result.status).toBe(400);
    expect(db._stores.readiness_results.size).toBe(0);
  });

  it('testDate from 120 days ago → rejected (more than 90 days back)', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: null, gender: 'male', mergedInto: null } },
      thresholds: THRESHOLDS,
    });
    const longAgo = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const result = await computeRecordResult(db, UNIT_ADMIN_SCOPE, { soldierId: 's1', testId: 't1', source: 'organized_test', value: 45, testDate: longAgo }, CTX);
    expect(result.status).toBe(400);
    expect(db._stores.readiness_results.size).toBe(0);
  });

  it('testDate from 10 days ago → written; recordedAt stays today, testDate stays the chosen date (the two are independent)', async () => {
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: null, gender: 'male', mergedInto: null } },
      thresholds: THRESHOLDS,
    });
    const tenDaysAgoDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const tenDaysAgoIso = tenDaysAgoDate.toISOString().slice(0, 10);
    const beforeCall = Date.now();
    const result = await computeRecordResult(db, UNIT_ADMIN_SCOPE, { soldierId: 's1', testId: 't1', source: 'organized_test', value: 45, testDate: tenDaysAgoIso }, CTX);
    expect(result.status).toBe(200);
    if (result.status === 200) {
      const stored = db._stores.readiness_results.get(result.body.resultId);
      // recordedAt is "now" (write time) — must NOT equal testDate.
      expect(stored.recordedAt.getTime()).toBeGreaterThanOrEqual(beforeCall);
      // testDate stores the chosen calendar day, not today.
      expect(stored.testDate.getFullYear()).toBe(tenDaysAgoDate.getFullYear());
      expect(stored.testDate.getMonth()).toBe(tenDaysAgoDate.getMonth());
      expect(stored.testDate.getDate()).toBe(tenDaysAgoDate.getDate());
      expect(stored.testDate.getTime()).not.toBe(stored.recordedAt.getTime());
    }
  });

  it('a soldier with "medical exemption" on one test and valid passing results on the others: that test counts as neither a failure nor "not yet tested"', async () => {
    const multiTestThresholds = {
      global: {
        id: 'global', version: 1, updatedBy: 'root', updatedAt: new Date(),
        tests: [
          { id: 'run_3000m', label: 'Run', metric: 'time_seconds', unit: 'seconds', lowerIsBetter: true, threshold: { male: 1080, female: 1200 }, validityDays: 365 },
          { id: 'pullups', label: 'Pull-ups', metric: 'reps', unit: 'reps', lowerIsBetter: false, threshold: { male: 3, female: 3 }, validityDays: 365 },
          { id: 'dips', label: 'Dips', metric: 'reps', unit: 'reps', lowerIsBetter: false, threshold: { male: 5, female: 5 }, validityDays: 365 },
        ],
      },
    };
    const db = makeFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', uid: null, gender: 'male', mergedInto: null } },
      thresholds: multiTestThresholds,
    });

    const run = await computeRecordResult(db, UNIT_ADMIN_SCOPE, { soldierId: 's1', testId: 'run_3000m', source: 'organized_test', notPerformedReason: 'medical_exemption', testDate: TODAY_ISO }, CTX);
    const pullups = await computeRecordResult(db, UNIT_ADMIN_SCOPE, { soldierId: 's1', testId: 'pullups', source: 'organized_test', value: 5, testDate: TODAY_ISO }, CTX);
    const dips = await computeRecordResult(db, UNIT_ADMIN_SCOPE, { soldierId: 's1', testId: 'dips', source: 'organized_test', value: 7, testDate: TODAY_ISO }, CTX);
    expect(run.status).toBe(200);
    expect(pullups.status).toBe(200);
    expect(dips.status).toBe(200);
    if (run.status === 200) expect(run.body.outcome).toBe('not_performed');

    const allResults = Array.from(db._stores.readiness_results.values()).map((r: any) => ({ ...r, id: 'x' })) as ReadinessResult[];
    const runStatus = computeSoldierCurrentStatus(allResults, 'run_3000m', new Date());
    // The exact two negatives David asked to see proven explicitly:
    expect(runStatus).not.toBe('fail');
    expect(runStatus).not.toBe('not_yet_tested');
    expect(runStatus).toBe('not_performed');
  });
});

describe('computeSoldierCurrentStatus (point 10 — expiry reverts to not_yet_tested, never to fail)', () => {
  const base = (overrides: Partial<ReadinessResult>): ReadinessResult => ({
    id: 'r', soldierId: 's1', tenantId: 't', unitId: 'u', testId: 't1',
    outcome: 'pass', value: 45, notPerformedReason: null, source: 'organized_test',
    thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 40, lowerIsBetter: false, validityDays: 180 },
    recordedBy: 'officer', recordedAt: new Date('2026-01-01'), testDate: new Date('2026-01-01'), uid: null,
    ...overrides,
  });

  it('no results at all → not_yet_tested', () => {
    expect(computeSoldierCurrentStatus([], 't1', new Date('2026-06-01'))).toBe('not_yet_tested');
  });

  it('a valid, non-expired result returns its frozen outcome', () => {
    const results = [base({ outcome: 'pass', recordedAt: new Date('2026-01-01') })];
    expect(computeSoldierCurrentStatus(results, 't1', new Date('2026-03-01'))).toBe('pass');
  });

  it('an expired FAIL reverts to not_yet_tested — never displayed as a current fail', () => {
    const results = [base({ outcome: 'fail', recordedAt: new Date('2026-01-01') })];
    // 180 days after 2026-01-01 is ~2026-06-30 — 2027-01-01 is well past expiry
    expect(computeSoldierCurrentStatus(results, 't1', new Date('2027-01-01'))).toBe('not_yet_tested');
  });

  it('picks the most recent result when several exist for the same test', () => {
    const results = [
      base({ outcome: 'fail', recordedAt: new Date('2026-01-01') }),
      base({ outcome: 'pass', recordedAt: new Date('2026-05-01') }),
    ];
    expect(computeSoldierCurrentStatus(results, 't1', new Date('2026-06-01'))).toBe('pass');
  });

  it('results for a different testId are ignored', () => {
    const results = [base({ outcome: 'pass', testId: 'OTHER-test', recordedAt: new Date('2026-01-01') })];
    expect(computeSoldierCurrentStatus(results, 't1', new Date('2026-03-01'))).toBe('not_yet_tested');
  });
});
