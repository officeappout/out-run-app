import { describe, it, expect } from 'vitest';
import { isDemoResident, isExcludedFromGlobalKpis, isExcludedResident, isTestOrMockUser } from '../testAccountFilter';

describe('isTestOrMockUser', () => {
  it('excludes a doc with core.isMockData === true', () => {
    expect(isTestOrMockUser({ isMockData: true })).toBe(true);
  });

  it('excludes a doc with core.isTestData === true', () => {
    expect(isTestOrMockUser({ isTestData: true })).toBe(true);
  });

  it('excludes a doc with both flags set', () => {
    expect(isTestOrMockUser({ isMockData: true, isTestData: true })).toBe(true);
  });

  it('does NOT exclude a real resident (neither flag set)', () => {
    expect(isTestOrMockUser({})).toBe(false);
  });

  it('does NOT exclude a doc where core is undefined (legacy doc with no core object at all)', () => {
    expect(isTestOrMockUser(undefined)).toBe(false);
    expect(isTestOrMockUser(null)).toBe(false);
  });

  it('does NOT exclude a doc where the flag is present but falsy/non-true (e.g. false, or a stray string)', () => {
    expect(isTestOrMockUser({ isMockData: false })).toBe(false);
    expect(isTestOrMockUser({ isTestData: 'true' as unknown as boolean })).toBe(false);
  });
});

// ── Demo world (PR 2) ──────────────────────────────────────────────────────

const REAL_CORES = [
  {},
  { isMockData: true },
  { isTestData: true },
  { isMockData: true, isTestData: true },
  { isMockData: false, isTestData: false },
  { isMockData: 'true' },
];

describe('isExcludedResident — real authority is byte-identical to isTestOrMockUser', () => {
  it('every real-uid core gets exactly the old answer on a real authority', () => {
    for (const core of REAL_CORES) {
      expect(isExcludedResident(core, { authorityIsDemo: false, uid: 'realUid' })).toBe(isTestOrMockUser(core));
      expect(isExcludedResident(core, { authorityIsDemo: false })).toBe(isTestOrMockUser(core));
    }
    expect(isExcludedResident(null, { authorityIsDemo: false })).toBe(false);
  });

  it('a real authority also never counts a demo user (uid prefix or core.demo stamp)', () => {
    expect(isExcludedResident({}, { authorityIsDemo: false, uid: 'demo_c07' })).toBe(true);
    expect(isExcludedResident({ demo: { tenantId: 'demo-city' } }, { authorityIsDemo: false, uid: 'x' })).toBe(true);
  });
});

describe('isExcludedResident — demo authority counts its demo residents', () => {
  it('demo residents count, test accounts (the viewers) never do', () => {
    expect(isExcludedResident({ isMockData: true, demo: { v: 1 } }, { authorityIsDemo: true, uid: 'demo_c07' })).toBe(false);
    expect(isExcludedResident({ isMockData: true }, { authorityIsDemo: true })).toBe(false);
    expect(isExcludedResident({ isTestData: true }, { authorityIsDemo: true, uid: 'viewerUid' })).toBe(true);
    expect(isExcludedResident({}, { authorityIsDemo: true, uid: 'someone' })).toBe(false);
  });
});

describe('isExcludedFromGlobalKpis / isDemoResident', () => {
  it('global KPIs drop test, mock and demo', () => {
    for (const core of REAL_CORES) expect(isExcludedFromGlobalKpis(core, 'realUid')).toBe(isTestOrMockUser(core));
    expect(isExcludedFromGlobalKpis({}, 'demo_c01')).toBe(true);
    expect(isExcludedFromGlobalKpis({ demo: { v: 1 } }, 'x')).toBe(true);
  });
  it('isDemoResident', () => {
    expect(isDemoResident({ isMockData: true })).toBe(true);
    expect(isDemoResident({}, 'demo_1')).toBe(true);
    expect(isDemoResident({ isTestData: true }, 'u')).toBe(false);
  });
});
