import { describe, it, expect } from 'vitest';
import { publicRowOf, publicRowUnchanged } from '../daily-activity-public';

const D = '2026-10-19';

describe('publicRowOf', () => {
  it('mirrors only the public subset, defaults name/steps, fails age closed', () => {
    expect(publicRowOf({ userId: 'u1', authorityId: 'a1', steps: 4200, displayName: 'דנה', calories: 300 }, D, 'adult')).toEqual({
      uid: 'u1', displayName: 'דנה', steps: 4200, authorityId: 'a1', date: D, ageGroup: 'adult',
    });
    expect(publicRowOf({ userId: 'u1', authorityId: 'a1' }, D, undefined)).toEqual({
      uid: 'u1', displayName: '???', steps: 0, authorityId: 'a1', date: D, ageGroup: 'minor',
    });
  });
  it('no uid or no authorityId → not mirrored', () => {
    expect(publicRowOf({ authorityId: 'a1', steps: 5 }, D, 'adult')).toBeNull();
    expect(publicRowOf({ userId: 'u1', steps: 5 }, D, 'adult')).toBeNull();
  });
});

describe('publicRowUnchanged', () => {
  const row = publicRowOf({ userId: 'u1', authorityId: 'a1', steps: 4200, displayName: 'דנה' }, D, 'adult')!;
  it('identical existing doc (plus its updatedAt) → skip', () => {
    expect(publicRowUnchanged({ ...row, updatedAt: { seconds: 1 } }, row)).toBe(true);
  });
  it('missing doc, or any mirrored field changed → write', () => {
    expect(publicRowUnchanged(undefined, row)).toBe(false);
    expect(publicRowUnchanged({ ...row, steps: 4100 }, row)).toBe(false);
    expect(publicRowUnchanged({ ...row, displayName: 'D' }, row)).toBe(false);
    expect(publicRowUnchanged({ ...row, authorityId: 'a2' }, row)).toBe(false);
    expect(publicRowUnchanged({ ...row, ageGroup: 'minor' }, row)).toBe(false);
  });
});
