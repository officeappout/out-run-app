import { describe, expect, it } from 'vitest';
import {
  aggregateDailyStats,
  buildClickRecordsCsv,
  type DailyStatsDoc,
} from '../link-stats';

describe('aggregateDailyStats', () => {
  const docs: DailyStatsDoc[] = [
    {
      date: '2026-07-01', total: 10,
      byDevice: { ios: 6, android: 4 },
      byHour: { '20': 5, '21': 5 },
      byDayOfWeek: { '3': 10 },
      byCountry: { IL: 9, US: 1 },
      byCity: { Haifa: 7, 'Tel Aviv': 2 },
    },
    {
      date: '2026-07-02', total: 5,
      byDevice: { android: 5 },
      byHour: { '9': 5 },
      byDayOfWeek: { '4': 5 },
      byCountry: { IL: 5 },
      byCity: { Haifa: 5 },
    },
  ];

  it('sums total scans across all days in range', () => {
    expect(aggregateDailyStats(docs).totalScans).toBe(15);
  });

  it('produces exactly 3 device buckets (ios/android/desktop) even when one never appears', () => {
    const { byDevice } = aggregateDailyStats(docs);
    expect(byDevice).toHaveLength(3);
    expect(byDevice.find((d) => d.device === 'ios')).toMatchObject({ count: 6 });
    expect(byDevice.find((d) => d.device === 'android')).toMatchObject({ count: 9 });
    expect(byDevice.find((d) => d.device === 'desktop')).toMatchObject({ count: 0, pct: 0 });
  });

  it('always produces exactly 24 hour buckets, 0-23, correctly summed across days', () => {
    const { byHour } = aggregateDailyStats(docs);
    expect(byHour).toHaveLength(24);
    expect(byHour[20].count).toBe(5);
    expect(byHour[9].count).toBe(5);
    expect(byHour[3].count).toBe(0);
  });

  it('always produces exactly 7 day-of-week buckets with Hebrew labels', () => {
    const { byDayOfWeek } = aggregateDailyStats(docs);
    expect(byDayOfWeek).toHaveLength(7);
    expect(byDayOfWeek[3]).toMatchObject({ count: 10, dayLabel: 'רביעי' });
  });

  it('sorts country/city breakdowns by count descending', () => {
    const { byCountry, byCity } = aggregateDailyStats(docs);
    expect(byCountry[0]).toMatchObject({ country: 'IL', count: 14 });
    expect(byCountry[1]).toMatchObject({ country: 'US', count: 1 });
    expect(byCity[0]).toMatchObject({ city: 'Haifa', count: 12 });
  });

  it('computes percentages relative to the grand total', () => {
    const { byDevice } = aggregateDailyStats(docs);
    const android = byDevice.find((d) => d.device === 'android')!;
    expect(android.pct).toBeCloseTo((9 / 15) * 100, 1);
  });

  it('handles a fully empty range without dividing by zero', () => {
    const { totalScans, byDevice, byHour } = aggregateDailyStats([]);
    expect(totalScans).toBe(0);
    expect(byDevice.every((d) => d.pct === 0)).toBe(true);
    expect(byHour).toHaveLength(24);
  });

  it('returns the daily trend sorted ascending by date', () => {
    const { dailyTrend } = aggregateDailyStats([docs[1], docs[0]]); // fed out of order
    expect(dailyTrend).toEqual([
      { date: '2026-07-01', count: 10 },
      { date: '2026-07-02', count: 5 },
    ]);
  });
});

describe('buildClickRecordsCsv', () => {
  it('produces a header row plus one row per click', () => {
    const csv = buildClickRecordsCsv([
      { clickId: 'a1', timestamp: new Date('2026-07-15T20:00:00Z'), device: 'android', country: 'IL', city: 'Haifa', referrer: null, userAgent: 'Mozilla/5.0' },
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('click_id,timestamp,device,country,city,referrer,user_agent');
    expect(lines[1]).toContain('a1');
    expect(lines[1]).toContain('android');
    expect(lines[1]).toContain('Haifa');
  });

  it('quotes fields containing commas or quotes per CSV rules', () => {
    const csv = buildClickRecordsCsv([
      { clickId: 'a1', timestamp: null, device: 'desktop', country: null, city: null, referrer: 'https://example.com/a,b"c', userAgent: null },
    ]);
    expect(csv).toContain('"https://example.com/a,b""c"');
  });

  it('returns just the header for an empty row set', () => {
    expect(buildClickRecordsCsv([])).toBe('click_id,timestamp,device,country,city,referrer,user_agent');
  });
});
