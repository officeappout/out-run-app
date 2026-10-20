import { describe, it, expect } from 'vitest';
import {
  demoSafeScopeTargets,
  isDemoCore,
  isDemoTenant,
  isDemoTenantId,
  isDemoUid,
  isDemoUser,
  restrictToDemoWorld,
  withoutDemoUids,
} from '../demo';

describe('demo identity helpers (functions)', () => {
  it('isDemoUid — only the demo_ prefix, only strings', () => {
    expect(isDemoUid('demo_c07')).toBe(true);
    for (const v of ['demo-c07', 'Demo_c07', 'xdemo_c07', 'abc123', '', null, undefined, 7, {}]) {
      expect(isDemoUid(v)).toBe(false);
    }
  });

  it('isDemoTenantId — only the demo- prefix', () => {
    expect(isDemoTenantId('demo-city')).toBe(true);
    expect(isDemoTenantId('demo-city-n2')).toBe(true);
    for (const v of ['demo_city', 'sderot', 'battalion-890', '', null, undefined]) expect(isDemoTenantId(v)).toBe(false);
  });

  it('isDemoCore / isDemoUser — the core.demo stamp or the uid prefix', () => {
    expect(isDemoCore({ demo: { tenantId: 'demo-city', v: 1 } })).toBe(true);
    expect(isDemoCore({ demo: true })).toBe(false);
    expect(isDemoCore({ isMockData: true })).toBe(false); // the old seeds are NOT the demo world
    expect(isDemoCore(null)).toBe(false);
    expect(isDemoUser('demo_x')).toBe(true);
    expect(isDemoUser('real', { demo: { v: 1 } })).toBe(true);
    expect(isDemoUser('real', { name: 'x' })).toBe(false);
    expect(isDemoUser('sderot-mock-1', { isMockData: true })).toBe(false);
  });

  it('isDemoTenant — isDemo:true OR the id prefix (fail closed for exclusion)', () => {
    expect(isDemoTenant({ isDemo: true }, 'anything')).toBe(true);
    expect(isDemoTenant({}, 'demo-unit')).toBe(true);
    expect(isDemoTenant(null, 'demo-unit')).toBe(true);
    expect(isDemoTenant({ isDemo: 'true' }, 'sderot')).toBe(false);
    expect(isDemoTenant({ isDemo: false }, 'sderot')).toBe(false);
    expect(isDemoTenant(undefined)).toBe(false);
  });

  it('withoutDemoUids keeps every real uid in order', () => {
    expect(withoutDemoUids(['a', 'demo_1', 'b', 'demo_2'])).toEqual(['a', 'b']);
    expect(withoutDemoUids([])).toEqual([]);
  });

  it('restrictToDemoWorld — demo uids + registered viewers only', () => {
    expect(restrictToDemoWorld(['real', 'demo_1', 'viewer'], new Set(['viewer']))).toEqual(['demo_1', 'viewer']);
    expect(restrictToDemoWorld(['real', 'demo_1'], new Set())).toEqual(['demo_1']);
  });

  it('demoSafeScopeTargets — a demo user counts toward demo scopes only; real users untouched', () => {
    const targets = [
      { granularity: 'city', scopeId: 'sderot' },
      { granularity: 'city', scopeId: 'demo-city' },
      { granularity: 'neighborhood', scopeId: 'demo-city-n2' },
      { granularity: 'group', scopeId: 'military_reserve_general' },
      { granularity: 'group', scopeId: 'demo-grp-walk' },
    ];
    expect(demoSafeScopeTargets('demo_c1', {}, targets).map((t) => t.scopeId)).toEqual(['demo-city', 'demo-city-n2', 'demo-grp-walk']);
    expect(demoSafeScopeTargets('x', { demo: { v: 1 } }, targets).map((t) => t.scopeId)).toEqual(['demo-city', 'demo-city-n2', 'demo-grp-walk']);
    expect(demoSafeScopeTargets('real', {}, targets)).toBe(targets);
  });
});
