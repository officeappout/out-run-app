/**
 * push-pull-vertical-symmetry.test.ts
 *
 * Covers the one-sided "Push-Pull Vertical Symmetry" scoring bonus fix
 * (11.10.2026, domain-balance audit). Root-caused via a direct generation
 * trace against the real invariants fixture: a push+pull 2-day/week user
 * got 0 pull exercises in 2 of 4 seeded runs of the easiest trio option,
 * despite pull having MORE eligible candidates near that level than push
 * (ruled out as a data/catalog issue). Traced to WorkoutGenerator.ts's
 * applySynergyBonuses: whenever the top-scoring vertical candidate was
 * vertical_pull, EVERY vertical_push candidate got a flat +100 bonus (far
 * larger than any other scoring term) — with no mirror case for when
 * vertical_push happens to be the natural top scorer. Under a tight
 * exercise-count budget, that one-sided inflation let push systematically
 * win the truncation cut.
 */
import { describe, it, expect } from 'vitest';
import { WorkoutGenerator } from '../WorkoutGenerator';
import type { Exercise, MovementGroup } from '@/features/content/exercises/core/exercise.types';
import type { ScoredExercise } from '../contextual-engine.types';
import type { WorkoutGenerationContext } from '../workout-generator.types';

function mkEx(id: string, movementGroup: MovementGroup, score: number): ScoredExercise {
  return {
    exercise: {
      id,
      name: { he: id, en: id },
      type: 'reps',
      mechanicalType: 'bent_arm',
      movementGroup,
      symmetry: 'bilateral',
      tags: [],
    } as unknown as Exercise,
    method: {},
    mechanicalType: 'bent_arm',
    score,
    reasoning: [],
    programLevel: 10,
  } as unknown as ScoredExercise;
}

const baseContext = { userLevel: 10 } as unknown as WorkoutGenerationContext;

function reasoningFor(result: ScoredExercise[], id: string): string[] {
  return (result.find((r) => r.exercise.id === id) as unknown as { reasoning: string[] }).reasoning;
}

describe('applySynergyBonuses — Push-Pull Vertical Symmetry', () => {
  it('pull-dominant pool: every vertical_push candidate gets the +100 bonus (pre-existing behavior preserved)', () => {
    const generator = new WorkoutGenerator();
    const pool = [
      mkEx('pull_top', 'vertical_pull', 90),
      mkEx('push_a', 'vertical_push', 40),
      mkEx('push_b', 'vertical_push', 35),
      mkEx('pull_horizontal', 'horizontal_pull', 50),
    ];
    const result = generator.applySynergyBonuses(pool, baseContext);
    const pushA = result.find((r) => r.exercise.id === 'push_a')!;
    const pushB = result.find((r) => r.exercise.id === 'push_b')!;
    expect(pushA.score).toBeGreaterThanOrEqual(40 + 100);
    expect(pushB.score).toBeGreaterThanOrEqual(35 + 100);
    expect(reasoningFor(result, 'push_a').some((r) => r.includes('vertical_symmetry') && r.includes('vpull_dominant'))).toBe(true);
  });

  // The fix: before, this direction got NOTHING — the push_top candidate
  // would win the vertical slot and no pull candidate was compensated.
  it('push-dominant pool: every vertical_pull candidate gets the matching +100 bonus (the fix)', () => {
    const generator = new WorkoutGenerator();
    const pool = [
      mkEx('push_top', 'vertical_push', 90),
      mkEx('pull_a', 'vertical_pull', 40),
      mkEx('pull_b', 'vertical_pull', 35),
      mkEx('push_horizontal', 'horizontal_push', 50),
    ];
    const result = generator.applySynergyBonuses(pool, baseContext);
    const pullA = result.find((r) => r.exercise.id === 'pull_a')!;
    const pullB = result.find((r) => r.exercise.id === 'pull_b')!;
    expect(pullA.score).toBeGreaterThanOrEqual(40 + 100);
    expect(pullB.score).toBeGreaterThanOrEqual(35 + 100);
    expect(reasoningFor(result, 'pull_a').some((r) => r.includes('vertical_symmetry') && r.includes('vpush_dominant'))).toBe(true);
  });

  it('the dominant side itself is not double-boosted by its own symmetry bonus', () => {
    const generator = new WorkoutGenerator();
    const pool = [
      mkEx('pull_top', 'vertical_pull', 90),
      mkEx('push_a', 'vertical_push', 40),
    ];
    const result = generator.applySynergyBonuses(pool, baseContext);
    const pullTop = result.find((r) => r.exercise.id === 'pull_top')!;
    expect(reasoningFor(result, 'pull_top').some((r) => r.includes('vertical_symmetry'))).toBe(false);
    // Only the Hierarchical Vertical Preference (+15) applies to the top scorer, not +100.
    expect(pullTop.score).toBeLessThan(90 + 100);
  });

  it('no vertical candidates at all: does not throw, no symmetry bonus applied', () => {
    const generator = new WorkoutGenerator();
    const pool = [mkEx('core_a', 'core', 50), mkEx('core_b', 'core', 45)];
    expect(() => generator.applySynergyBonuses(pool, baseContext)).not.toThrow();
    const result = generator.applySynergyBonuses(pool, baseContext);
    expect(reasoningFor(result, 'core_a').some((r) => r.includes('vertical_symmetry'))).toBe(false);
  });
});
