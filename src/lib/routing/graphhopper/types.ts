/**
 * GraphHopper 11 /route wire types (only the fields OUT uses) and the
 * routed-path shape the rest of the app consumes.
 */
import type { LngLat } from '@/lib/route-quality';

/** Server profiles — infra/graphhopper/config.yml. */
export type GhProfile = 'foot' | 'foot_turns' | 'out_run' | 'bike' | 'out_bike' | 'mtb';

/**
 * Foot profiles the app may route running/walking on: `foot` (node-based, no
 * turn costs) or `foot_turns` (same model + turn costs — fewer zigzags; needs
 * the config.yml rebuild of 21.10.2026). Chosen by GRAPHHOPPER_FOOT_PROFILE.
 */
export type GhFootProfile = 'foot' | 'foot_turns';

/**
 * Route "tags" a caller can ask for; each one adds custom-model statements
 * (custom-model.ts). All optional; DEFAULT_TAGS is what OUT runs with.
 */
export interface RouteTags {
  /** Push the route off tertiary+ roads onto residential streets / footways. */
  quietStreets?: boolean;
  /** Heavily penalise unmarked / missing crossings (foot profiles only). */
  avoidUnmarkedCrossings?: boolean;
  /** Prefer edges inside these park polygons (GeoJSON, lng/lat). */
  preferParks?: GeoJsonPolygonFeature[];
  /**
   * Prefer edges on OUR mapped routes: one buffered MultiPolygon (lib/routing/our-routes
   * buildOurRoutesArea). Set only with flag enable_loops_prefer_official.
   */
  preferOurRoutes?: GeoJsonPolygonFeature;
  // lit: not modelled yet — GraphHopper 11 has no `lit` encoded value (needs a custom import).
}

export const DEFAULT_TAGS: Readonly<RouteTags> = { quietStreets: true, avoidUnmarkedCrossings: true };

export interface GeoJsonPolygonFeature {
  type: 'Feature';
  id?: string;
  properties?: Record<string, unknown>;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
}

export interface CustomModelStatement {
  if?: string;
  else_if?: string;
  else?: string;
  multiply_by: string;
}

export interface CustomModel {
  priority: CustomModelStatement[];
  areas?: { type: 'FeatureCollection'; features: GeoJsonPolygonFeature[] };
}

/** POST /route body (GraphHopper uses [lng, lat] in JSON points). */
export interface GhRouteRequest {
  profile: GhProfile;
  points: LngLat[];
  points_encoded: false;
  instructions: false;
  elevation: true;
  details: string[];
  'ch.disable': true;
  custom_model?: CustomModel;
  algorithm?: 'round_trip';
  'round_trip.distance'?: number;
  'round_trip.seed'?: number;
  headings?: number[];
  pass_through?: boolean;
}

/** [fromPointIndex, toPointIndex, value] */
export type GhDetailInterval = [number, number, string | number | boolean | null];

export interface GhPath {
  distance: number;
  time: number;
  ascend?: number;
  descend?: number;
  points: { type: 'LineString'; coordinates: number[][] };
  details?: Record<string, GhDetailInterval[]>;
}

export interface GhRouteResponse {
  paths?: GhPath[];
  message?: string;
}

export type CrossingKind = 'signalled' | 'marked' | 'unmarked';

/** What OUT keeps from one GraphHopper path. */
export interface RoutedPath {
  /** [lng, lat] — Route.path order. */
  path: LngLat[];
  /** Metres above sea level per path point (same length as path). */
  elevations: number[];
  distanceM: number;
  /** GraphHopper's walking/cycling time estimate. */
  timeMs: number;
  ascendM: number;
  descendM: number;
  /** Steepest grade (%) over >= 50 m windows, from the smoothed SRTM profile. */
  maxGradePct: number;
  /** Share (0..1) of the length per road_class (lower-case OSM-ish names). */
  roadClassShare: Record<string, number>;
  /** Share (0..1) on tertiary or bigger roads — the route-quality majorRoadPct definition. */
  majorRoadShare: number;
  /** Crossing edges walked, by control. Counts every crossing (minor streets too). */
  crossings: Record<CrossingKind, number>;
}
