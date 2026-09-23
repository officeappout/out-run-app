import { describe, it, expect } from 'vitest';
import { isTestOrMockUser } from '../testAccountFilter';

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
