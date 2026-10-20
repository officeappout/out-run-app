import { describe, expect, it } from 'vitest';
import type { RichExerciseSession } from '@/features/workout-engine/services/exercise-history.service';
import { bestSession, chartData, filterRange, lastImprovement, sessionTarget, setTiles, trendStats } from '../exercise-analytics.utils';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 21).getTime();
const s = (daysAgo: number, reps: number[], targetReps = 10): RichExerciseSession => ({
  date: null,
  dateMs: NOW - daysAgo * DAY,
  reps,
  maxReps: Math.max(...reps),
  totalVolume: reps.reduce((a, b) => a + b, 0),
  maxWeight: 0,
  targetReps,
  exerciseName: 'מתח',
});

const asc = [s(100, [8, 7]), s(40, [10, 9, 8]), s(14, [12, 11]), s(7, [14, 10, 8]), s(0, [12, 12])];

describe('exercise analytics v2 utils', () => {
  it('filters by range', () => {
    expect(filterRange(asc, '1m', NOW)).toHaveLength(3);
    expect(filterRange(asc, '3m', NOW)).toHaveLength(4);
    expect(filterRange(asc, 'all', NOW)).toHaveLength(5);
  });

  it('trend stats', () => {
    const t = trendStats(asc);
    expect(t.best).toBe(14);
    expect(t.changePct).toBe(50);
    expect(t.sessions).toBe(5);
    expect(t.totalReps).toBe(15 + 27 + 23 + 32 + 24);
    expect(trendStats([]).changePct).toBeNull();
  });

  it('best session, last improvement', () => {
    expect(bestSession(asc)?.maxReps).toBe(14);
    expect(lastImprovement(asc)).toEqual({ previous: 14, latest: 12, delta: -2 });
    expect(lastImprovement(asc.slice(0, 1))).toBeNull();
  });

  it('tiles and targets', () => {
    expect(setTiles([10, 8], 10)).toEqual([
      { value: '10', tone: 'in' },
      { value: '8', tone: 'below' },
    ]);
    expect(setTiles([3], 1)[0].tone).toBe('in');
    expect(sessionTarget(s(0, [1], 1))).toBeNull();
  });

  it('chart data by metric', () => {
    expect(chartData(asc.slice(-1), 'totalVolume')[0].value).toBe(24);
    expect(chartData(asc.slice(-1), 'maxReps')[0].label).toBe('21/10');
  });
});
