import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => { throw new Error('getAdminDb should never be called from compute*() functions — db is always injected'); },
}));

import { computeReadinessAppActivity, computeFailToPassCount, statusAsOf, ACTIVE_WINDOW_DAYS } from '../readiness-app-activity.service';
import type { UnitPermissionScope } from '@/lib/unitPermissionScope';
import type { ReadinessResult } from '../readiness-write.service';

interface FakeDoc { [key: string]: unknown }

type Predicate = (d: FakeDoc) => boolean;

/**
 * Real Firestore comparison operators run SERVER-SIDE against whatever
 * Timestamp/Date representation is stored — this fake, running the
 * comparison in local JS instead, has to normalize both sides itself to
 * avoid a false "Timestamp instance >= Date instance" mismatch that the
 * real server would never produce. Mirrors the SAME toDate()-style
 * normalization already established in readiness-read.service.ts.
 */
function toMillis(v: unknown): number {
  if (v instanceof Date) return v.getTime();
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as { toMillis: () => number }).toMillis();
  return v as number;
}

function buildQuery(docs: [string, FakeDoc][], predicates: Predicate[] = []) {
  return {
    where(field: string, op: string, value: unknown) {
      const next: Predicate = (d: FakeDoc) => {
        const v = d[field];
        if (op === '==') return v === value;
        if (op === 'in') return Array.isArray(value) && (value as unknown[]).includes(v);
        if (op === '>=') return toMillis(v) >= toMillis(value);
        if (op === '<=') return toMillis(v) <= toMillis(value);
        throw new Error(`unexpected op: ${op}`);
      };
      return buildQuery(docs, [...predicates, next]);
    },
    select() {
      return this; // no-op in this fake — every doc already carries every field
    },
    async get() {
      const matched = docs.filter(([, d]) => predicates.every((p) => p(d)));
      return { docs: matched.map(([id, d]) => ({ id, data: () => ({ ...d }) })), empty: matched.length === 0 };
    },
  };
}

function makeFakeDb(seed: {
  soldiers?: Record<string, FakeDoc>;
  results?: Record<string, FakeDoc>;
  thresholds?: Record<string, FakeDoc>;
  workouts?: Record<string, FakeDoc>;
}) {
  const stores: Record<string, Map<string, FakeDoc>> = {
    readiness_soldiers: new Map(Object.entries(seed.soldiers ?? {})),
    readiness_results: new Map(Object.entries(seed.results ?? {})),
    readiness_thresholds: new Map(Object.entries(seed.thresholds ?? {})),
    workouts: new Map(Object.entries(seed.workouts ?? {})),
  };

  function collection(name: string): any {
    const store = stores[name];
    if (!store) throw new Error(`unexpected collection: ${name}`);
    return {
      doc: (id: string) => ({
        get: async () => {
          const d = store.get(id);
          return { id, exists: d !== undefined, data: () => (d ? { ...d } : undefined) };
        },
      }),
      ...buildQuery(Array.from(store.entries())),
    };
  }

  return { collection } as any;
}

const TENANT_OWNER_SCOPE: UnitPermissionScope = { kind: 'tenantOwner', tenantId: 'tenant-1' };
const UNIT_ADMIN_SCOPE: UnitPermissionScope = { kind: 'unitAdmin', tenantId: 'tenant-1', unitIds: ['battalion-1'] };

function soldier(unitId: string, uid: string | null): FakeDoc {
  return { tenantId: 'tenant-1', unitId, name: 'Soldier', gender: 'male', uid, mergedInto: null };
}

function workout(userId: string, daysAgo: number): FakeDoc {
  return { userId, date: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000) };
}

describe('computeReadinessAppActivity — scope resolution', () => {
  it('unknown scope → 503', async () => {
    const db = makeFakeDb({});
    const result = await computeReadinessAppActivity(db, { kind: 'unknown' }, {});
    expect(result.status).toBe(503);
  });

  it('denied scope → 403', async () => {
    const db = makeFakeDb({});
    const result = await computeReadinessAppActivity(db, { kind: 'denied' }, {});
    expect(result.status).toBe(403);
  });
});

describe('computeReadinessAppActivity — the denominator is EVERY soldier, not just linked (David\'s explicit rule)', () => {
  it('a linked soldier with no workouts in the window → not active, but still counted in the denominator', async () => {
    const db = makeFakeDb({
      soldiers: { s1: soldier('battalion-1', 'uid-1') },
    });
    const result = await computeReadinessAppActivity(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.body.totalCount).toBe(1);
      expect(result.body.linkedCount).toBe(1);
      expect(result.body.activeCount).toBe(0);
      expect(result.body.activePercent).toBe(0);
    }
  });

  it('a linked soldier with a workout 29 days ago → active', async () => {
    const db = makeFakeDb({
      soldiers: { s1: soldier('battalion-1', 'uid-1') },
      workouts: { w1: workout('uid-1', 29) },
    });
    const result = await computeReadinessAppActivity(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.body.activeCount).toBe(1);
      expect(result.body.activePercent).toBe(100);
    }
  });

  it('a linked soldier whose only workout was 31 days ago → NOT active', async () => {
    const db = makeFakeDb({
      soldiers: { s1: soldier('battalion-1', 'uid-1') },
      workouts: { w1: workout('uid-1', 31) },
    });
    const result = await computeReadinessAppActivity(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.body.activeCount).toBe(0);
      expect(result.body.activePercent).toBe(0);
    }
  });

  it('an unlinked soldier is counted in the denominator, never a candidate for the numerator (no uid to query by)', async () => {
    const db = makeFakeDb({
      soldiers: {
        s1: soldier('battalion-1', null),
        s2: soldier('battalion-1', 'uid-2'),
      },
      workouts: { w1: workout('uid-2', 1) },
    });
    const result = await computeReadinessAppActivity(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.body.totalCount).toBe(2);
      expect(result.body.linkedCount).toBe(1);
      expect(result.body.activeCount).toBe(1);
      expect(result.body.activePercent).toBe(50); // 1 active / 2 total, NOT 1/1
    }
  });

  it('0 linked soldiers → card reports 0%, "0 linked," and does not throw', async () => {
    const db = makeFakeDb({
      soldiers: { s1: soldier('battalion-1', null), s2: soldier('battalion-1', null) },
    });
    const result = await computeReadinessAppActivity(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.body.linkedCount).toBe(0);
      expect(result.body.activeCount).toBe(0);
      expect(result.body.activePercent).toBe(0);
    }
  });

  it('no soldiers at all → activePercent is null (no roster, not a real 0%)', async () => {
    const db = makeFakeDb({});
    const result = await computeReadinessAppActivity(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body.activePercent).toBeNull();
  });
});

describe('computeReadinessAppActivity — batching beyond Firestore\'s 30-value "in" cap', () => {
  it('35 linked soldiers, all active → chunking works, nobody falls through the cracks', async () => {
    const soldiers: Record<string, FakeDoc> = {};
    const workouts: Record<string, FakeDoc> = {};
    for (let i = 0; i < 35; i++) {
      const uid = `uid-${i}`;
      soldiers[`s${i}`] = soldier('battalion-1', uid);
      workouts[`w${i}`] = workout(uid, 1);
    }
    const db = makeFakeDb({ soldiers, workouts });
    const result = await computeReadinessAppActivity(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.body.totalCount).toBe(35);
      expect(result.body.linkedCount).toBe(35);
      expect(result.body.activeCount).toBe(35); // every single one, across >1 batch of 30
    }
  });
});

describe('computeReadinessAppActivity — per-unit breakdown + scope narrowing', () => {
  it('a unitAdmin only sees their own unit\'s soldiers (same scope narrowing as the rest of this build)', async () => {
    const db = makeFakeDb({
      soldiers: {
        s1: soldier('battalion-1', 'uid-1'),
        s2: soldier('OTHER-unit', 'uid-2'),
      },
      workouts: { w1: workout('uid-1', 1), w2: workout('uid-2', 1) },
    });
    const result = await computeReadinessAppActivity(db, UNIT_ADMIN_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.body.totalCount).toBe(1);
      expect(result.body.units).toEqual([{ unitId: 'battalion-1', totalCount: 1, linkedCount: 1, activeCount: 1 }]);
    }
  });
});

describe('computeFailToPassCount + statusAsOf — the pure transition logic', () => {
  const TEST_IDS = ['run_3000m'];
  function resultAt(testId: string, outcome: 'pass' | 'fail', testDate: Date, recordedAt: Date = testDate): ReadinessResult {
    return {
      id: 'r', soldierId: 's1', tenantId: 'tenant-1', unitId: 'battalion-1', testId, outcome,
      value: null, notPerformedReason: null, source: 'organized_test', thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 1, lowerIsBetter: false, validityDays: 365 },
      recordedBy: 'admin', recordedAt, testDate, uid: 'uid-1',
    };
  }

  it('today\'s real production shape — every soldier has exactly ONE distinct test date → count is null, not 0', () => {
    const day1 = new Date('2026-09-01');
    const soldiers = [{ results: [resultAt('run_3000m', 'fail', day1)] }];
    const { count, eligibleCount } = computeFailToPassCount(soldiers, TEST_IDS);
    expect(count).toBeNull();
    expect(eligibleCount).toBe(0);
  });

  it('a soldier with two distinct test dates, fail then pass → counted', () => {
    const day1 = new Date('2026-09-01');
    const day2 = new Date('2026-10-01');
    const soldiers = [{ results: [resultAt('run_3000m', 'fail', day1), resultAt('run_3000m', 'pass', day2)] }];
    const { count, eligibleCount } = computeFailToPassCount(soldiers, TEST_IDS);
    expect(eligibleCount).toBe(1);
    expect(count).toBe(1);
  });

  it('a soldier with two distinct test dates, fail then fail (no transition) → not counted, but IS eligible (real 0, not null)', () => {
    const day1 = new Date('2026-09-01');
    const day2 = new Date('2026-10-01');
    const soldiers = [{ results: [resultAt('run_3000m', 'fail', day1), resultAt('run_3000m', 'fail', day2)] }];
    const { count, eligibleCount } = computeFailToPassCount(soldiers, TEST_IDS);
    expect(eligibleCount).toBe(1);
    expect(count).toBe(0);
  });

  it('statusAsOf ignores a result whose testDate is AFTER the as-of date (can\'t see the future)', () => {
    const past = new Date('2026-01-01');
    const future = new Date('2026-12-01');
    const results = [resultAt('run_3000m', 'pass', future)];
    expect(statusAsOf(results, TEST_IDS, past)).toBe('not_yet_tested');
  });
});
