import { describe, it, expect } from 'vitest';
import type { WorkoutExercise } from '../../logic/workout-generator.types';
import type { StrengthBlockResult } from '../../core/pipeline/strength-block.service';
import { strengthBlockToWorkoutPlan } from '../strength-block-to-plan';

const we = (over: { id: string; role?: string }): WorkoutExercise =>
  ({
    exercise: { id: over.id, name: 'Ex' },
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
  } as unknown as WorkoutExercise);

const block = (exercises: WorkoutExercise[]): StrengthBlockResult =>
  ({ exercises, estimatedDurationSec: 1200, totalPlannedSets: 9, isEmpty: false, log: [] } as StrengthBlockResult);

const warm = we({ id: 'warm', role: 'warmup' });
const m1 = we({ id: 'm1', role: 'main' });
const m2 = we({ id: 'm2', role: 'main' });

describe('strengthBlockToWorkoutPlan — budget-split (no fullPark) is byte-identical', () => {
  it('emits a single hybrid-station segment with all roles forced to main + isWarmupActive:false', () => {
    const plan = strengthBlockToWorkoutPlan(block([warm, m1, m2]));
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].id).toBe('hybrid-station');
    // even a warmup-role source exercise is forced to 'main' (legacy behaviour)
    expect((plan.segments[0].exercises ?? []).every((e) => e.exerciseRole === 'main')).toBe(true);
    expect(plan.isWarmupActive).toBe(false);
  });
});

describe('strengthBlockToWorkoutPlan — full-park', () => {
  it('splits warmup into its own segment, preserves roles, carries isWarmupActive', () => {
    const plan = strengthBlockToWorkoutPlan(block([warm, m1, m2]), { fullPark: true, isWarmupActive: true });
    expect(plan.segments).toHaveLength(2);
    const [wSeg, sSeg] = plan.segments;
    expect(wSeg.id).toBe('warmup-segment');
    expect(wSeg.title).toBe('חימום');
    expect((wSeg.exercises ?? []).map((e) => e.id)).toEqual(['warm']);
    expect((wSeg.exercises ?? [])[0]?.exerciseRole).toBe('warmup'); // role PRESERVED
    expect(sSeg.id).toBe('hybrid-station');
    expect((sSeg.exercises ?? []).map((e) => e.id)).toEqual(['m1', 'm2']);
    expect(plan.isWarmupActive).toBe(true);
  });

  it('carries isWarmupActive:false but STILL emits the warmup segment (the run-path strips it, not the adapter)', () => {
    const plan = strengthBlockToWorkoutPlan(block([warm, m1]), { fullPark: true, isWarmupActive: false });
    expect(plan.isWarmupActive).toBe(false);
    expect(plan.segments.some((s) => s.id === 'warmup-segment')).toBe(true);
  });

  it('no warmup-role exercises → single station segment (no empty warmup segment)', () => {
    const plan = strengthBlockToWorkoutPlan(block([m1, m2]), { fullPark: true });
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].id).toBe('hybrid-station');
  });
});
