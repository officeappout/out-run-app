/** Progress hub v2 — running page: plan weeks, volume (done vs planned), totals, forecast trend, in-zone, render. */
import { describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null } }));

import { buildPlanWeeks, phaseOf, planTotals, planVolume, recentVolume, forecastTrend, type PlanEntry } from '../run/run-page.model';
import { forecastModel } from '../run/run-forecast';
import { niceAxis } from '../components/volume-axis';
import { readInZonePct, toProgressWorkout, type ProgressWorkout } from '../../utils/progress-model';
import VolumeChart from '../components/VolumeChart';
import RunWeeksList from '../run/RunWeeksList';
import RunZonesCard from '../run/RunZonesCard';
import RecentActivityList from '../run/RecentActivityList';
import { buildZoneLadder } from '@/features/workout-engine/players/running/utils/run-preview/run-zone-ladder';

const START = new Date(2026, 9, 4); // Sunday 4.10
const NOW = new Date(2026, 9, 22, 12);
const entry = (week: number, ordinal: number, status: PlanEntry['status'], km: number | null = 4, min: number | null = 30): PlanEntry => ({
  key: `${week}-${ordinal}`, week, ordinal, name: `W${week}S${ordinal}`, category: null, status, plannedKm: km, plannedMin: min,
});
const run = (d: Date, km: number, minutes: number, over: Partial<ProgressWorkout> = {}): ProgressWorkout => ({
  id: `${d.getTime()}`, date: d, kind: 'run', type: 'running', minutes, km, pace: minutes / km, sets: 0, domainSets: {}, ...over,
});

const entries = [
  entry(1, 1, 'completed'), entry(1, 2, 'completed'), entry(1, 3, 'completed'),
  entry(2, 1, 'completed'), entry(2, 2, 'skipped'), entry(2, 3, 'completed'),
  entry(3, 1, 'completed'), entry(3, 2, 'pending', 5, 40), entry(3, 3, 'pending', null, 35),
  entry(4, 1, 'pending'), entry(4, 2, 'pending'), entry(4, 3, 'pending'),
  entry(5, 1, 'pending'),
];
const runs = [run(new Date(2026, 9, 5, 8), 4, 30), run(new Date(2026, 9, 12, 8), 5, 33), run(new Date(2026, 9, 18, 8), 5.6, 36)];
const phases = [{ name: 'base' as const, startWeek: 1, endWeek: 2 }, { name: 'build' as const, startWeek: 3, endWeek: 5 }];

describe('plan weeks', () => {
  const weeks = buildPlanWeeks({ entries, weeks: 5, currentWeek: 3, planStart: START, phases, runs });

  it('state, phase, planned totals (unknown when a session has no estimate), done runs per plan week', () => {
    expect(weeks.map((w) => w.state)).toEqual(['done', 'done', 'current', 'next', 'ahead']);
    expect(weeks.map((w) => w.phase)).toEqual(['base', 'base', 'build', 'build', 'build']);
    expect(weeks[0]).toMatchObject({ plannedKm: 12, plannedMin: 90, completed: 3, actualKm: 4 });
    expect(weeks[2].plannedKm).toBeNull(); // one session without a distance estimate
    expect(weeks[2].plannedMin).toBe(105);
    expect(weeks[2].actualKm).toBe(5.6);
    expect(phaseOf(9, phases)).toBeNull();
  });

  it('volume: done vs planned, km or minutes, current highlighted', () => {
    const km = planVolume(weeks, 'km');
    expect(km.map((d) => d.label)).toEqual(['1', '2', '3', '4', '5']);
    expect(km[0]).toMatchObject({ done: 4, planned: 12, current: false });
    expect(km[2]).toMatchObject({ done: 5.6, planned: null, current: true });
    expect(planVolume(weeks, 'min')[2].planned).toBe(105);
  });

  it('totals: since the plan started, on track = everything before this week done', () => {
    const tot = planTotals(weeks, START, runs);
    expect(tot).toMatchObject({ km: 14.6, minutes: 99, runs: 3, onTrack: false });
    expect(tot.endDate).toEqual(new Date(2026, 10, 7));
  });

  it('weeks list: this week and next open, done weeks collapsed, the rest behind "show more"', () => {
    const many = buildPlanWeeks({ entries, weeks: 8, currentWeek: 3, planStart: START, phases, runs });
    const html = renderToStaticMarkup(h(RunWeeksList, { weeks: many }));
    expect(html).toContain('data-run-week="current"');
    expect(html).toContain('W3S2'); // current week sessions listed
    expect(html).toContain('W4S1'); // next week too
    expect(html).not.toContain('W1S1'); // done week collapsed
    expect(html).toContain('3 מתוך 3 ריצות בוצעו');
    expect(html).toContain('בנייה');
    expect(html).toContain('הצגת שבועות 6–8');
    expect(html).toContain('40 דק׳ · כ־5 ק״מ');
  });
});

describe('no plan: recent calendar weeks', () => {
  it('8 Sunday-based weeks, done only', () => {
    const v = recentVolume(runs, 'km', NOW);
    expect(v).toHaveLength(8);
    expect(v[7]).toMatchObject({ done: 5.6, current: true });
    expect(v[7].planned).toBeUndefined();
  });
});

describe('volume chart', () => {
  it('round axis ticks and a value per column; planned drawn as an outline', () => {
    expect(niceAxis(13)).toEqual({ max: 15, ticks: [0, 5, 10, 15] });
    expect(niceAxis(0)).toEqual({ max: 1, ticks: [0] });
    const html = renderToStaticMarkup(
      h(VolumeChart, {
        data: [{ key: 'a', label: '1', done: 8.4, planned: 12, current: true }],
        color: '#84cc16',
        format: (v: number) => String(v),
        ariaLabel: 'vol',
        describe: (d: { label: string }) => `w${d.label}`,
      }),
    );
    expect(html).toContain('8.4');
    expect(html).toContain('inset 0 0 0 1.5px #84cc1666');
    expect(html).toContain('<li>w1</li>');
  });
});

describe('forecast', () => {
  it('rows from the base pace; a trend only when the history moved it', () => {
    const flat = forecastModel({ basePace: 360, qualityWorkoutsHistory: [] }, '5k', NOW);
    expect(flat.rows[0].km).toBe(5);
    expect(flat.trend).toEqual([]);
    const moved = forecastModel(
      { basePace: 360, qualityWorkoutsHistory: [{ date: new Date(2026, 9, 15), impactOnBasePaceSeconds: -10 }] },
      '5k',
      NOW,
    );
    expect(moved.trend.length).toBeGreaterThanOrEqual(2);
    expect(moved.trend[moved.trend.length - 1].daysAgo).toBe(0);
    expect(moved.trend[0].seconds).toBeGreaterThan(moved.trend[moved.trend.length - 1].seconds);
    expect(forecastTrend([{ daysAgo: 14, seconds: 100 }, { daysAgo: 0, seconds: 100 }])).toEqual([]);
    expect(forecastModel(null, '5k', NOW).rows).toEqual([]);
  });
});

describe('in-zone', () => {
  it('runMeta.timeInZone → %, absent on older runs (no new field)', () => {
    expect(readInZonePct({ timeInZone: { inSec: 900, totalSec: 1200 } })).toBe(75);
    expect(readInZonePct(undefined)).toBeNull();
    const w = toProgressWorkout('x', { date: new Date(), workoutType: 'running', distance: 5, duration: 1800 })!;
    expect('inZonePct' in w).toBe(false);
    expect(toProgressWorkout('y', { date: new Date(), workoutType: 'running', runMeta: { timeInZone: { inSec: 60, totalSec: 100 } } })!.inZonePct).toBe(60);
  });

  it('recent runs show the in-zone chip; the zone ladder is the existing component', () => {
    const html = renderToStaticMarkup(h(RecentActivityList, { kind: 'run', items: [run(new Date(2026, 9, 20, 8), 3.4, 25, { inZonePct: 82 })], now: NOW }));
    expect(html).toContain('82% בטווח');
    expect(html).toContain('ריצה · 3.4 ק״מ');
    const z = (min: number, max: number) => ({ minPace: min, maxPace: max, label: '' });
    const zones = {
      easy: z(400, 440), long_run: z(410, 440), tempo: z(350, 365), interval_short: z(320, 330), sprint: z(290, 300),
    } as unknown as Parameters<typeof buildZoneLadder>[0];
    const ladder = renderToStaticMarkup(h(RunZonesCard, { items: buildZoneLadder(zones, 'tempo') }));
    expect(ladder).toContain('איפה הקצב הזה אצלך');
    expect(ladder).toContain('aria-current="true"');
  });
});
