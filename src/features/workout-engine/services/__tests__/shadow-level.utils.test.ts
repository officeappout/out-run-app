import { describe, it, expect } from 'vitest';
import { exerciseMatchesProgram } from '../shadow-level.utils';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

/**
 * Housekeeping audit (mapping gaps in PROGRAM_MUSCLE_MAP / the legs
 * primaryMuscle matcher): 'forearms'/'traps' were already in
 * UPPER_BODY_MUSCLES but missing from PROGRAM_MUSCLE_MAP.pull, so a
 * forearms- or traps-primary exercise never surfaced under a back/biceps
 * (pull) selection even though they're real, tagged exercises. Separately,
 * 'adductors'/'hip_flexors' reconcile the legs primaryMuscle matcher with
 * muscle-chips.ts's own `legs` group, which already included both.
 */

function makeExercise(id: string, primaryMuscle: Exercise['primaryMuscle']): Exercise {
  return {
    id,
    name: { he: id, en: id },
    movementGroup: 'isolation',
    primaryMuscle,
    targetPrograms: [],
    programIds: [],
  } as any;
}

describe('exerciseMatchesProgram — PROGRAM_MUSCLE_MAP.pull gap fix', () => {
  it('a forearms-primary exercise now matches the pull program', () => {
    const ex = makeExercise('wrist-curl', 'forearms');
    expect(exerciseMatchesProgram(ex, 'pull')).toBe(true);
  });

  it('a traps-primary exercise now matches the pull program', () => {
    const ex = makeExercise('shrug', 'traps');
    expect(exerciseMatchesProgram(ex, 'pull')).toBe(true);
  });

  it('a push-only muscle (chest) still does not match pull', () => {
    const ex = makeExercise('bench-press', 'chest');
    expect(exerciseMatchesProgram(ex, 'pull')).toBe(false);
  });
});

describe('exerciseMatchesProgram — legs primaryMuscle matcher reconciliation', () => {
  it('an adductors-primary exercise matches the legs program', () => {
    const ex = makeExercise('hip-adduction', 'adductors');
    expect(exerciseMatchesProgram(ex, 'legs')).toBe(true);
  });

  it('a hip_flexors-primary exercise matches the legs program', () => {
    const ex = makeExercise('leg-raise', 'hip_flexors');
    expect(exerciseMatchesProgram(ex, 'legs')).toBe(true);
  });
});
