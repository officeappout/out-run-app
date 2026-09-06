import { describe, expect, it } from 'vitest';
import { buildDailyStatsIncrement } from '../link-stats-write';

describe('buildDailyStatsIncrement', () => {
  it('buckets into the correct date/device/hour/day-of-week/country/city keys', () => {
    const { docId, data } = buildDailyStatsIncrement({
      clickedAt: new Date('2026-07-15T20:00:00Z'), // 23:00 Israel local
      device: 'android',
      country: 'IL',
      city: 'Haifa',
    });

    expect(docId).toBe('2026-07-15');
    expect(data.date).toBe('2026-07-15');
    expect(data.byDevice).toHaveProperty('android');
    expect(data.byHour).toHaveProperty('23');
    expect(data.byCountry).toEqual({ IL: expect.anything() });
    expect(data.byCity).toEqual({ Haifa: expect.anything() });
  });

  it('omits byCountry/byCity entirely when not provided, rather than writing null/empty', () => {
    const { data } = buildDailyStatsIncrement({
      clickedAt: new Date(), device: 'desktop', country: null, city: null,
    });
    expect(data.byCountry).toBeUndefined();
    expect(data.byCity).toBeUndefined();
  });
});
