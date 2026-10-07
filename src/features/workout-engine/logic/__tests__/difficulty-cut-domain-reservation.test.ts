import { describe, it, expect } from 'vitest';
import { selectExercisesForDifficulty } from '../workout-selection.utils';
import type { ScoredExercise } from '../contextual-engine.types';
import type { WorkoutGenerationContext } from '../workout-generator.types';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

/**
 * Regression coverage for the domain-reserved-headroom fix (2026-10-07
 * under-fill investigation). selectExercisesForDifficulty's score-ranked
 * top-N cut had NO domain/skill awareness at all -- confirmed live that a
 * thin skill (1 real planche candidate, 7 front_lever candidates, in a
 * 21-candidate scored pool) could be wiped out ENTIRELY by this cut before
 * selectExercisesWithDomainQuotas' own per-domain logic ever ran, forcing
 * every remaining slot through a domain-blind last-resort fallback. See the
 * function's own doc comment in workout-selection.utils.ts for the full
 * root-cause writeup.
 */

function makeExercise(id: string, targetPrograms: { programId: string; level: number }[]): Exercise {
  return { id, name: { he: id, en: id }, targetPrograms } as any;
}

function scored(ex: Exercise, score: number, levelDiff = -1): ScoredExercise & { levelDiff?: number } {
  return { exercise: ex, method: 'bodyweight' as any, score, reasoning: [], mechanicalType: 'none' as any, levelDiff } as any;
}

function ctx(requiredDomains?: string[]): WorkoutGenerationContext {
  return { requiredDomains } as any;
}

describe('selectExercisesForDifficulty — domain-reserved headroom', () => {
  it('reproduces and fixes the live bug: a thin skill (1 candidate) is no longer wiped out by a large generic pool', () => {
    // Shape mirrors the live trace exactly: 1 planche candidate, 7
    // front_lever candidates, 13 generic/other candidates (21 total) --
    // all scored so the 13 generic ones alone would already fill count*2.
    const planche = scored(makeExercise('planche-1', [{ programId: 'planche', level: 14 }]), 10);
    const frontLever = Array.from({ length: 7 }, (_, i) =>
      scored(makeExercise(`front-${i}`, [{ programId: 'front_lever', level: 7 }]), 20 + i));
    const generic = Array.from({ length: 13 }, (_, i) =>
      scored(makeExercise(`generic-${i}`, [{ programId: 'pull', level: 16 }]), 100 + i));

    const all = [planche, ...frontLever, ...generic];
    const result = selectExercisesForDifficulty(all, 6, ctx(['planche', 'front_lever']), 2);

    const hasPlanche = result.some((s) => s.exercise.id === 'planche-1');
    const frontLeverCount = result.filter((s) => s.exercise.id.startsWith('front-')).length;
    expect(hasPlanche).toBe(true);
    expect(frontLeverCount).toBeGreaterThanOrEqual(1);
    expect(result.length).toBe(6);
  });

  it('without requiredDomains set, behaves exactly as before (pure score cut, no reservation)', () => {
    const planche = scored(makeExercise('planche-1', [{ programId: 'planche', level: 14 }]), 10);
    const generic = Array.from({ length: 13 }, (_, i) =>
      scored(makeExercise(`generic-${i}`, [{ programId: 'pull', level: 16 }]), 100 + i));

    const result = selectExercisesForDifficulty([planche, ...generic], 6, ctx(undefined), 2);

    // No domain context at all -- the thin candidate is NOT specially
    // protected, matching pre-fix behavior exactly (this gate is additive).
    expect(result.some((s) => s.exercise.id === 'planche-1')).toBe(false);
    expect(result.length).toBe(6);
  });

  it('a domain already well-represented in the score-ranked pool is left untouched', () => {
    const frontLever = Array.from({ length: 5 }, (_, i) =>
      scored(makeExercise(`front-${i}`, [{ programId: 'front_lever', level: 7 }]), 200 + i));
    const generic = Array.from({ length: 10 }, (_, i) =>
      scored(makeExercise(`generic-${i}`, [{ programId: 'pull', level: 16 }]), 100 + i));

    const result = selectExercisesForDifficulty([...frontLever, ...generic], 6, ctx(['front_lever']), 2);

    // front_lever already dominates the top of the score-sorted pool --
    // reservation has nothing to top up, result is just the normal top-6.
    const frontLeverCount = result.filter((s) => s.exercise.id.startsWith('front-')).length;
    expect(frontLeverCount).toBe(5);
    expect(result.length).toBe(6);
  });

  it('reservation never grows the result past `count`', () => {
    const planche = scored(makeExercise('planche-1', [{ programId: 'planche', level: 14 }]), 10);
    const frontLever = scored(makeExercise('front-1', [{ programId: 'front_lever', level: 7 }]), 11);
    const generic = Array.from({ length: 13 }, (_, i) =>
      scored(makeExercise(`generic-${i}`, [{ programId: 'pull', level: 16 }]), 100 + i));

    const result = selectExercisesForDifficulty([planche, frontLever, ...generic], 6, ctx(['planche', 'front_lever']), 2);
    expect(result.length).toBe(6);
  });

  it('a required domain with zero real candidates anywhere does not crash and reserves nothing for it', () => {
    const generic = Array.from({ length: 13 }, (_, i) =>
      scored(makeExercise(`generic-${i}`, [{ programId: 'pull', level: 16 }]), 100 + i));

    expect(() => selectExercisesForDifficulty(generic, 6, ctx(['planche', 'muscle_up']), 2)).not.toThrow();
    const result = selectExercisesForDifficulty(generic, 6, ctx(['planche', 'muscle_up']), 2);
    expect(result.length).toBe(6);
  });
});
