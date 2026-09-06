import { describe, expect, it } from 'vitest';
import { getIsraelDateKey, getIsraelDayOfWeek, getIsraelHour } from '../israelTime';

describe('Israel-local time bucketing (DST-aware via Intl, not manual UTC offset math)', () => {
  it('rolls the date forward across the UTC day boundary in winter (UTC+2)', () => {
    const winterUtcLateNight = new Date('2026-01-15T22:30:00Z'); // 00:30 Israel local
    expect(getIsraelDateKey(winterUtcLateNight)).toBe('2026-01-16');
    expect(getIsraelHour(winterUtcLateNight)).toBe(0);
  });

  it('applies the summer UTC+3 offset automatically', () => {
    const summerEvening = new Date('2026-07-15T20:00:00Z'); // 23:00 Israel local (DST)
    expect(getIsraelDateKey(summerEvening)).toBe('2026-07-15');
    expect(getIsraelHour(summerEvening)).toBe(23);
  });

  it('maps day-of-week with Sunday=0 (Israeli week), not ISO Monday=0', () => {
    // 2026-01-15T22:30Z = 2026-01-16 00:30 Israel-local, a Friday.
    const friday = new Date('2026-01-15T22:30:00Z');
    expect(getIsraelDayOfWeek(friday)).toBe(5);

    // 2026-01-16T22:30Z = 2026-01-17 00:30 Israel-local, a Saturday.
    const saturday = new Date('2026-01-16T22:30:00Z');
    expect(getIsraelDayOfWeek(saturday)).toBe(6);
  });
});
