/**
 * What a park MACHINE (a machine pseudo-exercise, machineIdOf) can be swapped for, ranked,
 * machines before any bodyweight move (pilots AG5 + AJ9). See machine-swap-tiers.ts.
 *
 *   1. catalog exercises done on this same machine, with the method that uses it;
 *   2. the park's other machines (or, park unknown, the catalog's park machines) for the
 *      same muscle, then the same movement pattern — built exactly like the station built
 *      the original, so a pick plays as a machine with its own photo / video.
 *
 * Uncapped: the swap sheet shows the first few on "adaptation" and the rest on "alternative".
 */
import type { Exercise, ExecutionMethod } from '@/features/content/exercises';
import type { Park } from '@/types/admin-types';
import type { AlternativeExerciseOption } from './exercise-replacement.service';
import { withoutTestExercises } from '../../shared/utils/test-exercise.utils';
import { isHiddenSkillExercise } from '@/lib/hidden-programs';
import { compareMachineLevel, machineIdOf, rankMachineSwaps, MACHINE_SWAP_LIMIT, type MachineLike } from '../../players/strength/logic/machine-swap';
import { machineSwapPool, methodUsesMachine } from '../../players/strength/logic/machine-swap-tiers';

export interface MachineSwapQuery {
  excludeIds?: ReadonlySet<string> | null;
}

function catalogLevel(ex: Exercise, fallback: number): number {
  const tp = ex.targetPrograms?.[0]?.level;
  if (typeof tp === 'number' && tp > 0) return tp;
  return ex.recommendedLevel && ex.recommendedLevel > 0 ? ex.recommendedLevel : fallback;
}

/** Tier 1: catalog exercises whose method needs this very machine, closest level first. */
async function sameMachineExercises(
  current: Exercise,
  machineId: string,
  currentLevel: number,
  exclude: ReadonlySet<string> | null | undefined,
): Promise<AlternativeExerciseOption[]> {
  const { getAllExercisesCached } = await import('@/features/content/exercises');
  const out: AlternativeExerciseOption[] = [];
  for (const ex of withoutTestExercises(await getAllExercisesCached())) {
    if (!ex?.id || ex.id === current.id || ex.id === machineId || exclude?.has(ex.id)) continue;
    if (isHiddenSkillExercise(ex)) continue;
    const method = (ex.execution_methods ?? []).find((m) => methodUsesMachine(m as never, machineId));
    if (!method) continue;
    const level = catalogLevel(ex, currentLevel);
    out.push({
      exercise: ex,
      selectedExecutionMethod: method as ExecutionMethod,
      levelComparison: compareMachineLevel(level, currentLevel),
      resolvedLevel: level,
    });
  }
  out.sort((a, b) => Math.abs(a.resolvedLevel - currentLevel) - Math.abs(b.resolvedLevel - currentLevel));
  return out.slice(0, MACHINE_SWAP_LIMIT);
}

/** Tier 2: other machines for the same muscle / pattern, as machine pseudo-exercises. */
async function otherMachines(
  current: Exercise,
  currentLevel: number,
  park: Park | null,
  exclude: ReadonlySet<string> | null | undefined,
): Promise<AlternativeExerciseOption[]> {
  const parkGear = park?.gymEquipment ?? [];
  const parkIds = new Set(parkGear.map((g) => g.equipmentId).filter(Boolean) as string[]);
  const [{ getAllGymEquipmentCached }, { buildMachinePseudoExercise, TABATA_DIFFICULTY_LADDER }] = await Promise.all([
    import('@/features/content/equipment/gym/core/gym-equipment.service'),
    import('../../services/compose-park-strength-workout.service'),
  ]);
  const pool = machineSwapPool(await getAllGymEquipmentCached(), parkIds);
  const picks = rankMachineSwaps(current as MachineLike, pool, { exclude, limit: Number.POSITIVE_INFINITY });
  const brandOf = new Map(parkGear.map((g) => [g.equipmentId, g.brandName ?? undefined]));
  return picks.map((m) => {
    // The config only shapes the WorkoutExercise wrapper; the swap keeps the slot's own prescription.
    const we = buildMachinePseudoExercise(m, TABATA_DIFFICULTY_LADDER.medium, brandOf.get(m.id));
    const level = m.recommendedLevel > 0 ? m.recommendedLevel : currentLevel;
    return {
      exercise: we.exercise as Exercise,
      selectedExecutionMethod: we.method,
      levelComparison: compareMachineLevel(level, currentLevel),
      resolvedLevel: level,
    };
  });
}

/** Every machine swap option for a machine pseudo-exercise, best first. [] for a catalog exercise. */
export async function getMachineSwapOptions(
  currentExercise: Exercise,
  currentLevel: number,
  park: Park | null,
  opts?: MachineSwapQuery,
): Promise<AlternativeExerciseOption[]> {
  const machineId = machineIdOf(currentExercise);
  if (!machineId) return [];
  const [same, machines] = await Promise.all([
    sameMachineExercises(currentExercise, machineId, currentLevel, opts?.excludeIds),
    otherMachines(currentExercise, currentLevel, park, opts?.excludeIds),
  ]);
  const seen = new Set<string>();
  return [...same, ...machines].filter((o) => !seen.has(o.exercise.id) && !!seen.add(o.exercise.id));
}
