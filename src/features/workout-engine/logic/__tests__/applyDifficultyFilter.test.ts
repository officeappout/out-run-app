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
 *
 * absent=absent follow-up #2 (03.09.2026): the ONE remaining gap a1acb366's own comment
 * named but didn't close — `rawDomainLevel = globalLevel` when NO domain-specific level
 * exists at all (not even an assessed 1) — is now also fixed. 01-MAP.md §8 confirmed scale
 * A (per-domain level, open-ended) and scale G (globalLevel, closed 1-10, pure-XP-derived)
 * have zero mapping between them anywhere in the codebase; borrowing G as a stand-in for A
 * compares two unrelated number spaces. Fixed to an explicit, same-scale L1 floor instead
 * (matching resolveExerciseLevelForDomains' own `recommendedLevel || 1` convention),
 * tracked via the new `domainLevelAssumed` flag and a pipelineLog entry — never silent.
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

  it('no domain-specific match at all uses an explicit L1 floor, never globalLevel (03.09.2026 fix)', () => {
    const exercises = [makeExercise([])];
    const context = makeContext(22, new Map());
    const [result] = applyDifficultyFilter(exercises, context, 2 as any);
    // exerciseLevel(5) - domainUserLevel(1, explicit floor) = 4 → NOT exerciseLevel(5) - global(22) = -17
    expect(result.levelDiff).toBe(5 - 1);
    expect(result.domainLevelAssumed).toBe(true);
  });

  it('a real domain-specific level never sets domainLevelAssumed', () => {
    const exercises = [makeExercise([{ programId: 'legs', level: 8 }])];
    const context = makeContext(22, new Map([['legs', 8]]));
    const [result] = applyDifficultyFilter(exercises, context, 2 as any);
    expect(result.domainLevelAssumed).toBe(false);
  });

  it('pushes a pipelineLog entry when the L1 floor is used, and names globalLevel explicitly (never silent)', () => {
    const exercises = [makeExercise([])];
    const context = makeContext(22, new Map());
    const pipelineLog: string[] = [];
    applyDifficultyFilter(exercises, context, 2 as any, pipelineLog);
    expect(pipelineLog).toHaveLength(1);
    expect(pipelineLog[0]).toMatch(/no assessed domain level/);
    expect(pipelineLog[0]).toMatch(/NOT globalLevel/);
  });
});
