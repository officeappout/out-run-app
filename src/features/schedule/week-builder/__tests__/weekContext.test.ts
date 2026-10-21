import { describe, expect, it } from 'vitest';
import { weekContextLineHe } from '../weekContext';
import { OPEN_SUN_FRI, run, strength, week } from './fixtures';

describe('weekContextLineHe (Kelly "סדר לי במילים")', () => {
  it('the training days in order, a double day joined with +', () => {
    const w = week(OPEN_SUN_FRI, [
      [0, { ...run('q', 'quality_primary'), titleHe: 'אימון איכות' }],
      [0, { ...strength('l', 'legs'), titleHe: 'רגליים' }],
      [4, { ...run('long', 'long_run'), titleHe: 'ריצה ארוכה' }],
    ]);
    expect(weekContextLineHe(w)).toBe('א׳ אימון איכות + רגליים · ה׳ ריצה ארוכה');
  });
  it('an empty week is an empty line', () => {
    expect(weekContextLineHe(week(OPEN_SUN_FRI, []))).toBe('');
  });
});
