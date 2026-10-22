/**
 * urban-measure — what a walker meets along an URBAN route candidate
 * (RC9, owner 22.10.2026): composition (dedicated path vs. street vs.
 * sidewalk), lighting, amenities within reach, and road crossings. The
 * nationwide runner fills these in for candidates that arrive without them
 * (named corridors, park loops, GraphHopper loops, known routes …) so they are
 * scored on measurements instead of the half-points "not measured" fallback.
 * Pure, I/O-free: the caller builds one UrbanLayer per authority from the
 * local OSM extract and passes it in.
 */
import type { CrossingNode } from '../route-quality/types';

export type LngLat = [number, number];

/** One OSM highway way with its full tags (lit, footway, sidewalk, foot …). */
export interface UrbanWay {
  id: number;
  highway: string;
  tags: Record<string, string>;
  coords: LngLat[];
}

export type UrbanAmenityKind = 'bench' | 'drinking_water' | 'toilets' | 'fitness_station';
export const URBAN_AMENITY_KINDS: readonly UrbanAmenityKind[] = ['bench', 'drinking_water', 'toilets', 'fitness_station'];

export interface UrbanPoint {
  kind: UrbanAmenityKind;
  coord: LngLat;
}

/** Plain input — everything the measurements need for one authority. */
export interface UrbanLayerInput {
  ways: UrbanWay[];
  /** highway=street_lamp nodes (and any lamp dataset points). */
  lamps: LngLat[];
  amenities: UrbanPoint[];
  /** Crossing / traffic-signal nodes (route-quality's CrossingNode). */
  crossings: CrossingNode[];
}

export interface UrbanComposition {
  sidewalkPct: number;
  genuinePct: number;
  ordinaryPct: number;
  otherPct: number;
  unmatchedPct: number;
}

export interface UrbanLighting {
  /** Share (0..1) of the length with a yes/no answer (OSM lit=* or a lamp within reach). */
  known: number;
  /** Lit share of the KNOWN length, 0..100. */
  litPct: number;
}

export interface UrbanAmenities {
  has: Record<UrbanAmenityKind, boolean>;
  counts: Record<UrbanAmenityKind, number>;
}

export interface UrbanCrossings {
  /** Share (0..1) of the length running ON a tertiary+ centerline. */
  majorRoadPct: number;
  /**
   * Q-D (RC10): share (0..1) of the length that is "on" a tertiary+ road
   * (counted in majorRoadPct) but on a walkway separated from it — a parallel
   * footway / OSM footway=sidewalk within 15 m, or a road tagged sidewalk=*.
   * Always ≤ majorRoadPct.
   */
  separatedMajorPct: number;
  total: number;
  signalled: number;
  marked: number;
  unmarked: number;
  unmarkedPerKm: number;
}

/** Per-route result; null parts were not measurable (never guessed). */
export interface UrbanMeasurement {
  composition: UrbanComposition | null;
  lighting: UrbanLighting | null;
  amenities: UrbanAmenities | null;
  crossings: UrbanCrossings | null;
  notes: string[];
}
