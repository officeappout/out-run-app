/**
 * Route Types
 * Running, walking, and cycling routes
 */

export type ActivityType = 'running' | 'walking' | 'cycling' | 'workout';
export type SegmentType = 'run' | 'walk' | 'workout' | 'bench' | 'finish';

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
  instructions?: string[];
  icon?: string;
  
  // Enriched metadata from Firestore Exercise
  /** Exercise type: 'reps' | 'time' */
  exerciseType?: 'reps' | 'time';
  /** Exercise role: 'warmup' | 'main' | 'cooldown' */
  exerciseRole?: 'warmup' | 'main' | 'cooldown';
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
}

export interface WorkoutPlan {
  id: string;
  name: string;
  segments: WorkoutSegment[];
  totalDuration: number;
  difficulty: 'easy' | 'medium' | 'hard';
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
  difficulty: 'easy' | 'medium' | 'hard';

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

  // Route structure
  segments: RouteSegment[];
  path: [number, number][];

  // Display
  color?: string;

  // Administrative linkage
  authorityId?: string;
  city?: string;

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

  // Runtime fields
  calculatedScore?: number;
  distanceFromUser?: number;
  isWarmupFeasible?: boolean;
  isReachableWithoutCar?: boolean;
  includesOfficialSegments?: boolean;
  visitingParkId?: string | null;
  includesFitnessStop?: boolean;
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
