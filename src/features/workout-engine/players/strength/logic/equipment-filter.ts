/**
 * equipment-filter — limit exercise swaps AT A STATION to what the park has (PR-B3).
 *
 * ExerciseReplacementModal applies this only when it is given `allowedEquipmentIds` (only the
 * hybrid station passes it). Everywhere else the modal is unchanged.
 *
 * An alternative is kept when it has at least one PARK execution method whose required equipment
 * is all available at this park, or that needs no equipment at all (bodyweight). That fitting
 * method is also the one used if the user picks it, so the swapped exercise is doable here.
 */
import { normalizeGearId } from '@/features/workout-engine/shared/utils/gear-mapping.utils';

type MethodLike = {
  location?: string;
  locationMapping?: string[];
  equipmentIds?: string[];
  gearIds?: string[];
  gearId?: string;
  equipmentId?: string;
};

/** Normalized gear ids a method needs (bodyweight / none dropped). [] = bodyweight. */
export function methodRequiredEquipment(method: MethodLike | null | undefined): string[] {
  const raw = [
    ...(method?.equipmentIds ?? []),
    ...(method?.gearIds ?? []),
    ...(method?.gearId ? [method.gearId] : []),
    ...(method?.equipmentId ? [method.equipmentId] : []),
  ].filter(Boolean);
  const out: string[] = [];
  for (const id of raw) {
    const norm = normalizeGearId(id);
    if (norm !== 'none' && norm !== 'bodyweight' && !out.includes(norm)) out.push(norm);
  }
  return out;
}

const isParkMethod = (m: MethodLike): boolean =>
  m?.location === 'park' || (m?.locationMapping ?? []).includes('park');

/**
 * The park method to use for this exercise at a station with `allowed` gear, or null when none
 * fits. Prefers a method that uses the park's equipment, then a bodyweight one.
 */
export function pickFittingParkMethod<M extends MethodLike>(
  exercise: { execution_methods?: M[]; executionMethods?: M[] } | null | undefined,
  allowed: readonly string[],
): M | null {
  const methods: M[] = (exercise as any)?.execution_methods || (exercise as any)?.executionMethods || [];
  const allowedSet = new Set(allowed.map((id) => normalizeGearId(id)));
  let bodyweight: M | null = null;
  for (const m of methods) {
    if (!isParkMethod(m)) continue;
    const req = methodRequiredEquipment(m);
    if (req.length === 0) { bodyweight = bodyweight ?? m; continue; }
    if (req.every((id) => allowedSet.has(id))) return m;
  }
  return bodyweight;
}

/**
 * Keep only alternatives doable at this park; each kept option's method is set to the fitting
 * one. `allowed` null/undefined → unchanged (not at a station).
 */
export function filterAlternativesByEquipment<
  T extends { exercise: any; selectedExecutionMethod?: any },
>(options: readonly T[], allowed: readonly string[] | null | undefined): T[] {
  if (!allowed) return options.slice();
  const out: T[] = [];
  for (const opt of options) {
    const method = pickFittingParkMethod(opt.exercise, allowed);
    if (method) out.push({ ...opt, selectedExecutionMethod: method });
  }
  return out;
}
