/** Progress hub v2 — the pure numbers behind the domain cards and the steps page. */
import { describe, expect, it } from 'vitest';
import {
  currentWeekDates,
  elapsedDays,
  planDistanceKm,
  runPlanPct,
  stepsCardModel,
  strengthCardModel,
  walkWeekModel,
} from '../model/domain-cards.model';
import { lastNDays, monthlyAverages, stepsHero, stepsTiles, trimLeadingEmpty } from '../steps/steps-hub.model';
import { periodRanges } from '../../utils/progress-period';
import type { DailyStepsSnapshot } from '@/features/activity/services/activity-history.service';
import { HUB_COLORS, STEPS_ORANGE, STEPS_ORANGE_TEXT } from '../hub-colors';
import { STEPS_WALK_COLORS, TRACK_COLORS } from '@/components/ui/v2/track-colors';
import { HUB_ROUTES, hubRouteForKind } from '../hub-routes';

const NOW = new Date(2026, 9, 22, 12); // Thursday 22.10.2026

const snap = (date: string, steps: number, over: Partial<DailyStepsSnapshot> = {}): DailyStepsSnapshot => ({
  date,
  steps,
  floors: 0,
  stepsGoalMet: steps >= 8000,
  floorsGoalMet: false,
  stepsGoal: 8000,
  floorsGoal: 10,
  distanceMeters: 0,
  ...over,
});

describe('colour tokens', () => {
  it('steps and walking share the one orange; running stays green; strength cyan', () => {
    expect(STEPS_ORANGE).toBe('#f97316');
    expect(STEPS_ORANGE_TEXT).toBe('#c2410c');
    expect(STEPS_WALK_COLORS).toEqual({ fill: '#f97316', text: '#c2410c', rgb: '249,115,22' });
    expect(HUB_COLORS.steps.fill).toBe(STEPS_ORANGE);
    expect(HUB_COLORS.walk.fill).toBe(STEPS_ORANGE);
    expect(HUB_COLORS.run.fill).toBe(TRACK_COLORS.run);
    expect(HUB_COLORS.strength.fill).toBe(TRACK_COLORS.strength);
    // TRACK_COLORS.walk (amber) is untouched → flag-off surfaces stay identical.
    expect(TRACK_COLORS.walk).toBe('#f59e0b');
  });
});

describe('routes', () => {
  it('deeper pages are /progress/* (the paths home links to)', () => {
    expect(HUB_ROUTES).toEqual({ strength: '/progress/strength', run: '/progress/run', steps: '/progress/steps' });
    expect(hubRouteForKind('strength')).toBe('/progress/strength');
    expect(hubRouteForKind('walk')).toBe('/progress/run');
  });
});

describe('domain cards', () => {
  it('strength: level ring, % to the next level, top level has no next', () => {
    expect(strengthCardModel(null)).toBeNull();
    expect(strengthCardModel({ programName: 'P', currentLevel: 12, maxLevel: 15, progressPercent: 22 })).toEqual({
      programName: 'P', pct: 22, level: 12, maxLevel: 15, toNext: 78, nextLevel: 13,
    });
    const top = strengthCardModel({ programName: 'P', currentLevel: 15, maxLevel: 15, progressPercent: 100 })!;
    expect(top.toNext).toBeNull();
    expect(top.nextLevel).toBeNull();
  });

  it('running plan ring = sessions done of the plan; distance from the key', () => {
    expect(runPlanPct(null)).toBeNull();
    expect(runPlanPct({ done: 9, total: 24 })).toBe(38);
    expect(planDistanceKm('5k')).toBe(5);
    expect(planDistanceKm('maintenance')).toBeNull();
  });

  it('walking week: planned vs completed; no walks → not a walker', () => {
    expect(walkWeekModel([])).toBeNull();
    expect(walkWeekModel([{ completed: true }, { completed: false }, {}, { completed: true }])).toEqual({ planned: 4, done: 2, pct: 50 });
    expect(currentWeekDates(NOW)).toEqual(['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24']);
  });

  it('steps: today vs goal, period average and days in goal over the elapsed days', () => {
    const r = periodRanges('week', NOW).current; // Sun 18 → Thu 22
    const day = (date: string, steps: number) => ({ date, steps, stepsGoal: 8000, distanceMeters: 0, activeMinutes: 0 });
    const m = stepsCardModel([day('2026-10-17', 20000), day('2026-10-18', 9000), day('2026-10-20', 7000), day('2026-10-22', 6240)], r, NOW, 8000)!;
    expect(m).toEqual({ today: 6240, goal: 8000, pct: 78, average: 7413, daysInGoal: 1, daysCounted: 5 });
    expect(stepsCardModel([], r, NOW, 8000)).toBeNull();
    expect(elapsedDays(new Date(2026, 9, 1), NOW)).toBe(22);
  });
});

describe('steps page model', () => {
  const snaps = [
    snap('2026-10-14', 5000),
    snap('2026-10-15', 7200, { distanceMeters: 5100 }),
    snap('2026-10-16', 8400),
    snap('2026-10-17', 5100),
    snap('2026-10-18', 9100),
    snap('2026-10-19', 6800),
    snap('2026-10-20', 8800),
    snap('2026-10-21', 7000),
    snap('2026-10-22', 6240),
  ];

  it('hero: today of goal, what is left in steps and walking minutes, delta vs the same weekday', () => {
    const h = stepsHero(snaps, 'week', 0, 8000);
    expect(h.dateKey).toBe('2026-10-22');
    expect(h.remaining).toBe(1760);
    expect(h.walkMinutes).toBe(18);
    expect(h.lastWeekSameDay).toBe(7200);
    expect(h.kmIsEstimate).toBe(true);
    // Day tab: the picked day; a synced distance wins over the estimate.
    const d = stepsHero(snaps, 'day', 7, 8000);
    expect(d.dateKey).toBe('2026-10-15');
    expect(d.km).toBeCloseTo(5.1);
    expect(d.kmIsEstimate).toBe(false);
  });

  it('tiles: the existing stats + the best day date + the previous window average', () => {
    const t = stepsTiles(snaps, 'week');
    expect(t.bestDay).toBe(9100);
    expect(t.bestDate).toBe('2026-10-18');
    expect(t.daysAtGoal).toBe(3);
    expect(t.previousAverage).toBe(6100); // 5000 + 7200 → 6100
    expect(stepsTiles(snaps, 'day').previousAverage).toBeNull();
  });

  it('last 30 days: one cell per calendar day, gaps are no-data', () => {
    const cells = lastNDays(snaps, NOW, 30);
    expect(cells).toHaveLength(30);
    expect(cells[29]).toEqual({ date: '2026-10-22', steps: 6240, met: false });
    expect(cells[25]).toEqual({ date: '2026-10-18', steps: 9100, met: true });
    expect(cells[26].met).toBe(false); // 19.10: 6,800 — below the goal
    expect(cells[0].met).toBeNull();
  });

  it('year: daily average per month, empty leading months trimmed', () => {
    const months = monthlyAverages([...snaps, snap('2026-09-30', 4000)], NOW);
    expect(months).toHaveLength(12);
    expect(months[11]).toMatchObject({ key: '2026-10', average: 7071 });
    expect(months[10]).toMatchObject({ key: '2026-09', average: 4000 });
    expect(trimLeadingEmpty(months).map((m) => m.key)).toEqual(['2026-09', '2026-10']);
  });
});
