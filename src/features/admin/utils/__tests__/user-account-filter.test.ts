import { describe, it, expect } from 'vitest';
import { isTestOrMockUser } from '@/lib/testAccountFilter';
import { matchesAccountKind, type TestAccountFilter } from '../user-account-filter';

const REAL = {};
const TEST = { isTestData: true };
const MOCK = { isMockData: true };
const DEMO = { isMockData: true, isDemo: true };
const DEMO_ONLY_STAMP = { isDemo: true };

describe('matchesAccountKind', () => {
  it('without demo users, every filter gives the old answer', () => {
    for (const u of [REAL, TEST, MOCK]) {
      const old = isTestOrMockUser(u);
      const expectOld: Record<TestAccountFilter, boolean> = { ALL: true, HIDE: !old, ONLY: old };
      for (const f of ['ALL', 'HIDE', 'ONLY'] as TestAccountFilter[]) {
        expect(matchesAccountKind(u, { testFilter: f, demoOnly: false })).toBe(expectOld[f]);
      }
    }
  });

  it('HIDE (default) hides demo users, ONLY shows them', () => {
    for (const u of [DEMO, DEMO_ONLY_STAMP]) {
      expect(matchesAccountKind(u, { testFilter: 'HIDE', demoOnly: false })).toBe(false);
      expect(matchesAccountKind(u, { testFilter: 'ONLY', demoOnly: false })).toBe(true);
    }
  });

  it('the demo chip shows only demo users, whatever the test filter', () => {
    for (const f of ['ALL', 'HIDE', 'ONLY'] as TestAccountFilter[]) {
      expect(matchesAccountKind(DEMO, { testFilter: f, demoOnly: true })).toBe(true);
      expect(matchesAccountKind(REAL, { testFilter: f, demoOnly: true })).toBe(false);
      expect(matchesAccountKind(MOCK, { testFilter: f, demoOnly: true })).toBe(false);
      expect(matchesAccountKind(TEST, { testFilter: f, demoOnly: true })).toBe(false);
    }
  });
});
