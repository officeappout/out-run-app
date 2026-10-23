/**
 * Route tags → GraphHopper custom model (priority multipliers only, all <= 1,
 * merged by GraphHopper on top of the profile's own model). Values are the
 * ones measured in the 19.10.2026 experiment ("mix best-of-6" variant).
 */
import type { CustomModel, CustomModelStatement, GeoJsonPolygonFeature, GhProfile, RouteTags } from './types';
import { OUR_ROUTES_AREA_ID, OUTSIDE_OUR_ROUTES_PRIORITY } from '../our-routes';

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

/**
 * enable_loops_prefer_marked_trails: a mild cut on ordinary paved streets that are NOT part of a marked
 * foot route (foot_network == MISSING), so trail-like edges (PATH / TRACK / BRIDLEWAY / FOOTWAY / STEPS)
 * and anything inside a hiking-route relation stay un-penalised and come out relatively better.
 * Deliberately <= 1 (GraphHopper rejects priority > 1) and mild: villages' streets must stay usable to
 * get from the start onto a trail. Never touches access (a forbidden edge keeps priority 0).
 */
export const PREFER_TRAILS_PAVED_MULTIPLIER = '0.85';
// MUST stay a separate, multiplicative statement applied AFTER QUIET_FOOT. Do not fold it into
// QUIET_FOOT's if/else_if chain: those road classes are already matched there, so an else_if branch
// would never fire for them.
const PREFER_TRAILS_FOOT: CustomModelStatement[] = [
  {
    if: 'foot_network == MISSING && (road_class == TERTIARY || road_class == UNCLASSIFIED || road_class == RESIDENTIAL || road_class == SERVICE)',
    multiply_by: PREFER_TRAILS_PAVED_MULTIPLIER,
  },
];

export const PARKS_AREA_ID = 'parks';
const OUTSIDE_PARKS: CustomModelStatement = { if: `!in_${PARKS_AREA_ID}`, multiply_by: '0.85' };
/** Our mapped routes (enable_loops_prefer_official): everything off them is de-prioritised. */
const OUTSIDE_OUR_ROUTES: CustomModelStatement = { if: `!in_${OUR_ROUTES_AREA_ID}`, multiply_by: OUTSIDE_OUR_ROUTES_PRIORITY };

export const isFootProfile = (p: GhProfile) => p === 'foot' || p === 'foot_turns' || p === 'out_run';
/** Plain foot profiles: OUT's quiet-streets / safe-crossings layers are sent per request (out_run bakes them in). */
const isPlainFoot = (p: GhProfile) => p === 'foot' || p === 'foot_turns';

/** null when no tag adds anything (send no custom_model at all). */
export function buildCustomModel(profile: GhProfile, tags: RouteTags): CustomModel | null {
  const foot = isFootProfile(profile);
  const priority: CustomModelStatement[] = [];
  // out_run / out_bike already carry these in the server profile.
  if (tags.quietStreets && isPlainFoot(profile)) priority.push(...QUIET_FOOT);
  if (tags.quietStreets && profile === 'bike') priority.push(...QUIET_BIKE);
  if (tags.avoidUnmarkedCrossings && isPlainFoot(profile)) priority.push(...SAFE_CROSSINGS);
  const parks = tags.preferParks?.filter(f => f?.geometry) ?? [];
  if (parks.length > 0 && (foot || profile === 'bike')) priority.push(OUTSIDE_PARKS);
  const ourRoutes = tags.preferOurRoutes?.geometry ? tags.preferOurRoutes : null;
  if (ourRoutes) priority.push(OUTSIDE_OUR_ROUTES);
  if (tags.preferMarkedTrails && foot) priority.push(...PREFER_TRAILS_FOOT);
  if (priority.length === 0) return null;
  const features: GeoJsonPolygonFeature[] = [];
  if (parks.length > 0 && priority.includes(OUTSIDE_PARKS)) {
    // GraphHopper wants ONE feature per area id — merge into a MultiPolygon.
    const polys: unknown[] = [];
    for (const f of parks) {
      if (f.geometry.type === 'Polygon') polys.push(f.geometry.coordinates);
      else polys.push(...(f.geometry.coordinates as unknown[]));
    }
    features.push({ type: 'Feature', id: PARKS_AREA_ID, properties: {}, geometry: { type: 'MultiPolygon', coordinates: polys } });
  }
  if (ourRoutes) features.push({ ...ourRoutes, id: OUR_ROUTES_AREA_ID, properties: {} });
  if (features.length === 0) return { priority };
  return { priority, areas: { type: 'FeatureCollection', features } };
}
