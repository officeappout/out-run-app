import { describe, it, expect, vi } from 'vitest';

// Same reason as the other two readiness test files: @/lib/unitPermissionScope
// imports @/lib/firebase-admin at the top level ('server-only' guard).
vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => { throw new Error('getAdminDb should never be called from compute*() functions — db is always injected'); },
}));

import { computeCreateSoldier, computeRecordResult, type ReadinessCtx } from '../readiness-write.service';
import { computeUnitRoster } from '../readiness-read.service';
import type { UnitPermissionScope } from '@/lib/unitPermissionScope';

/**
 * 03.10.2026 — this file exists because of a real production incident:
 * the write side (computeRecordResult) was tested, the read side
 * (computeUnitRoster) was tested, and the HANDOFF between them never
 * was. The first real readiness_results document ever written threw a
 * 500 the instant computeUnitRoster tried to read it back, because
 * Firestore's Admin SDK returns Timestamp instances on read, not the
 * plain JS Date objects every other fake-db test in this build silently
 * assumes. Those other fake dbs are correct for what they test
 * (authorization, validation, business logic) — they were just never
 * asked to prove the round-trip through real Firestore's own type
 * coercion, which is exactly the gap this file closes.
 *
 * FakeTimestamp below deliberately has .toDate()/.toMillis() and NOT
 * .getTime() — matching the real admin.firestore.Timestamp's actual
 * shape — so a regression here (removing toDate() normalization in
 * readiness-read.service.ts) throws in this suite exactly as it did in
 * production, not silently passing the way the pre-incident fake dbs did.
 */

class FakeTimestamp {
  constructor(private readonly date: Date) {}
  toDate(): Date { return this.date; }
  toMillis(): number { return this.date.getTime(); }
}

function wrapDatesAsTimestamps<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = { ...obj };
  for (const [k, v] of Object.entries(out)) {
    if (v instanceof Date) out[k] = new FakeTimestamp(v);
  }
  return out as T;
}

interface FakeDoc { [key: string]: unknown }

function makeRealisticFakeDb(seed: {
  soldiers?: Record<string, FakeDoc>;
  thresholds?: Record<string, FakeDoc>;
  units?: Record<string, Record<string, FakeDoc>>;
}) {
  const stores: Record<string, Map<string, FakeDoc>> = {
    readiness_soldiers: new Map(Object.entries(seed.soldiers ?? {}).map(([k, v]) => [k, wrapDatesAsTimestamps(v)])),
    readiness_results: new Map(),
    readiness_thresholds: new Map(Object.entries(seed.thresholds ?? {}).map(([k, v]) => [k, wrapDatesAsTimestamps(v)])),
    users: new Map(),
    audit_logs: new Map(),
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
      doc: (id: string) => ({
        get: async () => docSnap(name, id),
        update: async (data: FakeDoc) => {
          const existing = store.get(id) ?? {};
          store.set(id, { ...existing, ...wrapDatesAsTimestamps(data) });
        },
      }),
      add: async (data: FakeDoc) => {
        const id = `${name}_generated_${store.size + 1}_${Math.random().toString(36).slice(2, 6)}`;
        store.set(id, wrapDatesAsTimestamps(data));
        return { id };
      },
      where: (field: string, op: string, value: unknown) => ({
        get: async () => {
          if (op !== '==') throw new Error(`unexpected op: ${op}`);
          const docs = Array.from(store.entries())
            .filter(([, d]) => getByDotPath(d, field) === value)
            .map(([id, d]) => ({ id, data: () => ({ ...d }) }));
          return { docs, empty: docs.length === 0 };
        },
      }),
      get: async () => ({ docs: Array.from(store.entries()).map(([id, d]) => ({ id, data: () => ({ ...d }) })) }),
    };
  }

  return { collection } as any;
}

const CTX: ReadinessCtx = { callerUid: 'officer-uid', tokenEmail: 'officer@example.com', sourceIp: '203.0.113.1' };
const UNIT_ADMIN_SCOPE: UnitPermissionScope = { kind: 'unitAdmin', tenantId: 'tenant-1', unitIds: ['battalion-1'] };
const TODAY_ISO = new Date().toISOString().slice(0, 10);

describe('write-then-read round trip (the exact gap that caused the 03.10.2026 production 500)', () => {
  it('a result recorded via computeRecordResult is readable via computeUnitRoster in the same test, against a Firestore-realistic fake db', async () => {
    const db = makeRealisticFakeDb({
      units: { 'tenant-1': { 'battalion-1': { name: 'Battalion One' } } },
      thresholds: {
        global: {
          id: 'global', version: 1, updatedBy: 'root', updatedAt: new Date(),
          tests: [{ id: 't1', label: 'Push-ups', metric: 'reps', unit: 'count', lowerIsBetter: false, threshold: { male: 40, female: 25 }, validityDays: 180 }],
        },
      },
    });

    const created = await computeCreateSoldier(db, UNIT_ADMIN_SCOPE, { name: 'Soldier A', unitId: 'battalion-1', gender: 'male' }, CTX);
    expect(created.status).toBe(200);
    if (created.status !== 200) return;
    const soldierId = created.body.soldierId;

    const recorded = await computeRecordResult(db, UNIT_ADMIN_SCOPE, { soldierId, testId: 't1', source: 'organized_test', value: 45, testDate: TODAY_ISO }, CTX);
    expect(recorded.status).toBe(200);

    // This is the exact call that threw a real 500 in production the
    // instant the first readiness_results document ever existed.
    const roster = await computeUnitRoster(db, UNIT_ADMIN_SCOPE, {});
    expect(roster.status).toBe(200);
    if (roster.status === 200) {
      expect(roster.body.soldiers).toHaveLength(1);
      expect(roster.body.soldiers[0].currentStatus).toBe('pass');
    }
  });

  it('a linked soldier\'s linkedAt survives the roster read as a real ISO string, not silently null (the Timestamp-vs-Date gap also hit toIsoOrNull)', async () => {
    const db = makeRealisticFakeDb({
      soldiers: {
        s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Already Linked', gender: 'male', uid: 'real-uid', linkedAt: new Date('2026-01-01'), mergedInto: null },
      },
    });
    const roster = await computeUnitRoster(db, UNIT_ADMIN_SCOPE, {});
    expect(roster.status).toBe(200);
    if (roster.status === 200) {
      expect(roster.body.soldiers[0].linkedAt).not.toBeNull();
      expect(roster.body.soldiers[0].linkedAt).toBe(new Date('2026-01-01').toISOString());
    }
  });

  it('a soldier with no readiness_results at all still reads back cleanly (the common, pre-incident case — must not regress)', async () => {
    const db = makeRealisticFakeDb({
      soldiers: { s1: { tenantId: 'tenant-1', unitId: 'battalion-1', name: 'Untested', gender: 'male', uid: null, linkedAt: null, mergedInto: null } },
      thresholds: { global: { id: 'global', version: 1, updatedBy: 'root', updatedAt: new Date(), tests: [{ id: 't1', label: 'X', metric: 'reps', unit: 'count', lowerIsBetter: false, threshold: { male: 1, female: 1 }, validityDays: 180 }] } },
    });
    const roster = await computeUnitRoster(db, UNIT_ADMIN_SCOPE, {});
    expect(roster.status).toBe(200);
    if (roster.status === 200) expect(roster.body.soldiers[0].currentStatus).toBe('not_yet_tested');
  });
});
