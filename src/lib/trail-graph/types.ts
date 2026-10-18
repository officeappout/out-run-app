/**
 * trail-graph/types.ts — shared types for the national trails pipeline
 * (pilot: מועצה אזורית שער הנגב, 18.10.2026). Pure, no I/O.
 *
 * Coordinates are ALWAYS [lng, lat] (GeoJSON order) in this module.
 */
import type { SurfaceType } from '@/lib/route-collections/surface-type';

export type Tags = Record<string, string>;
export type LngLat = [number, number];

export interface OsmNode { id: number; lon: number; lat: number; tags: Tags }
export interface OsmWay { id: number; nodes: number[]; tags: Tags }
export interface OsmMember { type: 'n' | 'w' | 'r'; ref: number; role: string }
export interface OsmRelation { id: number; members: OsmMember[]; tags: Tags }

export interface OsmData {
  nodes: Map<number, OsmNode>;
  ways: Map<number, OsmWay>;
  relations: Map<number, OsmRelation>;
}

export const OSM_LICENSE = 'ODbL-1.0';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

export type SurfaceConfidence = 'osm_surface' | 'osm_tracktype' | 'highway_default';
export type LitValue = 'yes' | 'no' | 'unknown';
export type LitSource = 'osm_lit' | 'street_lamp' | 'default_unlit_outside_built_up' | 'none';

export interface SegmentElevation {
  provider: 'copernicus-glo30';
  /** Walking the geometry in stored order (fwd) or reversed (rev). */
  gainFwdM: number;
  gainRevM: number;
  maxGrade50mFwdPct: number;
  maxGrade50mRevPct: number;
  minEleM: number;
  maxEleM: number;
}

export interface TrailSegment {
  id: string;
  geometry: LngLat[];
  startNode: number;
  endNode: number;
  lengthM: number;
  /** null = DEM coverage gap (never guessed). */
  elevation: SegmentElevation | null;
  highwayClass: string;
  surface: SurfaceType;
  surfaceRaw: string | null;
  surfaceConfidence: SurfaceConfidence;
  lit: LitValue;
  litSource: LitSource;
  sacScale: string | null;
  mtbScale: string | null;
  tracktype: string | null;
  /** Marked-trail colour (osmc:symbol / colour of the member route), e.g. 'red'. */
  colour: string | null;
  /** ITC/KKL route ref(s) this segment is a member of. */
  itcRef: string | null;
  name: string | null;
  inBuiltUp: boolean;
  osmWayIds: number[];
  /** Route relations this segment belongs to (sorted). */
  routeRelationIds: number[];
  foot: boolean;
  bicycle: boolean;
  license: typeof OSM_LICENSE;
}

export type Difficulty = 'easy' | 'medium' | 'hard';
export type RouteShape = 'loop' | 'out_and_back' | 'linear';
export type NameSource =
  | 'osm_name'
  | 'itc_colour_ref_toponym'
  | 'urban_park_or_promenade'
  | 'endpoints'
  | 'placeholder'
  | 'generated_descriptive';

export interface RouteStats {
  lengthM: number;
  gainM: number | null;
  lossM: number | null;
  maxGrade50mPct: number | null;
  /** Same, over segments OUTSIDE built-up areas only. Copernicus GLO-30 is a
   *  surface model (DSM: buildings, tree rows) — inside kibbutzim/towns its
   *  "grades" are often roofs, so the technical bump only trusts this one. */
  maxGrade50mOpenPct: number | null;
  minEleM: number | null;
  maxEleM: number | null;
  builtUpPct: number;
  trailPct: number;
  litPct: number;
  litUnknownPct: number;
  surfaceMix: Partial<Record<SurfaceType, number>>;
}

export interface DifficultyBreakdown {
  npsScore: number | null;
  base: Difficulty;
  technicalReasons: string[];
  urbanCapped: boolean;
  final: Difficulty;
}

export interface StarBreakdown {
  provenance: number;
  scenery: number;
  amenities: number;
  composition: number;
  total: number;
}

export interface TrailRoute {
  id: string;
  kind: 'osm_relation' | 'generated';
  name: string;
  nameSource: NameSource;
  needsName: boolean;
  activity: 'walking' | 'cycling';
  shape: RouteShape;
  segmentIds: string[];
  /** Traversal direction per segment (true = stored order). */
  segmentForward: boolean[];
  geometry: LngLat[];
  stats: RouteStats;
  difficulty: DifficultyBreakdown;
  stars: StarBreakdown;
  settlement: string | null;
  osm?: {
    relationId: number;
    route: string;
    operator: string | null;
    network: string | null;
    ref: string | null;
    colour: string | null;
    officialName: string | null;
    clippedToPilotArea: boolean;
    continuity: number;
  };
  dedupedRelationIds?: number[];
  license: typeof OSM_LICENSE;
  attribution: string;
}
