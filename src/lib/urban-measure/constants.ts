/** Named, tunable thresholds for the urban measurements (RC9). */

/**
 * Highway vocabulary for the composition classifier — the same list
 * scripts/lib/route-quality-osm-fetch.node.ts fetches from Overpass for the
 * quality certificate (HIGHWAY_VOCAB / ROAD_HIGHWAY there), so a route scored
 * here is classified exactly like a route in the app.
 */
export const COMPOSITION_HIGHWAYS: ReadonlySet<string> = new Set([
  'footway', 'path', 'pedestrian', 'cycleway', 'steps', 'track', 'residential', 'tertiary', 'service',
  'living_street', 'unclassified', 'secondary', 'primary', 'trunk', 'motorway',
]);
/** Roads a footway can run beside (the sidewalk detector's reference lines). */
export const COMPOSITION_ROAD_HIGHWAYS: ReadonlySet<string> = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'living_street', 'unclassified', 'service',
]);

/** Composition counts as measured only when at least this share of the route snapped to an OSM way. */
export const COMPOSITION_MIN_MATCHED_PCT = 50;

/** Sample spacing along a route for lighting. */
export const URBAN_SAMPLE_STEP_M = 10;
/** A route sample is "on" a way within this distance (same 15 m as the lighting file matcher). */
export const URBAN_ON_WAY_M = 15;
/** Lighting counts as measured only when at least this share of the length has a yes/no answer. */
export const LIGHTING_MIN_KNOWN = 0.5;

/** Amenities count as "along the route" within this distance (owner: ~50 m). */
export const AMENITY_RADIUS_M = 50;

/**
 * Q-D (RC10, owner 22.10.2026): a walkway SEPARATED from a major road. Where a
 * route runs "on" a tertiary+ road (route-quality's on-road test, 10 m), the
 * walker is on a separated walkway when any of:
 *   - a walkway way (SEPARATED_WALKWAY_HIGHWAYS, foot not "no" — includes
 *     OSM footway=sidewalk) runs parallel within SEPARATED_WALKWAY_M of the
 *     route sample, or
 *   - the major road itself is tagged with a sidewalk (ROAD_SIDEWALK_VALUES on
 *     sidewalk / sidewalk:both / sidewalk:left / sidewalk:right).
 */
export const SEPARATED_WALKWAY_M = 15;
export const SEPARATED_WALKWAY_HIGHWAYS: ReadonlySet<string> = new Set(['footway', 'path', 'pedestrian', 'cycleway', 'steps']);
export const ROAD_SIDEWALK_KEYS = ['sidewalk', 'sidewalk:both', 'sidewalk:left', 'sidewalk:right'] as const;
export const ROAD_SIDEWALK_VALUES: ReadonlySet<string> = new Set(['both', 'left', 'right', 'separate', 'yes']);
