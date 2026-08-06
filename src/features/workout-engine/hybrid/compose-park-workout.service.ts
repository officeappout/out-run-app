/**
 * compose-park-workout.service — Phase 1.2 of the hybrid "full workout in the park".
 *
 * PURE composer for the full-park-workout branch: walk to the park → the FULL
 * home-recommended strength workout → walk back. Produces the SAME `HybridPlan`
 * shape as composeHybridSession, but from a pre-built out-and-back route (Phase 1.1)
 * plus a pre-generated home `GeneratedWorkout` — NOT via the budget-split / station
 * machinery.
 *
 * ⚠️ composeHybridSession.service is deliberately NOT touched — the budget-split path
 * other hybrid cards use stays byte-identical. The small pace / calorie / MET helpers
 * below MIRROR that file's private helpers (kept local to stay Firestore-free and to
 * avoid importing the pace resolver from the heavy running-engine.service). This is
 * the same "mirror" pattern compose-hybrid-session itself uses for MET/domain maps.
 *
 * Q-A (16.07): the joint-mobility warmup is KEPT — the walk warms cardio but not
 * joints. The home warmup is ALREADY time-scaled (warmup.service warmupSlotBudget +
 * min-slots floor), so we keep `workout.exercises` intact (warmup + main + cooldown)
 * rather than filtering. Rests are FULL (goal-based) — no ×0.5 station post-pass.
 *
 * ISOMORPHIC: pure TypeScript. No hooks, no Firebase, no Date.now().
 */

import type {
  GeneratedWorkout,
  WorkoutExercise,
} from '../logic/workout-generator.types';
import type { StrengthBlockResult, BlockDomainFocus } from '../core/pipeline/strength-block.service';
import type {
  HybridPlan,
  HybridPlannedSegment,
  AerobicKind,
  ResolvedEmphasis,
  StopLocationKind,
} from './compose-hybrid-session.service';
import type { PaceProfile, RunZoneType, PaceZoneRule } from '../core/types/running.types';
import { DEFAULT_PACE_MAP_CONFIG } from '../core/config/pace-map-config';
import {
  buildRoutePrefixKm,
  totalRouteKm,
  kmAtIndex,
  legGapsKm,
  type RoutePath,
} from '@/features/parks/core/services/route-distance.utils';

// ── Mirrored constants (compose-hybrid-session §2-§3, approved values) ──────────
const AEROBIC_KCAL_FACTOR = 1.036;     // existing formula: km × kg × 1.036
/** Duty-cycle MET anchors (design step 8, ACSM calisthenics; rest = 1.5). */
const TIER_MET: Record<string, number> = { flow: 3.8, easy: 3.8, match: 5.0, hard: 8.0, elite: 8.0 };
const REST_MET = 1.5;
const SECONDS_PER_REP = 3;             // engine constant (workout-timing)

// ── Mirrored pace resolution (compose-hybrid-session's private zonePaceSecPerKm) ──
function profileTable(profileType: PaceProfile['profileType']): Record<RunZoneType, PaceZoneRule> {
  switch (profileType) {
    case 1: return DEFAULT_PACE_MAP_CONFIG.profileFast;
    case 3: return DEFAULT_PACE_MAP_CONFIG.profileBeginner;
    case 4: return DEFAULT_PACE_MAP_CONFIG.profileMaintenance;
    case 2:
    default: return DEFAULT_PACE_MAP_CONFIG.profileSlow;
  }
}

function zonePaceSecPerKm(
  paceProfile: Pick<PaceProfile, 'basePace' | 'profileType'>,
  zone: RunZoneType,
): { min: number; max: number } {
  const rule = profileTable(paceProfile.profileType)[zone];
  if (rule.fixedMinSeconds != null && rule.fixedMaxSeconds != null) {
    return { min: rule.fixedMinSeconds, max: rule.fixedMaxSeconds };
  }
  return {
    min: Math.round(paceProfile.basePace * (rule.minPercent ?? 100) / 100),
    max: Math.round(paceProfile.basePace * (rule.maxPercent ?? 100) / 100),
  };
}

// ── Mirrored strength-block calorie model (compose-hybrid-session step 8) ────────
function strengthBlockCalories(block: StrengthBlockResult, weightKg: number): number {
  let workSec = 0;
  for (const ex of block.exercises) {
    workSec += ex.sets * (ex.isTimeBased ? ex.reps : ex.reps * SECONDS_PER_REP);
  }
  workSec = Math.min(workSec, block.estimatedDurationSec);
  const restSec = Math.max(0, block.estimatedDurationSec - workSec);
  const met = block.exercises.length > 0
    ? block.exercises.reduce((acc, ex) => acc + (TIER_MET[ex.tier ?? 'match'] ?? 5.0), 0) / block.exercises.length
    : 5.0;
  const kcalPerMin = (m: number) => (m * 3.5 * weightKg) / 200;
  return Math.round(kcalPerMin(met) * (workSec / 60) + kcalPerMin(REST_MET) * (restSec / 60));
}

// ============================================================================
// WRAP — home GeneratedWorkout → StrengthBlockResult (the hybrid station content)
// ============================================================================

/**
 * Wrap the full home strength workout as a `StrengthBlockResult` (the shape the
 * hybrid runtime consumes via `strengthBlockToWorkoutPlan`).
 *
 * Q-A: keeps `workout.exercises` INTACT — warmup (joint-mobility, already time-scaled
 * by the home engine) + main + cooldown — with FULL rests. No filtering, no ×0.5.
 */
export function workoutToStrengthBlock(workout: GeneratedWorkout): StrengthBlockResult {
  const exercises: WorkoutExercise[] = workout.exercises ?? [];
  return {
    exercises,
    estimatedDurationSec: Math.round((workout.estimatedDuration ?? 0) * 60),
    totalPlannedSets: workout.totalPlannedSets ?? exercises.reduce((s, e) => s + e.sets, 0),
    domainFocus: undefined,
    isEmpty: exercises.length === 0,
    log: [`park-workout: wrapped full home workout (${exercises.length} ex — warmup+main+cooldown kept, full rests)`],
  };
}

// ============================================================================
// COMPOSE — [walk-out → full strength → walk-back]
// ============================================================================

export interface ParkWorkoutStation {
  stopId: string;
  parkId?: string;
  locationKind: StopLocationKind;
  lat: number;
  lng: number;
  /** Turnaround vertex index on routePath (Phase 1.1 sets this to the park). */
  waypointIndex: number;
}

export interface ParkWorkoutComposeInput {
  /** Out-and-back user→park→user route (Phase 1.1). */
  routePath: RoutePath;
  station: ParkWorkoutStation;
  /** The FULL home-recommended strength workout (Phase 1.3 fetches it). */
  workout: GeneratedWorkout;
  aerobicKind: AerobicKind;
  paceProfile: Pick<PaceProfile, 'basePace' | 'profileType'>;
  userWeightKg: number;
  /** Display-only emphasis label for the plan meta. Defaults to 'balanced'. */
  emphasis?: ResolvedEmphasis;
}

/**
 * Compose the full-park-workout plan: one outbound aerobic leg, the full strength
 * workout at the park, one return aerobic leg. When the workout is empty (rest-day /
 * empty pool), the strength segment is omitted and the plan is aerobic-only.
 */
export function composeParkWorkoutPlan(input: ParkWorkoutComposeInput): HybridPlan {
  const prefixKm = buildRoutePrefixKm(input.routePath);
  const routeKm = totalRouteKm(prefixKm);
  const stationKm = kmAtIndex(prefixKm, input.station.waypointIndex);
  const gaps = legGapsKm(prefixKm, [stationKm]); // [outbound, return]

  const block = workoutToStrengthBlock(input.workout);

  const segments: HybridPlannedSegment[] = [];
  let totalCalories = 0;
  let cursorKm = 0;
  let aerobicSec = 0;

  for (let leg = 0; leg < gaps.length; leg++) {
    // Outbound = jogging (run) / walk; return = recovery (run) / walk.
    const zone: RunZoneType = input.aerobicKind === 'walking'
      ? 'walk'
      : leg === 0 ? 'jogging' : 'recovery';
    const pace = zonePaceSecPerKm(input.paceProfile, zone);
    const legSec = Math.round(gaps[leg] * (pace.min + pace.max) / 2);
    aerobicSec += legSec;
    const legCalories = Math.round(gaps[leg] * input.userWeightKg * AEROBIC_KCAL_FACTOR);
    totalCalories += legCalories;

    segments.push({
      index: segments.length,
      kind: 'aerobic',
      aerobicType: input.aerobicKind,
      zone,
      targetPaceSecPerKm: pace,
      durationSec: legSec,
      distanceKm: Number(gaps[leg].toFixed(3)),
      fromKm: Number(cursorKm.toFixed(3)),
      toKm: Number((cursorKm + gaps[leg]).toFixed(3)),
      estCalories: legCalories,
    });
    cursorKm += gaps[leg];

    // The full strength workout sits at the park — after the outbound leg only.
    if (leg === 0 && !block.isEmpty) {
      const stationCalories = strengthBlockCalories(block, input.userWeightKg);
      totalCalories += stationCalories;
      segments.push({
        index: segments.length,
        kind: 'strength',
        stopId: input.station.stopId,
        parkId: input.station.parkId,
        locationKind: input.station.locationKind,
        activityType: 'strength',
        domainFocus: block.domainFocus,
        content: block,
        durationSec: block.estimatedDurationSec,
        estCalories: stationCalories,
      });
    }
  }

  const strengthSec = block.isEmpty ? 0 : block.estimatedDurationSec;
  return {
    segments,
    totals: {
      aerobicMin: Math.round(aerobicSec / 60),
      strengthMin: Math.round(strengthSec / 60),
      distanceKm: Number(routeKm.toFixed(2)),
      estCalories: totalCalories,
      stations: block.isEmpty ? 0 : 1,
    },
    meta: {
      emphasisResolved: input.emphasis ?? 'balanced',
      whoGapNote: null,
      usedFieldFallback: false,
      insufficientHomeContent: false,
      log: [
        `park-workout: routeKm=${routeKm.toFixed(2)} stationKm=${stationKm.toFixed(2)} legs=${gaps.length}`,
        ...block.log,
      ],
    },
  };
}
