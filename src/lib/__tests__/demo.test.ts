import { describe, it, expect } from 'vitest';
import * as client from '../demo';
// functions/ has its own copy (it cannot import from src/) — pin that both agree.
import * as server from '../../../functions/src/lib/demo';

const SAMPLES: unknown[] = ['demo_c07', 'demo-city', 'Demo_x', 'sderot', '', null, undefined, 3, {}];

describe('src/lib/demo.ts mirrors functions/src/lib/demo.ts', () => {
  it('same prefixes', () => {
    expect(client.DEMO_UID_PREFIX).toBe(server.DEMO_UID_PREFIX);
    expect(client.DEMO_TENANT_PREFIX).toBe(server.DEMO_TENANT_PREFIX);
  });
  it('same answers for every shared helper', () => {
    for (const v of SAMPLES) {
      expect(client.isDemoUid(v)).toBe(server.isDemoUid(v));
      expect(client.isDemoTenantId(v)).toBe(server.isDemoTenantId(v));
      expect(client.isDemoCore({ demo: v })).toBe(server.isDemoCore({ demo: v }));
      expect(client.isDemoUser(v)).toBe(server.isDemoUser(v));
      expect(client.isDemoTenant({ isDemo: v }, v)).toBe(server.isDemoTenant({ isDemo: v }, v));
    }
    const uids = ['a', 'demo_1', 'viewer'];
    expect(client.withoutDemoUids(uids)).toEqual(server.withoutDemoUids(uids));
    expect(client.restrictToDemoWorld(uids, new Set(['viewer']))).toEqual(server.restrictToDemoWorld(uids, new Set(['viewer'])));
  });
});

describe('isDemoScope — national league boards (scope-stats)', () => {
  it('drops a demo city, a flagged authority and a neighborhood of a demo city', () => {
    expect(client.isDemoScope('demo-city')).toBe(true);
    expect(client.isDemoScope('abc', { isDemo: true })).toBe(true);
    expect(client.isDemoScope('hood-1', { parentId: 'demo-city' })).toBe(true);
  });
  it('keeps real cities and neighborhoods', () => {
    expect(client.isDemoScope('sderot', { isDemo: false, parentId: null })).toBe(false);
    expect(client.isDemoScope('hood-1', { parentId: 'sderot' })).toBe(false);
    expect(client.isDemoScope('x')).toBe(false);
  });
});

describe('isDemoDoc / withoutDemoDocs — client discovery lists', () => {
  it('recognises a demo doc by flag, id, owner or scope', () => {
    expect(client.isDemoDoc({ isDemo: true }, 'g1')).toBe(true);
    expect(client.isDemoDoc({}, 'demo-grp-walk')).toBe(true);
    expect(client.isDemoDoc({}, 'demo_c01')).toBe(true); // presence doc id = uid
    expect(client.isDemoDoc({ createdBy: 'demo_c01' }, 'g1')).toBe(true);
    expect(client.isDemoDoc({ userId: 'demo_c01' }, 's1')).toBe(true);
    expect(client.isDemoDoc({ authorityId: 'demo-city' }, 'e1')).toBe(true);
    expect(client.isDemoDoc({ groupId: 'demo-grp-run' }, 's1')).toBe(true);
  });
  it('keeps every real doc', () => {
    expect(client.isDemoDoc({ createdBy: 'u1', authorityId: 'sderot', isDemo: false }, 'g1')).toBe(false);
    expect(client.isDemoDoc(null, 'g1')).toBe(false);
    expect(client.isDemoDoc({ isMockData: true, userId: 'sderot-mock-1' }, 'x')).toBe(false);
  });
  it('withoutDemoDocs filters a list in order', () => {
    const items = [{ id: 'a' }, { id: 'demo-grp' }, { id: 'b', createdBy: 'demo_1' }, { id: 'c' }];
    expect(client.withoutDemoDocs(items).map((i) => i.id)).toEqual(['a', 'c']);
  });
});
