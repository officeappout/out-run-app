/**
 * level-summary.test.ts — Progression System v2, Phase 4b.
 *
 * Unit tests for resolveLevelSummary — the three explicit data-source
 * decisions behind the Skill Tree program page's inline "current level"
 * card (replacing ProgramDrawer): placeholder-only descriptions are
 * hidden, the target exercise's value only shows when a real targetGoals
 * entry names that SAME exercise, and per-level status is derived from
 * completedGoalIds only when the level actually has goals.
 */
import { describe, it, expect } from 'vitest';
import { resolveLevelSummary } from '../level-summary.service';

describe('resolveLevelSummary — level description', () => {
  it('the auto-placeholder ("רמה N") is treated as no real content', () => {
    const result = resolveLevelSummary({ currentLevel: 6, levelDescription: 'רמה 6' });
    expect(result.realDescription).toBeNull();
  });

  it('real admin-authored text is shown as-is', () => {
    const result = resolveLevelSummary({ currentLevel: 6, levelDescription: 'החזק חתירת פרונט בטאק 8 שניות' });
    expect(result.realDescription).toBe('החזק חתירת פרונט בטאק 8 שניות');
  });

  it('no description field at all -> null, not a crash', () => {
    const result = resolveLevelSummary({ currentLevel: 6 });
    expect(result.realDescription).toBeNull();
  });

  it('the placeholder check is level-specific — "רמה 6" text at level 7 is real content, not that level\'s placeholder', () => {
    const result = resolveLevelSummary({ currentLevel: 7, levelDescription: 'רמה 6' });
    expect(result.realDescription).toBe('רמה 6');
  });
});

describe('resolveLevelSummary — target exercise / matching goal', () => {
  const GOALS = [
    { exerciseId: 'ex-A', targetValue: 8, unit: 'seconds' as const },
    { exerciseId: 'ex-B', targetValue: 10, unit: 'reps' as const },
  ];

  it('a targetGoals entry naming the SAME exercise as the tree representative is the matching goal', () => {
    const result = resolveLevelSummary({
      currentLevel: 6,
      targetGoals: GOALS,
      currentLevelExerciseId: 'ex-A',
    });
    expect(result.matchingGoal).toEqual({ exerciseId: 'ex-A', targetValue: 8, unit: 'seconds' });
  });

  it('no targetGoals entry names the tree representative -> no matching goal (exercise still shown by the caller, just no number)', () => {
    const result = resolveLevelSummary({
      currentLevel: 6,
      targetGoals: GOALS,
      currentLevelExerciseId: 'ex-Z', // not in GOALS
    });
    expect(result.matchingGoal).toBeNull();
  });

  it('no tree representative at all -> no matching goal, even if targetGoals exist', () => {
    const result = resolveLevelSummary({ currentLevel: 6, targetGoals: GOALS, currentLevelExerciseId: null });
    expect(result.matchingGoal).toBeNull();
  });
});

describe('resolveLevelSummary — per-level completion status', () => {
  const GOALS = [
    { exerciseId: 'ex-A', targetValue: 8, unit: 'seconds' as const },
    { exerciseId: 'ex-B', targetValue: 10, unit: 'reps' as const },
  ];

  it('no targetGoals at all -> hasGoals false, no fabricated status', () => {
    const result = resolveLevelSummary({ currentLevel: 6 });
    expect(result.hasGoals).toBe(false);
    expect(result.goalsCompleted).toBe(false);
  });

  it('all goals completed -> goalsCompleted true', () => {
    const result = resolveLevelSummary({
      currentLevel: 6,
      targetGoals: GOALS,
      completedGoalIds: ['ex-A', 'ex-B'],
    });
    expect(result.hasGoals).toBe(true);
    expect(result.goalsCompleted).toBe(true);
  });

  it('only SOME goals completed -> still "בתהליך" (goalsCompleted false)', () => {
    const result = resolveLevelSummary({
      currentLevel: 6,
      targetGoals: GOALS,
      completedGoalIds: ['ex-A'],
    });
    expect(result.hasGoals).toBe(true);
    expect(result.goalsCompleted).toBe(false);
  });

  it('no completedGoalIds at all (never assessed this session) -> not completed, no crash', () => {
    const result = resolveLevelSummary({ currentLevel: 6, targetGoals: GOALS });
    expect(result.goalsCompleted).toBe(false);
  });
});
