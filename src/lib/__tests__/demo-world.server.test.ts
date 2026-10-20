/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes */
import { describe, it, expect, beforeEach } from 'vitest';
import { getDemoViewerUids, isInDemoWorld, resolveTenantIsDemo, __resetDemoWorldCachesForTests } from '../demo-world.server';
import { makeFakeAdminDb } from './helpers/fake-admin-db';

beforeEach(() => __resetDemoWorldCachesForTests());

describe('demo-world.server — viewers', () => {
  it('a demo uid is in the demo world without any read', async () => {
    const { db, reads } = makeFakeAdminDb();
    await expect(isInDemoWorld(db, 'demo_c07')).resolves.toBe(true);
    expect(reads).toEqual([]);
  });

  it('a registered viewer is in; a real user is not', async () => {
    const { db } = makeFakeAdminDb({ 'demo_registry/viewers': { uids: ['viewerA', 3, ''] } });
    await expect(isInDemoWorld(db, 'viewerA')).resolves.toBe(true);
    await expect(isInDemoWorld(db, 'realUser')).resolves.toBe(false);
    await expect(isInDemoWorld(db, null)).resolves.toBe(false);
  });

  it('the viewers doc is read once and shared (cached per instance)', async () => {
    const { db, reads } = makeFakeAdminDb({ 'demo_registry/viewers': { uids: ['v'] } });
    await Promise.all([isInDemoWorld(db, 'a'), isInDemoWorld(db, 'b'), getDemoViewerUids(db)]);
    await isInDemoWorld(db, 'c');
    expect(reads.filter((r) => r === 'demo_registry/viewers')).toHaveLength(1);
  });

  it('fails closed: missing doc or read error ⇒ no viewers', async () => {
    const { db } = makeFakeAdminDb();
    await expect(isInDemoWorld(db, 'v')).resolves.toBe(false);
    const broken: any = { collection: () => ({ doc: () => ({ get: async () => { throw new Error('boom'); } }) }) };
    await expect(isInDemoWorld(broken, 'v')).resolves.toBe(false);
  });
});

describe('demo-world.server — resolveTenantIsDemo', () => {
  it('a real id never costs a read', async () => {
    const { db, reads } = makeFakeAdminDb({ 'authorities/sderot': { isDemo: true } });
    await expect(resolveTenantIsDemo(db, 'authorities', 'sderot')).resolves.toBe(false);
    await expect(resolveTenantIsDemo(db, 'authorities', null)).resolves.toBe(false);
    expect(reads).toEqual([]);
  });

  it('needs BOTH the demo- prefix and isDemo:true', async () => {
    const { db } = makeFakeAdminDb({
      'authorities/demo-city': { isDemo: true },
      'authorities/demo-unflagged': { name: 'x' },
      'tenants/demo-unit': { isDemo: true },
    });
    await expect(resolveTenantIsDemo(db, 'authorities', 'demo-city')).resolves.toBe(true);
    await expect(resolveTenantIsDemo(db, 'authorities', 'demo-unflagged')).resolves.toBe(false);
    await expect(resolveTenantIsDemo(db, 'authorities', 'demo-missing')).resolves.toBe(false);
    await expect(resolveTenantIsDemo(db, 'tenants', 'demo-unit')).resolves.toBe(true);
  });

  it('caches the answer per id', async () => {
    const { db, reads } = makeFakeAdminDb({ 'authorities/demo-city': { isDemo: true } });
    await resolveTenantIsDemo(db, 'authorities', 'demo-city');
    await resolveTenantIsDemo(db, 'authorities', 'demo-city');
    expect(reads).toEqual(['authorities/demo-city']);
  });
});
