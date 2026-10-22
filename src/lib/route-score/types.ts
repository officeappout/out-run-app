/**
 * route-score — one 0-100 score per route (NATIONWIDE-PLAN.md §3.3), plus the
 * per-authority top-N selection (§3.7). Pure, I/O-free. Reuses the existing
 * measurements only (qualitySignals, route-quality v1, decide-accuracy, the
 * trails star prior) — no new signal is invented here.
 */
import type { LngLat } from '../route-quality/types';
import type { SurfaceClass, SurfaceShares } from './surface-class';
import type { RouteShade } from '../shade/route-shade';
import type { HourlyProfileSummary } from '../shade-hourly/route-hourly';

export type { LngLat };

/** How a route closes. `linear_corridor` = a named promenade/corridor (not penalised on compactness). */
export type ScoreShape = 'loop' | 'linear_corridor' | 'out_and_back' | 'point_to_point' | 'unclassified';

/**
 * Source / "officialness" tier (§3.3 row "מקור/רשמיות"):
 * official   — municipal/government dataset or an officially marked trail (ITC/KKL/INPA operator)
 * osm_named  — a named OSM route relation, or a route an admin drew/curated by hand
 * named_place— a named park perimeter / promenade
 * stitched   — stitched OSM ways
 * generated  — generated loop
 * unknown    — no provenance at all
 */
export type SourceTier = 'official' | 'osm_named' | 'named_place' | 'stitched' | 'generated' | 'unknown';

export type CertificateVerdict = 'approve' | 'edit' | 'drop';

/** Named urban route kinds eligible for the urban selection floor (RC9). */
export type UrbanRouteKind = 'named_corridor' | 'park_loop' | 'known_route' | 'bike_adjacent';

export interface ParkRef {
  source: string;
  id: string;
  name: string;
}

/** Normalised, plain input. Build it from a Firestore doc with `routeScoreInputFromDoc`. */
export interface RouteScoreInput {
  id: string;
  name: string;
  authorityId: string | null;
  city: string | null;
  activityType: string | null;
  distanceKm: number | null;
  path: LngLat[];
  shape: ScoreShape | null;
  composition: { sidewalkPct: number; genuinePct: number; ordinaryPct: number; otherPct: number } | null;
  /** True when `composition` is a proxy (trails pipeline: trail share of the length), not the real classifier. */
  compositionIsProxy: boolean;
  /** Only when lighting was really computed (status 'computed'). */
  litCoveragePct: number | null;
  /** Only when the amenity join ran with coverage (status 'computed'). */
  amenitiesHas: Partial<Record<'bench' | 'drinking_water' | 'court' | 'dog_park' | 'fitness_station' | 'toilets', boolean>> | null;
  /**
   * Which of composition / lighting / amenities / safety were filled by the
   * runner's urban measurement (src/lib/urban-measure, RC9) rather than read
   * from the stored doc. Informational — lands in the component notes.
   */
  measuredBy?: Partial<Record<'composition' | 'lighting' | 'amenities' | 'safety', 'osm_urban_measure'>>;
  /**
   * From route-quality v1 with an OSM road layer; null when not measured.
   * `separatedMajorPct` (v1.4, Q-D): the part of majorRoadPct (0..1 of the
   * length) that runs on a walkway separated from the road — urban-measure only;
   * absent = not measured (v1.3 behaviour).
   */
  osmSafety: { majorRoadPct: number; unmarkedPerKm: number; separatedMajorPct?: number } | null;
  /** Geometry facts (computed from `path` by the adapter, or supplied). */
  /**
   * turnsPerKm / zigzagIndex (route-quality turns.ts, v1.2): optional so older
   * callers stay valid; absent = not judged.
   */
  geometry: { retracedPct: number; uTurnCount: number; spurCount: number; compactness: number; turnsPerKm?: number; zigzagIndex?: number } | null;
  sourceTier: SourceTier;
  /** RC9: a NAMED urban route (urban floor eligible) — null for everything else. Optional for older callers. */
  urbanKind?: UrbanRouteKind | null;
  /** Share (0..1) of the length inside a park / green / beach — trails PilotContext. Null when not measured. */
  greenShare: number | null;
  parkRef: ParkRef | null;
  hasFitnessStop: boolean;
  certificate: CertificateVerdict | null;
  /** Paved / unpaved share of the length and where it came from (surface-class.ts). */
  surface: SurfaceShares;
  /** Filter class for the app: bike_road / bike_offroad / walk_run_paved / hike_offroad / unknown. */
  surfaceClass: SurfaceClass;
  /**
   * Mean Technion summer Shade Index (0..1) over the measured length; null =
   * not measured (no layer for the city, or layer coverage < 50%). Comfort
   * consumes it on the 0.10 → 0.35 scale (components.ts).
   */
  shadeShare: number | null;
  /** Full shade measurement (status, shadedPct, coverage) for the route_scores doc; null = not attempted. */
  shade: RouteShade | null;
  /**
   * Shade HINT (RC9) — an SI-equivalent (0..1) from a dataset's "trees along
   * the path" field (MoT bike-path layer). Used only when `shadeShare` is null
   * (no Technion layer), at half coverage.
   */
  shadeHint?: number | null;
  /**
   * Hour-aware shade (RC7, shade/hourly/v1): summer mean + 21-July by-hour curve.
   * Informational only — exposed on the comfort component, never changes points.
   * Absent/null = the city has no hourly file or it covers < 50% of the route.
   */
  hourlyShade?: HourlyProfileSummary | null;
}

export interface ComponentScore {
  /** Points awarded, 0..max. Unmeasured parts are filled at half their max (neutral, not zero). */
  points: number;
  max: number;
  /** 0..1 — how much of this component was really measured (proxy counts as 0.5). */
  coverage: number;
  notes: string[];
  /** Comfort only: the hour-aware shade summary, when measured (informational, no points). */
  hourlyShade?: HourlyProfileSummary;
}

export type ScoreComponentKey = 'surface' | 'geometry' | 'safety' | 'source' | 'comfort' | 'experience';

export type ScoreBand = 'green' | 'yellow' | 'red';

export interface RouteScore {
  score: number;
  /** 0..1 — weighted share of the score that was really measured. */
  confidence: number;
  band: ScoreBand;
  components: Record<ScoreComponentKey, ComponentScore>;
  version: string;
}
