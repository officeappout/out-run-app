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

/** A trail-pipeline route (osm / generated stage) is urban when at least this share runs in built-up area. */
export const URBAN_BUILT_UP_MIN_PCT = 50;
