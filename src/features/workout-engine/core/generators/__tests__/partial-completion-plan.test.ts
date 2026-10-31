import { describe, it, expect } from 'vitest';
import { isTopUpEvening, topUpMinutes } from '../partial-completion-plan';

describe('topUpMinutes (board HomeAfterRules: length by the missing sets)', () => {
  it('about 2 minutes a set plus a warm-up, rounded to 5, 10..30', () => {
    expect(topUpMinutes(2)).toBe(10);
    expect(topUpMinutes(4)).toBe(10);
    expect(topUpMinutes(6)).toBe(15);
    expect(topUpMinutes(8)).toBe(20);
    expect(topUpMinutes(20)).toBe(30);
    expect(topUpMinutes(0)).toBe(10);
  });
});

describe('isTopUpEvening', () => {
  it('after 18:00, or when evening workouts are preferred', () => {
    expect(isTopUpEvening({ hour: 17 })).toBe(false);
    expect(isTopUpEvening({ hour: 18 })).toBe(true);
    expect(isTopUpEvening({ hour: 9, preferEvening: true })).toBe(true);
  });
});
