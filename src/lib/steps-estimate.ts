/** Steps per km when no step counter is available (average adult stride, ~0.77 m). */
export const STEPS_PER_KM_ESTIMATE = 1300;

/** Estimated steps for a distance in km (never negative, whole steps). */
export function estimateSteps(distanceKm: number): number {
  return Number.isFinite(distanceKm) && distanceKm > 0 ? Math.round(distanceKm * STEPS_PER_KM_ESTIMATE) : 0;
}
