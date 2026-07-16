import { describe, it, expect } from 'vitest';
import type { GeneratedWorkout, WorkoutExercise } from '../../logic/workout-generator.types';
import type { RoutePath } from '@/features/parks/core/services/route-distance.utils';
import {
  workoutToStrengthBlock,
  composeParkWorkoutPlan,
  type ParkWorkoutComposeInput,
} from '../compose-park-workout.service';

// Minimal WorkoutExercise — only the fields the composer/calorie model read.
const we = (over: Partial<WorkoutExercise> & { role?: string }): WorkoutExercise =>
  ({
    exercise: { id: over.role ?? 'ex', name: 'Ex' },
    method: {},
    mechanicalType: 'none',
    sets: 3,
    reps: 10,
    isTimeBased: false,
    restSeconds: 120,
    priority: 'compound',
    score: 0,
    reasoning: [],
    tier: 'match',
    exerciseRole: (over.role ?? 'main') as any,
    ...over,
  } as unknown as WorkoutExercise);

const warmup = we({ role: 'warmup', sets: 1, reps: 8, tier: 'flow' });
const main1 = we({ role: 'main', sets: 3, reps: 6, tier: 'match' });
const main2 = we({ role: 'main', sets: 3, reps: 8, tier: 'easy' });
const cooldown = we({ role: 'cooldown', sets: 1, reps: 30, isTimeBased: true, tier: 'flow' });

const mkWorkout = (exercises: WorkoutExercise[], estimatedDuration = 30): GeneratedWorkout =>
  ({
    title: 'Home workout',
    exercises,
    estimatedDuration,
    totalPlannedSets: exercises.reduce((s, e) => s + e.sets, 0),
  } as unknown as GeneratedWorkout);

// Out-and-back: user → park(index 1) → user. legGapsKm ⇒ two equal legs.
const routePath: RoutePath = [
  [34.0, 32.0],
  [34.01, 32.0],
  [34.0, 32.0],
];

const baseInput = (over: Partial<ParkWorkoutComposeInput> = {}): ParkWorkoutComposeInput => ({
  routePath,
  station: { stopId: 'park:Test', parkId: 'p1', locationKind: 'gym', lat: 32.0, lng: 34.01, waypointIndex: 1 },
  workout: mkWorkout([warmup, main1, main2, cooldown]),
  aerobicKind: 'running',
  paceProfile: { basePace: 390, profileType: 2 },
  userWeightKg: 70,
  ...over,
});

describe('workoutToStrengthBlock (Q-A: keep warmup, full rests)', () => {
  it('keeps warmup + main + cooldown intact (does NOT filter warmup)', () => {
    const block = workoutToStrengthBlock(mkWorkout([warmup, main1, main2, cooldown]));
    expect(block.exercises).toHaveLength(4);
    expect(block.exercises.some((e) => e.exerciseRole === 'warmup')).toBe(true);
    expect(block.exercises.some((e) => e.exerciseRole === 'cooldown')).toBe(true);
  });

  it('preserves full rest seconds (no ×0.5)', () => {
    const block = workoutToStrengthBlock(mkWorkout([main1]));
    expect(block.exercises[0].restSeconds).toBe(120);
  });

  it('derives duration (min→sec) and totals; flags empty', () => {
    const block = workoutToStrengthBlock(mkWorkout([main1, main2], 24));
    expect(block.estimatedDurationSec).toBe(24 * 60);
    expect(block.totalPlannedSets).toBe(6);
    expect(block.isEmpty).toBe(false);

    const empty = workoutToStrengthBlock(mkWorkout([], 0));
    expect(empty.isEmpty).toBe(true);
    expect(empty.exercises).toHaveLength(0);
  });
});

describe('composeParkWorkoutPlan', () => {
  it('produces [aerobic → strength → aerobic] with the workout as the station content', () => {
    const plan = composeParkWorkoutPlan(baseInput());
    expect(plan.segments.map((s) => s.kind)).toEqual(['aerobic', 'strength', 'aerobic']);
    expect(plan.totals.stations).toBe(1);
    expect(plan.segments[1].content?.exercises).toHaveLength(4);
    // Q-A: the joint-mobility warmup survives into the station content.
    expect(plan.segments[1].content?.exercises.some((e) => e.exerciseRole === 'warmup')).toBe(true);
  });

  it('running legs are jogging (out) then recovery (back); distance ≈ route length', () => {
    const plan = composeParkWorkoutPlan(baseInput({ aerobicKind: 'running' }));
    const aerobic = plan.segments.filter((s) => s.kind === 'aerobic');
    expect(aerobic[0].zone).toBe('jogging');
    expect(aerobic[1].zone).toBe('recovery');
    expect(plan.totals.distanceKm).toBeGreaterThan(0);
    // Two equal out-and-back legs sum to ~the full route.
    const legSum = (aerobic[0].distanceKm ?? 0) + (aerobic[1].distanceKm ?? 0);
    expect(Math.abs(legSum - plan.totals.distanceKm)).toBeLessThan(0.02);
  });

  it('walking legs both use the fixed walk zone', () => {
    const plan = composeParkWorkoutPlan(baseInput({ aerobicKind: 'walking' }));
    const aerobic = plan.segments.filter((s) => s.kind === 'aerobic');
    expect(aerobic.every((s) => s.zone === 'walk')).toBe(true);
  });

  it('empty workout → aerobic-only (no strength segment, stations 0)', () => {
    const plan = composeParkWorkoutPlan(baseInput({ workout: mkWorkout([], 0) }));
    expect(plan.segments.map((s) => s.kind)).toEqual(['aerobic', 'aerobic']);
    expect(plan.totals.stations).toBe(0);
    expect(plan.totals.strengthMin).toBe(0);
  });
});
