/**
 * Warmup Service
 *
 * Prepends domain-matched movement-preparation exercises to a generated
 * workout. Selects one general mobility drill plus one L1-L2 strength
 * regression per child domain present in the main workout.
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks.
 */

import { Exercise, ExecutionLocation } from '@/features/content/exercises/core/exercise.types';
import {
  type GeneratedWorkout,
  type WorkoutExercise,
} from '../logic/WorkoutGenerator';
import { exerciseMatchesProgram } from './shadow-level.utils';
import { FULL_BODY_CHILD_DOMAINS } from './program-hierarchy.utils';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Warmup Zone (Sprint 4):
 *   Level 1–2: General Mobility ONLY — no regressions, no potentiation.
 *   Level 3+:  MaxWarmupLevel = UserLevel − 2 (min 1).
 *              Primes the CNS without causing fatigue.
 */
function getWarmupZone(userLevel: number): { min: number; max: number } {
  if (userLevel <= 2) return { min: 0, max: 0 }; // sentinel: caller skips B & C
  const max = Math.max(1, userLevel - 2);
  const min = 1;
  return { min, max };
}

/** Warmup reps for blood flow (no fatigue) */
const WARMUP_REPS = 15;

/** Warmup hold seconds for time-based exercises */
const WARMUP_HOLD_SECONDS = { min: 30, max: 45 };

/** Short rest between warmup exercises (seconds) */
const WARMUP_REST_SECONDS = 15;

/** Gear IDs to exclude from warmup (bands, TRX, personal gear) */
const BANNED_WARMUP_GEAR_IDS = new Set(['I1K30JehaxSx8dlBOZyd', '7gLOFEfgSvInu7lfLHxV']);

// ============================================================================
// SESSION-LOCAL VARIETY GUARD
// Tracks warmup IDs picked in the current browser session (survives refreshes
// until page reload). Prevents the same warmup from appearing on consecutive
// regenerations even without a DB save.
// ============================================================================
const _recentWarmupIds = new Set<string>();
const WARMUP_MEMORY_LIMIT = 12;

function recordWarmupPick(id: string) {
  _recentWarmupIds.add(id);
  if (_recentWarmupIds.size > WARMUP_MEMORY_LIMIT) {
    const first = _recentWarmupIds.values().next().value;
    if (first) _recentWarmupIds.delete(first);
  }
}

/**
 * Pick the best candidate from an array using jitter + variety guard.
 * Variety penalty: -20 for exercises used in recent warmup picks.
 * Jitter: 0-30 random bonus for healthy randomization.
 */
function pickWithVariety(candidates: Exercise[]): Exercise | undefined {
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  const scored = candidates.map(ex => {
    let score = Math.floor(Math.random() * 31); // jitter 0-30
    if (_recentWarmupIds.has(ex.id)) score -= 20;  // variety guard
    return { ex, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].ex;
}

// ============================================================================
// EQUIPMENT CHECK (shared with cooldown.service.ts)
// ============================================================================

export function isWarmupEquipmentAllowed(gearIds: (string | undefined)[], equipmentIds: (string | undefined)[]): boolean {
  const all = [...gearIds, ...equipmentIds].filter((id): id is string => Boolean(id));
  if (all.length === 0) return true;
  const lower = (id: string) => String(id).toLowerCase();
  return all.every((id) => {
    if (lower(id) === 'bodyweight' || lower(id) === 'none') return true;
    if (BANNED_WARMUP_GEAR_IDS.has(id)) return false;
    if (lower(id).includes('band') || lower(id).includes('trx')) return false;
    return true;
  });
}

// ============================================================================
// WARMUP PREPEND
// ============================================================================

/** Max potentiation warmups to add (movement-group-matched) */
const MAX_POTENTIATION_WARMUPS = 2;

/**
 * Check if an exercise qualifies as a potentiation warmup candidate:
 * either tagged as warmup/mobility, or within the Warmup Zone for the user's level.
 */
function isPotentiationCandidate(ex: Exercise, userLevel: number): boolean {
  if (ex.exerciseRole === 'warmup') return true;
  if ((ex.tags as string[] ?? []).includes('mobility')) return true;
  const level = ex.recommendedLevel ?? ex.targetPrograms?.[0]?.level ?? 99;
  if (typeof level !== 'number') return false;
  const zone = getWarmupZone(userLevel);
  return level >= zone.min && level <= zone.max;
}

/**
 * Perfect Warmup Recipe:
 *   Part A: EXACTLY 1 general warmup (exerciseRole === 'warmup' OR tags.includes('mobility'))
 *   Part B: Potentiation — up to 2 exercises matching exact movementGroups from main workout
 *   Part C: Domain regression — 1 exercise in the Warmup Zone (30%-70% of user level) per domain NOT already primed
 *   ALL: bodyweight or basic park bars (no bands/TRX)
 *   ALL: session-local variety guard + jitter for healthy refresh variety
 */
export function prependWarmupExercises(
  workout: GeneratedWorkout,
  allExercises: Exercise[],
  userProgramLevels: Map<string, number>,
  location: ExecutionLocation,
  resolvedChildDomains: string[],
  selectedMainExercises?: WorkoutExercise[],
): void {
  const mainExercises = selectedMainExercises
    ?? workout.exercises.filter((ex) => ex.exerciseRole !== 'warmup' && ex.exerciseRole !== 'cooldown');
  if (mainExercises.length === 0) return;

  const workoutIds = new Set(workout.exercises.map((e) => e.exercise.id));
  const warmupBlock: WorkoutExercise[] = [];

  const addToBlock = (ex: Exercise, reason: string) => {
    const methods = ex.execution_methods || ex.executionMethods || [];
    const method = methods.find((m) => m.location === location || m.location === 'home' || m.locationMapping?.includes(location)) ?? methods[0];
    if (!method) return;
    const isTimeBased = ex.type === 'time' || ex.mechanicalType === 'straight_arm';
    const reps = isTimeBased
      ? WARMUP_HOLD_SECONDS.min + Math.floor(Math.random() * (WARMUP_HOLD_SECONDS.max - WARMUP_HOLD_SECONDS.min + 1))
      : WARMUP_REPS;
    const warmupExercise = { ...ex, exerciseRole: 'warmup' as const };
    warmupBlock.push({
      exercise: warmupExercise,
      method,
      mechanicalType: (ex.mechanicalType || 'none') as any,
      sets: 1,
      reps,
      repsRange: isTimeBased ? { min: WARMUP_HOLD_SECONDS.min, max: WARMUP_HOLD_SECONDS.max } : { min: WARMUP_REPS, max: WARMUP_REPS },
      isTimeBased,
      restSeconds: WARMUP_REST_SECONDS,
      priority: 'accessory' as const,
      score: 0,
      reasoning: [reason],
      exerciseRole: 'warmup' as const,
    });
    workoutIds.add(ex.id);
  };

  /** Location-aware equipment filter reused by all parts */
  const passesEquipmentAndLocation = (ex: Exercise): boolean => {
    const methods = ex.execution_methods || ex.executionMethods || [];
    const method = methods.find((m) => m.location === location || m.location === 'home' || m.locationMapping?.includes(location));
    if (!method) return false;
    const gearIds = method.gearIds ?? method.gearId ? [method.gearId] : [];
    const equipmentIds = method.equipmentIds ?? method.equipmentId ? [method.equipmentId] : [];
    return isWarmupEquipmentAllowed(gearIds, equipmentIds);
  };

  // -- Part A: EXACTLY 1 general warmup (mobility / joint rotations) --
  const generalCandidates = allExercises.filter((ex) => {
    if (workoutIds.has(ex.id)) return false;
    const isGeneral = ex.exerciseRole === 'warmup' || (ex.tags as string[] ?? []).includes('mobility');
    if (!isGeneral) return false;
    return passesEquipmentAndLocation(ex);
  });
  if (generalCandidates.length > 0) {
    const chosen = pickWithVariety(generalCandidates)!;
    addToBlock(chosen, 'warmup: general mobility');
    recordWarmupPick(chosen.id);
    console.log(`[Warmup Variety] General: picked "${chosen.name?.he ?? chosen.id}" from ${generalCandidates.length} candidates`);
  }

  // Derive a representative user level for potentiation (max across all domains)
  const maxUserLevel = userProgramLevels.size > 0
    ? Math.max(...Array.from(userProgramLevels.values()))
    : 1;

  // Sprint 4: Level 1–2 users get ONLY General Mobility — skip Parts B & C
  const globalWarmupZone = getWarmupZone(maxUserLevel);
  const skipPotentiationAndRegression = globalWarmupZone.max === 0;

  if (skipPotentiationAndRegression) {
    console.log(`[Warmup] Level ${maxUserLevel} ≤ 2 → General Mobility only (no potentiation/regression)`);
  }

  // -- Part B: Potentiation — match exact movementGroups from main workout --
  const targetMovementGroups = new Set<string>();
  for (const ex of mainExercises) {
    if (ex.exercise.movementGroup) targetMovementGroups.add(ex.exercise.movementGroup);
  }

  const primedMovementGroups = new Set<string>();
  let potentiationCount = 0;

  if (!skipPotentiationAndRegression) {
    for (const mg of Array.from(targetMovementGroups)) {
      if (potentiationCount >= MAX_POTENTIATION_WARMUPS) break;

      const candidates = allExercises.filter((ex) => {
        if (workoutIds.has(ex.id)) return false;
        if (ex.movementGroup !== mg) return false;
        if (!isPotentiationCandidate(ex, maxUserLevel)) return false;
        return passesEquipmentAndLocation(ex);
      });

      if (candidates.length === 0) continue;

      const warmupTagged = candidates.filter(e => e.exerciseRole === 'warmup');
      const pool = warmupTagged.length > 0 ? warmupTagged : candidates;
      const chosen = pickWithVariety(pool)!;
      addToBlock(chosen, `warmup: potentiation (${mg})`);
      recordWarmupPick(chosen.id);
      primedMovementGroups.add(mg);
      potentiationCount++;
      console.log(`[Warmup Variety] Potentiation (${mg}): picked "${chosen.name?.he ?? chosen.id}" from ${pool.length} candidates`);
    }

    if (potentiationCount > 0) {
      console.log(`[HomeWorkout] Potentiation: ${potentiationCount} movement-group-matched warmups for [${Array.from(primedMovementGroups).join(', ')}]`);
    }
  }

  // -- Part C: Domain regression — 1 exercise in the Warmup Zone per domain NOT already primed --
  if (!skipPotentiationAndRegression) {
    const domainsInWorkout = new Set<string>();
    const domains = resolvedChildDomains.length > 0 ? resolvedChildDomains : [...FULL_BODY_CHILD_DOMAINS];
    for (const domain of domains) {
      if (mainExercises.some((ex) => exerciseMatchesProgram(ex.exercise, domain))) {
        domainsInWorkout.add(domain);
      }
    }

    for (const domain of Array.from(domainsInWorkout)) {
      const domainMainExercises = mainExercises.filter((ex) => exerciseMatchesProgram(ex.exercise, domain));
      const domainMGs = domainMainExercises.map((ex) => ex.exercise.movementGroup).filter(Boolean) as string[];
      if (domainMGs.length > 0 && domainMGs.every((mg) => primedMovementGroups.has(mg))) continue;

      const domainUserLevel = userProgramLevels.get(domain) ?? maxUserLevel;
      const zone = getWarmupZone(domainUserLevel);
      if (zone.max === 0) continue; // L1–2 child domain → skip

      const candidates = allExercises.filter((ex) => {
        if (workoutIds.has(ex.id)) return false;
        if (!exerciseMatchesProgram(ex, domain)) return false;
        const level = ex.targetPrograms?.find((tp) => tp.programId === domain)?.level ?? ex.recommendedLevel ?? 99;
        if (typeof level !== 'number' || level < zone.min || level > zone.max) return false;
        return passesEquipmentAndLocation(ex);
      });
      if (candidates.length === 0) continue;
      const chosen = pickWithVariety(candidates)!;
      const chosenLvl = chosen.targetPrograms?.find((tp) => tp.programId === domain)?.level ?? '?';
      addToBlock(chosen, `warmup: ${domain} regression (L${zone.min}–L${zone.max})`);
      recordWarmupPick(chosen.id);
      console.log(`[Warmup Variety] Regression (${domain} L${domainUserLevel}→zone L${zone.min}–${zone.max}): picked "${chosen.name?.he ?? chosen.id}" L${chosenLvl} from ${candidates.length} candidates`);
    }
  }

  if (warmupBlock.length > 0) {
    workout.exercises.unshift(...warmupBlock);
    console.log(`[HomeWorkout] Warmup: 1 general + ${potentiationCount} potentiation + ${warmupBlock.length - 1 - potentiationCount} domain regressions`);
  }
}
