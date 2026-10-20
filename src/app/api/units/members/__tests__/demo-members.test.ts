/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes */
/**
 * Demo world (demo-users-design.md PR 2): a demo soldier is listed only in a
 * demo unit. A real tenant's roster is unchanged (test / legacy mock members
 * are still listed exactly as before — this route never filtered them).
 */
import { describe, expect, it, vi } from 'vitest';
import { makeFakeAdminDb } from '@/lib/__tests__/helpers/fake-admin-db';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminAuth: () => ({}), getAdminDb: () => ({}) }));

import { computeUnitMembers } from '../route';
import { __resetDemoWorldCachesForTests } from '@/lib/demo-world.server';

function seed(tenantId: string, tenantDoc: Record<string, unknown>) {
  __resetDemoWorldCachesForTests();
  return makeFakeAdminDb({
    [`tenants/${tenantId}`]: tenantDoc,
    [`tenants/${tenantId}/units/u1`]: { name: 'פלוגה א' },
    'users/s1': { core: { tenantId, unitId: 'u1', name: 'חייל' } },
    'users/t1': { core: { tenantId, unitId: 'u1', name: 'טסט', isTestData: true } },
    'users/m1': { core: { tenantId, unitId: 'u1', name: 'מוק', isMockData: true } },
    'users/demo_s1': { core: { tenantId, unitId: 'u1', name: 'דמו', isMockData: true, demo: { tenantId, v: 1 } } },
  });
}

const uidsOf = (r: any) => r.body.units[0].approvedMembers.map((m: any) => m.uid).sort();

describe('computeUnitMembers — demo soldiers', () => {
  it('a real tenant: unchanged roster, minus any demo soldier', async () => {
    const { db } = seed('brigade-810', { name: 'חטיבה' });
    const r: any = await computeUnitMembers(db, { kind: 'root' }, { tenantId: 'brigade-810' });
    expect(r.status).toBe(200);
    expect(uidsOf(r)).toEqual(['m1', 's1', 't1']);
  });

  it('a demo tenant (demo- id AND isDemo:true) lists its demo soldiers', async () => {
    const { db } = seed('demo-unit', { name: 'יחידת דמו', isDemo: true });
    const r: any = await computeUnitMembers(db, { kind: 'root' }, { tenantId: 'demo-unit' });
    expect(uidsOf(r)).toEqual(['demo_s1', 'm1', 's1', 't1']);
  });
});
