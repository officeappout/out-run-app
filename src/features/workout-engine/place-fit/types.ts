/**
 * place-fit — "which workouts fit THIS place?" (park page / route page,
 * owner-approved boards RP-12 / RP-13, 26.10.2026, flag enable_place_workouts_v1).
 *
 * The reverse of route-fit's "which route fits today's run": given a place
 * (a park with its equipment, or a route with its profile) and what the user
 * has planned, up to 3 workouts, today's plan first. Pure: no reads, no
 * React, no text. The UI turns style / meta / reason into catalog strings.
 */

import type { WorkoutRouteNeeds } from '../players/running/lib/route-fit/types';
import type { ScorableRoute } from '../players/running/lib/route-fit/score-route-for-workout';
import type { WeeklyStrengthBudgetState } from '../hybrid/weekly-budget-gate';

/** One card per style at most (variety rule). */
export type PlaceWorkoutStyle =
  | 'strength'
  | 'hybrid'
  | 'run_easy'
  | 'run_hills'
  | 'run_quality'
  | 'walk';

/** The onboarding persona (profile.lifestyle.primaryTrack, mapped). null = unknown. */
export type PlacePersona = 'strength' | 'run' | 'walk' | 'hybrid' | null;

/** The equipment facts the engine needs (from the park's GymEquipment docs). */
export interface PlaceEquipment {
  id: string;
  name: string;
  iconKey?: string | null;
  movementPattern?: string | null;
}

export interface ParkPlace {
  kind: 'park';
  parkId: string;
  equipment: readonly PlaceEquipment[];
  /** km from the park to the nearest on-foot official route; null = unknown / none cached. */
  nearestRouteKm: number | null;
}

/** A park on or beside the route (a facility stop or a fitness-station amenity). */
export interface ParkNearRoute {
  name: string | null;
  /** km along the route from its start (null = unknown). */
  atKm: number | null;
  /** km between the park and the route line. */
  offRouteKm: number;
}

export interface RoutePlace {
  kind: 'route';
  route: ScorableRoute;
  parkNearRoute: ParkNearRoute | null;
}

export type Place = ParkPlace | RoutePlace;

/** Today's planned run, already materialized (useTodayPlannedRun) and turned into route needs. */
export interface PlanRunToday {
  workoutId: string;
  week: number;
  day: number;
  /** The workout's own title (content from the plan, not UI copy). */
  title: string | null;
  needs: WorkoutRouteNeeds;
}

export interface PlaceUserContext {
  persona: PlacePersona;
  today: {
    /** Today's strength session from the plan (day-plan item), if any. */
    strength: { title: string | null } | null;
    run: PlanRunToday | null;
    walk: { title: string | null; minutes: number | null } | null;
  };
  hasStrengthPlan: boolean;
  hasRunPlan: boolean;
  hasWalkPlan: boolean;
  /** useWeeklyVolumeStore's strength slice — null/0 budget = unknown, never "spent". */
  weeklyStrength: WeeklyStrengthBudgetState | null;
  /** Easy pace for generic runs, sec/km; null → the hybrid composer's default. */
  easyPaceSecPerKm: number | null;
  /** The run would end after dark (route light matters). */
  afterDark: boolean;
}

/** Why the card fits — one key per card; the UI maps it to a line. */
export type PlaceWorkoutReason =
  | 'plan_today'
  | 'equipment'
  | 'route_near_park'
  | 'park_on_route'
  | 'distance_fits'
  | 'walk_plan'
  | 'persona';

/** The one meta line under the title (the UI formats numbers and units). */
export type PlaceWorkoutMeta =
  | { kind: 'park_workout' }
  | { kind: 'loop'; minutes: number }
  | { kind: 'distance'; km: number | null; laps: number | null }
  | { kind: 'hill_reps'; reps: number; climbAtKm: number | null }
  | { kind: 'stop_at'; km: number | null };

/** How to start it — each maps to an EXISTING start path (see the UI's usePlaceWorkoutStart). */
export type PlaceWorkoutStart =
  /** pendingParkWorkoutStart → home composes the park workout (composeParkWorkout). */
  | { kind: 'park_strength'; parkId: string; difficulty: 'easy' | 'medium' | 'hard'; minutes: number }
  /** A HybridStartIntent composed by the map (composeAndShowOverview). */
  | { kind: 'hybrid'; aerobicKind: 'running' | 'walking'; minutes: number; parkId?: string; routeId?: string }
  /** Today's planned run: on this route (route page) or with route suggestions (park page). */
  | { kind: 'planned_run'; workoutId: string; week: number; day: number; routeId?: string }
  /** The route as a free run / walk (startActiveWorkoutForRoute via pendingRouteStart). */
  | { kind: 'route_activity'; routeId: string; activity: 'running' | 'walking' };

export interface PlaceWorkoutSuggestion {
  id: string;
  style: PlaceWorkoutStyle;
  isFromPlan: boolean;
  /** The plan's own title when it has one; else the UI uses the style's title. */
  planTitle: string | null;
  durationMin: number | null;
  meta: PlaceWorkoutMeta;
  reason: PlaceWorkoutReason;
  start: PlaceWorkoutStart;
}

/** At most one banner per page, only when needed (owner 26.10). */
export type PlaceBanner = 'unlit_after_dark' | 'budget_spent' | 'climb_for_plan';
