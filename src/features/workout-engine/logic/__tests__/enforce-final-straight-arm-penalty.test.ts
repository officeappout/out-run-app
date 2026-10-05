import { describe, it, expect } from 'vitest';
import { enforceFinalStraightArmPenalty } from '../workout-sorting.utils';
import type { WorkoutExercise } from '../workout-generator.types';

/**
 * Regression coverage for the SA/BA final-pass guard (06.10.2026).
 *
 * Root cause this closes: `trio-modifiers.service.ts`'s `applyFlowRegression`
 * (D1) and `applyIntenseOption`'s "David Rule inject" path (D3) both swap
 * `ex.exercise` to a different exercise AFTER `ContextualEngine.
 * applyMechanicalBalancing`'s one-time, early SA penalty pass already ran —
 * correctly re-deriving `mechanicalType` for the replacement, but never
 * re-consulting the penalty. Reproduced live (generator-validation sweep,
 * 2026-10-06): `push L18 60min D1` repeatedly landed at 5-6 final straight-arm
 * exercises with only the original 2-3 pre-swap ones marked.
 */

let nextId = 0;
function sa(reasoning: string[] = [], role: WorkoutExercise['exerciseRole'] = 'main'): WorkoutExercise {
  nextId += 1;
  return {
    exercise: { id: `sa_${nextId}`, name: { he: `sa_${nextId}`, en: `sa_${nextId}` } },
    method: {},
    sets: 3,
    reps: 10,
    restSeconds: 60,
    isTimeBased: false,
    exerciseRole: role,
    priority: 'compound',
    mechanicalType: 'straight_arm',
    score: 50,
    reasoning: [...reasoning],
  } as unknown as WorkoutExercise;
}
function ba(role: WorkoutExercise['exerciseRole'] = 'main'): WorkoutExercise {
  nextId += 1;
  return {
    exercise: { id: `ba_${nextId}`, name: { he: `ba_${nextId}`, en: `ba_${nextId}` } },
    method: {},
    sets: 3,
    reps: 10,
    restSeconds: 60,
    isTimeBased: false,
    exerciseRole: role,
    priority: 'compound',
    mechanicalType: 'bent_arm',
    score: 50,
    reasoning: [],
  } as unknown as WorkoutExercise;
}

const hasMarker = (ex: WorkoutExercise) => ex.reasoning.some((r) => r.startsWith('SA עודף'));

describe('enforceFinalStraightArmPenalty', () => {
  it('leaves the first 2 straight-arm exercises untouched and marks the 3rd/4th', () => {
    const exercises = [sa(), sa(), sa(), sa()];
    const result = enforceFinalStraightArmPenalty(exercises, ['push', 'pull', 'legs']);

    expect(hasMarker(result[0])).toBe(false);
    expect(hasMarker(result[1])).toBe(false);
    expect(result[2].reasoning).toContain('SA עודף: -5 (3/2)');
    expect(result[3].reasoning).toContain('SA עודף: -10 (4/2)');
    expect(result[2].score).toBe(45);
    expect(result[3].score).toBe(40);
  });

  it('is idempotent: an exercise already carrying the marker from the original pass is not double-penalized', () => {
    // Simulates the real-world shape: positions 1-2 are ordinary (never
    // penalized), position 3 was ALREADY marked by ContextualEngine.
    // applyMechanicalBalancing's original pass, position 4 is a swapped-in
    // replacement that bypassed that pass entirely (the bug) and so arrives
    // here unmarked.
    const originalMark = sa(['SA עודף: -5 (3/2)']);
    const swappedIn = sa(['flow_regression:L16→L14(floor=L12)']); // no SA marker — the bug
    const exercises = [sa(), sa(), originalMark, swappedIn];

    const result = enforceFinalStraightArmPenalty(exercises, ['push', 'pull', 'legs']);

    // Position 3 (already marked) is untouched — not a second marker, not a second penalty.
    expect(result[2].reasoning.filter((r) => r.startsWith('SA עודף')).length).toBe(1);
    expect(result[2].score).toBe(50); // unchanged — the guard never re-penalizes an already-marked exercise

    // Position 4 (the swap that bypassed the original pass) IS now caught by the final pass.
    expect(hasMarker(result[3])).toBe(true);
    expect(result[3].reasoning).toContain('SA עודף: -10 (4/2)');
  });

  it('only counts and marks main-role exercises — warmup/cooldown straight-arm exercises are ignored', () => {
    const exercises = [
      sa([], 'warmup'),
      sa(), sa(), sa(), // 3rd main-role straight-arm should still be marked
      sa([], 'cooldown'),
    ];
    const result = enforceFinalStraightArmPenalty(exercises, ['push', 'pull', 'legs']);

    expect(hasMarker(result[0])).toBe(false); // warmup — ignored entirely
    expect(hasMarker(result[1])).toBe(false);
    expect(hasMarker(result[2])).toBe(false);
    expect(hasMarker(result[3])).toBe(true); // 3rd MAIN straight-arm
    expect(hasMarker(result[4])).toBe(false); // cooldown — ignored entirely
  });

  it('bent-arm and hybrid exercises are never counted or marked', () => {
    const exercises = [sa(), sa(), ba(), sa()];
    const result = enforceFinalStraightArmPenalty(exercises, ['push', 'pull', 'legs']);

    expect(hasMarker(result[0])).toBe(false);
    expect(hasMarker(result[1])).toBe(false);
    expect(hasMarker(result[2])).toBe(false); // bent-arm, never touched
    expect(hasMarker(result[3])).toBe(true); // 3rd straight-arm encountered (bent-arm doesn't count)
  });

  it('respects the relaxSABA escape hatch: a single active program filter skips the guard entirely', () => {
    const exercises = [sa(), sa(), sa(), sa()];
    const result = enforceFinalStraightArmPenalty(exercises, ['push']); // length === 1 → relaxed

    expect(result).toBe(exercises); // untouched, same reference
    expect(result.every((ex) => !hasMarker(ex))).toBe(true);
  });

  it('a session with <= 2 straight-arm exercises is never touched', () => {
    const exercises = [sa(), sa(), ba(), ba()];
    const result = enforceFinalStraightArmPenalty(exercises, ['push', 'pull', 'legs']);

    expect(result.every((ex) => !hasMarker(ex))).toBe(true);
    expect(result.every((ex) => ex.score === 50)).toBe(true);
  });
});
