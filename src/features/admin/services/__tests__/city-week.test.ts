import { describe, it, expect } from 'vitest';
import { computeCityWeek, computeParkActivity } from '../city-week';

const NOW = new Date('2026-10-15T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe('computeCityWeek', () => {
  const r = computeCityWeek(
    {
      authorityId: 'city-1',
      authorityName: 'אשקלון',
      workouts: [
        { uid: 'a', at: daysAgo(1) }, { uid: 'a', at: daysAgo(2) }, { uid: 'b', at: daysAgo(6) },
        { uid: 'c', at: daysAgo(8) }, { uid: 'a', at: daysAgo(20) },
      ],
      visits: [
        { parkId: 'p1', at: daysAgo(1) }, { parkId: 'p1', at: daysAgo(3) }, { parkId: 'p1', at: daysAgo(10) },
        { parkId: 'p2', at: daysAgo(29) },
        { parkId: 'p3', at: daysAgo(40) }, // outside 30 days → quiet
      ],
      parks: [
        { id: 'p1', name: 'גן העיר' }, { id: 'p2', name: 'פארק הים' }, { id: 'p3', name: 'גינת ברנע' }, { id: 'p4', name: 'גינה חדשה' },
      ],
      reports: [
        { id: 'r1', reportedAt: daysAgo(2), open: true },
        { id: 'r2', reportedAt: daysAgo(12), open: true },
        { id: 'r3', reportedAt: daysAgo(30), open: false },
      ],
    },
    NOW,
  );

  it('active residents and workouts, this week vs last', () => {
    expect([r.activeThisWeek, r.activeLastWeek, r.workoutsThisWeek, r.workoutsLastWeek]).toEqual([2, 1, 3, 1]);
  });
  it('busiest parks by visits in 30 days; quiet = no visit in 30 days', () => {
    expect(r.parks.busiest).toEqual([
      { id: 'p1', name: 'גן העיר', visits30d: 3 },
      { id: 'p2', name: 'פארק הים', visits30d: 1 },
    ]);
    expect(r.parks.quietCount).toBe(2);
    expect(r.parks.quiet.map((p) => p.id)).toEqual(['p3', 'p4']);
  });
  it('open reports, how many over a week, and the oldest', () => {
    expect(r.reports).toEqual({ open: 2, olderThanWeek: 1, oldestDays: 12 });
  });
});

describe('computeParkActivity', () => {
  it('visits in 30 days, the latest visit ever, open reports per park', () => {
    const a = computeParkActivity(
      [
        { parkId: 'p1', at: daysAgo(2) }, { parkId: 'p1', at: daysAgo(40) },
        { parkId: 'p2', at: daysAgo(45) },
      ],
      [{ parkId: 'p2' }, { parkId: 'p2' }, { parkId: 'p3' }, { parkId: '' }],
      NOW,
    );
    expect(a.p1).toEqual({ visits30d: 1, lastVisit: daysAgo(2).toISOString(), openReports: 0 });
    expect(a.p2).toEqual({ visits30d: 0, lastVisit: daysAgo(45).toISOString(), openReports: 2 });
    expect(a.p3).toEqual({ visits30d: 0, lastVisit: null, openReports: 1 });
    expect(a['']).toBeUndefined();
  });
});
