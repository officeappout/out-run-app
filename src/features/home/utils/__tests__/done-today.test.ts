import { describe, expect, it } from 'vitest';
import { nextPlannedDay, totalMinutes, totalXp } from '../done-today';

describe('totalXp', () => {
  it('sums recorded XP, ignores missing / bad values', () => {
    expect(totalXp([{ duration: 600, xpEarned: 40 }, { duration: 300 }, { duration: 1, xpEarned: NaN }, { duration: 1, xpEarned: 15 }])).toBe(55);
  });
  it('no XP anywhere → 0', () => expect(totalXp([{ duration: 600 }])).toBe(0));
});

describe('totalMinutes', () => {
  it('sums the rows', () => expect(totalMinutes([25, 12, 0])).toBe(37));
  it('ignores bad values', () => expect(totalMinutes([NaN, -3, 10])).toBe(10));
});

describe('nextPlannedDay', () => {
  // Sunday = 0 … Saturday = 6, letters א…ש
  it('tomorrow', () => expect(nextPlannedDay(['א', 'ג'], 1)).toEqual({ offset: 1, label: 'מחר' }));
  it('a later day by name', () => expect(nextPlannedDay(['א', 'ה'], 1)).toEqual({ offset: 3, label: 'יום חמישי' }));
  it('wraps the week', () => expect(nextPlannedDay(['ב'], 5)).toEqual({ offset: 3, label: 'יום שני' }));
  it('only today scheduled → same day next week', () => expect(nextPlannedDay(['ג'], 2)).toEqual({ offset: 7, label: 'יום שלישי' }));
  it('no schedule → null', () => expect(nextPlannedDay([], 3)).toBeNull());
});
