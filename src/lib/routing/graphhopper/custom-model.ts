/**
 * Route tags → GraphHopper custom model (priority multipliers only, all <= 1,
 * merged by GraphHopper on top of the profile's own model). Values are the
 * ones measured in the 19.10.2026 experiment ("mix best-of-6" variant).
 */
import type { CustomModel, CustomModelStatement, GhProfile, RouteTags } from './types';

const QUIET_FOOT: CustomModelStatement[] = [
  { if: 'road_class == MOTORWAY || road_class == TRUNK || road_class == PRIMARY', multiply_by: '0.08' },
  { else_if: 'road_class == SECONDARY', multiply_by: '0.15' },
  { else_if: 'road_class == TERTIARY', multiply_by: '0.3' },
  { else_if: 'road_class == UNCLASSIFIED || road_class == SERVICE', multiply_by: '0.6' },
  { else_if: 'road_class == RESIDENTIAL', multiply_by: '0.8' },
  { else_if: 'road_class == STEPS', multiply_by: '0.5' },
];

const QUIET_BIKE: CustomModelStatement[] = [
  { if: 'road_class == MOTORWAY || road_class == TRUNK', multiply_by: '0.1' },
  { else_if: 'road_class == PRIMARY', multiply_by: '0.3' },
  { else_if: 'road_class == SECONDARY', multiply_by: '0.5' },
];

const SAFE_CROSSINGS: CustomModelStatement[] = [
  { if: 'crossing == UNMARKED || crossing == NO', multiply_by: '0.2' },
  { else_if: 'crossing == UNCONTROLLED', multiply_by: '0.8' },
];

export const PARKS_AREA_ID = 'parks';
const OUTSIDE_PARKS: CustomModelStatement = { if: `!in_${PARKS_AREA_ID}`, multiply_by: '0.85' };

export const isFootProfile = (p: GhProfile) => p === 'foot' || p === 'out_run';

/** null when no tag adds anything (send no custom_model at all). */
export function buildCustomModel(profile: GhProfile, tags: RouteTags): CustomModel | null {
  const foot = isFootProfile(profile);
  const priority: CustomModelStatement[] = [];
  // out_run / out_bike already carry these in the server profile.
  if (tags.quietStreets && profile === 'foot') priority.push(...QUIET_FOOT);
  if (tags.quietStreets && profile === 'bike') priority.push(...QUIET_BIKE);
  if (tags.avoidUnmarkedCrossings && profile === 'foot') priority.push(...SAFE_CROSSINGS);
  const parks = tags.preferParks?.filter(f => f?.geometry) ?? [];
  if (parks.length > 0 && (foot || profile === 'bike')) priority.push(OUTSIDE_PARKS);
  if (priority.length === 0) return null;
  if (parks.length === 0 || !priority.includes(OUTSIDE_PARKS)) return { priority };
  // GraphHopper wants ONE feature per area id — merge into a MultiPolygon.
  const polys: unknown[] = [];
  for (const f of parks) {
    if (f.geometry.type === 'Polygon') polys.push(f.geometry.coordinates);
    else polys.push(...(f.geometry.coordinates as unknown[]));
  }
  return {
    priority,
    areas: { type: 'FeatureCollection', features: [{ type: 'Feature', id: PARKS_AREA_ID, properties: {}, geometry: { type: 'MultiPolygon', coordinates: polys } }] },
  };
}
