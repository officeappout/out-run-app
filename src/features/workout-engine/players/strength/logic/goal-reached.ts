/**
 * 3e (enable_goal_presence_v1): which level goals a set just reached (pure).
 * A goal is reached when ONE logged set of its exercise is ≥ the target (reps, or seconds for a
 * hold). Matching = exercise id, or the goal's exercise name inside the logged name (the same
 * rule as the summary's useGoalEvaluation). Each goal fires once per session (`celebrated`).
 */
export interface GoalTargetLite {
  exerciseId: string;
  exerciseName: string;
  targetValue: number;
  unit: 'reps' | 'seconds';
}

export interface ReachedGoal {
  key: string;
  goal: GoalTargetLite;
  value: number;
}

interface LogEntryLike {
  exerciseId: string;
  exerciseName: string;
  confirmedReps: number[];
}

export function goalKey(g: GoalTargetLite): string {
  return `${g.exerciseId || g.exerciseName}:${g.targetValue}:${g.unit}`;
}

function matches(entry: LogEntryLike, g: GoalTargetLite): boolean {
  if (g.exerciseId && entry.exerciseId === g.exerciseId) return true;
  const name = (g.exerciseName ?? '').trim().toLowerCase();
  return !!name && (entry.exerciseName ?? '').toLowerCase().includes(name);
}

export function newlyReachedGoals(
  log: readonly LogEntryLike[],
  goals: readonly GoalTargetLite[],
  celebrated: ReadonlySet<string>,
): ReachedGoal[] {
  const out: ReachedGoal[] = [];
  for (const g of goals) {
    if (!(g.targetValue > 0)) continue;
    const key = goalKey(g);
    if (celebrated.has(key)) continue;
    let best = 0;
    for (const e of log) {
      if (!matches(e, g)) continue;
      for (const v of e.confirmedReps ?? []) if (v > best) best = v;
    }
    if (best >= g.targetValue) out.push({ key, goal: g, value: best });
  }
  return out;
}
