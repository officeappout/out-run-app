/**
 * park-fitness.util — shared PRIMARY-fitness + has-equipment park predicates.
 *
 * Extracted verbatim from find-station-park.service so BOTH the along-route station
 * finder and the Phase 1.1 out-and-back resolver (park-out-and-back) apply the
 * IDENTICAL "is this a dedicated fitness park" test — one source of truth, no drift.
 *
 * PURE: imports only the `Park` type. No gear-mapping / Firestore / runtime deps, so
 * it is safe to import from unit-tested modules.
 *
 * Catalog-aware (SPEC-07 production-bug fix): `fetchRealParks()` returns the lean
 * catalog shape — `hasUsableEquipment`/`isPrimaryFitness` precomputed booleans, no raw
 * `gymEquipment`/`sportTypes` arrays. Both predicates below prefer the precomputed
 * boolean when it's present (catalog shape) and fall back to the raw-field check
 * otherwise (a full-record Park, e.g. from `getPark()`, which may not have the
 * booleans populated). This is the SAME "precomputed flag first, raw fallback"
 * pattern `route-stops.service.ts`'s `mapParkToStop` already uses correctly — see
 * scheduling-capability-audit.md for the bug this fixes (every caller of the OLD
 * raw-only checks here always returned "no equipped park" against catalog data).
 */

import type { Park } from '@/features/parks/core/types/park.types';

/** True for a PRIMARY facility (dedicated fitness) — the only tier we station at for MVP. */
export function isPrimaryFitness(p: Park): boolean {
  if (typeof p.isPrimaryFitness === 'boolean') return p.isPrimaryFitness;
  const sportTypes = Array.isArray(p.sportTypes) ? p.sportTypes : [];
  const category = (p as any).category ?? p.facilityType; // stored field is `category`
  return (
    sportTypes.some((t) => ['calisthenics', 'functional', 'crossfit'].includes(String(t))) ||
    category === 'gym_park'
  );
}

/** True when the park has at least one real, usable piece of gym equipment. */
export function hasUsableEquipment(p: Park): boolean {
  if (typeof p.hasUsableEquipment === 'boolean') return p.hasUsableEquipment;
  return (p.gymEquipment?.length ?? 0) > 0;
}
