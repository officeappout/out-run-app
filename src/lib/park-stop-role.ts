/**
 * park-stop-role — the single source of truth for classifying a park/POI's
 * generic hybrid-route stop role from facilityType/natureType/urbanType.
 *
 * Extracted verbatim from route-stops.service.ts's `mapParkToStop` (SPEC-07
 * redesign, 17.09.2026) so BOTH the catalog build (server, computes
 * `stopRole` from the full record at build time) and any client consumer
 * import the SAME classification — one module, not a duplicated table.
 * Duplicating this table across a server/client boundary is exactly the
 * failure that has hit this codebase three times already.
 *
 * Equipment (`gym_park` / has real gymEquipment) is intentionally NOT part
 * of this function — that predicate is already covered by the catalog's
 * own `hasUsableEquipment`/`facilityType` fields, so a caller checks those
 * directly instead of baking equipment into this classification.
 */

export type ParkStopRole =
  | { activityType: 'stretch'; locationKind: 'viewpoint'; cooldownEligible: true }
  | { activityType: 'stretch'; locationKind: 'spring'; cooldownEligible: true }
  | { activityType: 'stretch'; locationKind: 'scenic'; cooldownEligible: true }
  | { activityType: 'strength'; locationKind: 'stairs'; cooldownEligible: false }
  | { activityType: 'core'; locationKind: 'bench'; cooldownEligible: false };

export interface ParkStopRoleInput {
  facilityType?: string;
  natureType?: string;
  urbanType?: string;
  /** Legacy stored-field fallback — see mapParkToStop's original comment.
   *  Verified against 1165 real docs (17.09.2026): 0 carry this field, the
   *  fallback is dead on real data today, but kept so behavior is provably
   *  identical to the function this replaces rather than silently dropped. */
  category?: string;
}

/** PURE. Mirrors mapParkToStop's nature/urban/facility branches exactly
 *  (minus the equipment/gym_park branch — see module doc above). */
export function classifyParkStopRole(input: ParkStopRoleInput): ParkStopRole | null {
  const facility = input.category ?? input.facilityType;
  const nature = input.natureType;
  const urban = input.urbanType;

  if (nature === 'observation_point') return { activityType: 'stretch', locationKind: 'viewpoint', cooldownEligible: true };
  if (nature === 'spring') return { activityType: 'stretch', locationKind: 'spring', cooldownEligible: true };
  if (facility === 'nature_community') return { activityType: 'stretch', locationKind: 'scenic', cooldownEligible: true };
  if (facility === 'zen_spot') return { activityType: 'stretch', locationKind: 'scenic', cooldownEligible: true };
  if (facility === 'urban_spot') {
    if (urban === 'stairs') return { activityType: 'strength', locationKind: 'stairs', cooldownEligible: false };
    return { activityType: 'core', locationKind: 'bench', cooldownEligible: false };
  }
  return null;
}
