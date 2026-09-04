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
import type { ScoredExercise } from './contextual-engine.types';
import { TABATA_BLOCK_SECONDS, TABATA_CLASSIC } from './protocols/tabata.constants';
import { DOMAIN_ALIAS_MAP, DOMAIN_PARENT_MAP, getShuffleSeed, classifyPriority, resolveExerciseLevelForDomains } from './workout-selection.utils';
import { resolveToSlug } from '../services/program-hierarchy.utils';
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
  MATCH_HORIZONTAL_REPS,
  HORIZONTAL_MOVEMENT_GROUPS,
  resolveTier,
  restSafetyFloor,
} from './workout-generator.types';

// ============================================================================
// CONSTANTS
// ============================================================================

const DURATION_SCALING: Record<string, { min: number; max: number; includeAccessories: boolean }> = {
  '5':  { min: 2, max: 3,  includeAccessories: false },
  '15': { min: 4, max: 5,  includeAccessories: false },
  '30': { min: 5, max: 6,  includeAccessories: false },
  '45': { min: 6, max: 8,  includeAccessories: true  },
  '60': { min: 7, max: 10, includeAccessories: true  },
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
  1: { sets: { min: 3, max: 3 }, reps: { min: 10, max: 12 }, holdSeconds: { min: 20, max: 30 } },
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
// DAVID STAIRCASE — Progress-aware rep scaling
// ============================================================================
//
// Rationale:
//   The onboarding questionnaire tells us a user "fresh to Level X" can hit
//   roughly 1-3 reps of an X-level exercise; a user "mastering Level X"
//   (>=50% progress to X+1) can hit 4-6 reps comfortably. The legacy logic
//   ignored this and used a flat 3-6 range for every match-tier exercise,
//   which both over-prescribed reps for fresh users and under-prescribed
//   reps for mastery-stage users.
//
// Mapping (bilateral, vertical):
//   Match (delta = 0)   <50%  →  2-4 reps   (neurological focus)
//   Match (delta = 0)   >=50% →  4-6 reps   (hypertrophy ramp)
//   Easy  (delta = -1)        →  6-8 reps
//   Flow  (delta = -2)        →  10-12 reps
//   Hard / Elite (delta >= 1) →  unchanged from TIER_TABLE (low reps for above-level)
//
// Horizontal matches retain a wider hypertrophy-friendly range, but still
// scale by progress so a fresh user is not asked for 12-rep horizontal pulls.
function getStaircaseRange(
  tierName: TierName,
  isHorizontalMatch: boolean,
  levelProgressPercent: number | undefined,
): { min: number; max: number } | null {
  const pct = levelProgressPercent ?? 0;

  if (tierName === 'match') {
    if (isHorizontalMatch) {
      return pct < 50 ? { min: 4, max: 6 } : { min: 6, max: 12 };
    }
    return pct < 50 ? { min: 2, max: 4 } : { min: 4, max: 6 };
  }

  if (tierName === 'easy')  return { min: 6, max: 8 };
  if (tierName === 'flow')  return { min: 10, max: 12 };

  // hard / elite: keep the existing TIER_TABLE values (low reps for above-level work)
  return null;
}

/**
 * History Floor: never assign fewer reps than the user actually performed
 * in their most recent session for this exercise — capped to the staircase
 * max so we don't blow past the physiologically appropriate ceiling.
 *
 * Paranoid guards:
 *   - Suspicious history values (>= 100 reps) are treated as corrupt data
 *     and discarded (legacy bug protection — a hold logged in seconds may
 *     have been written to a rep-based exercise's history doc).
 *   - The returned floor is ALWAYS clamped to `range.max`, regardless of
 *     what history says. Callers should still apply higher-level caps
 *     (skill ceiling, etc.) afterwards.
 */
const HISTORY_SUSPICIOUS_THRESHOLD = 100;

function applyHistoryFloor(
  reps: number,
  range: { min: number; max: number },
  exerciseId: string,
  historyMap: Record<string, number[]> | undefined,
): { reps: number; floored: boolean; lastMax: number | null; discarded: boolean } {
  if (!historyMap) return { reps, floored: false, lastMax: null, discarded: false };
  const lastReps = historyMap[exerciseId];
  if (!lastReps || lastReps.length === 0) return { reps, floored: false, lastMax: null, discarded: false };
  const lastMax = Math.max(...lastReps);

  // Sanity check 1: absolute outlier — any single logged set ≥ 100 reps is
  // almost certainly corrupted history (e.g. seconds written into a rep-based
  // field by a legacy bug). Refuse to use it as a floor and log a warning.
  if (lastMax >= HISTORY_SUSPICIOUS_THRESHOLD) {
    console.warn(
      `[HistoryFloor] Discarding suspicious history for "${exerciseId}": ` +
      `lastMax=${lastMax} (absolute threshold ${HISTORY_SUSPICIOUS_THRESHOLD}). ` +
      `Likely corrupt data from a prior bug — please check Firestore.`,
    );
    return { reps, floored: false, lastMax, discarded: true };
  }

  // Sanity check 2: range-relative outlier — if the recorded max exceeds the
  // prescribed range max by more than 3×, treat it as suspect. This catches
  // the "30-rep history on a 5-rep skill move" pattern (where range.max = 5
  // but lastMax = 30 = 6× the ceiling — almost certainly cross-contaminated
  // or corrupted, since a real 30-rep set is physiologically impossible at
  // a hard/elite skill tier).
  const RELATIVE_OUTLIER_MULTIPLIER = 3;
  if (lastMax > range.max * RELATIVE_OUTLIER_MULTIPLIER) {
    console.warn(
      `[HistoryFloor] Discarding outlier history for "${exerciseId}": ` +
      `lastMax=${lastMax} > ${RELATIVE_OUTLIER_MULTIPLIER}× range.max(${range.max}). ` +
      `Falling back to staircase reps (${reps}).`,
    );
    return { reps, floored: false, lastMax, discarded: true };
  }

  if (lastMax <= reps) return { reps, floored: false, lastMax, discarded: false };
  const cappedFloor = Math.min(lastMax, range.max);
  return { reps: cappedFloor, floored: cappedFloor !== reps, lastMax, discarded: false };
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

  // ── Periodization Volume Multiplier ──────────────────────────────────
  // Peak (week 4): +20% sets for a max-stimulus overload session.
  // Deload (week 5): -50% sets for full systemic recovery.
  // Only applied when no gap-based volumeReductionOverride is active
  // (inactivity + deload don't stack — the gap override takes priority).
  if (
    context.periodizationWeek != null &&
    context.periodizationWeek !== 1 &&
    context.periodizationWeek !== 2 &&
    context.periodizationWeek !== 3 &&
    context.volumeReductionOverride == null
  ) {
    const pw = context.periodizationWeek;
    if (pw === 4) {
      const multiplied = Math.max(2, Math.round(baseSets * 1.2));
      console.log(
        `[Periodization] Peak week (W4): sets ${baseSets} → ${multiplied} (+20%)`,
      );
      return {
        reason: 'peak',
        reductionPercent: -20,
        originalSets: baseSets,
        adjustedSets: multiplied,
        badge: '🔥 שבוע פסגה',
      };
    }
    if (pw === 5) {
      const reduced = Math.max(2, Math.round(baseSets * 0.5));
      console.log(
        `[Periodization] Deload week (W5): sets ${baseSets} → ${reduced} (-50%)`,
      );
      return {
        reason: 'deload',
        reductionPercent: 50,
        originalSets: baseSets,
        adjustedSets: reduced,
        badge: '🧘 שבוע שחזור',
      };
    }
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

// Movement groups that are ALWAYS rep-based (dynamic movements — never timed).
// One Arm Pull-up, Pike Push-up, Squat, etc. must never appear as "30 שניות".
const DYNAMIC_MOVEMENT_GROUPS = new Set([
  'vertical_pull', 'horizontal_pull',
  'vertical_push', 'horizontal_push',
  'squat', 'hinge', 'lunge',
]);

// Used by the Relative Skill Guard in assignVolume
const PUSH_PULL_MG = new Set(['vertical_push', 'horizontal_push', 'vertical_pull', 'horizontal_pull']);
const LEGS_MG      = new Set(['squat', 'hinge', 'lunge']);

export function isTimeBasedExercise(exercise: Exercise): boolean {
  // ── PRIMARY: CMS type field is the single source of truth ─────────────────
  // The Admin Panel "סוג התרגיל" toggle writes to exercise.type ('reps' | 'time').
  // If the CMS has it marked as time-based, trust it unconditionally — before any
  // movement-group guard, mechanical-type check, or name heuristic.
  if (exercise.type === 'time') return true;
  // If explicitly 'reps' and NOT straight_arm / hold-named, trust that too.
  // We only fall through to heuristics when type is absent/defaulted.

  // ── FALLBACK 1: straight_arm mechanics (must run BEFORE movement-group guard) ─
  // A parallettes or front-lever hold may carry movementGroup='horizontal_push'
  // but is still a timed hold.  straight_arm overrides the dynamic-group guard
  // so isometric holds are never mis-classified as rep-based.
  // NOTE: bent-arm holds (dead hang, L-sit) should be marked type='time' in the
  // CMS — this fallback does NOT cover them.
  if (exercise.mechanicalType === 'straight_arm') {
    if (exercise.type !== 'reps') {
      console.warn(
        `[isTimeBasedExercise] "${typeof exercise.name === 'string' ? exercise.name : (exercise.name as any)?.he ?? exercise.id}" `+
        `has mechanicalType=straight_arm but type="${exercise.type}". Fix in CMS → set type to "זמן".`,
      );
    }
    return true;
  }

  // ── DYNAMIC movement groups are always rep-based ───────────────────────────
  if (DYNAMIC_MOVEMENT_GROUPS.has(exercise.movementGroup ?? '')) return false;

  // ── FALLBACK 2: name heuristics ────────────────────────────────────────────
  // getLocalizedText defaults to 'he', and this catalog is Hebrew-only (no
  // exercise carries an 'en' name in practice) — so 'hold'/'plank'/'hang'
  // (Latin) NEVER actually match against real data; 'החזק' (matching both
  // the absolute form החזקה and the construct/smichut form החזקת) was doing
  // all the real work. 'פלאנק' (plank, transliterated) is added explicitly —
  // found via direct testing (docs/workout-engine/06-TIME-VS-REPS.md): it's
  // one of the most common real hold-exercise names in this catalog and was
  // NOT caught by any existing keyword. The Latin keywords are kept for any
  // future 'en'-named content, not removed.
  const name = getLocalizedText(exercise.name).toLowerCase();
  if (name.includes('hold') || name.includes('plank') || name.includes('hang') || name.includes('החזק') || name.includes('פלאנק')) {
    console.warn(
      `[isTimeBasedExercise] "${name}" detected as time-based via name heuristic. `+
      `Fix in CMS → set type to "זמן" so this warning disappears.`,
    );
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
    const slug = resolveToSlug(tp.programId);
    if (budgetDomains.has(slug)) return slug;
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
  difficulty: DifficultyLevel,
): WorkoutExercise[] {
  const blastRestMultiplier = context.intentMode === 'blast' ? 0.5 : 1;
  const diffVol = DIFFICULTY_VOLUME[difficulty];

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
    //
    // Strict Exercise Cap (by budget tier):
    //   budget < 5  → max 1 distinct exercise  (e.g. 3-4 sets of Squats only)
    //   budget 5–8  → max 2 distinct exercises
    //   budget > 8  → no extra cap (existing TYPICAL_MIN_SETS guard applies)
    const TYPICAL_MIN_SETS = 3;
    for (const db of context.domainBudgets!) {
      const count = exercisesPerDomain.get(db.domain) ?? 0;
      if (count === 0) continue;

      // Hard cap on distinct exercises per domain based on budget tier
      const budgetCap = db.daily < 5 ? 1 : db.daily <= 8 ? 2 : Infinity;
      const perExercise = Math.ceil(db.daily / count);
      const needsBudgetConsolidation = perExercise < TYPICAL_MIN_SETS && count > 1;

      if (count > budgetCap || needsBudgetConsolidation) {
        const maxReceivers = Math.min(
          Math.max(1, Math.floor(db.daily / TYPICAL_MIN_SETS)),
          budgetCap === Infinity ? count : budgetCap,
        );
        const domainExercises = exercises
          .filter(s => exerciseDomainMap.get(s.exercise.id) === db.domain)
          .sort((a, b) => b.score - a.score);
        for (let i = 0; i < Math.min(maxReceivers, domainExercises.length); i++) {
          domainBudgetReceivers.add(domainExercises[i].exercise.id);
        }
        exercisesPerDomain.set(db.domain, Math.min(maxReceivers, domainExercises.length));
        console.log(
          `[assignVolume] Budget guard: ${db.domain} budget=${db.daily} ÷ ${count} exercises ` +
          `(budgetCap=${budgetCap}) → consolidated to ${maxReceivers} receiver(s)`,
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

  // Pre-assignment set ceiling for constrained single-domain sessions.
  // When the dailySetBudget is set and the exercise pool is small, spreading
  // sets evenly prevents 2 exercises from consuming the entire budget at
  // their tier maximum (e.g. 4-5 sets × 2 = 8-10 sets out of 11 budget).
  // This ceiling is only applied via the non-domain-budget path; exercises
  // already managed by domain budgets have their own ceiling through
  // domainSets = Math.ceil(budget / count).
  const exerciseCount = exercises.length;
  const setsPerSlot =
    context.dailySetBudget != null && exerciseCount > 0
      ? Math.max(2, Math.floor(context.dailySetBudget / exerciseCount))
      : undefined;

  return exercises.map((scored) => {
    const priority = classifyPriority(scored.exercise);
    const timeBased = isTimeBasedExercise(scored.exercise);
    const isOverLevel = scored.isOverLevel || false;
    const exercise = scored.exercise;
    const delta = scored.levelDiff ?? 0;

    const tierName = resolveTier(delta);
    const tier = TIER_TABLE[tierName];
    // Hard/Elite (delta >= 1, above-level work): reps must come from TIER_TABLE
    // (1-3), never from the bolt-indexed DIFFICULTY_VOLUME table — see the
    // DAVID STAIRCASE comment above getStaircaseRange, which already promises
    // this but wasn't wired for the reps range (only getStaircaseRange's
    // match/easy/flow branches were). getStaircaseRange returns null for these
    // two tiers specifically so the fallback below can apply TIER_TABLE's range.
    const isAboveLevelTier = tierName === 'hard' || tierName === 'elite';

    // Merge: sets/reps/hold from DIFFICULTY_VOLUME; rest unchanged from TIER_TABLE
    const volumeTier: TierConfig = {
      sets: diffVol.sets,
      reps: diffVol.reps,
      hold: diffVol.holdSeconds,
      rest: tier.rest,
    };

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
      sets = Math.max(volumeTier.sets.min, Math.min(volumeTier.sets.max, domainSets));
    } else {
      // Apply the pre-assignment ceiling so a small pool spreads sets evenly.
      // setsPerSlot is clamped to [sets.min, sets.max] so the random range
      // is always non-negative and the tier minimum is always respected.
      const effectiveSetMax = setsPerSlot != null
        ? Math.max(volumeTier.sets.min, Math.min(volumeTier.sets.max, setsPerSlot))
        : volumeTier.sets.max;
      const range = Math.max(0, effectiveSetMax - volumeTier.sets.min);
      sets = volumeTier.sets.min + Math.floor(Math.random() * (range + 1));
    }

    if (priority === 'skill') {
      sets = Math.min(sets, 4);
    } else if (priority === 'isolation') {
      sets = Math.max(2, sets - 1);
    }


    if (volumeAdjustment.reductionPercent > 0) {
      sets = Math.max(2, Math.round(sets * (1 - volumeAdjustment.reductionPercent / 100)));
    }

    // Absolute floor: no exercise should ever have fewer than 2 sets
    sets = Math.max(2, sets);

    let reps: number;

    const movementGroup = exercise.movementGroup;
    const isHorizontalMatch = tierName === 'match'
      && movementGroup != null
      && HORIZONTAL_MOVEMENT_GROUPS.has(movementGroup);

    // uniRepsRange: set by the Relative Skill Guard for unilateral exercises
    let uniRepsRange: { min: number; max: number } | undefined;

    // Phase 3.6 — Physiological hold cap resolved once at the top of the
    // closure so both the reps scalar block and the repsRange Smart Range
    // Compression block below can share the same value without hitting a
    // block-scope ReferenceError (fixing the crash reported at line ~705).
    const holdCap = getIsometricTimeCap(exercise);

    if (timeBased) {
      reps = calculateHoldTimeTier(exercise, volumeTier, tierName);
      // Route every time-based exercise through the full three-tier cap:
      //   pullup lock-offs / straight-arm levers / level ≥ 8  → 15 s
      //   handstands / hangs / 'תלייה'-named                  → 45 s
      //   core holds and base conditioning                    → 45 s
      reps = Math.min(reps, holdCap);
    } else {
      // ── DAVID STAIRCASE — progress-aware rep range ──
      // For match/easy/flow tiers, override the legacy TIER_TABLE range with a
      // physiologically-aligned range based on the user's progress within the
      // current level. For hard/elite (above user level) we keep the existing
      // low-rep tier values since the user is in over-level territory.
      const staircaseRange = getStaircaseRange(tierName, isHorizontalMatch, context.levelProgressPercent);
      const repRange = staircaseRange
        ?? (isAboveLevelTier ? tier.reps : (isHorizontalMatch ? MATCH_HORIZONTAL_REPS : volumeTier.reps));

      const mg = exercise.movementGroup ?? '';
      const isPushPull = PUSH_PULL_MG.has(mg);
      const isLegs     = LEGS_MG.has(mg);

      if (exercise.symmetry === 'unilateral' && (isPushPull || isLegs)) {
        // levelDiff = userLevel − exerciseLevel.  delta = exerciseLevel − userLevel → levelDiff = −delta.
        const levelDiff = -(delta);

        if (Math.abs(levelDiff) <= 1) {
          // Rule A — High Intensity: exercise is at or ±1 user level
          if (isPushPull) { reps = 1 + Math.floor(Math.random() * 3); uniRepsRange = { min: 1, max: 3 }; }
          else            { reps = 3 + Math.floor(Math.random() * 4); uniRepsRange = { min: 3, max: 6 }; }
        } else if (levelDiff >= 2 && difficulty !== 1) {
          // Rule B — Moderate Intensity: exercise is ≥2 levels below user.
          // Skipped for bolt 1 (Easy) — the lower exercise level is an intentional
          // difficulty selection, not a gap to compensate for with extra reps.
          // When difficulty === 1, the code falls through to the standard
          // DIFFICULTY_VOLUME[1] rep range (10–12) below.
          if (isPushPull) { reps = 3 + Math.floor(Math.random() * 3); uniRepsRange = { min: 3, max: 5 }; }
          else            { reps = 6 + Math.floor(Math.random() * 3); uniRepsRange = { min: 6, max: 8 }; }
        } else {
          // Exercise is above user level: use tier range with -30% reduction
          reps = repRange.min + Math.floor(Math.random() * (repRange.max - repRange.min + 1));
          reps = Math.max(1, Math.round(reps * 0.7));
          uniRepsRange = {
            min: Math.max(1, Math.round(repRange.min * 0.7)),
            max: Math.max(1, Math.round(repRange.max * 0.7)),
          };
        }
        if (volumeAdjustment.reductionPercent > 0) {
          reps = Math.max(1, Math.round(reps * (1 - volumeAdjustment.reductionPercent / 100)));
        }
      } else {
        reps = repRange.min + Math.floor(Math.random() * (repRange.max - repRange.min + 1));
        if (volumeAdjustment.reductionPercent > 0) {
          reps = Math.max(repRange.min, Math.round(reps * (1 - volumeAdjustment.reductionPercent / 100)));
        }
      }

      // ── HISTORY FLOOR — never assign fewer reps than user did last session ──
      // Capped to the active range max so the floor stays inside the
      // physiologically appropriate window for this delta tier.
      const activeRange = uniRepsRange ?? repRange;
      const floorResult = applyHistoryFloor(reps, activeRange, scored.exercise.id, context.exerciseHistoryMap);
      if (floorResult.floored) {
        console.log(
          `[assignVolume] HistoryFloor "${getLocalizedText(scored.exercise.name) || scored.exercise.id}":` +
          ` ${reps} → ${floorResult.reps} reps (last session max: ${floorResult.lastMax}, capped at range max ${activeRange.max})`,
        );
        reps = floorResult.reps;
      }
    }

    let restSeconds = tier.rest.min + Math.floor(Math.random() * (tier.rest.max - tier.rest.min + 1));

    if (tierName !== 'elite') {
      restSeconds = Math.round(restSeconds * blastRestMultiplier);
    }

    restSeconds = Math.max(restSeconds, restSafetyFloor(tier));

    // Mirror the staircase override into the displayed range so the UI shows
    // the same window we used for the assigned reps. Falls back to the legacy
    // tier range for hard/elite tiers (where staircase returns null).
    const staircaseDisplayRange = getStaircaseRange(tierName, isHorizontalMatch, context.levelProgressPercent);
    const effectiveRepRange = staircaseDisplayRange
      ?? (isAboveLevelTier ? tier.reps : (isHorizontalMatch ? MATCH_HORIZONTAL_REPS : volumeTier.reps));
    // Phase 3.6 — Smart Range Compression.
    // For time-based exercises, build the initial range from the difficulty
    // table then compress it when the table overshoots the physiological cap.
    // `holdCap` was resolved above in the reps block; it is always in scope
    // here because both branches are inside the same `exercises.map` closure.
    let repsRange: { min: number; max: number } = timeBased
      ? (() => {
          const baseMin = volumeTier.hold.min;
          const baseMax = volumeTier.hold.max;
          if (baseMax > holdCap) {
            // Difficulty table overshot the physiological ceiling.
            // Compress into a tight explosive-strength window:
            //   max = holdCap, min = max(5, holdCap - 5).
            // e.g. holdCap=15 → { min: 10, max: 15 } — a clean strength band.
            return { min: Math.max(5, holdCap - 5), max: holdCap };
          }
          // Table is within the cap — preserve it exactly.
          return { min: baseMin, max: baseMax };
        })()
      : (uniRepsRange ?? { min: effectiveRepRange.min, max: effectiveRepRange.max });

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

    // ── ABSOLUTE SKILL CEILING ─────────────────────────────────────────────
    // Skill exercises (planche, front lever, muscle-up, handstand, etc.) and
    // any exercise classified as `hard` or `elite` tier (delta >= +1) must
    // never be prescribed for more than 5 reps regardless of staircase range,
    // history floor, goal ramp, or horizontal hypertrophy expansion.
    //
    // This guards against:
    //   - Horizontal-match skill exercises picking up the 6-12 hypertrophy range
    //   - Corrupt history pulling reps up to the staircase max for a skill
    //   - Admin-defined goals with implausibly high rep targets on a skill move
    //
    // Time-based exercises (isometric holds) are exempt — `reps` here is in
    // seconds and the static skill cap (≤15s for straight-arm) already handles
    // those upstream.
    if (!timeBased) {
      const SKILL_REP_CEILING = 5;
      const isSkillPriority = priority === 'skill';
      const isHighIntensityTier = tierName === 'hard' || tierName === 'elite';
      if (isSkillPriority || isHighIntensityTier) {
        if (reps > SKILL_REP_CEILING) {
          console.log(
            `[assignVolume] SkillCeiling "${getLocalizedText(scored.exercise.name) || exerciseId}":` +
            ` ${reps} → ${SKILL_REP_CEILING} reps (priority=${priority}, tier=${tierName})`,
          );
          reps = SKILL_REP_CEILING;
        }
        if (repsRange.max > SKILL_REP_CEILING) {
          repsRange = {
            min: Math.min(repsRange.min, SKILL_REP_CEILING),
            max: SKILL_REP_CEILING,
          };
        }
      }
    }

    const resolvedProgramLevel = (() => {
      if (scored.programLevel != null && scored.programLevel > 0) return scored.programLevel;
      // Domain-aware fallback: resolve from targetPrograms matching active domains.
      // `context.activeProgramId` is forwarded as the primary-program tiebreaker
      // so multi-assigned exercises resolve to the skill-level entry instead of
      // a baseline foundational entry indexed earlier in targetPrograms.
      const activeDomains = context.requiredDomains as string[] | undefined;
      return resolveExerciseLevelForDomains(
        scored.exercise,
        activeDomains,
        context.activeProgramId,
      ).level;
    })();

    const volumeReasoning = [
      ...scored.reasoning,
      `tier:${tierName}(delta=${delta >= 0 ? '+' : ''}${delta})`,
      isHorizontalMatch
        ? `reps:${reps}(horizontal ${effectiveRepRange.min}-${effectiveRepRange.max})`
        : `reps:${reps}(${effectiveRepRange.min}-${effectiveRepRange.max})`,
      `sets:${sets}`,
      `rest:${restSeconds}s`,
    ];

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
      reasoning: volumeReasoning,
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
// RE-DERIVE VOLUME FOR A SWAPPED EXERCISE
// ============================================================================

/**
 * Re-derive `isTimeBased` / `mechanicalType` / `tier` / `reps` / `repsRange` /
 * `restSeconds` for a NEW exercise replacing an existing WorkoutExercise
 * slot, AFTER assignVolume has already run once for the original workout.
 * `tier` is returned so callers can also keep `levelDelta` / `programLevel` /
 * `isOverLevel` in sync with the swap — leaving those stale (still
 * describing the pre-swap exercise) was a second-order version of the same
 * bug: reps could be correctly re-derived for the new exercise's TRUE tier
 * while `tier`/`levelDelta` kept reporting the OLD one, both misleading
 * anything reading those fields downstream and defeating verification
 * queries that filter by `levelDelta`.
 *
 * Every exercise-swap path in the pipeline (level regression, guarantee/
 * rescue substitution, naked-gear backfill/replacement) independently
 * carried the REPLACED exercise's reps/hold value forward regardless of
 * the new exercise's type or tier — the same mistake fixed three times in
 * three different shapes (isTimeBased consistency, naked-backfill reps,
 * and this one): a hold exercise's assigned duration in seconds (e.g. 15s,
 * the elite/hard tier's `calculateHoldTimeTier` cap) surviving numerically
 * unchanged and getting displayed/stored as a REP COUNT once swapped to an
 * unrelated rep-based exercise. Confirmed via live trace: repeated
 * `reps=15` output across many different swapped exercises, 15 being
 * exactly the hold-cap value, not a coincidence (docs/workout-engine/
 * 03-CHANGES.md, Addendum 3, "Not fixed" section).
 *
 * Mirrors exactly what `assignVolume` computes for these fields — same
 * `TIER_TABLE` / `getStaircaseRange` / `calculateHoldTimeTier` /
 * `DIFFICULTY_VOLUME` sources, same ABSOLUTE SKILL CEILING guard — no new
 * formulas. Deliberately excludes:
 *   - `sets` — every call site already owns its own sets logic (e.g. the
 *     core set-count lock), which differs per site and isn't part of this
 *     bug.
 *   - domain-budget sets derivation, history floor, goal ramp — these need
 *     full pipeline context that isn't available at a swap site, and they
 *     only refine volume WITHIN a tier; they don't correct the tier
 *     mismatch this function fixes.
 *   - the unilateral skill Rule A/B/C special case (assignVolume ~666-698)
 *     — callers that already have their own equivalent guard (e.g.
 *     `substituteExercise`'s Skill-Rep Guard) keep applying it themselves,
 *     as a deliberate override layered on top of this function's result.
 *
 * `levelDelta` (exerciseLevel − userDomainLevel for the NEW exercise) is a
 * caller-supplied input, not re-derived here — each call site already
 * resolves the new exercise's level against the correct domain/program
 * using its own existing logic, which this function must not duplicate or
 * risk diverging from.
 */
export function rederiveVolumeForSwappedExercise(
  newExercise: Exercise,
  levelDelta: number,
  difficulty: DifficultyLevel,
  levelProgressPercent?: number,
  intentMode?: WorkoutGenerationContext['intentMode'],
): Pick<WorkoutExercise, 'isTimeBased' | 'mechanicalType' | 'reps' | 'repsRange' | 'restSeconds' | 'tier'> {
  const isTimeBased = isTimeBasedExercise(newExercise);
  const mechanicalType = (newExercise.mechanicalType || 'none') as MechanicalType;

  const tierName = resolveTier(levelDelta);
  const tier = TIER_TABLE[tierName];
  const diffVol = DIFFICULTY_VOLUME[difficulty];
  const volumeTier: TierConfig = { sets: diffVol.sets, reps: diffVol.reps, hold: diffVol.holdSeconds, rest: tier.rest };
  const isAboveLevelTier = tierName === 'hard' || tierName === 'elite';

  let reps: number;
  let repsRange: { min: number; max: number };

  if (isTimeBased) {
    const holdCap = getIsometricTimeCap(newExercise);
    reps = Math.min(calculateHoldTimeTier(newExercise, volumeTier, tierName), holdCap);
    repsRange = volumeTier.hold.max > holdCap
      ? { min: Math.max(5, holdCap - 5), max: holdCap }
      : { min: volumeTier.hold.min, max: volumeTier.hold.max };
  } else {
    const movementGroup = newExercise.movementGroup;
    const isHorizontalMatch = tierName === 'match' && movementGroup != null && HORIZONTAL_MOVEMENT_GROUPS.has(movementGroup);
    const staircaseRange = getStaircaseRange(tierName, isHorizontalMatch, levelProgressPercent);
    const repRange = staircaseRange
      ?? (isAboveLevelTier ? tier.reps : (isHorizontalMatch ? MATCH_HORIZONTAL_REPS : volumeTier.reps));
    reps = repRange.min + Math.floor(Math.random() * (repRange.max - repRange.min + 1));
    repsRange = { min: repRange.min, max: repRange.max };

    // ABSOLUTE SKILL CEILING mirror (assignVolume ~768-801): hard/elite and
    // skill-priority exercises never exceed 5 reps.
    const isSkillPriority = classifyPriority(newExercise) === 'skill';
    if (isSkillPriority || isAboveLevelTier) {
      const SKILL_REP_CEILING = 5;
      if (reps > SKILL_REP_CEILING) reps = SKILL_REP_CEILING;
      if (repsRange.max > SKILL_REP_CEILING) {
        repsRange = { min: Math.min(repsRange.min, SKILL_REP_CEILING), max: SKILL_REP_CEILING };
      }
    }
  }

  let restSeconds = tier.rest.min + Math.floor(Math.random() * (tier.rest.max - tier.rest.min + 1));
  const blastRestMultiplier = intentMode === 'blast' ? 0.5 : 1;
  if (tierName !== 'elite') {
    restSeconds = Math.round(restSeconds * blastRestMultiplier);
  }
  restSeconds = Math.max(restSeconds, restSafetyFloor(tier));

  return { isTimeBased, mechanicalType, reps, repsRange, restSeconds, tier: tierName };
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

  const compoundMin = budgetTight ? Math.max(2, setsPerExerciseWhenTight) : 3;
  const skillMin = budgetTight ? Math.max(2, setsPerExerciseWhenTight) : 2;

  const reductionOrder: ExercisePriority[] = ['isolation', 'accessory', 'skill', 'compound', 'foundation'];
  const minSetsByPriority: Record<ExercisePriority, number> = {
    isolation: 2,
    accessory: 2,
    compound: compoundMin,
    foundation: compoundMin,
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

// Warmup timing constants
// Warmup exercises are performed as a continuous flow circuit — no seated
// rest between movements, just a brief transition shuffle.  Inflating warmup
// time with 30s transitions and per-set rest was adding 10–18 phantom minutes.
const WARMUP_REST_PER_EXERCISE_SEC = 0;       // no rest between warmup sets
const WARMUP_TRANSITION_SEC        = 5;       // 5 s shuffle between warmup items
const WARMUP_WORK_SEC_PER_SLOT     = 60;      // ~60 s per warmup slot (1 set)
const WARMUP_BLOCK_CAP_SEC         = 6 * 60;  // hard cap: warmup ≤ 6 min

export function calculateEstimatedDuration(exercises: WorkoutExercise[]): number {
  // Section accumulators for detailed breakdown
  let rawWarmupSec   = 0;
  let mainWorkSec    = 0; let mainRestSec    = 0;
  let cooldownWorkSec = 0; let cooldownRestSec = 0;

  // Per-exercise detail rows for the console table
  const rows: Array<{ role: string; name: string; sets: number; workSec: number; restSec: number }> = [];

  const warmupExercises:  WorkoutExercise[] = [];
  const cooldownExercises: WorkoutExercise[] = [];
  const tabataMembers:     WorkoutExercise[] = [];

  for (const ex of exercises) {
    const role = ex.exerciseRole ?? 'main';

    // ── Tabata block members (Stage 3.1) ───────────────────────────────────
    // The block's wall-clock is a fixed (work+rest)×rounds constant — sets
    // and reps of the members are IRRELEVANT to its duration. Collect and
    // price once after the loop; per-set math here would double-count.
    if (ex.protocolBlock === 'tabata') {
      tabataMembers.push(ex);
      continue;
    }

    if (role === 'warmup') {
      warmupExercises.push(ex);
      continue;
    }

    if (role === 'cooldown') {
      cooldownExercises.push(ex);
      // Work seconds — flat 90 s per cooldown slot (follow-along / mobility)
      const exWorkSec  = 90;
      const exRestSec  = ex.sets * ex.restSeconds;
      cooldownWorkSec += exWorkSec;
      cooldownRestSec += exRestSec;
      rows.push({ role, name: (ex.exercise.name as any)?.he ?? ex.exercise.id, sets: ex.sets, workSec: exWorkSec, restSec: exRestSec });
      continue;
    }

    // Main exercise
    const secPerRep      = ex.exercise.secondsPerRep ?? 3;
    const setTime        = ex.isTimeBased ? ex.reps : ex.reps * secPerRep;
    const sideMultiplier = ex.exercise.symmetry === 'unilateral' ? 2 : 1;
    const exWorkSec      = ex.sets * setTime * sideMultiplier;
    // Rest seconds — full staircase value, no cap.
    const exRestSec      = ex.sets * ex.restSeconds;
    mainWorkSec += exWorkSec;
    mainRestSec += exRestSec;
    rows.push({ role, name: (ex.exercise.name as any)?.he ?? ex.exercise.id, sets: ex.sets, workSec: exWorkSec, restSec: exRestSec });
  }

  // ── Warmup block: 0 rest, 5 s transitions, hard-capped at 6 min ─────────
  // Each warmup slot = WARMUP_WORK_SEC_PER_SLOT seconds of active work.
  // Transition time shrinks from the standard 30 s to 5 s (flow circuit).
  if (warmupExercises.length > 0) {
    const rawWork = warmupExercises.length * WARMUP_WORK_SEC_PER_SLOT;
    const rawTrans = (warmupExercises.length - 1) * WARMUP_TRANSITION_SEC;
    rawWarmupSec = Math.min(rawWork + rawTrans, WARMUP_BLOCK_CAP_SEC);

    for (const ex of warmupExercises) {
      rows.push({
        role: 'warmup',
        name: (ex.exercise.name as any)?.he ?? ex.exercise.id,
        sets: ex.sets,
        workSec: WARMUP_WORK_SEC_PER_SLOT,
        restSec: WARMUP_REST_PER_EXERCISE_SEC,
      });
    }
  }

  // ── Tabata block: one fixed cost, regardless of member count ────────────
  let tabataBlockSec = 0;
  if (tabataMembers.length > 0) {
    tabataBlockSec = TABATA_BLOCK_SECONDS;
    rows.push({
      role: 'tabata',
      name: `בלוק טבטה (${tabataMembers.length} תרגילים)`,
      sets: TABATA_CLASSIC.rounds,
      workSec: TABATA_CLASSIC.workSec * TABATA_CLASSIC.rounds,
      restSec: TABATA_CLASSIC.restSec * TABATA_CLASSIC.rounds,
    });
  }

  // ── Transitions: warmup items use 5 s; all others use 30 s ──────────────
  // The tabata block counts as ONE unit (members flow 20/10 internally).
  const mainAndCooldownExercises = exercises.filter(ex =>
    (ex.exerciseRole ?? 'main') !== 'warmup' && ex.protocolBlock !== 'tabata');
  const transitionUnits = mainAndCooldownExercises.length + (tabataMembers.length > 0 ? 1 : 0);
  const mainTransitionSeconds = transitionUnits > 1 ? (transitionUnits - 1) * 30 : 0;

  const totalSeconds = rawWarmupSec + mainWorkSec + mainRestSec + cooldownWorkSec + cooldownRestSec + tabataBlockSec;
  const finalSeconds = totalSeconds + mainTransitionSeconds;
  const finalMinutes = Math.ceil(finalSeconds / 60);

  const fmt = (s: number) => `${Math.round(s / 60)}m ${s % 60}s`;

  console.group('[Duration Math Formulation]');
  console.log(
    `┌─────────────┬────────────┬────────────┬────────────┐\n` +
    `│  Section    │  Work      │  Rest      │  Subtotal  │\n` +
    `├─────────────┼────────────┼────────────┼────────────┤\n` +
    `│  Warmup     │ ${fmt(rawWarmupSec).padEnd(10)} │ ${('0m 0s').padEnd(10)} │ ${fmt(rawWarmupSec).padEnd(10)} │  ← 0s rest, 5s transitions, cap=${WARMUP_BLOCK_CAP_SEC / 60}m\n` +
    `│  Main       │ ${fmt(mainWorkSec).padEnd(10)} │ ${fmt(mainRestSec).padEnd(10)} │ ${fmt(mainWorkSec + mainRestSec).padEnd(10)} │  ← ${Math.round(mainRestSec / 60)}m rest = ${mainWorkSec > 0 ? Math.round(mainRestSec / (mainWorkSec + mainRestSec) * 100) : 0}% of main block\n` +
    `│  Cooldown   │ ${fmt(cooldownWorkSec).padEnd(10)} │ ${fmt(cooldownRestSec).padEnd(10)} │ ${fmt(cooldownWorkSec + cooldownRestSec).padEnd(10)} │\n` +
    `├─────────────┼────────────┼────────────┼────────────┤\n` +
    `│  TOTAL(raw) │             │             │ ${fmt(totalSeconds).padEnd(10)} │\n` +
    `└─────────────┴────────────┴────────────┴────────────┘`,
  );
  console.log(`  + Main transitions (${mainAndCooldownExercises.length - 1} × 30s): ${mainTransitionSeconds}s`);
  console.log(`  = Final Duration: ${finalMinutes} min`);

  if (rows.length > 0) {
    console.groupCollapsed('[Duration] Per-exercise breakdown');
    console.table(
      rows.map(r => ({
        role: r.role,
        name: r.name,
        sets: r.sets,
        'work (s)': r.workSec,
        'rest (s)': r.restSec,
        'total (s)': r.workSec + r.restSec,
      })),
    );
    console.groupEnd();
  }

  console.groupEnd();

  return finalMinutes;
}

// ============================================================================
// ISOMETRIC TIME CAP
// ============================================================================

/**
 * Returns the maximum physiologically appropriate hold duration (seconds)
 * for an isometric exercise, based on movement group, Hebrew name, and level.
 *
 * Tier 1 — Grip / Shoulder Health / Balance Exemption (45 s ceiling):
 *   Handstands, dead/active hangs ('תלייה'), and the 'hang' movementGroup
 *   need sustained TUT for balance, shoulder health and grip endurance.
 *   They bypass all neural caps regardless of level.
 *   'עמידת ידיים' is included here so free handstand exercises (which may
 *   be filed under 'vertical_push' or 'handstand_pushup' in Firestore) are
 *   treated as balance/endurance rather than structural lever work.
 *
 * Tier 2 — Elite Neural-Skill Cap (15 s ceiling):
 *   Dedicated movement groups (planche, front_lever, human_flag,
 *   one_arm_pullup, handstand_pushup, pullup) plus a Hebrew name heuristic
 *   for exercises whose Firestore docs are mis-categorised under generic
 *   groups like 'horizontal_push' (e.g. 'פלאנץ׳ בטאק מתקדם').  Any
 *   exercise at level ≥ 8 that doesn't qualify for the Tier-1 exemption
 *   is also capped here.
 *
 * Tier 3 — Standard Conditioning Ceiling (45 s):
 *   Core holds (plank, hollow body, L-sit), hip hinges, and base-level
 *   isometrics default to the conventional conditioning cap.
 */
export function getIsometricTimeCap(exercise: Exercise): number {
  const mg = exercise.movementGroup ?? '';
  const nameHe = (exercise.name as any)?.he ?? '';

  // Tier 1 — Grip, Shoulder Health & Balance Exemption.
  // 'עמידת ידיים' handles free handstands (balance / endurance TUT).
  if (
    mg === 'handstand' ||
    mg === 'hang' ||
    nameHe.includes('תלייה') ||
    nameHe.includes('עמידת ידיים')
  ) {
    return 45;
  }

  // Tier 2 — Elite Neurological Levers & Heavy Lock-offs.
  const eliteSkillGroups = [
    'planche',
    'front_lever',
    'human_flag',
    'one_arm_pullup',
    'handstand_pushup',
    'pullup',
  ];

  // Hebrew name heuristic — catches exercises filed under generic Firestore
  // movement groups (e.g. 'horizontal_push') that are physiologically elite
  // skill levers.  Substrings are prefix-safe in Hebrew morphology:
  //   'פלאנץ' matches 'פלאנץ׳', 'פלאנץ בטאק', 'פלאנץ׳ מתקדם' etc.
  //   'פרונט'  matches 'פרונט לבר', 'פרונט לוור' variants.
  //   'דגל'    matches 'דגל אנושי', 'דגלון קדמי/אחורי' (front/back lever).
  //   'יד אחת' matches 'מתח יד אחת', 'שכיבה יד אחת' etc.
  const isEliteSkillName =
    nameHe.includes('פלאנץ') ||
    nameHe.includes('פרונט') ||
    nameHe.includes('דגל') ||
    nameHe.includes('יד אחת');

  // Fallback level resolution: some Firestore docs carry a flat `level` field
  // on the document root in addition to (or instead of) `targetPrograms`.
  const level = (exercise as any).level ?? exercise.targetPrograms?.[0]?.level ?? 0;

  if (eliteSkillGroups.includes(mg) || level >= 8 || isEliteSkillName) {
    return 15;
  }

  // Tier 3 — Standard fallback for base conditioning and core holds.
  return 45;
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
