/**
 * Budget light mode — the home-trio seam (generateHomeWorkoutTrio, home-workout.service.ts).
 *
 * Every strength session that goes through generateHomeWorkoutTrio (home trio, full park,
 * Kelly's generate_workout, the builder, the adjuster) passes here first:
 *
 *   flag off            → options untouched (byte-identical to before)
 *   entry 'manual'      → the budget inputs are dropped: no recovery floor, no weekly cap,
 *                         no "budget usage" set cut — the user's own build is never restricted
 *   entry 'recommended' → resolveBudgetLightMode; when light, the session is generated as a
 *                         regular strength session on the easy bolt (no recovery floor, no
 *                         deficit squeeze to 2 sets) and then trimmed to the light set cap
 *                         with the "why" line as its description (applyBudgetLightToTrio).
 *
 * Pure (no store, no flag read — the caller passes `enabled`).
 */

import type { HomeWorkoutOptions, HomeWorkoutTrioResult, WorkoutTrioOption } from '../services/home-workout.types';
import type { GeneratedWorkout } from '../logic/workout-generator.types';
import {
  LIGHT_SESSION_MINUTES_CAP, NORMAL_DECISION, resolveBudgetLightMode, type BudgetEntry, type BudgetLightDecision,
} from './policy';
import { budgetLightText, copyGenderOf } from './copy';
import { capMainSets, mainWorkSets } from './cap-sets';

export interface TrioBudgetGate {
  options: HomeWorkoutOptions;
  decision: BudgetLightDecision;
  entry: BudgetEntry;
}

export function budgetEntryOf(options: Pick<HomeWorkoutOptions, 'budgetEntry' | 'isManualOverride'>): BudgetEntry {
  return options.budgetEntry ?? (options.isManualOverride ? 'manual' : 'recommended');
}

/**
 * The old recovery floor's first-week bypass (home-workout.service.ts): a program started in
 * the last 7 days cannot have spent its week — a small remaining budget there is stale data.
 */
export function isFirstProgramWeek(options: Pick<HomeWorkoutOptions, 'userProfile'>, nowMs: number): boolean {
  const raw = options.userProfile?.progression?.activePrograms?.[0]?.startDate as unknown;
  if (!raw) return false;
  const ms = raw instanceof Date ? raw.getTime() : new Date(raw as string).getTime();
  return Number.isFinite(ms) && ms > 0 && nowMs - ms < 7 * 24 * 60 * 60 * 1000;
}

export function resolveTrioBudgetGate(
  options: HomeWorkoutOptions,
  enabled: boolean,
  nowMs: number = Date.now(),
): TrioBudgetGate {
  const entry = budgetEntryOf(options);
  if (!enabled) return { options, decision: NORMAL_DECISION, entry };

  if (entry === 'manual') {
    if (options.remainingWeeklyBudget == null && options.weeklyBudgetUsagePercent == null) {
      return { options, decision: NORMAL_DECISION, entry };
    }
    return {
      options: { ...options, remainingWeeklyBudget: undefined, weeklyBudgetUsagePercent: undefined },
      decision: NORMAL_DECISION,
      entry,
    };
  }

  if (isFirstProgramWeek(options, nowMs)) return { options, decision: NORMAL_DECISION, entry };

  const decision = resolveBudgetLightMode({
    enabled,
    entry,
    snapshot: options.strengthBudgetSnapshot,
    remainingWeeklySets: options.remainingWeeklyBudget,
  });
  if (decision.mode !== 'light') return { options, decision, entry };

  const cap = decision.intensityCap ?? 3;
  const target = Math.min(options.targetDifficulty ?? cap, cap) as 1 | 2 | 3;
  return {
    options: {
      ...options,
      remainingWeeklyBudget: undefined,
      weeklyBudgetUsagePercent: undefined,
      // A viable set budget (no deficit squeeze to the 2-set floor); the light cap is applied after.
      isManualOverride: true,
      targetDifficulty: target,
      difficulty: target,
      // Shorter → fewer exercises, so the set cap leaves ~2 real sets each.
      availableTime: Math.min(options.availableTime ?? LIGHT_SESSION_MINUTES_CAP, LIGHT_SESSION_MINUTES_CAP),
    },
    decision,
    entry,
  };
}

/** Make one generated workout light: set cap, "why" description, budgetLight stamp. */
export function applyBudgetLightToWorkout(
  workout: GeneratedWorkout,
  decision: BudgetLightDecision,
  gender: 'male' | 'female',
  estimateMinutes?: (exercises: GeneratedWorkout['exercises']) => number,
): GeneratedWorkout {
  if (decision.mode !== 'light' || !decision.reasonKey) return workout;
  if (workout.needsAssessment || workout.isRecovery || !(workout.exercises?.length)) return workout;
  const setsCap = decision.setsCap ?? mainWorkSets(workout.exercises);
  const before = mainWorkSets(workout.exercises);
  const exercises = capMainSets(workout.exercises, setsCap);
  const after = mainWorkSets(exercises);
  const removed = before - after;
  return {
    ...workout,
    exercises,
    totalPlannedSets: Math.max(0, (workout.totalPlannedSets ?? before) - removed),
    estimatedDuration: removed > 0 && estimateMinutes ? estimateMinutes(exercises) : workout.estimatedDuration,
    description: budgetLightText(decision.reasonKey, 'description', gender),
    budgetLight: { reasonKey: decision.reasonKey, setsCap },
    pipelineLog: [
      ...(workout.pipelineLog ?? []),
      `budget_light: ${decision.reasonKey} sets ${before}→${after} (cap ${setsCap}), difficulty≤${decision.intensityCap}`,
    ],
  };
}

export function applyBudgetLightToTrio(
  trio: HomeWorkoutTrioResult,
  decision: BudgetLightDecision,
  profile: HomeWorkoutOptions['userProfile'],
  estimateMinutes?: (exercises: GeneratedWorkout['exercises']) => number,
): HomeWorkoutTrioResult {
  if (decision.mode !== 'light') return trio;
  const gender = copyGenderOf(profile as never);
  // Padded slots share one result object — keep them shared.
  const done = new Map<WorkoutTrioOption['result'], WorkoutTrioOption['result']>();
  const options = trio.options.map((opt) => {
    let result = done.get(opt.result);
    if (!result) {
      result = { ...opt.result, workout: applyBudgetLightToWorkout(opt.result.workout, decision, gender, estimateMinutes) };
      done.set(opt.result, result);
    }
    return { ...opt, result };
  }) as HomeWorkoutTrioResult['options'];
  return { ...trio, options };
}
