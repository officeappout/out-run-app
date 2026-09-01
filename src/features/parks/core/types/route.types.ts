/**
 * Route Types
 * Running, walking, and cycling routes
 */

import type { PyramidStep } from '@/features/workout-engine/logic/workout-generator.types';
import type { ExternalVideo } from '@/features/content/exercises/core/exercise.types';
import type {
  SegmentKind,
  SegmentProtocolConfig,
  SegmentProtocolId,
} from '@/features/workout-engine/core/types/protocol.types';
import type { SurfaceType } from '@/lib/route-collections/surface-type';
import type { ClimbType } from './climb-segment.types';
import type { AmenityCategory, CourtSport } from './osm-amenity.types';

export type ActivityType = 'running' | 'walking' | 'cycling' | 'workout';
export type SegmentType = 'run' | 'walk' | 'workout' | 'bench' | 'finish';

/**
 * A-to-B commute variants returned by `generateDynamicRoutes` when called
 * with a `destination`. The unified RouteCarousel reads `route.variant`
 * to render the correct chip ("הכי מהיר" / "מסלול חלופי" / "שקט").
 *
 *   • fastest     — Mapbox's primary route (or the alternative with the
 *                   shortest duration when `alternatives=true`).
 *   • alternative — A different Mapbox alternative geometry (no park bias,
 *                   no scenic routing — purely a different way to get there).
 *   • quiet       — Calculated with `exclude=motorway` (and `toll` for
 *                   cycling). Falls back to the longest-duration alternative
 *                   when Mapbox returns nothing for the exclude query.
 *
 * Loop routes (the original generator branch) leave `variant` undefined,
 * so the chip never renders for free-run cards. This is the single switch
 * that tells the card what badge — if any — to show.
 */
export type CommuteVariant = 'fastest' | 'alternative' | 'quiet';

/**
 * Enriched Exercise interface for WorkoutPlan
 * Contains all metadata needed for UI rendering - Single Source of Truth
 */
export interface Exercise {
  id: string;
  name: string;
  reps?: string;
  duration?: string;
  videoUrl?: string;
  imageUrl?: string;
  /** Bare Bunny UUID (from media.previewVideo.he.videoId) carried through the plan flatten,
   *  so consumers that lose execution_methods (e.g. the rest-preview) can still resolve the
   *  network-aware Bunny stream. Undefined for legacy-only exercises. */
  bunnyVideoId?: string;
  /** Pre-resolved long-form instructional video (deep-searched at plan-build time). Drives the "צפה בהסבר המלא" CTA. */
  fullTutorial?: ExternalVideo | null;
  instructions?: string[];
  icon?: string;

  // Enriched metadata from Firestore Exercise
  /** Exercise type: 'reps' | 'time' */
  exerciseType?: 'reps' | 'time';
  /**
   * Exercise role. Widened to include 'recovery' — rest-day follow-along videos
   * flatten through with `exerciseRole: 'recovery'` (the flatten already carried
   * it at runtime; buildRunnerWorkoutPlanFromGenerated filters it via `as any`).
   * Typing it here lets the runner match it without a cast (see
   * useWorkoutStateMachine follow-along branch).
   */
  exerciseRole?: 'warmup' | 'main' | 'cooldown' | 'recovery';
  /** Is this a follow-along exercise? */
  isFollowAlong?: boolean;
  /** Whether the exercise video has audio that should be played */
  hasAudio?: boolean;
  /** Execution highlights (tips) */
  highlights?: string[];
  /** Primary and secondary muscle groups */
  muscleGroups?: string[];
  /** Exercise goal/description */
  goal?: string;
  /** Detailed description */
  description?: string;
  /** Equipment required for this exercise */
  equipment?: string[];
  /** Rest time in seconds between sets (from WorkoutGenerator) */
  restSeconds?: number;
  /** Rep/hold range for UI display (e.g., {min:6, max:12}) */
  repsRange?: { min: number; max: number };
  /** Whether this exercise is an admin-defined goal exercise */
  isGoalExercise?: boolean;
  /** Progressive overload: ramped target for this session */
  rampedTarget?: number;
  /** Whether this is a timed hold vs rep-based */
  isTimeBased?: boolean;
  /** Number of sets (from WorkoutGenerator) */
  sets?: number;
  /** Exercise symmetry — unilateral exercises require per-side logging */
  symmetry?: 'bilateral' | 'unilateral';
  /**
   * Firestore program IDs this exercise belongs to (resolved from
   * `targetPrograms` at generation time). Used for cross-program
   * progression tracking — see `processWorkoutCompletion`'s linked
   * program detection.
   */
  programIds?: string[];
  /**
   * Per-set rep ladder for Repetition Pyramid workouts (D1 fallback).
   * Example: [12, 10, 8, 6] — the runner advances through this array
   * as the user completes each set.  Undefined for standard sets.
   */
  repsSequence?: number[];
  /**
   * Per-set exercise variants for the Mechanical Leverage Pyramid.
   * When populated, each set displays a different progression of the
   * same movement group (e.g., Tuck → Adv Tuck → Straddle → Full).
   * Undefined for standard sets and Repetition Pyramids.
   */
  pyramidSequence?: PyramidStep[];
}

export interface RouteSegment {
  id?: string;
  type: SegmentType;
  title: string;
  subTitle?: string;
  distance?: string;
  duration?: string;
  location?: { lat: number; lng: number };
  exercises?: Exercise[];
}

export type WorkoutSegmentType = 'travel' | 'station';

export interface WorkoutSegment {
  id: string;
  type: WorkoutSegmentType;
  title: string;
  subTitle?: string;
  icon: string;
  target: {
    type: 'distance' | 'time' | 'reps';
    value: number;
    unit?: string;
  };
  exercises?: Exercise[];
  isCompleted: boolean;
  heartRateTarget?: string;
  paceTarget?: string;
  /** Rest time between exercises in seconds. Defaults to 10. Set to 0 to skip rest. */
  restBetweenExercises?: number;
  /**
   * Execution protocol. Absent = legacy plan → the player derives it per
   * exercise (pairedWith→superset, pyramidSequence→pyramid, else straight).
   * For block-scoped protocols (tabata/emom/amrap) this IS the dispatch key.
   */
  protocol?: SegmentProtocolId;
  /** Required for block-scoped protocols; unused for exercise-scoped ones. */
  protocolConfig?: SegmentProtocolConfig;
  /** Aligned to the hybrid branch's SessionSegmentKind. Absent = 'strength'. */
  kind?: SegmentKind;
}

export interface WorkoutPlan {
  id: string;
  name: string;
  segments: WorkoutSegment[];
  totalDuration: number;
  difficulty: 'easy' | 'medium' | 'hard';
  /** Training type from the source Program — routes to correct activity ring */
  trainingType?: 'strength' | 'cardio';
  /** AI-generated contextual coaching cue (e.g., "Focus on form today") */
  aiCue?: string;
  /** Workout execution location — used for location-aware equipment icons */
  workoutLocation?: 'home' | 'park' | 'gym' | 'street' | 'office' | string;

  /**
   * Protocol applied by the engine for this workout.
   * Undefined = standard straight sets (default behavior).
   * The active workout runner may use this hint to switch execution flows
   * (e.g., alternating supersets, EMOM clock, pyramid rep sequence).
   */
  appliedProtocol?: 'antagonist_pair' | 'emom' | 'pyramid' | 'compound_superset';
  /**
   * EMOM / AMRAP block configuration for blast-mode workouts.
   * Carried through from GeneratedWorkout.blastMode so the runner has
   * timer parameters available without re-querying the engine.
   */
  blastMode?: {
    type: 'emom';
    workSeconds: number;
    restSeconds: number;
    durationMinutes: number;
  };
  /**
   * Warmup inclusion flag set by `WorkoutPreviewDrawer` when the user
   * toggles the "דלג / פעיל" warmup pill before starting the session.
   * When `false`, the active runner strips the warmup segment from
   * `segments` before mounting so the session starts directly on the
   * first main exercise.  Defaults to `true` (warmup included) when
   * the field is absent or when the plan originates from a path that
   * does not serialise this flag (e.g. Firestore fallback).
   */
  isWarmupActive?: boolean;
  /**
   * Recovery session flag — set from `GeneratedWorkout.isRecovery` at the
   * generate→flatten boundary (rest-day video trio, REST_DAY_CONFIGS, and
   * Budget-Floor recovery all mark their workout `isRecovery: true`).
   *
   * The active-workout runner and summary use this to SKIP strength
   * progression: no `processWorkoutCompletion` level% gain, no strength-XP
   * award, and no weekly volume-budget charge. A recovery session still
   * counts as daily activity (rings + streak + coins via `syncWorkoutCompletion`).
   * Absent/false ⇒ a normal strength workout (every guard is a no-op).
   */
  isRecovery?: boolean;
  /**
   * Fix (30.08.2026, "no complete-your-sets follow-up after a partial
   * workout"): carried through from `GeneratedWorkout.totalPlannedSets` at
   * the generate→flatten boundary so `StrengthSummaryPage`/`useActivitySync`
   * can report the real planned/completed split to `recordStrengthSession`
   * (`useWeeklyVolumeStore`). Without it, `useActivitySync.ts`'s own
   * `totalPlannedSets ?? actualSetsCompleted` fallback silently treats
   * "planned" as "whatever was actually completed" — `setsCompleted <
   * setsPlanned` can then never be true, so `partial-completion.generator.ts`'s
   * eligibility never fires, no matter how incomplete the real session was.
   * Absent ⇒ same fallback behavior as before this fix (no regression for
   * plans that don't set it).
   */
  totalPlannedSets?: number;
}

export interface PlannedRoute {
  id: string;
  name: string;
  totalDistance: number;
  totalTime: number;
  pathCoordinates: [number, number][];
  stops: {
    parkId: string;
    order: number;
    suggestedWorkoutId?: string;
  }[];
}

export interface RouteFeatures {
  hasGym: boolean;
  hasBenches: boolean;
  lit: boolean;
  scenic: boolean;
  terrain: string;      
  environment: string;
  trafficLoad: string;
  surface: string;      
}

/**
 * Extended amenity tags for routes — the route-side counterpart of
 * `ParkFeatureTag`. Lets admins describe what a runner/walker/cyclist
 * can expect along the route (toilets, water, shade, shelter, etc.)
 * beyond the small derived set in `RouteFeatures`.
 *
 * Values are intentionally aligned with `ParkFeatureTag` so a single
 * Hebrew label table can later be shared across both domains if the
 * two schemas converge.
 */
export type RouteFeatureTag =
  | 'night_lighting'
  | 'has_benches'
  | 'water_fountain'
  | 'has_toilets'
  | 'wheelchair_accessible'
  | 'dog_friendly'
  | 'safe_zone'
  | 'nearby_shelter'
  | 'parkour_friendly'
  | 'stairs_training'
  | 'rubber_floor'
  | 'shaded'
  | 'near_water';

/**
 * Hebrew labels for `RouteFeatureTag`. Single source of truth — both
 * the admin RouteEditor (write side) and the user-facing
 * RouteDetailSheet (read side) consume this map so they can never
 * drift apart again.
 */
export const ROUTE_FEATURE_TAG_LABELS: Record<RouteFeatureTag, string> = {
  night_lighting:         'תאורת לילה 💡',
  has_benches:            'ספסלים 🪑',
  water_fountain:         'ברזיות מים 🚰',
  has_toilets:            'שירותים 🚻',
  wheelchair_accessible:  'נגיש לכיסא גלגלים ♿',
  dog_friendly:           'ידידותי לכלבים 🐕',
  safe_zone:              'אזור בטוח / מיגונית 🛡️',
  nearby_shelter:         'ממ"ד קרוב 🏠',
  parkour_friendly:       'ידידותי לפארקור 🤸',
  stairs_training:        'מדרגות לאימון 🪜',
  rubber_floor:           'ריצפת גומי ⬛',
  shaded:                 'מוצל ☀️',
  near_water:             'ליד מים 🏖️',
};

/** Stable ordering for UI rendering of feature tag pickers/lists. */
export const ALL_ROUTE_FEATURE_TAGS = Object.keys(
  ROUTE_FEATURE_TAG_LABELS,
) as RouteFeatureTag[];

/**
 * One `climb_segments` doc's cross-reference onto a route it passes near —
 * see `Route.terrainFeatures`. `distanceFromPathMeters` is the nearest-vertex
 * gap found by `findNearestContactPoint` (route-adjacency.service.ts, reused
 * as-is by route-enrichment.service.ts), not a true point-to-segment
 * distance — same approximation the shipped corridor-adjacency engine
 * already relies on at its own (much larger) threshold.
 *
 * `avgGrade`/`maxGrade` are denormalized straight from the joined
 * `ClimbSegment` (percent — the running/cycling standard unit; a degrees
 * conversion is display-only if ever wanted, never stored) so a route can
 * report each climb's steepness directly ("12% climb at ~km 2") without a
 * second `climb_segments` fetch. `null` for stairs, mirroring
 * `ClimbSegment.avgGrade`/`maxGrade`'s own nullability — grade isn't the
 * relevant metric there. Composes with, and is deliberately distinct from,
 * `Route.elevationGain`/`maxGrade` (Stage 1A): those are the route's OWN
 * overall hardness; these are per-climb detail about a nearby feature.
 */
export interface RouteTerrainFeatureRef {
  climbSegmentId: string;
  type: 'terrain' | 'structure' | 'stairs';
  climbType: ClimbType;
  distanceFromPathMeters: number;
  avgGrade: number | null;
  maxGrade: number | null;
}

/**
 * One `osm_amenities` doc's cross-reference onto a route it passes near —
 * see `Route.nearbyAmenities`. Structural sibling of `RouteTerrainFeatureRef`
 * (same "denormalize the joined doc's own fields, keep the id for a future
 * detail fetch" shape), but a DIFFERENT join: distance here comes from
 * `findNearestContactPoint` treating the amenity as a single-point path
 * against the route's real path (route-amenity-tagging.service.ts), not the
 * climb-to-climb geometry `RouteTerrainFeatureRef` reuses the same primitive
 * for. `distanceFromPathMeters` is therefore the same nearest-vertex
 * approximation `RouteTerrainFeatureRef` already documents — not a true
 * point-to-segment distance.
 */
export interface RouteAmenityRef {
  amenityId: string; // osm_amenities doc id
  category: AmenityCategory;
  sport?: CourtSport; // only present when category === 'court'
  distanceFromPathMeters: number;
  location: { lat: number; lng: number };
}

export interface Route {
  id: string;
  name: string;
  description?: string;
  descriptionKey?: string;

  // Numeric data
  distance: number;
  duration: number;
  score: number;

  type: ActivityType;
  activityType?: ActivityType;
  /** Multiple activity types this route supports (e.g., walking + running) */
  activityTypes?: ActivityType[];
  difficulty: 'easy' | 'medium' | 'hard';

  /**
   * Persisted record of the route's actual built shape, classified from its
   * geometry (see `classifyRouteShape` / `isLoopPath` / `isOutAndBackPath`
   * in geoUtils.ts). Undefined when neither shape applies (e.g. a
   * point-to-point commute, or a linear OSM-discovered trail).
   *
   * Distinct from `RouteGenerationOptions.returnShape` (route-generator.service.ts)
   * — that's a generation-time *request* knob for one specific corridor-flow
   * mode, not a record of what was actually built. Don't conflate the two.
   */
  routeShape?: 'loop' | 'out_and_back';

  /** DEM-derived total elevation gain in meters (see demProfile() in scripts/geo-discovery-routes.ts). */
  elevationGain?: number;
  /** DEM-derived maximum grade in percent, over a 15m step (see demProfile()). */
  maxGrade?: number;

  /**
   * Granular ground-material vocabulary, parsed from the OSM `surface` tag
   * (see src/lib/route-collections/surface-type.ts). Undefined when no raw
   * OSM surface tag was available at ingestion (trail-relation-derived and
   * Mapbox-round-trip candidates have none) — never guessed.
   *
   * Deliberately DISTINCT from `features.surface` below — that's an older,
   * coarser "paved-ish vs trail-ish vs mixed" concept (values like
   * 'road'/'trail'/'paved'/'mixed') actively read by useRouteFilter.ts's
   * match-scoring and RouteDetailSheet.tsx's SURFACE_LABELS table. Do not
   * conflate the two or repoint either field's readers at the other.
   */
  surfaceType?: SurfaceType;

  /**
   * Cross-reference to nearby `climb_segments` docs whose geometry passes
   * within CLIMB_ROUTE_ASSOCIATION_THRESHOLD_METERS of this route's path
   * (see route-enrichment.service.ts's computeClimbRouteAssociations).
   * Populated by Stage 3's spatial join (route-enrichment-pipeline plan) —
   * undefined until that join has run for this route's city. Reverse of
   * ClimbSegment.routeIds — this array and that one are two ends of the
   * same edge, written together by the same recompute pass.
   */
  terrainFeatures?: RouteTerrainFeatureRef[];

  /**
   * Cross-references to `osm_amenities` docs within category-specific
   * distance of this route's path (Phase 3, route↔amenity tagging,
   * 01.09.2026 — see route-amenity-tagging.service.ts). Structural sibling
   * of `terrainFeatures` (denormalized join-result array), but a wholesale-
   * REPLACED array on every recompute, never `arrayUnion`-appended — this is
   * derived/computed data, not a user-driven incremental list (axioms.md §5's
   * arrayUnion rule is for the latter). A since-rejected or moved amenity
   * must be able to disappear on the next run, which only a full replace
   * allows. Undefined until the tagging script has run for this route's city.
   */
  nearbyAmenities?: RouteAmenityRef[];

  /**
   * Per-route quality-certificate signals (v1: surface composition only —
   * see quality-certificate v1 Stage 1/2, 29-30.08.2026). Extensible: future
   * signals (crosswalks, shade) add sibling keys, not a new top-level field.
   * `composition` is populated by scripts/lib/route-composition-classify.ts
   * (a direct port of geo-discovery-routes.ts's sidewalk-gate classifier —
   * do not build a second, divergent classifier). `genuinePct` matches the
   * deferred route_decisions.compositionSnapshot naming (route-editor-
   * scoping-spec.md §5) — same field name, one source of truth.
   * `lighting` is intentionally optional and NOT written by the composition
   * backfill/discovery wiring — it's a separate, later task.
   * `amenities` is the sibling key this doc comment's own header anticipated
   * ("future signals... add sibling keys") — Phase 3 route↔amenity tagging.
   * Self-contained `status`/`source` (not reusing the outer `computedAt`/
   * `source` above), same reason `lighting` already carries its own optional
   * `source` — computed by a different script, at a different time, than
   * composition.
   */
  qualitySignals?: {
    composition: {
      sidewalkPct: number;
      genuinePct: number;
      ordinaryPct: number;
      otherPct: number;
    };
    lighting?: {
      status: 'computed' | 'unknown';
      litCoveragePct: number | null;
      isLit: boolean | null;
      source?: 'lamp_nodes' | 'street_segments_lit';
    };
    /**
     * `status: 'no_coverage'` means this route's CITY has zero `osm_amenities`
     * docs at all (the ingester was never run there) — honesty rule: never a
     * false "no benches," see route-amenity-tagging.service.ts's header.
     * `status: 'computed'` means the city has coverage and every count below
     * (including a real `0`) reflects an actual check, not an absence of data.
     * `counts` includes `crossing`; `has` deliberately does NOT (crossings are
     * a filter/generator signal only, never a positive-badge flag).
     * `sourceStatuses` documents which `osm_amenities.status` values were
     * included when computing counts/has — transparency for the sourcing
     * decision (pending+published, excluding rejected, as of Phase 3 v1).
     */
    amenities?: {
      status: 'computed' | 'no_coverage';
      counts: Record<AmenityCategory, number>;
      has: Record<Exclude<AmenityCategory, 'crossing'>, boolean>;
      sourceStatuses: Array<'pending' | 'published'>;
      computedAt: unknown;
      source: 'osm_amenities_join_v1';
    };
    computedAt: unknown; // FieldValue.serverTimestamp() at write time (climb-segment.types.ts's updatedAt convention)
    source: 'osm_overpass_v1';
  };

  // Ratings
  /** User-facing star rating (1–5, decimal precision e.g. 4.3). */
  rating: number;
  calories: number;
  adminRating?: number;
  isPromoted?: boolean;

  // Source management
  source?: {
    type: 'official_api' | 'user_generated' | 'system';
    name: string;
    externalId?: string;
    externalLink?: string;
  };

  // Analytics
  analytics?: {
    usageCount: number;
    rating: number;
    heatMapScore: number;
  };

  // Features
  features: RouteFeatures;
  /**
   * Extended amenity tags chosen by the admin in RouteEditor.
   * Optional — older routes saved before this field exists are
   * fully backward-compatible.
   */
  featureTags?: RouteFeatureTag[];

  // Route structure
  segments: RouteSegment[];
  path: [number, number][];

  // Display
  color?: string;

  // Administrative linkage
  authorityId?: string;
  city?: string;
  /** Approval workflow */
  status?: 'pending' | 'published' | 'archived';
  published?: boolean;
  publishedAt?: Date | null;
  /** UID of the user who created this route */
  createdByUser?: string;
  /** Origin of the route record */
  origin?: 'authority_admin' | 'super_admin';

  // Visuals
  images?: string[];

  // Import tracking
  /** Unique batch ID for group management of imported routes */
  importBatchId?: string;
  /** Original filename or source label for display */
  importSourceName?: string;

  // Infrastructure & Stitching
  /** True for raw GIS-imported segments (infrastructure), false for curated / manual routes */
  isInfrastructure?: boolean;
  /**
   * What kind of users can safely use this infrastructure segment?
   *  - 'cycling'    → Bike-only lanes (cycleway). Running/Walking should NOT use these.
   *  - 'pedestrian' → Foot-only paths (footway, pedestrian). Cycling may not fit.
   *  - 'shared'     → Shared-use paths suitable for all activities.
   *
   * Auto-detected from GIS properties (highway tag) during import;
   * falls back to the admin-selected activity classification.
   */
  infrastructureMode?: 'cycling' | 'pedestrian' | 'shared';
  /** IDs of source infrastructure segments used to build this curated route */
  sourceInfrastructureIds?: string[];
  /** Number of Mapbox-bridged gaps in this curated route */
  bridgeCount?: number;
  /** Tier label for curated onboarding routes */
  curatedTier?: 'short' | 'medium' | 'long';

  // Hybrid route metadata (Phase 2 — Urban Strength)
  /** Whether this route combines cardio with strength pit-stops */
  isHybrid?: boolean;
  /** Highest-priority facility type snapped on this route ('mixed' = walking multi-category) */
  hybridType?: 'primary' | 'secondary' | 'tertiary' | 'mixed';
  /** Activity types combined in this hybrid route */
  hybridActivities?: ActivityType[];
  /** Facility pit-stops along the route */
  facilityStops?: FacilityStop[];

  // Runtime social enrichment (never persisted — populated by useCommunityEnrichment)
  linkedSessions?: {
    eventId?: string;
    eventLabel?: string;
    nextStartTime?: string;
    plannedCount?: number;
    maxParticipants?: number;
    currentRegistrations?: number;
    spotsLeft?: number;
    /** Up to 3 avatar URLs for social proof on route cards */
    avatars?: { uid: string; name: string; photoURL?: string }[];
  };

  // Runtime fields
  calculatedScore?: number;
  distanceFromUser?: number;
  isWarmupFeasible?: boolean;
  isReachableWithoutCar?: boolean;
  includesOfficialSegments?: boolean;
  visitingParkId?: string | null;
  includesFitnessStop?: boolean;

  /**
   * Rotated / user-prepended path used only by AppMap for rendering and camera fitBounds.
   * When set by useRouteFilter, AppMap and useCameraController prefer this over `path`.
   * The original `path` always reflects the stored Firestore geometry.
   */
  displayPath?: [number, number][];

  /**
   * Total projected trip distance (walk-to-start + route + walk-home) in km.
   * Set by useRouteFilter for static official routes. The carousel uses this
   * value in place of `distance` so users see the full trip estimate.
   * The original `distance` field is never overwritten.
   */
  projectedDistance?: number;

  // ── Commute (A-to-B) metadata ──────────────────────────────────────────
  // Set ONLY when this Route was produced by the commute branch of
  // `generateDynamicRoutes` (i.e. `destination` was passed). Loop routes
  // leave both fields undefined.

  /**
   * Which of the three commute variants this is. Drives the chip badge
   * rendered by the unified RouteCarousel's internal RouteCard.
   */
  variant?: CommuteVariant;

  /**
   * Mapbox `duration` (seconds) at the time the route was fetched. The
   * `duration` field above is in MINUTES (rounded for display); this is
   * the raw seconds value, kept for the live ETA HUD which needs sub-
   * minute precision when computing arrival time vs current pace.
   */
  etaSeconds?: number;

  /**
   * Set ONLY when this Route's `path` was produced by following (or chaining)
   * one or more `official_routes/{id}` corridors verbatim — see
   * `generateCorridorRoute` / chain assembly in route-generator.service.ts.
   * Single-corridor follow: the one source id. Chained: the ordered list of
   * corridor ids spliced together (connectors are not corridors, so they
   * don't appear here). Undefined for every other generation path
   * (loop/out-and-back/commute/short) — those build geometry via Mapbox
   * Directions, not from stored corridor paths.
   */
  sourceOfficialRouteIds?: string[];
}

// ── Hybrid Route Types ──────────────────────────────────────────────

export enum FacilityPriority {
  PRIMARY = 1,    // Dedicated fitness facilities (calisthenics, fitness_station)
  SECONDARY = 2,  // Urban stairs/steps
  TERTIARY = 3,   // Park benches (last resort)
}

export interface FacilityStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  waypointIndex: number;
  priority: FacilityPriority;
  type: string;
  /** 'pit-stop' = discrete exercise break (running), 'journey' = integrated element (walking) */
  stopType: 'pit-stop' | 'journey';
}

/** Activity-specific stitching configuration */
export interface ActivityConfig {
  turnPenalty: 'very_high' | 'medium' | 'low';
  preferredSurfaces: string[];
  avoidStairs: boolean;
  targetDistanceKm: number;
  /** 0-1: higher = prioritize POIs (shade, parks, water) */
  poiWeighting: number;
  mapboxProfile: 'walking' | 'cycling';
}

export const ACTIVITY_CONFIGS: Record<string, ActivityConfig> = {
  running: {
    turnPenalty: 'very_high',
    preferredSurfaces: ['road', 'path'],
    avoidStairs: true,
    targetDistanceKm: 10,
    poiWeighting: 0.2,
    mapboxProfile: 'walking',
  },
  walking: {
    turnPenalty: 'low',
    preferredSurfaces: ['path', 'trail', 'road'],
    avoidStairs: false,
    targetDistanceKm: 5,
    poiWeighting: 0.8,
    mapboxProfile: 'walking',
  },
  cycling: {
    turnPenalty: 'medium',
    preferredSurfaces: ['road'],
    avoidStairs: true,
    targetDistanceKm: 15,
    poiWeighting: 0.3,
    mapboxProfile: 'cycling',
  },
};
