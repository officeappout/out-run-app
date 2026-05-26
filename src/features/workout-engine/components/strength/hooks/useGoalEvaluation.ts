'use client';

import { useGoalsForProgram } from '@/features/user/progression/hooks/useGoalsForProgram';

import type { CompletedExercise, LevelGoalDef } from '../utils/summary.utils';

/**
 * useGoalEvaluation — admin-defined level-goal checklist pipeline.
 *
 * Three-step pipeline:
 *   1. Self-fetch goals for the program (when no `levelGoals` prop was passed)
 *      via `useGoalsForProgram`, which transparently handles master-program
 *      expansion (upper_body → push + pull, etc.).
 *   2. Map the raw `LevelGoal[]` into the UI-shaped `LevelGoalDef[]`
 *      (`fetchedGoalDefs`) with localized labels ("חזרות" / "שניות").
 *   3. Resolve the final goal set (`levelGoals` prop wins when non-empty;
 *      otherwise the fetched defs are used), then EVALUATE each goal against
 *      the session's `completedExercises` to produce `bestValue` + `achieved`.
 *
 * Matching is name-substring OR id-equality.  bestValue uses `max(sets)` for
 * rep-based goals and `totalReps` (which holds total hold time) for second-based
 * goals.
 *
 * Pure peripheral — no side effects, no Firebase writes.
 *
 * Extracted from StrengthSummaryPage.tsx (Decoupling Step S-3).
 */

export interface EvaluatedGoal extends LevelGoalDef {
  /** True when `bestValue ≥ targetValue`. */
  achieved: boolean;
  /** Best value extracted from the session (max set reps OR totalReps for seconds). */
  bestValue: number;
}

export interface UseGoalEvaluationParams {
  /** Goals piped in from the parent (wins when non-empty). */
  levelGoals?: LevelGoalDef[];
  /** Program id used to self-fetch goals via `useGoalsForProgram`. */
  programId?: string;
  /** Current program level — drives the `useGoalsForProgram` target. */
  currentLevel: number;
  /** Session exercise log to evaluate goals against. */
  completedExercises: CompletedExercise[];
}

export interface UseGoalEvaluationResult {
  /** Final goal set used for evaluation (prop > fetched). */
  resolvedGoals: LevelGoalDef[];
  /** Resolved goals annotated with `achieved` + `bestValue` for this session. */
  evaluatedGoals: EvaluatedGoal[];
}

export function useGoalEvaluation({
  levelGoals,
  programId,
  currentLevel,
  completedExercises,
}: UseGoalEvaluationParams): UseGoalEvaluationResult {
  // ── Self-fetch goals when none were passed in ──
  // useGoalsForProgram handles master-program expansion internally; passing
  // `null` short-circuits the fetch so we don't waste a network call when the
  // parent already piped goals in via the `levelGoals` prop.
  const { goals: rawFetchedGoals } = useGoalsForProgram(
    (!levelGoals || levelGoals.length === 0) && programId
      ? { templateId: programId, currentLevel }
      : null,
  );

  // ── Map LevelGoal[] → LevelGoalDef[] (UI shape) ──
  const fetchedGoalDefs: LevelGoalDef[] = rawFetchedGoals.map((tg, idx) => {
    const unitLabel = tg.unit === 'reps' ? 'חזרות' : 'שניות';
    return {
      id: tg.exerciseId || `goal-${idx}`,
      exerciseName: tg.exerciseName,
      targetValue: tg.targetValue,
      unit: tg.unit,
      label: `${tg.exerciseName} — ${tg.targetValue} ${unitLabel}`,
      progressBonus: tg.progressBonus,
    };
  });

  // ── Resolve: prop wins when non-empty, else use fetched ──
  const resolvedGoals: LevelGoalDef[] =
    levelGoals && levelGoals.length > 0 ? levelGoals : fetchedGoalDefs;

  // ── Evaluate each goal against this session's completed exercises ──
  const evaluatedGoals: EvaluatedGoal[] = resolvedGoals.map((goal) => {
    const match = completedExercises.find(
      (ex) =>
        ex.name.toLowerCase().includes(goal.exerciseName.toLowerCase()) ||
        ex.id === goal.id,
    );
    const bestValue = match
      ? goal.unit === 'reps'
        ? Math.max(...match.sets, 0)
        : match.totalReps // For seconds, totalReps holds total hold time
      : 0;
    return {
      ...goal,
      achieved: bestValue >= goal.targetValue,
      bestValue,
    };
  });

  return { resolvedGoals, evaluatedGoals };
}
