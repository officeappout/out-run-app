import { describe, expect, it } from 'vitest';
import {
  doneKindsOfDoc,
  hybridPartMinutes,
  splitHybridWorkout,
  stationCompletedSets,
} from '../hybrid-counting';
import { hybridCategorySplits, stationMuscles } from '../hybrid-completion-sync';
import type { HybridPlannedSegment } from '../compose-hybrid-session.service';

// A route + stops session: walk 1.2 km → station (push/pull) → run 2 km → skipped station → run 1 km.
const segments = [
  { index: 0, kind: 'aerobic', aerobicType: 'walking', actual: { durationSec: 900, distanceKm: 1.2 }, endedAtMs: 1 },
  {
    index: 1, kind: 'strength', planned: { sets: 8 },
    actual: {
      durationSec: 600, sets: 5,
      exerciseLog: [
        { exerciseId: 'warm', exerciseName: 'w', confirmedReps: [10], targetReps: 10, role: 'warmup', domain: 'push' },
        { exerciseId: 'pushup', exerciseName: 'p', confirmedReps: [10, 9, 0], targetReps: 10, domain: 'push' },
        { exerciseId: 'row', exerciseName: 'r', confirmedReps: [8, 8], targetReps: 8 }, // no stamp → plan MG
      ],
    },
    endedAtMs: 2,
  },
  { index: 2, kind: 'aerobic', aerobicType: 'running', actual: { durationSec: 720, distanceKm: 2 }, endedAtMs: 3 },
  { index: 3, kind: 'strength', planned: { sets: 6 }, skipped: true, actual: { durationSec: 40, sets: 0 }, endedAtMs: 4 },
  { index: 4, kind: 'aerobic', aerobicType: 'running', actual: { durationSec: 360, distanceKm: 1 }, endedAtMs: 5 },
];

const plan = [
  { kind: 'aerobic' },
  {
    kind: 'strength',
    content: {
      totalPlannedSets: 8,
      exercises: [
        { exercise: { id: 'pushup', movementGroup: 'horizontal_push', primaryMuscle: 'chest', secondaryMuscles: ['triceps'] }, sets: 3 },
        { exercise: { id: 'row', movementGroup: 'horizontal_pull', primaryMuscle: 'back' }, sets: 3 },
        { exercise: { id: 'unused', movementGroup: 'squat', primaryMuscle: 'quads' }, sets: 2 },
      ],
    },
  },
  { kind: 'aerobic' },
  { kind: 'strength', content: { exercises: [] } },
  { kind: 'aerobic' },
] as unknown as HybridPlannedSegment[];

describe('splitHybridWorkout — a combined workout counts per part (owner 20.10.2026)', () => {
  const parts = splitHybridWorkout(segments, plan);

  it('running legs → running, walking legs → walking', () => {
    expect(parts.running).toEqual({ sec: 1080, km: 3, legs: 2 });
    expect(parts.walking).toEqual({ sec: 900, km: 1.2, legs: 1 });
  });

  it('done stations → strength; a skipped station adds no time or sets', () => {
    expect(parts.strength.stations).toBe(1);
    expect(parts.strength.sec).toBe(600);
    // logged sets with a value > 0: warmup 1 + pushup 2 + row 2
    expect(parts.strength.setsCompleted).toBe(5);
    expect(parts.strength.setsPlanned).toBe(8);
  });

  it('domain sets from the log stamp, else the plan movementGroup; warm-up never counts as a domain', () => {
    expect(parts.strength.domainSets).toEqual({ push: 2, pull: 2 });
    expect(parts.strength.exerciseIds.sort()).toEqual(['pushup', 'row', 'warm']);
  });

  it('a station saved without a log uses its set count + the plan stop for domains', () => {
    const legacy = splitHybridWorkout(
      [{ index: 1, kind: 'strength', actual: { durationSec: 300, sets: 6 } }],
      plan,
    );
    expect(legacy.strength.setsCompleted).toBe(6);
    expect(legacy.strength.domainSets).toEqual({ push: 3, pull: 3, legs: 2 });
  });

  it('a leg without a type falls back to the session aerobic kind; cycling is ignored', () => {
    const p = splitHybridWorkout(
      [
        { kind: 'aerobic', actual: { durationSec: 60, distanceKm: 0.2 } },
        { kind: 'aerobic', aerobicType: 'cycling', actual: { durationSec: 60, distanceKm: 1 } },
      ],
      null,
      'walking',
    );
    expect(p.walking.km).toBe(0.2);
    expect(p.running.legs).toBe(0);
  });

  it('reads junk defensively', () => {
    const p = splitHybridWorkout(undefined);
    expect(p.running.legs + p.walking.legs + p.strength.stations).toBe(0);
    expect(splitHybridWorkout([null, { kind: 'strength' }]).strength.stations).toBe(0);
  });

  it('whole-minute view + dailyActivity splits (cardio = run + walk, strength = stations)', () => {
    const m = hybridPartMinutes(parts);
    expect(m).toEqual({ runMinutes: 18, runKm: 3, walkMinutes: 15, walkKm: 1.2, strengthMinutes: 10, strengthSets: 5 });
    expect(hybridCategorySplits(parts, { total: 300, aerobic: 200, strength: 100 })).toEqual([
      { category: 'cardio', durationMinutes: 33, calories: 200 },
      { category: 'strength', durationMinutes: 10, calories: 100 },
    ]);
  });
});

describe('stationCompletedSets', () => {
  it('logged sets win over the planned total', () => {
    expect(stationCompletedSets([{ confirmedReps: [5, 0, 6] }], 9)).toBe(2);
  });
  it('no log → planned (legacy callers)', () => {
    expect(stationCompletedSets(undefined, 9)).toBe(9);
    expect(stationCompletedSets([], 4)).toBe(4);
  });
});

describe('stationMuscles', () => {
  it('only the done exercises, from the plan exercise docs', () => {
    const { muscles, exercises } = stationMuscles(plan, ['pushup', 'row']);
    expect(muscles.sort()).toEqual(['back', 'chest', 'triceps']);
    expect(exercises).toHaveLength(2);
  });
});

describe('doneKindsOfDoc', () => {
  it('a combined doc → the kinds of the parts it has', () => {
    expect(doneKindsOfDoc({ workoutType: 'hybrid', activityType: 'hybrid', segments })).toEqual(['run', 'walk', 'strength']);
    const walkOnly = segments.filter((s) => s.aerobicType !== 'running');
    expect(doneKindsOfDoc({ workoutType: 'hybrid', activityType: 'hybrid', segments: walkOnly })).toEqual(['walk', 'strength']);
  });
  it('a combined doc whose stations were all skipped is not strength', () => {
    expect(doneKindsOfDoc({ workoutType: 'hybrid', segments: [segments[2], segments[3]] })).toEqual(['run']);
  });
  it('solo docs keep their type; old segment-less hybrids keep their label', () => {
    expect(doneKindsOfDoc({ workoutType: 'running' })).toEqual(['run']);
    expect(doneKindsOfDoc({ activityType: 'walking' })).toEqual(['walk']);
    expect(doneKindsOfDoc({ workoutType: 'strength' })).toEqual(['strength']);
    expect(doneKindsOfDoc({ workoutType: 'hybrid' })).toEqual(['walk', 'strength']);
    expect(doneKindsOfDoc({ workoutType: 'cycling' })).toEqual([]);
  });
});
