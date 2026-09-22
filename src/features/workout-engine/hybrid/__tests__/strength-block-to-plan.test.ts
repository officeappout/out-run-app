import { describe, it, expect } from 'vitest';
import type { WorkoutExercise, TabataBlockSpec } from '../../logic/workout-generator.types';
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

// ── Tabata blocks (22.09.2026, field-test docs 32/33) ──────────────────────
describe('strengthBlockToWorkoutPlan — tabata blocks (core-station wiring)', () => {
  const tabataConfig = { workSec: 20, restSec: 10, rounds: 8 };

  it('one block → one segment carrying protocol:tabata + protocolConfig, scoped to that block\'s exerciseIds', () => {
    const b: StrengthBlockResult = {
      ...block([m1, m2]),
      tabataBlocks: [{ config: tabataConfig, exerciseIds: ['m1', 'm2'], kind: 'core' } as TabataBlockSpec],
    };
    const plan = strengthBlockToWorkoutPlan(b);
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].protocol).toBe('tabata');
    expect(plan.segments[0].protocolConfig).toEqual(tabataConfig);
    expect((plan.segments[0].exercises ?? []).map((e) => e.id)).toEqual(['m1', 'm2']);
  });

  it('two blocks → two SEPARATE segments, each scoped to its own exerciseIds, numbered "סבב 1/2"', () => {
    const m3 = we({ id: 'm3' });
    const m4 = we({ id: 'm4' });
    const b: StrengthBlockResult = {
      ...block([m1, m2, m3, m4]),
      tabataBlocks: [
        { config: tabataConfig, exerciseIds: ['m1', 'm2'], kind: 'core' } as TabataBlockSpec,
        { config: tabataConfig, exerciseIds: ['m3', 'm4'], kind: 'core' } as TabataBlockSpec,
      ],
    };
    const plan = strengthBlockToWorkoutPlan(b, { name: 'תחנת כוח' });
    expect(plan.segments).toHaveLength(2);
    expect(plan.segments[0].title).toBe('תחנת כוח — סבב 1 מתוך 2');
    expect(plan.segments[1].title).toBe('תחנת כוח — סבב 2 מתוך 2');
    expect((plan.segments[0].exercises ?? []).map((e) => e.id)).toEqual(['m1', 'm2']);
    expect((plan.segments[1].exercises ?? []).map((e) => e.id)).toEqual(['m3', 'm4']);
    for (const seg of plan.segments) {
      expect(seg.protocol).toBe('tabata');
      expect(seg.protocolConfig).toEqual(tabataConfig);
    }
  });

  it('takes priority over fullPark — a tabataBlocks result never falls into the warmup-split shape', () => {
    const b: StrengthBlockResult = {
      ...block([m1]),
      tabataBlocks: [{ config: tabataConfig, exerciseIds: ['m1'], kind: 'core' } as TabataBlockSpec],
    };
    const plan = strengthBlockToWorkoutPlan(b, { fullPark: true, isWarmupActive: true });
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].protocol).toBe('tabata');
    expect(plan.segments.some((s) => s.id === 'warmup-segment')).toBe(false);
  });

  it('empty tabataBlocks array falls through to the regular (non-tabata) shape — never an empty-segments plan', () => {
    const b: StrengthBlockResult = { ...block([m1, m2]), tabataBlocks: [] };
    const plan = strengthBlockToWorkoutPlan(b);
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].protocol).toBeUndefined();
  });
});
