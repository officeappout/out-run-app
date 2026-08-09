import { describe, it, expect } from 'vitest';
import { applyDifficultyFilter } from '../workout-selection.utils';
import type { ScoredExercise } from '../contextual-engine.types';
import type { WorkoutGenerationContext } from '../workout-generator.types';

/**
 * absent=absent follow-up (09.08.2026): the "Safety fallback" that overrode a real
 * domain-specific level<=1 with the user's globalLevel — on the stale assumption that 1
 * meant "Firestore default" — was removed. Since a0a2ab6f, domainLevelMap's sources
 * (buildUserProgramLevels/buildAssessedDomainBudgets) never invent a fabricated L1; a
 * domain-specific 1 reaching here is always a real assessed beginner level. These tests
 * lock down that a genuine domain-specific level (including a real 1) now drives
 * isOverLevel/levelDiff on its own — never silently promoted to the global level.
 */
function makeExercise(targetPrograms: { programId: string; level: number }[]): ScoredExercise {
  return {
    exercise: {
      id: 'ex-1',
      name: { he: 'תרגיל', en: 'exercise' },
      targetPrograms,
    } as any,
    method: 'bodyweight' as any,
    score: 0,
    reasoning: [],
    mechanicalType: 'compound' as any,
    programLevel: 5, // fixed exerciseLevel — isolates the test to domainUserLevel resolution
  };
}

function makeContext(userLevel: number, userProgramLevels: Map<string, number>): WorkoutGenerationContext {
  return {
    userLevel,
    userProgramLevels,
    requiredDomains: ['legs'],
  } as any;
}

describe('applyDifficultyFilter — domain-specific level is never overridden by globalLevel', () => {
  it('a real assessed legs=1 stays 1, even with a much higher global level (regression: was promoted to global)', () => {
    const exercises = [makeExercise([{ programId: 'legs', level: 1 }])];
    const context = makeContext(22, new Map([['legs', 1]]));
    const [result] = applyDifficultyFilter(exercises, context, 2 as any);
    // exerciseLevel(5) - domainUserLevel(1) = 4 → over-level, NOT exerciseLevel(5) - global(22) = -17
    expect(result.levelDiff).toBe(4);
    expect(result.isOverLevel).toBe(true);
  });

  it('a real assessed legs=8 is used as-is (sanity check, unrelated to the bug)', () => {
    const exercises = [makeExercise([{ programId: 'legs', level: 8 }])];
    const context = makeContext(22, new Map([['legs', 8]]));
    const [result] = applyDifficultyFilter(exercises, context, 2 as any);
    expect(result.levelDiff).toBe(5 - 8);
  });

  it('no domain-specific match at all still falls back to globalLevel (line 377, unchanged)', () => {
    const exercises = [makeExercise([])];
    const context = makeContext(22, new Map());
    const [result] = applyDifficultyFilter(exercises, context, 2 as any);
    expect(result.levelDiff).toBe(5 - 22);
  });
});
