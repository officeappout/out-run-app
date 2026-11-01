/**
 * machine-swap-tiers — how a park MACHINE's swap list is built (pilot AJ9), PURE.
 *
 * AG5 gave a machine pseudo-exercise (machineIdOf) the park's other machines, but only when
 * the swap sheet got a `park` with its gymEquipment. The workout preview drawer and the active
 * player pass `park={null}`, so the list came back empty ("לא נמצאו תרגילים חלופיים") and the
 * "alternative" tab offered only bodyweight moves. The order now, before any bodyweight move:
 *   1. catalog exercises done ON this same machine (a method that requires its id);
 *   2. machines working the same primary muscle, then the same movement pattern
 *      (rankMachineSwaps) from the park when it is known, else from the catalog's park machines.
 * The first MACHINE_SWAP_LIMIT go to the "adaptation" tab; the rest lead the "alternative" tab,
 * topped up with the catalog alternatives.
 */
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import { normalizeGearId } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { methodRequiredEquipment } from './equipment-filter';
import { MACHINE_SWAP_LIMIT } from './machine-swap';

type MethodLike = Parameters<typeof methodRequiredEquipment>[0];

/** The method needs this machine (by its raw gym_equipment id, or the same canonical gear). */
export function methodUsesMachine(method: MethodLike, machineId: string): boolean {
  if (!method || !machineId) return false;
  const raw = [
    ...(method.equipmentIds ?? []),
    ...(method.gearIds ?? []),
    ...(method.gearId ? [method.gearId] : []),
    ...(method.equipmentId ? [method.equipmentId] : []),
  ];
  if (raw.includes(machineId)) return true;
  const canonical = normalizeGearId(machineId);
  return canonical !== machineId && methodRequiredEquipment(method).includes(canonical);
}

/**
 * The machines a swap may offer: the park's own when it is known, else every catalog machine
 * that lives in parks (an unknown park must still beat bodyweight). Cardio is dropped later.
 */
export function machineSwapPool(
  all: readonly GymEquipment[],
  parkMachineIds: ReadonlySet<string>,
): GymEquipment[] {
  if (parkMachineIds.size > 0) return all.filter((m) => parkMachineIds.has(m.id));
  return all.filter((m) => !m.availableInLocations?.length || m.availableInLocations.includes('park'));
}

interface HasExerciseId {
  exercise: { id: string };
}

/** Machine options first, then the others; no id twice, at most `limit`. */
export function machineFirst<T extends HasExerciseId>(
  machines: readonly T[],
  others: readonly T[],
  limit = MACHINE_SWAP_LIMIT,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const o of [...machines, ...others]) {
    if (out.length >= limit) break;
    if (!o?.exercise?.id || seen.has(o.exercise.id)) continue;
    seen.add(o.exercise.id);
    out.push(o);
  }
  return out;
}

/** The ranked machine options split into the two tabs: the best few, and the ones left over. */
export function splitMachineTabs<T>(ranked: readonly T[], limit = MACHINE_SWAP_LIMIT): { adaptation: T[]; rest: T[] } {
  return { adaptation: ranked.slice(0, limit), rest: ranked.slice(limit) };
}
