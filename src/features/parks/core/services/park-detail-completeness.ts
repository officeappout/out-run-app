/**
 * park-detail-completeness — the TRIPWIRE logic behind ParkDetailSheet's
 * self point-fetch (SPEC-07 redesign, 17.09.2026). Extracted as a pure,
 * standalone module so it's unit-testable in this repo's node-only Vitest
 * config (no jsdom — a React component with framer-motion/hooks can't be
 * rendered in a test here; the LOGIC behind its fallback path can).
 *
 * Fires only on the fallback path: ParkDetailSheet's own getPark() point-
 * fetch failed or hasn't resolved yet, and it's about to render whatever
 * `selectedPark` it was handed instead. Silent degrade was the actual
 * failure mode this whole redesign responds to — this makes it loud.
 */

import type { Park } from '../types/park.types';

type DetailCriticalPark = Pick<Park, 'id' | 'description' | 'featureTags' | 'city' | 'status' | 'facilityType' | 'gymEquipment'>;

const ALWAYS_REQUIRED_FIELDS = ['description', 'featureTags', 'city', 'status'] as const;

/** PURE. Returns the detail-critical fields missing on `park` — empty
 *  array means the object is complete enough to render without degrading. */
export function findMissingDetailFields(park: DetailCriticalPark | null | undefined): string[] {
  if (!park) return [];
  const missing: string[] = [];
  for (const field of ALWAYS_REQUIRED_FIELDS) {
    if (park[field] === undefined) missing.push(field);
  }
  if (park.facilityType === 'gym_park' && park.gymEquipment === undefined) missing.push('gymEquipment');
  return missing;
}

/** The tripwire itself — call this from the fallback branch (point-fetch
 *  failed/pending). Warns once per call when the object is incomplete;
 *  no-op when it's already complete. */
export function logParkDetailTripwireIfIncomplete(park: DetailCriticalPark, context: string): void {
  const missing = findMissingDetailFields(park);
  if (missing.length > 0) {
    console.warn(
      `[ParkDetailSheet] TRIPWIRE: fallback render with incomplete park data — missing [${missing.join(', ')}], park ${park.id}, ${context}`,
    );
  }
}
