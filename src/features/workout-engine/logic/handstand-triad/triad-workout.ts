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
import { methodFits } from '../never-empty.utils';
import { isTestOrPlaceholderExercise } from '../../shared/utils/test-exercise.utils';
import type { DifficultyLevel, GeneratedWorkout, WorkoutExercise } from '../workout-generator.types';
import { rederiveVolumeForSwappedExercise } from '../workout-budgeting.utils';
import { resolveTriadLevels } from './triad-levels';
import { LEGACY_HANDSTAND_VOLUME, type LegacyVolumeRow } from './legacy-volume.data';
import { BASE_SETS } from './triad-session-plan';
import { getTriadScores, trainedAxis } from './triad-scores';
import { fillTriadPlan } from './triad-select';
import { buildTriadPlan } from './triad-session-plan';

export const MIN_TRIAD_MAIN = 2;

/** New 1-15 axis level → old program level 1-10 (old 10 ≈ free handstand ≈ new 14). */
export const toLegacyLevel = (axisLevel: number) => Math.min(10, Math.max(1, Math.round(axisLevel / 1.4)));

/** Longest legacy hold used as-is; longer rows are capped (wall/free holds stay ≤ 90 s). */
export const LEGACY_HOLD_CAP_SECONDS = 90;

/**
 * Closest old-level row of the legacy table for this exercise, or null (not in
 * the table, or its type changed since the table was generated). Seconds are
 * capped at LEGACY_HOLD_CAP_SECONDS.
 */
export function legacyVolume(exerciseId: string, axisLevel: number, exerciseType?: string): LegacyVolumeRow | null {
  const entry = LEGACY_HANDSTAND_VOLUME[exerciseId];
  if (!entry) return null;
  if (exerciseType && (exerciseType === 'time' ? 'seconds' : 'reps') !== entry.unit) return null;
  const rows = entry.rows;
  if (Object.keys(rows).length === 0) return null;
  const target = toLegacyLevel(axisLevel);
  const levels = Object.keys(rows).map(Number);
  const nearest = levels.reduce((b, l) => (Math.abs(l - target) < Math.abs(b - target) || (Math.abs(l - target) === Math.abs(b - target) && l < b) ? l : b), levels[0]);
  const row = rows[nearest];
  if (entry.unit !== 'seconds') return row;
  return { ...row, min: Math.min(row.min, LEGACY_HOLD_CAP_SECONDS), max: Math.min(row.max, LEGACY_HOLD_CAP_SECONDS) };
}

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
  /** Undefined = unknown → the fall-practice gate is not applied. */
  fallPracticeDone?: boolean;
  /** Earlier trio options / recent ids: demoted on ties so the 3 options differ. */
  avoidIds?: ReadonlySet<string>;
}

const isMain = (e: WorkoutExercise) => e.exerciseRole !== 'warmup' && e.exerciseRole !== 'cooldown';

/** Returns a pipeline note when the main block was rebuilt, else null (workout untouched). */
export function applyTriadSkeleton(workout: GeneratedWorkout, opts: TriadWorkoutOptions): string | null {
  if (!opts.enabled || !opts.activeProgramId) return null;
  if (resolveToSlug(opts.activeProgramId) !== 'handstand') return null;

  const levels = resolveTriadLevels(opts.userProgramLevels, opts.baseUserLevel ?? 1, 'handstand');
  const rawLevels = resolveTriadLevels(opts.userProgramLevels, opts.baseUserLevel ?? 1, 'handstand', false);
  // Rank the weakest/strongest axis on the real levels; select with the entry floor.
  const plan = buildTriadPlan(rawLevels, 'session').filter((b) => b.kind !== 'warmup' && b.kind !== 'cooldown');
  const candidates = opts.pool.filter(
    (ex) => !isTestOrPlaceholderExercise(ex)
      && methodFits(selectMethodForContext(ex, opts.location, opts.availableEquipment), opts.location, opts.availableEquipment),
  );
  const filled = fillTriadPlan(plan, candidates, levels, { fallPracticeDone: opts.fallPracticeDone, avoidIds: opts.avoidIds });

  const mains: WorkoutExercise[] = [];
  for (const block of filled) {
    for (const ex of block.exercises) {
      const method = selectMethodForContext(ex, opts.location, opts.availableEquipment)!;
      const demand = getTriadScores(ex)!;
      const axis = block.axis ?? trainedAxis(demand);
      const delta = demand[axis] - levels[axis];
      const d = rederiveVolumeForSwappedExercise(ex, delta, opts.difficulty, undefined, undefined, opts.progressionPolicy);
      // Owner, 31.10: volume from the old handstand workouts where the exercise
      // appears there (reps or seconds by its own type); generic formula otherwise.
      const legacy = legacyVolume(ex.id, levels[axis], ex.type);
      // Legacy sets, shifted by the block's emphasis (+1 weakest, -1 strongest).
      const sets = legacy ? Math.max(1, legacy.sets + (block.sets - BASE_SETS)) : block.sets;
      mains.push({
        exercise: ex,
        method,
        mechanicalType: d.mechanicalType,
        sets,
        reps: legacy ? Math.round((legacy.min + legacy.max) / 2) : d.reps,
        repsRange: legacy ? { min: legacy.min, max: legacy.max } : d.repsRange,
        // Legacy rows carry their own unit; the generic heuristic reads some rep
        // exercises (straight-arm, "פלאנק" in the name) as holds.
        isTimeBased: legacy ? LEGACY_HANDSTAND_VOLUME[ex.id].unit === 'seconds' : d.isTimeBased,
        restSeconds: d.restSeconds,
        priority: 'skill',
        // High score: the volume cap's Phase C trims the lowest score first,
        // and the triad block is the session's purpose.
        score: 100 + demand[axis],
        reasoning: [`handstand_triad:${block.kind}${block.emphasis ? `(${block.emphasis})` : ''} S${demand.strength}/B${demand.balance}/M${demand.mobility} vs ${rawLevels.strength}/${rawLevels.balance}/${rawLevels.mobility} (select ${levels.strength}/${levels.balance}/${levels.mobility})${legacy ? ' legacy' : ''}`],
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
  // No generic add-backs from the generator's reserve (Phase V): time left over
  // goes to more sets (Phase D) on the triad exercises instead.
  workout.reserveExercises = [];
  return `handstand_triad: ${filled.map((b) => `${b.kind}=${b.exercises.length}x${b.sets}`).join(' ')} levels S${rawLevels.strength}/B${rawLevels.balance}/M${rawLevels.mobility}`;
}
