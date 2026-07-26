/**
 * park-fitness.util — shared PRIMARY-fitness park predicate.
 *
 * Extracted verbatim from find-station-park.service so BOTH the along-route station
 * finder and the Phase 1.1 out-and-back resolver (park-out-and-back) apply the
 * IDENTICAL "is this a dedicated fitness park" test — one source of truth, no drift.
 *
 * PURE: imports only the `Park` type. No gear-mapping / Firestore / runtime deps, so
 * it is safe to import from unit-tested modules.
 */

import type { Park } from '@/features/parks/core/types/park.types';

/** True for a PRIMARY facility (dedicated fitness) — the only tier we station at for MVP. */
export function isPrimaryFitness(p: Park): boolean {
  const sportTypes = Array.isArray(p.sportTypes) ? p.sportTypes : [];
  const category = (p as any).category ?? p.facilityType; // stored field is `category`
  return (
    sportTypes.some((t) => ['calisthenics', 'functional', 'crossfit'].includes(String(t))) ||
    category === 'gym_park'
  );
}
