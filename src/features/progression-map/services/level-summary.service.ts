/**
 * level-summary.service.ts — Progression System v2, Phase 4b.
 *
 * Pure derivation for the Skill Tree program page's inline "current level"
 * card (replacing ProgramDrawer). Encodes the three explicit data-source
 * decisions made for this card, so each is independently verifiable rather
 * than only "confirmed via tsc passing" inside a large .tsx component this
 * repo's vitest config can't import directly:
 *
 *   1. Level description: only real admin-authored text counts — the
 *      write path (admin/programs/page.tsx) hardcodes every unauthored
 *      level to the placeholder `רמה ${lvl}`, so an exact match against
 *      that string is treated as "no real content," not shown.
 *   2. Target exercise: identified by the CALLER (the tree's own
 *      representative for the current level, not targetGoals[0] — see
 *      SkillTreeScreen.tsx's own comment for why) — this service only
 *      looks up whether a targetGoals entry happens to name that same
 *      exercise, for its reps/seconds value.
 *   3. Per-level status: derived from completedGoalIds (which resets on
 *      every level-up, unlike the domain-wide totalWorkoutsCompleted) —
 *      only meaningful when the level actually has targetGoals to
 *      evaluate against.
 */

export interface LevelGoalLike {
  exerciseId: string;
  targetValue: number;
  unit: 'reps' | 'seconds';
}

export interface LevelSummaryInput {
  currentLevel: number;
  levelDescription?: string;
  targetGoals?: LevelGoalLike[];
  currentLevelExerciseId?: string | null;
  completedGoalIds?: string[];
}

export interface LevelSummaryResult {
  /** null when there's no real admin-authored description (just the auto-placeholder, or nothing at all). */
  realDescription: string | null;
  /** The targetGoals entry matching the tree's own current-level exercise, if any. */
  matchingGoal: LevelGoalLike | null;
  hasGoals: boolean;
  /** Only meaningful when hasGoals is true. */
  goalsCompleted: boolean;
}

export function resolveLevelSummary(input: LevelSummaryInput): LevelSummaryResult {
  const placeholder = `רמה ${input.currentLevel}`;
  const realDescription =
    input.levelDescription && input.levelDescription !== placeholder ? input.levelDescription : null;

  const targetGoals = input.targetGoals ?? [];
  const matchingGoal =
    (input.currentLevelExerciseId
      ? targetGoals.find((g) => g.exerciseId === input.currentLevelExerciseId)
      : undefined) ?? null;

  const hasGoals = targetGoals.length > 0;
  const completedGoalIds = input.completedGoalIds ?? [];
  const goalsCompleted = hasGoals && targetGoals.every((g) => completedGoalIds.includes(g.exerciseId));

  return { realDescription, matchingGoal, hasGoals, goalsCompleted };
}
