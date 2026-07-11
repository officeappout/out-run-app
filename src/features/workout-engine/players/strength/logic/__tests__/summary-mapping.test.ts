import { describe, it, expect } from 'vitest';
import { mapToCompletedExercises } from '../summary-mapping';
import type { WorkoutPlan } from '@/features/parks';
import type { ExerciseResultLog } from '../../hooks/useWorkoutStateMachine';

const ex = (id: string, over: Record<string, unknown> = {}) =>
  ({ id, name: id, sets: 3, ...over } as never);

const seg = (id: string, exercises: unknown[], over: Record<string, unknown> = {}) =>
  ({ id, title: id, exercises, ...over } as never);

const plan = (...segments: unknown[]): WorkoutPlan =>
  ({ id: 'w1', name: 'test', segments, totalDuration: 30, difficulty: 'medium' } as never);

const logEntry = (
  exerciseId: string,
  segmentId: string,
  reps: number[],
): ExerciseResultLog => ({
  exerciseId,
  exerciseName: exerciseId,
  segmentId,
  confirmedReps: reps,
  targetReps: reps[0] ?? 0,
});

describe('mapToCompletedExercises (Stage S)', () => {
  it('explicit protocol=superset → superset category', () => {
    const p = plan(seg('seg-main', [ex('a', { pairedWith: 'b' }), ex('b', { pairedWith: 'a' })], { protocol: 'superset' }));
    const out = mapToCompletedExercises(p, [logEntry('a', 'seg-main', [8])]);
    expect(out.find((e) => e.id === 'seg-main:a')?.category).toBe('superset');
    expect(out.find((e) => e.id === 'seg-main:b')?.category).toBe('superset');
  });

  it('BURIES the length>=2 heuristic: protocol=straight multi-exercise segment → main', () => {
    // The old inline version labeled ANY 2+-exercise segment as superset.
    const p = plan(seg('seg-main', [ex('a'), ex('b'), ex('c')], { protocol: 'straight' }));
    const out = mapToCompletedExercises(p, []);
    expect(out.every((e) => e.category === 'main')).toBe(true);
  });

  it('legacy plan (no protocol): per-exercise pairedWith decides, standalone stays main', () => {
    const p = plan(seg('seg-main', [
      ex('a', { pairedWith: 'b' }),
      ex('solo'),
      ex('b', { pairedWith: 'a' }),
    ]));
    const out = mapToCompletedExercises(p, []);
    expect(out.find((e) => e.id === 'seg-main:a')?.category).toBe('superset');
    expect(out.find((e) => e.id === 'seg-main:solo')?.category).toBe('main');
    expect(out.find((e) => e.id === 'seg-main:b')?.category).toBe('superset');
  });

  it('tabata block groups as main (until the summary grows block sections)', () => {
    const p = plan(seg('seg-tabata', [ex('a'), ex('b')], {
      protocol: 'tabata',
      protocolConfig: { workSec: 20, restSec: 10, rounds: 8 },
    }));
    const out = mapToCompletedExercises(p, [logEntry('a', 'seg-tabata', [20, 20, 20, 20])]);
    expect(out.find((e) => e.id === 'seg-tabata:a')?.category).toBe('main');
    expect(out.find((e) => e.id === 'seg-tabata:a')?.totalReps).toBe(80);
  });

  it('warmup/stretch detection unchanged (id + Hebrew title)', () => {
    const p = plan(
      seg('seg-warmup', [ex('w')], { protocol: 'straight' }),
      seg('seg-cooldown', [ex('c')], { title: 'מתיחות', protocol: 'straight' }),
    );
    const out = mapToCompletedExercises(p, []);
    expect(out.find((e) => e.id === 'seg-warmup:w')?.category).toBe('warmup');
    expect(out.find((e) => e.id === 'seg-cooldown:c')?.category).toBe('stretch');
  });

  it('cross-segment duplicate exercise no longer collides (composite keys)', () => {
    // Same exercise id in warmup AND main — the old exerciseId-only maps
    // merged them (one row swallowed the other in the secondary pass).
    const p = plan(
      seg('seg-warmup', [ex('pushup')]),
      seg('seg-main', [ex('pushup')]),
    );
    const out = mapToCompletedExercises(p, [
      logEntry('pushup', 'seg-warmup', [10]),
      logEntry('pushup', 'seg-main', [8, 8]),
    ]);
    const ids = out.map((e) => e.id);
    expect(ids).toContain('seg-warmup:pushup');
    expect(ids).toContain('seg-main:pushup');
    expect(out).toHaveLength(2); // no phantom secondary-pass duplicates
    expect(out.find((e) => e.id === 'seg-main:pushup')?.totalReps).toBe(16);
  });

  it('swapped-in exercise (log without plan twin) appears with real reps', () => {
    const p = plan(seg('seg-main', [ex('planned')]));
    const out = mapToCompletedExercises(p, [logEntry('swapped', 'seg-main', [12, 12])]);
    const swapped = out.find((e) => e.id === 'seg-main:swapped');
    expect(swapped).toMatchObject({ category: 'main', totalReps: 24 });
    // planned-but-unlogged still appended with empty sets
    expect(out.find((e) => e.id === 'seg-main:planned')?.sets).toEqual([]);
  });
});
