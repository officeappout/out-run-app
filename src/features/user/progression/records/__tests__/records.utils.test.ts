import { describe, expect, it } from 'vitest';
import {
  applyPeriodIncrements,
  applyRecordUpdates,
  bestMonth,
  monthKey,
  nextExerciseAggregate,
  periodTotalsIncrements,
  recordUpdates,
} from '../records.utils';

const NOW = new Date(2026, 9, 21, 9);

describe('periodTotalsIncrements', () => {
  it('run → workouts + run minutes/km', () => {
    expect(periodTotalsIncrements({ workoutType: 'running', durationMinutes: 31, distanceKm: 5.555 }, NOW)).toEqual({
      'progression.periodTotals.2026-10.workouts': 1,
      'progression.periodTotals.2026-10.minutes.run': 31,
      'progression.periodTotals.2026-10.km.run': 5.56,
    });
  });
  it('strength with sets; hybrid splits', () => {
    expect(periodTotalsIncrements({ workoutType: 'strength', durationMinutes: 40, sets: 18 }, NOW)).toMatchObject({
      'progression.periodTotals.2026-10.minutes.strength': 40,
      'progression.periodTotals.2026-10.sets': 18,
    });
    const h = periodTotalsIncrements(
      { workoutType: 'hybrid', durationMinutes: 50, distanceKm: 3, categorySplits: [{ category: 'cardio', durationMinutes: 20 }, { category: 'strength', durationMinutes: 30 }] },
      NOW,
    );
    expect(h['progression.periodTotals.2026-10.minutes.strength']).toBe(30);
    expect(h['progression.periodTotals.2026-10.minutes.run']).toBe(20);
  });
  it('hybrid with parts: run legs → run, walk legs → walk, stations → strength (owner 20.10.2026)', () => {
    const h = periodTotalsIncrements(
      {
        workoutType: 'hybrid', durationMinutes: 45, distanceKm: 4.2, sets: 9,
        categorySplits: [{ category: 'cardio', durationMinutes: 33 }, { category: 'strength', durationMinutes: 10 }],
        hybridParts: { runMinutes: 18, runKm: 3, walkMinutes: 15, walkKm: 1.2, strengthMinutes: 10 },
      },
      NOW,
    );
    expect(h).toEqual({
      'progression.periodTotals.2026-10.workouts': 1,
      'progression.periodTotals.2026-10.minutes.run': 18,
      'progression.periodTotals.2026-10.km.run': 3,
      'progression.periodTotals.2026-10.minutes.walk': 15,
      'progression.periodTotals.2026-10.km.walk': 1.2,
      'progression.periodTotals.2026-10.minutes.strength': 10,
      'progression.periodTotals.2026-10.sets': 9,
    });
  });
  it('month key pads', () => expect(monthKey(new Date(2026, 0, 5))).toBe('2026-01'));
});

describe('recordUpdates', () => {
  it('first run sets longest + 5k; a slower/shorter run breaks nothing', () => {
    const first = recordUpdates(null, { workoutType: 'running', durationMinutes: 30, distanceKm: 5 }, 1);
    expect(first).toEqual({
      'progression.records.longestRunKm': { value: 5, at: 1 },
      'progression.records.fastest5kSec': { value: 1800, at: 1 },
    });
    const recs = applyRecordUpdates(null, first);
    expect(recordUpdates(recs, { workoutType: 'running', durationMinutes: 35, distanceKm: 5 }, 2)).toEqual({});
    expect(recordUpdates(recs, { workoutType: 'running', durationMinutes: 33, distanceKm: 6 }, 3)).toEqual({
      'progression.records.longestRunKm': { value: 6, at: 3 },
      'progression.records.fastest5kSec': { value: 1650, at: 3 },
    });
  });
  it('walks, tiny distances and impossible paces are ignored', () => {
    expect(recordUpdates(null, { workoutType: 'walking', durationMinutes: 40, distanceKm: 3.4 }, 1)).toEqual({
      'progression.records.longestWalkKm': { value: 3.4, at: 1 },
    });
    expect(recordUpdates(null, { workoutType: 'running', durationMinutes: 2, distanceKm: 0.2 }, 1)).toEqual({});
    expect(recordUpdates(null, { workoutType: 'running', durationMinutes: 10, distanceKm: 5 }, 1)).not.toHaveProperty(
      'progression.records.fastest5kSec',
    );
  });
});

describe('nextExerciseAggregate', () => {
  it('keeps the best and the last 7 maxes', () => {
    const a = nextExerciseAggregate(null, 10, 100);
    expect(a).toEqual({ bestReps: 10, bestAt: 100, recentMax: [10], isNewBest: true });
    const b = nextExerciseAggregate({ bestReps: 12, bestAt: 50, recentMax: [1, 2, 3, 4, 5, 6, 7] }, 9, 200);
    expect(b).toEqual({ bestReps: 12, bestAt: 50, recentMax: [2, 3, 4, 5, 6, 7, 9], isNewBest: false });
  });
});

describe('local mirrors', () => {
  it('applies increments onto nested totals', () => {
    const inc = periodTotalsIncrements({ workoutType: 'running', durationMinutes: 30, distanceKm: 5 }, NOW);
    const t = applyPeriodIncrements({ '2026-10': { workouts: 2, km: { run: 4 } } }, inc);
    expect(t['2026-10']).toEqual({ workouts: 3, km: { run: 9 }, minutes: { run: 30 } });
    expect(bestMonth({ '2026-09': { workouts: 5 }, ...t })).toEqual({ month: '2026-09', workouts: 5 });
  });
});
