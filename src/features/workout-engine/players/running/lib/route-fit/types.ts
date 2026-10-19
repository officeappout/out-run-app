/**
 * route-fit — "which route fits TODAY's planned run?" (owner, 19.10.2026).
 *
 * Two directions, one engine:
 *   • overview → "הצע לי מסלול": rank routes near the user for the workout
 *     (suggest-routes-for-workout.ts → up to 3 for the carousel).
 *   • Discover → a route the user opened: does today's run fit it?
 *     (workoutFitForRoute → "מתאים" / "מתאים ב-N סיבובים" / not).
 *
 * Everything here is pure except suggest-routes-for-workout.ts (which only
 * reads the existing official-routes cache and calls the existing generator).
 */

import type { WorkoutCategory } from '../../../../core/types/running.types';
import type { RunKind } from '../../utils/run-preview/run-kind';

/** A hill-repeat main set: each rep wants a climb of ≥ minGradePct for ≥ repLengthM. */
export interface HillRepSpec {
  repLengthM: number;
  minGradePct: number;
  reps: number;
}

/** What a planned run asks of a route — built once by buildWorkoutRouteNeeds. */
export interface WorkoutRouteNeeds {
  kind: RunKind;
  category: WorkoutCategory | null;
  /** Estimated total distance (km); null when it can't be estimated (no pace profile). */
  targetKm: number | null;
  durationMin: number | null;
  /** Non-null for hill workouts (hill_* category or blocks with an incline). */
  hill: HillRepSpec | null;
  /** Part of the run falls after dark (sun below DARK_SUN_ALTITUDE_DEG) → prefer lit. */
  afterDark: boolean;
}

export type FitVerdict = 'fits' | 'laps' | 'close' | 'no' | 'unknown';

export interface DistanceFit {
  verdict: FitVerdict;
  /** How many times the route is covered (1, 1.5, 2 …); null when unknown / no fit. */
  laps: number | null;
  /** The run finishes where it started. */
  endsAtStart: boolean;
  /** Out-and-back: turn round at this km (one-way distance from the start). */
  turnaroundKm: number | null;
  /** 0..1 — how well the distance works. */
  score: number;
  /** Hebrew, for the UI ("2 סיבובים", "הלוך-חזור · סיבוב בק״מ 2.5"); null = nothing to say. */
  reason: string | null;
  caution: string | null;
}

export interface ClimbMatch {
  /** Where the climb starts, metres from the route start (null: position unknown). */
  startM: number | null;
  lengthM: number | null;
  avgGradePct: number;
  /** profile = real elevation samples; terrain = a nearby climb_segments ref; maxGrade = route's steepest 15 m only. */
  source: 'profile' | 'terrain' | 'maxGrade';
  /** Meets the rep spec (grade AND length, when length is known). */
  meetsSpec: boolean;
}

export interface RouteWorkoutScore {
  routeId: string;
  /** 0..100. */
  score: number;
  fit: DistanceFit;
  climb: ClimbMatch | null;
  /** Positive Hebrew reasons for the card, most important first. */
  reasons: string[];
  /** Honest negatives ("אין עלייה מתאימה", "לא מואר"). */
  cautions: string[];
}

export interface RouteScoreContext {
  /** The user's position — for "how far to the route". */
  origin?: { lat: number; lng: number } | null;
  /** Generated on the fly (not a stored official route) — official ones get a small boost. */
  isGenerated?: boolean;
  /** Search radius used for the access score (km). */
  radiusKm?: number;
}
