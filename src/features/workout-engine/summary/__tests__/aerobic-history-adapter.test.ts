import { describe, it, expect } from 'vitest';
import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import {
  aerobicHistoryActivityType,
  historyAveragePace,
  historyRoutePathToCoords,
  workoutHistoryEntryToAerobicWorkout,
} from '../aerobic-history-adapter';

function makeEntry(over: Partial<WorkoutHistoryEntry> = {}): WorkoutHistoryEntry {
  return {
    id: 'w1',
    userId: 'u1',
    date: new Date('2026-10-10T07:00:00Z'),
    activityType: 'running',
    workoutType: 'running',
    distance: 5,
    duration: 1500,
    calories: 320,
    pace: 5.2,
    ...over,
  } as WorkoutHistoryEntry;
}

describe('historyRoutePathToCoords', () => {
  it('converts stored {lat,lng} points to [lng,lat] (RunMapBlock order)', () => {
    expect(historyRoutePathToCoords([{ lat: 32.1, lng: 34.8 }, { lat: 32.2, lng: 34.9 }])).toEqual([
      [34.8, 32.1],
      [34.9, 32.2],
    ]);
  });

  it('passes legacy array points through unchanged', () => {
    expect(historyRoutePathToCoords([[34.8, 32.1]])).toEqual([[34.8, 32.1]]);
  });

  it('drops malformed / NaN points and tolerates missing input', () => {
    expect(historyRoutePathToCoords([{ lat: 'x', lng: 1 }, null, [1], { lat: 1, lng: 2 }])).toEqual([[2, 1]]);
    expect(historyRoutePathToCoords(undefined)).toEqual([]);
    expect(historyRoutePathToCoords([])).toEqual([]);
  });
});

describe('historyAveragePace', () => {
  it('uses (duration/60)/distance when both are positive', () => {
    expect(historyAveragePace({ distance: 5, duration: 1500, pace: 9 })).toBe(5);
  });

  it('falls back to the stored pace, then 0', () => {
    expect(historyAveragePace({ distance: 0, duration: 1500, pace: 6.5 })).toBe(6.5);
    expect(historyAveragePace({ distance: 0, duration: 0, pace: 0 })).toBe(0);
  });
});

describe('aerobicHistoryActivityType', () => {
  it('reads workoutType first, legacy activityType as fallback', () => {
    expect(aerobicHistoryActivityType({ workoutType: 'walking', activityType: 'running' })).toBe('walking');
    expect(
      aerobicHistoryActivityType({
        workoutType: undefined as unknown as WorkoutHistoryEntry['workoutType'],
        activityType: 'walking',
      }),
    ).toBe('walking');
    expect(aerobicHistoryActivityType({ workoutType: 'running', activityType: 'running' })).toBe('running');
  });
});

describe('workoutHistoryEntryToAerobicWorkout', () => {
  it('keeps every other field and normalises route + pace', () => {
    const entry = makeEntry({
      routePath: [{ lat: 32.1, lng: 34.8 }],
      xpEarned: 40,
      parkId: 'p1',
      laps: [],
    });
    const out = workoutHistoryEntryToAerobicWorkout(entry);
    expect(out.id).toBe('w1');
    expect(out.distance).toBe(5);
    expect(out.duration).toBe(1500);
    expect(out.calories).toBe(320);
    expect(out.xpEarned).toBe(40);
    expect(out.parkId).toBe('p1');
    expect(out.pace).toBe(5);
    expect(out.routePath).toEqual([[34.8, 32.1]]);
    expect(out.date).toBeInstanceOf(Date);
    expect(out.date.toISOString()).toBe('2026-10-10T07:00:00.000Z');
  });
});
