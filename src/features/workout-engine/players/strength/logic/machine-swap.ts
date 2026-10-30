/**
 * machine-swap — what a park MACHINE can be swapped for (pilot AG5), PURE.
 *
 * A machine at a park station isn't a catalog exercise: it's a pseudo-exercise built
 * from its gym_equipment doc (buildMachinePseudoExercise), tagged with
 * `sourceEquipmentId`. It has no base_movement_id, so the catalog "variations" tab was
 * always empty, and the catalog "alternatives" tab could only offer bodyweight moves.
 * Its real alternatives are the park's OTHER machines working the same muscle:
 *   rank 0: same primary muscle;
 *   rank 1: same movement pattern (different / unknown muscle).
 * Cardio machines, the machine itself and excluded ids (already in the workout) never.
 */
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';

export interface MachineLike {
  id?: string;
  primaryMuscle?: string | null;
  movementGroup?: string | null;
  sourceEquipmentId?: string | null;
}

/** The gym_equipment id behind a machine pseudo-exercise, else null (a catalog exercise). */
export function machineIdOf(exercise: unknown): string | null {
  const id = (exercise as MachineLike | null | undefined)?.sourceEquipmentId;
  return typeof id === 'string' && id ? id : null;
}

export const MACHINE_SWAP_LIMIT = 3;

export function rankMachineSwaps(
  current: MachineLike,
  machines: readonly GymEquipment[],
  opts: { exclude?: ReadonlySet<string> | null; limit?: number } = {},
): GymEquipment[] {
  const selfId = machineIdOf(current) ?? current.id ?? '';
  const muscle = current.primaryMuscle ?? null;
  const pattern = current.movementGroup ?? null;
  const ranked: Array<{ m: GymEquipment; rank: number; i: number }> = [];
  machines.forEach((m, i) => {
    if (!m?.id || m.id === selfId || m.isCardio === true || opts.exclude?.has(m.id)) return;
    if (muscle && m.primaryMuscle === muscle) ranked.push({ m, rank: 0, i });
    else if (pattern && m.movementPattern === pattern) ranked.push({ m, rank: 1, i });
  });
  ranked.sort((a, b) => a.rank - b.rank || a.i - b.i);
  const seen = new Set<string>();
  const out: GymEquipment[] = [];
  for (const { m } of ranked) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
    if (out.length >= (opts.limit ?? MACHINE_SWAP_LIMIT)) break;
  }
  return out;
}

/** 'lower' | 'same' | 'higher' of a machine's level against the current one. */
export function compareMachineLevel(level: number, currentLevel: number): 'lower' | 'same' | 'higher' {
  return level < currentLevel ? 'lower' : level > currentLevel ? 'higher' : 'same';
}
