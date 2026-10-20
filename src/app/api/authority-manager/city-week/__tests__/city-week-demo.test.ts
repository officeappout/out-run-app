/**
 * Demo world on the authority dashboards (demo-users-design.md PR 2), pinned
 * through city-week (the shared isExcludedResident rule every
 * authority-manager route uses):
 *   - a real city: test, legacy mock and demo residents never count — the
 *     same numbers as before demo users existed;
 *   - a demo city (demo- id AND isDemo:true): its demo residents count, test
 *     accounts (the owner's viewers) still don't.
 */
import { describe, expect, it, vi } from 'vitest';
import { makeFakeAdminDb } from '@/lib/__tests__/helpers/fake-admin-db';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminAuth: () => ({}), getAdminDb: () => ({}) }));

import { computeCityWeekForAuthority } from '../route';
import { __resetDemoWorldCachesForTests } from '@/lib/demo-world.server';

const NOW = new Date('2026-10-20T10:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const run = (userId: string, n: number) => ({ userId, date: daysAgo(n), workoutType: 'running' });

function seed(cityId: string, cityDoc: Record<string, unknown>) {
  __resetDemoWorldCachesForTests();
  return makeFakeAdminDb({
    [`authorities/${cityId}`]: cityDoc,
    'users/real1': { core: { authorityId: cityId } },
    'users/real2': { core: { authorityId: cityId } },
    'users/mock1': { core: { authorityId: cityId, isMockData: true } },
    'users/test1': { core: { authorityId: cityId, isTestData: true } },
    'users/demo_c01': { core: { authorityId: cityId, isMockData: true, demo: { tenantId: cityId, v: 1 } } },
    'users/demo_c02': { core: { authorityId: cityId, isMockData: true, demo: { tenantId: cityId, v: 1 } } },
    'workouts/w1': run('real1', 1),
    'workouts/w2': run('real2', 2),
    'workouts/w3': run('mock1', 1),
    'workouts/w4': run('test1', 1),
    'workouts/w5': run('demo_c01', 1),
    'workouts/w6': run('demo_c02', 3),
  });
}

describe('city-week — demo-aware resident filter', () => {
  it('a real city counts only real residents (test, mock and demo excluded — unchanged)', async () => {
    const { db } = seed('sderot', { name: 'שדרות' });
    const r = await computeCityWeekForAuthority(db, 'sderot', NOW);
    expect(r.status).toBe(200);
    if (r.status !== 200) return;
    expect(r.body.activeThisWeek).toBe(2);
    expect(r.body.workoutsThisWeek).toBe(2);
  });

  it('a city with isDemo:true but no demo- prefix is treated as real', async () => {
    const { db } = seed('sderot', { name: 'שדרות', isDemo: true });
    const r = await computeCityWeekForAuthority(db, 'sderot', NOW);
    if (r.status !== 200) throw new Error('expected 200');
    expect(r.body.activeThisWeek).toBe(2);
  });

  it('a demo city counts its demo residents (and legacy mock), never test accounts', async () => {
    const { db } = seed('demo-city', { name: 'עיריית דמו', isDemo: true });
    const r = await computeCityWeekForAuthority(db, 'demo-city', NOW);
    if (r.status !== 200) throw new Error('expected 200');
    // real1, real2, mock1, demo_c01, demo_c02 — test1 excluded
    expect(r.body.activeThisWeek).toBe(5);
    expect(r.body.workoutsThisWeek).toBe(5);
  });

  it('a demo- id without isDemo:true does NOT count demo residents (inclusion needs both markers)', async () => {
    const { db } = seed('demo-city', { name: 'x' });
    const r = await computeCityWeekForAuthority(db, 'demo-city', NOW);
    if (r.status !== 200) throw new Error('expected 200');
    expect(r.body.activeThisWeek).toBe(2);
  });
});
