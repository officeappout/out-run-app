/**
 * Workout Budgeting Utilities
 *
 * Volume adjustment, set/rep assignment, hold time calculation,
 * smart set capping, duration estimation, and calorie/stats calculation.
 * Extracted from WorkoutGenerator for modularity.
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs
 */

import { Exercise, MechanicalType, getLocalizedText, ExerciseTag } from '@/features/content/exercises/core/exercise.types';
import { ScoredExercise } from './ContextualEngine';
import { DOMAIN_ALIAS_MAP, DOMAIN_PARENT_MAP, getShuffleSeed, classifyPriority } from './workout-selection.utils';
import {
  DifficultyLevel,
  ExercisePriority,
  WorkoutExercise,
  WorkoutGenerationContext,
  WorkoutStats,
  VolumeAdjustment,
  TierName,
  TierConfig,
  TIER_TABLE,
  resolveTier,
  restSafetyFloor,
} from './workout-generator.types';

// ============================================================================
// CONSTANTS
// ============================================================================

const DURATION_SCALING: Record<string, { min: number; max: number; includeAccessories: boolean }> = {
  '5': { min: 2, max: 3, includeAccessories: false },
  '15': { min: 4, max: 5, includeAccessories: false },
  '30': { min: 4, max: 5, includeAccessories: false },
  '45': { min: 6, max: 8, includeAccessories: true },
  '60': { min: 7, max: 10, includeAccessories: true },
};

const BASE_SETS_BY_LEVEL: Record<number, number> = {
  1: 2, 2: 2, 3: 2, 4: 2, 5: 2,
  6: 3, 7: 3, 8: 3, 9: 3, 10: 3,
  11: 3, 12: 3, 13: 4, 14: 4, 15: 4,
  16: 4, 17: 4, 18: 4, 19: 4, 20: 4,
  21: 5, 22: 5, 23: 5, 24: 5, 25: 5,
};

export function getBaseSets(level: number): number {
  if (level <= 0) return 2;
  if (level > 25) return 5;
  return BASE_SETS_BY_LEVEL[level] || Math.min(5, 2 + Math.floor(level / 6));
}

const BASE_REPS_BY_LEVEL: Record<number, { standard: number; timeBased: number }> = {
  1: { standard: 6, timeBased: 15 }, 2: { standard: 6, timeBased: 18 },
  3: { standard: 7, timeBased: 20 }, 4: { standard: 7, timeBased: 22 },
  5: { standard: 8, timeBased: 25 }, 6: { standard: 8, timeBased: 28 },
  7: { standard: 9, timeBased: 30 }, 8: { standard: 9, timeBased: 32 },
  9: { standard: 10, timeBased: 35 }, 10: { standard: 10, timeBased: 38 },
  11: { standard: 11, timeBased: 40 }, 12: { standard: 11, timeBased: 42 },
  13: { standard: 12, timeBased: 45 }, 14: { standard: 12, timeBased: 47 },
  15: { standard: 13, timeBased: 50 }, 16: { standard: 13, timeBased: 52 },
  17: { standard: 14, timeBased: 54 }, 18: { standard: 14, timeBased: 56 },
  19: { standard: 15, timeBased: 58 }, 20: { standard: 15, timeBased: 60 },
  21: { standard: 16, timeBased: 60 }, 22: { standard: 16, timeBased: 60 },
  23: { standard: 17, timeBased: 60 }, 24: { standard: 17, timeBased: 60 },
  25: { standard: 18, timeBased: 60 },
};

export function getBaseReps(level: number): { standard: number; timeBased: number } {
  if (level <= 0) return { standard: 6, timeBased: 15 };
  if (level > 25) return { standard: 18, timeBased: 60 };
  return BASE_REPS_BY_LEVEL[level] || {
    standard: Math.min(18, 6 + Math.floor(level * 0.5)),
    timeBased: Math.min(60, 15 + Math.floor(level * 1.8)),
  };
}

const INACTIVITY_THRESHOLD_DAYS = 3;
const INACTIVITY_VOLUME_REDUCTION = 0.40;

const DIFFICULTY_VOLUME: Record<DifficultyLevel, {
  sets: { min: number; max: number };
  reps: { min: number; max: number };
  holdSeconds: { min: number; max: number };
}> = {
  1: { sets: { min: 3, max: 3 }, reps: { min: 10, max: 15 }, holdSeconds: { min: 20, max: 30 } },
  2: { sets: { min: 3, max: 4 }, reps: { min: 6, max: 8 }, holdSeconds: { min: 15, max: 25 } },
  3: { sets: { min: 4, max: 5 }, reps: { min: 1, max: 6 }, holdSeconds: { min: 5, max: 15 } },
};

const ISOMETRIC_GUARDRAILS = {
  straightArmMaxHold: 15,
  handstandMaxHold: 60,
  corePlanksFollowLevel: true,
};

const MET_BY_DIFFICULTY: Record<DifficultyLevel, number> = {
  1: 3.5, 2: 6.0, 3: 8.0,
};

const COIN_BONUS_BY_DIFFICULTY: Record<DifficultyLevel, number> = {
  1: 0, 2: 20, 3: 50,
};

const DEFAULT_USER_WEIGHT = 70;

const DIFFICULTY_MULTIPLIERS: Record<DifficultyLevel, number> = {
  1: 0.8, 2: 1.0, 3: 1.5,
};

const BASE_WORKOUT_CALORIES = 50;

// ============================================================================
// EXERCISE COUNT
// ============================================================================

export function getExerciseCountForDuration(
  availableTime: number,
): { exerciseCount: number; includeAccessories: boolean } {
  let config = DURATION_SCALING['30'];

  if (availableTime <= 10) config = DURATION_SCALING['5'];
  else if (availableTime <= 30) config = DURATION_SCALING['15'];
  else if (availableTime <= 45) config = DURATION_SCALING['45'];
  else config = DURATION_SCALING['60'];

  const exerciseCount = config.min + Math.floor(Math.random() * (config.max - config.min + 1));
  return { exerciseCount, includeAccessories: config.includeAccessories };
}

// ============================================================================
// VOLUME ADJUSTMENT
// ============================================================================

export function calculateVolumeAdjustment(
  context: WorkoutGenerationContext,
  difficulty: DifficultyLevel,
): VolumeAdjustment {
  const baseSets = getBaseSets(context.userLevel);
  let adjustedSets = baseSets;
  let reductionPercent = 0;
  let badge = '';
  let reason: VolumeAdjustment['reason'] = 'inactivity';

  if (difficulty === 1) {
    adjustedSets = Math.max(2, baseSets - 1);
    reductionPercent = ((baseSets - adjustedSets) / baseSets) * 100;
  }

  if (context.volumeReductionOverride != null && context.volumeReductionOverride > 0) {
    const override = context.volumeReductionOverride;
    adjustedSets = Math.max(2, Math.round(baseSets * (1 - override)));
    reductionPercent = override * 100;
    badge = '🦥 מצב מופחת';
    reason = 'detraining';
    return { reason, reductionPercent: Math.round(reductionPercent), originalSets: baseSets, adjustedSets, badge };
  }

  if (context.daysInactive > INACTIVITY_THRESHOLD_DAYS) {
    adjustedSets = Math.max(2, Math.round(baseSets * (1 - INACTIVITY_VOLUME_REDUCTION)));
    reductionPercent = INACTIVITY_VOLUME_REDUCTION * 100;
    badge = `🦥 חזרה אחרי ${context.daysInactive} ימים`;
    reason = 'inactivity';
    return { reason, reductionPercent: Math.round(reductionPercent), originalSets: baseSets, adjustedSets, badge };
  }

  if (context.weeklyBudgetUsagePercent != null && context.weeklyBudgetUsagePercent > 75) {
    const budgetReduction = Math.min(0.3, (context.weeklyBudgetUsagePercent - 75) / 100);
    adjustedSets = Math.max(2, Math.round(baseSets * (1 - budgetReduction)));
    reductionPercent = budgetReduction * 100;
    badge = '📊 ניהול תקציב';
    reason = 'weekly_budget';
    return { reason, reductionPercent: Math.round(reductionPercent), originalSets: baseSets, adjustedSets, badge };
  }

  return {
    reason,
    reductionPercent: Math.round(reductionPercent),
    originalSets: baseSets,
    adjustedSets,
    badge,
  };
}

// ============================================================================
// HOLD TIME CALCULATION
// ============================================================================

export function isTimeBasedExercise(exercise: Exercise): boolean {
  if (exercise.type === 'time') return true;
  if (exercise.mechanicalType === 'straight_arm') return true;
  const name = getLocalizedText(exercise.name).toLowerCase();
  if (name.includes('hold') || name.includes('plank') || name.includes('hang') || name.includes('החזקה')) {
    return true;
  }
  return false;
}

export function calculateHoldTimeTier(
  exercise: Exercise,
  tier: TierConfig,
  tierName: TierName,
): number {
  const name = getLocalizedText(exercise.name).toLowerCase();
  const tags = exercise.tags || [];

  const isHandstand =
    tags.includes('handstand' as ExerciseTag) ||
    name.includes('handstand') ||
    name.includes('עמידת ידיים');

  const isCorePlank =
    name.includes('plank') ||
    name.includes('פלאנק') ||
    exercise.primaryMuscle === 'core' ||
    exercise.primaryMuscle === 'abs';

  let holdTime = tier.hold.min + Math.floor(Math.random() * (tier.hold.max - tier.hold.min + 1));

  if (isHandstand) {
    holdTime = Math.min(holdTime, ISOMETRIC_GUARDRAILS.handstandMaxHold);
  } else if (isCorePlank) {
    // follow tier range
  } else if (exercise.mechanicalType === 'straight_arm') {
    holdTime = Math.min(holdTime, ISOMETRIC_GUARDRAILS.straightArmMaxHold);
  }

  if (tierName === 'elite' || tierName === 'hard') {
    holdTime = Math.min(holdTime, 15);
  }

  return Math.max(3, holdTime);
}

// ============================================================================
// DOMAIN RESOLUTION (Phase 2 — Domain-Aware Budgeting)
// ============================================================================

const MUSCLE_TO_DOMAIN: Record<string, string> = {
  chest: 'push', triceps: 'push', shoulders: 'push', deltoids: 'push',
  back: 'pull', biceps: 'pull', lats: 'pull', forearms: 'pull',
  quads: 'legs', hamstrings: 'legs', glutes: 'legs', calves: 'legs', hip_flexors: 'legs',
  core: 'core', abs: 'core', obliques: 'core',
};

function resolveExerciseDomain(
  exercise: Exercise,
  budgetDomains: Set<string>,
): string | undefined {
  const tps = exercise.targetPrograms ?? [];

  for (const tp of tps) {
    if (budgetDomains.has(tp.programId)) return tp.programId;
  }

  for (const tp of tps) {
    const aliases = DOMAIN_ALIAS_MAP[tp.programId];
    if (aliases) {
      for (const alias of aliases) {
        if (budgetDomains.has(alias)) return alias;
      }
    }
  }

  const muscle = exercise.primaryMuscle?.toLowerCase();
  if (muscle && MUSCLE_TO_DOMAIN[muscle] && budgetDomains.has(MUSCLE_TO_DOMAIN[muscle])) {
    return MUSCLE_TO_DOMAIN[muscle];
  }

  return undefined;
}

// ============================================================================
// VOLUME ASSIGNMENT
// ============================================================================

export function assignVolume(
  exercises: (ScoredExercise & { isOverLevel?: boolean; levelDiff?: number })[],
  context: WorkoutGenerationContext,
  volumeAdjustment: VolumeAdjustment,
  _difficulty: DifficultyLevel,
): WorkoutExercise[] {
  const blastRestMultiplier = context.intentMode === 'blast' ? 0.5 : 1;

  // ── Domain-Aware Budgeting pre-pass (Phase 2) ───────────────────────
  const domainBudgetMap = new Map<string, number>();
  const exerciseDomainMap = new Map<string, string>();
  const exercisesPerDomain = new Map<string, number>();
  const hasDomainBudgets = (context.domainBudgets?.length ?? 0) > 0;

  const domainBudgetReceivers = new Set<string>();

  if (hasDomainBudgets) {
    const budgetDomains = new Set(context.domainBudgets!.map(d => d.domain));
    for (const db of context.domainBudgets!) {
      domainBudgetMap.set(db.domain, db.daily);
    }
    for (const scored of exercises) {
      const domain = resolveExerciseDomain(scored.exercise, budgetDomains);
      if (domain) {
        exerciseDomainMap.set(scored.exercise.id, domain);
        exercisesPerDomain.set(domain, (exercisesPerDomain.get(domain) ?? 0) + 1);
      }
    }

    // Budget-Over-Volume guard: if splitting a domain's budget across N exercises
    // would force each to its tier.sets.min (typically 3), exceeding the budget,
    // consolidate into fewer exercises. The highest-scored exercises receive the
    // domain budget; the rest fall through to regular tier-based assignment.
    const TYPICAL_MIN_SETS = 3;
    for (const db of context.domainBudgets!) {
      const count = exercisesPerDomain.get(db.domain) ?? 0;
      if (count === 0) continue;
      const perExercise = Math.ceil(db.daily / count);
      if (perExercise < TYPICAL_MIN_SETS && count > 1) {
        const maxReceivers = Math.max(1, Math.floor(db.daily / TYPICAL_MIN_SETS));
        const domainExercises = exercises
          .filter(s => exerciseDomainMap.get(s.exercise.id) === db.domain)
          .sort((a, b) => b.score - a.score);
        for (let i = 0; i < Math.min(maxReceivers, domainExercises.length); i++) {
          domainBudgetReceivers.add(domainExercises[i].exercise.id);
        }
        exercisesPerDomain.set(db.domain, maxReceivers);
        console.log(
          `[assignVolume] Budget guard: ${db.domain} budget=${db.daily} ÷ ${count} exercises ` +
          `would under-min → consolidated to ${maxReceivers} receiver(s)`,
        );
      } else {
        const domainExercises = exercises
          .filter(s => exerciseDomainMap.get(s.exercise.id) === db.domain);
        for (const s of domainExercises) {
          domainBudgetReceivers.add(s.exercise.id);
        }
      }
    }

    console.group('[assignVolume] Domain-Aware Budget Distribution');
    for (const db of context.domainBudgets!) {
      const count = exercisesPerDomain.get(db.domain) ?? 0;
      const perExercise = count > 0 ? Math.ceil(db.daily / count) : 0;
      console.log(`  ${db.domain} L${db.level}: ${db.daily} sets ÷ ${count} exercises = ${perExercise} sets/each`);
    }
    console.groupEnd();
  }

  return exercises.map((scored) => {
    const priority = classifyPriority(scored.exercise);
    const timeBased = isTimeBasedExercise(scored.exercise);
    const isOverLevel = scored.isOverLevel || false;
    const exercise = scored.exercise;
    const delta = scored.levelDiff ?? 0;

    const tierName = resolveTier(delta);
    const tier = TIER_TABLE[tierName];

    let sets: number;

    // Domain-aware: derive sets from domain budget, clamped to tier bounds.
    // Only exercises in domainBudgetReceivers participate; others use tier fallback
    // to prevent min_sets clamping from blowing past the domain budget.
    const exDomain = exerciseDomainMap.get(scored.exercise.id);
    if (hasDomainBudgets && exDomain && domainBudgetMap.has(exDomain)
        && domainBudgetReceivers.has(scored.exercise.id)) {
      const budget = domainBudgetMap.get(exDomain)!;
      const count = exercisesPerDomain.get(exDomain)!;
      const domainSets = Math.ceil(budget / count);
      sets = Math.max(tier.sets.min, Math.min(tier.sets.max, domainSets));
    } else {
      sets = tier.sets.min + Math.floor(Math.random() * (tier.sets.max - tier.sets.min + 1));
    }

    if (priority === 'skill') {
      sets = Math.min(sets, 4);
    } else if (priority === 'isolation') {
      sets = Math.max(2, sets - 1);
    }

    if (volumeAdjustment.reductionPercent > 0) {
      sets = Math.max(2, Math.round(sets * (1 - volumeAdjustment.reductionPercent / 100)));
    }

    let reps: number;

    if (timeBased) {
      reps = calculateHoldTimeTier(exercise, tier, tierName);
    } else {
      reps = tier.reps.min + Math.floor(Math.random() * (tier.reps.max - tier.reps.min + 1));
      if (volumeAdjustment.reductionPercent > 0) {
        reps = Math.max(tier.reps.min, Math.round(reps * (1 - volumeAdjustment.reductionPercent / 100)));
      }
    }

    let restSeconds = tier.rest.min + Math.floor(Math.random() * (tier.rest.max - tier.rest.min + 1));

    if (tierName !== 'elite') {
      restSeconds = Math.round(restSeconds * blastRestMultiplier);
    }

    restSeconds = Math.max(restSeconds, restSafetyFloor(tier));

    const repsRange = timeBased
      ? { min: tier.hold.min, max: tier.hold.max }
      : { min: tier.reps.min, max: tier.reps.max };

    const exerciseId = scored.exercise.id;
    const isGoalExercise = context.goalExerciseIds?.has(exerciseId) ?? false;
    let rampedTarget: number | undefined;

    if (isGoalExercise && context.goalTargets?.has(exerciseId)) {
      const goal = context.goalTargets.get(exerciseId)!;
      const sessionsCompleted = context.workoutsCompletedInLevel ?? 0;
      const rampFraction = Math.min(1.0, 0.3 + 0.1 * sessionsCompleted);
      rampedTarget = Math.round(goal.targetValue * rampFraction);

      if (timeBased && goal.unit === 'seconds') {
        reps = Math.max(reps, rampedTarget);
        repsRange.max = Math.max(repsRange.max, goal.targetValue);
      } else if (!timeBased && goal.unit === 'reps') {
        reps = Math.max(reps, rampedTarget);
        repsRange.max = Math.max(repsRange.max, goal.targetValue);
      }
    }

    const resolvedProgramLevel = (() => {
      if (scored.programLevel != null && scored.programLevel > 0) return scored.programLevel;
      const ex = scored.exercise;
      const domains = context.requiredDomains ?? [];
      const userLevels = context.userProgramLevels;

      for (const domain of domains) {
        const parentAliases = DOMAIN_PARENT_MAP[domain] ?? [];
        const tp = ex.targetPrograms?.find((t) => t.programId === domain)
          ?? ex.targetPrograms?.find((t) => parentAliases.includes(t.programId));
        if (tp?.level != null) {
          return tp.level;
        }
      }
      return userLevels?.get(domains[0]) ?? context.userLevel ?? 1;
    })();

    return {
      exercise: scored.exercise,
      method: scored.method,
      mechanicalType: scored.mechanicalType,
      sets,
      reps,
      repsRange,
      isTimeBased: timeBased,
      restSeconds,
      priority,
      score: scored.score,
      reasoning: scored.reasoning,
      programLevel: resolvedProgramLevel,
      isOverLevel,
      tier: tierName,
      levelDelta: delta,
      isGoalExercise,
      rampedTarget,
      exerciseRole: 'main' as const,
    };
  });
}

// ============================================================================
// SMART SET CAP
// ============================================================================

export function applySmartSetCap(
  exercises: WorkoutExercise[],
  cap: number,
  requiredDomainCount?: number,
): WorkoutExercise[] {
  let totalSets = exercises.reduce((sum, ex) => sum + ex.sets, 0);
  if (totalSets <= cap || cap <= 0) return exercises;

  const domainCount = requiredDomainCount ?? exercises.length;
  const setsPerExerciseWhenTight = Math.max(1, Math.floor(cap / domainCount));
  const budgetTight = cap < exercises.length * 3;

  const compoundMin = budgetTight ? Math.max(1, setsPerExerciseWhenTight) : 3;
  const skillMin = budgetTight ? Math.max(1, setsPerExerciseWhenTight) : 2;

  const reductionOrder: ExercisePriority[] = ['isolation', 'accessory', 'compound', 'skill'];
  const minSetsByPriority: Record<ExercisePriority, number> = {
    isolation: 2,
    accessory: 2,
    compound: compoundMin,
    skill: skillMin,
  };

  let result = [...exercises];
  while (totalSets > cap) {
    let reduced = false;
    for (const p of reductionOrder) {
      if (totalSets <= cap) break;
      const candidates = result
        .filter((ex) => ex.priority === p && ex.sets > minSetsByPriority[p])
        .sort((a, b) => a.sets - b.sets);
      if (candidates.length > 0) {
        const idx = result.findIndex((e) => e.exercise.id === candidates[0].exercise.id);
        if (idx >= 0) {
          result[idx] = { ...result[idx], sets: result[idx].sets - 1 };
          totalSets -= 1;
          reduced = true;
          break;
        }
      }
    }
    if (!reduced) break;
  }
  if (totalSets !== exercises.reduce((sum, ex) => sum + ex.sets, 0)) {
    console.log(`[WorkoutGenerator] Smart set cap: ${totalSets} sets (cap ${cap})`);
  }
  return result;
}

// ============================================================================
// ESTIMATED DURATION
// ============================================================================

export function calculateEstimatedDuration(exercises: WorkoutExercise[]): number {
  let totalWorkSeconds = 0;
  let totalRestSeconds = 0;

  for (const ex of exercises) {
    const isWarmupOrCooldown = ex.exerciseRole === 'warmup' || ex.exerciseRole === 'cooldown';

    if (isWarmupOrCooldown) {
      totalWorkSeconds += 90;
    } else {
      const secPerRep = ex.exercise.secondsPerRep ?? 3;
      const setTime = ex.isTimeBased ? ex.reps : ex.reps * secPerRep;
      const sideMultiplier = ex.exercise.symmetry === 'unilateral' ? 2 : 1;
      totalWorkSeconds += ex.sets * setTime * sideMultiplier;
    }

    const effectiveRest = Math.min(ex.restSeconds, 90);
    totalRestSeconds += ex.sets * effectiveRest;
  }

  const totalSeconds = totalWorkSeconds + totalRestSeconds;
  const transitionSeconds = (exercises.length - 1) * 30;
  const finalMinutes = Math.ceil((totalSeconds + transitionSeconds) / 60);

  console.group('[Duration Math Formulation]');
  console.log('Total Work Time:', Math.round(totalWorkSeconds / 60), 'min');
  console.log('Rest Time:', Math.round(totalRestSeconds / 60), 'min');
  console.log('Transition (30s between exercises):', transitionSeconds, 's');
  console.log('Final Duration:', finalMinutes, 'min');
  console.groupEnd();

  return finalMinutes;
}

// ============================================================================
// WORKOUT STATS
// ============================================================================

export function calculateWorkoutStats(
  exercises: WorkoutExercise[],
  difficulty: DifficultyLevel,
  durationMinutes?: number,
  userWeight?: number,
): WorkoutStats {
  let totalReps = 0;
  let totalHoldTime = 0;

  for (const ex of exercises) {
    if (ex.isTimeBased) {
      totalHoldTime += ex.sets * ex.reps;
    } else {
      totalReps += ex.sets * ex.reps;
    }
  }

  const met = MET_BY_DIFFICULTY[difficulty];
  const weight = userWeight || DEFAULT_USER_WEIGHT;
  const duration = durationMinutes || calculateEstimatedDuration(exercises);
  const metCalories = met * 0.0175 * weight * duration;
  const calories = Math.max(BASE_WORKOUT_CALORIES, Math.round(metCalories));
  const difficultyBonus = COIN_BONUS_BY_DIFFICULTY[difficulty];
  const coins = calories + difficultyBonus;
  const multiplier = DIFFICULTY_MULTIPLIERS[difficulty];

  return { calories, coins, totalReps, totalHoldTime, difficultyMultiplier: multiplier };
}
