/**
 * park-loops — loops around BIG, pleasant parks (owner, 21.10: Sportek,
 * Park HaYarkon, Park HaMesila — NOT fitness parks). NATIONWIDE-PLAN.md §2.5,
 * W5 (offline). Pure; the PBF/GraphHopper I/O lives in the script.
 */
export type LngLat = [number, number];

export interface ParkPolygon {
  /** e.g. 'way/123' | 'relation/456' (merged parks: ids joined with '+'). */
  id: string;
  name: string;
  /** Outer rings only (holes ignored for a perimeter walk). */
  rings: LngLat[][];
  areaM2: number;
  perimeterM: number;
  kind: 'park' | 'nature_reserve' | 'recreation_ground';
}

export type ParkLoopKind = 'known' | 'perimeter' | 'inner';

export interface ParkLoop {
  park: ParkPolygon;
  kind: ParkLoopKind;
  coords: LngLat[];
  lengthM: number;
  /** known loops: the existing route id; perimeter: share of the boundary on real paths. */
  evidence: string;
  fitnessStops: Array<{ id: string; coord: LngLat; distanceM: number }>;
}

export interface PathLine { id: string; coords: LngLat[]; highway: string }
export interface PointFeature { id: string; coord: LngLat }
