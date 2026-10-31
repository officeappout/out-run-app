/**
 * Handstand Triad: shape a standalone handstand session's main block into the
 * skeleton (mobility → balance → strength → line), weakest axis emphasized.
 *
 * Runs in home-workout.service right after the generator, before the warm-up
 * and cool-down services, which keep owning those two blocks (they already
 * build wrist / shoulder prep and stretches from the main block they see).
 * Only when HANDSTAND_TRIAD_ENABLED and the session's active program is
 * handstand. If the triad pool can't fill at least MIN_TRIAD_MAIN exercises,
 * the generator's own main block is kept (never worse than today).
 */
import type { Exercise, ExecutionLocation } from '@/features/content/exercises/core/exercise.types';
import { resolveToSlug } from '../../services/program-hierarchy.utils';
import { selectMethodForContext } from '../../shared/utils/method-selection.utils';
import { isTestOrPlaceholderExercise } from '../../shared/utils/test-exercise.utils';
import type { DifficultyLevel, GeneratedWorkout, WorkoutExercise } from '../workout-generator.types';
import { rederiveVolumeForSwappedExercise } from '../workout-budgeting.utils';
import { resolveTriadLevels } from './triad-levels';
import { getTriadScores, primaryAxis } from './triad-scores';
import { fillTriadPlan } from './triad-select';
import { buildTriadPlan } from './triad-session-plan';

export const MIN_TRIAD_MAIN = 2;

export interface TriadWorkoutOptions {
  enabled: boolean;
  activeProgramId?: string;
  pool: Exercise[];
  location: ExecutionLocation;
  availableEquipment: string[];
  userProgramLevels: Map<string, number>;
  baseUserLevel?: number;
  difficulty: DifficultyLevel;
  progressionPolicy?: import('../adaptive/policy').ProgressionPolicy;
  fallPracticeDone?: boolean;
}

const isMain = (e: WorkoutExercise) => e.exerciseRole !== 'warmup' && e.exerciseRole !== 'cooldown';

/** Returns a pipeline note when the main block was rebuilt, else null (workout untouched). */
export function applyTriadSkeleton(workout: GeneratedWorkout, opts: TriadWorkoutOptions): string | null {
  if (!opts.enabled || !opts.activeProgramId) return null;
  if (resolveToSlug(opts.activeProgramId) !== 'handstand') return null;

  const levels = resolveTriadLevels(opts.userProgramLevels, opts.baseUserLevel ?? 1, 'handstand');
  const plan = buildTriadPlan(levels, 'session').filter((b) => b.kind !== 'warmup' && b.kind !== 'cooldown');
  const candidates = opts.pool.filter(
    (ex) => !isTestOrPlaceholderExercise(ex) && selectMethodForContext(ex, opts.location, opts.availableEquipment) !== null,
  );
  const filled = fillTriadPlan(plan, candidates, levels, { fallPracticeDone: opts.fallPracticeDone });

  const mains: WorkoutExercise[] = [];
  for (const block of filled) {
    for (const ex of block.exercises) {
      const method = selectMethodForContext(ex, opts.location, opts.availableEquipment)!;
      const demand = getTriadScores(ex)!;
      const axis = block.axis ?? primaryAxis(demand);
      const delta = demand[axis] - levels[axis];
      const d = rederiveVolumeForSwappedExercise(ex, delta, opts.difficulty, undefined, undefined, opts.progressionPolicy);
      mains.push({
        exercise: ex,
        method,
        mechanicalType: d.mechanicalType,
        sets: block.sets,
        reps: d.reps,
        repsRange: d.repsRange,
        isTimeBased: d.isTimeBased,
        restSeconds: d.restSeconds,
        priority: 'skill',
        score: 0,
        reasoning: [`handstand_triad:${block.kind}${block.emphasis ? `(${block.emphasis})` : ''} S${demand.strength}/B${demand.balance}/M${demand.mobility} vs ${levels.strength}/${levels.balance}/${levels.mobility}`],
        exerciseRole: 'main',
        tier: d.tier,
        programLevel: demand[axis],
        levelDelta: delta,
        isOverLevel: delta > 0,
      } as WorkoutExercise);
    }
  }
  if (mains.length < MIN_TRIAD_MAIN) return null;

  const rest = workout.exercises.filter((e) => !isMain(e));
  const firstCooldown = rest.findIndex((e) => e.exerciseRole === 'cooldown');
  const at = firstCooldown >= 0 ? firstCooldown : rest.length;
  workout.exercises = [...rest.slice(0, at), ...mains, ...rest.slice(at)];
  return `handstand_triad: ${filled.map((b) => `${b.kind}=${b.exercises.length}x${b.sets}`).join(' ')} levels S${levels.strength}/B${levels.balance}/M${levels.mobility}`;
}
