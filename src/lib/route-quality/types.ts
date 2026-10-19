/** [lng, lat] — the same tuple order as Route.path and Mapbox geometry. */
export type LngLat = [number, number];

/** A tertiary-or-bigger road centerline from OSM. */
export interface MajorRoad {
  id: number;
  highway: string;
  name?: string;
  coords: LngLat[];
}

/** How a crossing node lets a pedestrian over a road. */
export type CrossingControl = 'signalled' | 'marked' | 'unmarked';

export interface CrossingNode {
  id: number;
  coord: LngLat;
  control: CrossingControl;
}

/** The OSM context a route is judged against (major roads + crossing nodes in a bbox). */
export interface OsmRoadLayer {
  bbox: { south: number; west: number; north: number; east: number };
  roads: MajorRoad[];
  crossings: CrossingNode[];
}

export interface UTurnMark {
  coord: LngLat;
  /** Distance along the route (m) of the reversal tip. */
  atM: number;
  /** 'spur' = a dead-end out-and-back of >= SPUR_MIN_M; 'uturn' = a short reversal. */
  kind: 'uturn' | 'spur';
  /** How far (m) the path runs out and back along itself around the tip. */
  depthM: number;
}

export interface RoadCrossingMark {
  coord: LngLat;
  roadName?: string;
  highway: string;
  control: CrossingControl;
}

export interface RouteQualityMetrics {
  lengthM: number;
  uTurns: UTurnMark[];
  uTurnCount: number;
  spurCount: number;
  /** Share (0..1) of the route length that re-walks a stretch already walked earlier. */
  retracedPct: number;
  /** Proper self-crossings of the line (touching/overlapping excluded). */
  selfIntersections: number;
  /** Isoperimetric quotient 4πA/P² of the closed path (circle = 1, out-and-back ≈ 0). */
  compactness: number;
  /** (actual − target) / target; null when no target given. */
  distanceErrorPct: number | null;
  /** Share (0..1) of the length running ON a tertiary+ centerline; null without an OSM layer. */
  majorRoadPct: number | null;
  /** Crossings of tertiary+ roads; null without an OSM layer. */
  crossings: {
    total: number;
    perKm: number;
    signalled: number;
    marked: number;
    unmarked: number;
    unmarkedPerKm: number;
    marks: RoadCrossingMark[];
  } | null;
}
