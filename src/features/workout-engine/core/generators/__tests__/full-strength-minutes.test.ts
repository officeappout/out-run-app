import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));

import { fullStrengthAvailableMinutes } from '../full-strength-minutes';

const NOW = new Date('2026-10-27T10:00:00');
const user = (level: number, minutes?: number, start = '2026-10-26T08:00:00.000Z') => ({
  lifestyle: minutes == null ? {} : { sessionMinutes: minutes },
  progression: { tracks: { push: { currentLevel: level } }, activePrograms: [{ startDate: start }] },
});

describe('fullStrengthAvailableMinutes (AA3: no pills, the user\'s own length)', () => {
  it('no saved length keeps the context budget (unchanged for existing users)', () => {
    expect(fullStrengthAvailableMinutes(user(3), 30, NOW)).toBe(30);
    expect(fullStrengthAvailableMinutes(null, 30, NOW)).toBe(30);
  });
  it('level 6+ uses the chosen length', () => {
    expect(fullStrengthAvailableMinutes(user(7, 40), 30, NOW)).toBe(40);
  });
  it('the first-weeks ramp applies, same as the home hero', () => {
    expect(fullStrengthAvailableMinutes(user(1, 45), 30, NOW)).toBe(15);
    expect(fullStrengthAvailableMinutes(user(4, 45), 30, NOW)).toBe(20);
  });
});
