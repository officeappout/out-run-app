/**
 * Shadow Level Utilities
 *
 * Implements the Shadow Tracking Matrix: per-movement-group and per-muscle-group
 * level resolution for the workout engine.
 *
 * Priority cascade (5 steps):
 *   0. Program override       → shadowMatrix.programs[programId] (HIGHEST)
 *   1. Global override        → shadowMatrix.globalLevel
 *   2. MovementGroup override → shadowMatrix.movementGroups[group].level
 *   3. MuscleGroup override   → shadowMatrix.muscleGroups[muscle].level
 *   4. Normal Shadow Tracking → userProfile.progression.domains.[domain].currentLevel
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs.
 *
 * @see TRAINING_LOGIC.md Rule 2.2 (Shadow Tracking Matrix)
 * @see HOME_WORKOUT_SERVICE_FINAL_ARCHITECTURE.md Part 1
 */

import {
  Exercise,
  MovementGroup,
  MuscleGroup,
} from '@/features/content/exercises/core/exercise.types';
import { UserFullProfile, TrainingDomainId } from '@/features/user/core/types/user.types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Per-group level override entry (used in both movementGroups and muscleGroups maps).
 */
export interface LevelOverride {
  /** The override level (1-20) */
  level: number;
  /** Whether this override is active */
  override: boolean;
}

/**
 * Per-program level override entry.
 * Programs are the HIGHEST PRIORITY in the cascade (above Global).
 */
export interface ProgramLevelOverride extends LevelOverride {
  /** Program domain ID (e.g., 'upper_body', 'pulling', 'pushing') */
  programId: string;
}

/**
 * Shadow Matrix — QA / dev-testing level override structure.
 *
 * When provided to the workout service, it allows overriding the
 * user's real domain levels for specific movement or muscle groups.
 *
 * Priority cascade (5 steps):
 *   0. Program override       → shadowMatrix.programs[id] (HIGHEST)
 *   1. Global override        → shadowMatrix.globalLevel
 *   2. MovementGroup override → shadowMatrix.movementGroups[group].level
 *   3. MuscleGroup override   → shadowMatrix.muscleGroups[muscle].level
 *   4. Normal Shadow Tracking → userProfile.progression.domains
 */
export interface ShadowMatrix {
  /** If true, every exercise uses `globalLevel` regardless of group. */
  useGlobalLevel: boolean;
  /** The single level applied when `useGlobalLevel === true`. */
  globalLevel: number;

  /** Per-movement-group overrides (8 groups). */
  movementGroups: Record<MovementGroup, LevelOverride>;

  /** Per-muscle-group overrides (up to 19 groups). */
  muscleGroups: Partial<Record<MuscleGroup, LevelOverride>>;

  /**
   * Per-program level overrides (HIGHEST PRIORITY).
   * Keys: 'pulling', 'pushing', 'core', 'upper_body', 'full_body'
   * When an exercise's programIds includes a key with override=true,
   * that level is used before anything else.
   */
  programs: Record<string, LevelOverride>;
}

// ============================================================================
// MOVEMENT-GROUP → DOMAIN MAPPING
// ============================================================================

/** Upper-body movement groups */
const UPPER_BODY_MOVEMENTS: MovementGroup[] = [
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
];

/** Lower-body movement groups */
const LOWER_BODY_MOVEMENTS: MovementGroup[] = ['squat', 'hinge'];

/** Muscles that map to upper_body domain */
const UPPER_BODY_MUSCLES: MuscleGroup[] = [
  'chest',
  'back',
  'middle_back',
  'shoulders',
  'rear_delt',
  'biceps',
  'triceps',
  'traps',
  'forearms',
];

/** Muscles that map to lower_body domain */
const LOWER_BODY_MUSCLES: MuscleGroup[] = [
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'legs',
];

/** Muscles that map to core domain */
const CORE_MUSCLES: MuscleGroup[] = ['abs', 'obliques', 'core'];

// ============================================================================
// PROGRAM → EXERCISE MATCHING (for Step 0)
// ============================================================================

/**
 * Maps each shadow-matrix program key to the movement groups it covers.
 * This allows program overrides to match exercises by their actual
 * movementGroup / primaryMuscle rather than relying on the (often empty)
 * exercise.programIds array.
 */
const PROGRAM_MOVEMENT_MAP: Record<string, MovementGroup[]> = {
  pulling: ['horizontal_pull', 'vertical_pull'],
  pushing: ['horizontal_push', 'vertical_push'],
  core:    ['core'],
  upper_body: ['horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull', 'isolation'],
  // full_body matches everything — handled separately
};

const PROGRAM_MUSCLE_MAP: Record<string, MuscleGroup[]> = {
  core: ['abs', 'obliques', 'core'],
  upper_body: ['chest', 'back', 'middle_back', 'shoulders', 'rear_delt', 'biceps', 'triceps', 'traps', 'forearms'],
  // pulling maps to back muscles as secondary match
  pulling: ['back', 'middle_back', 'biceps', 'rear_delt'],
  // pushing maps to push muscles as secondary match
  pushing: ['chest', 'shoulders', 'triceps'],
};

/**
 * Check if an exercise matches a given program key.
 * Matching order:
 *   1. Explicit exercise.programIds includes the key
 *   2. Exercise movementGroup is in the program's movement map
 *   3. Exercise primaryMuscle is in the program's muscle map
 *   4. 'full_body' matches everything
 */
export function exerciseMatchesProgram(exercise: Exercise, programKey: string): boolean {
  // Explicit programIds match
  if (exercise.programIds?.includes(programKey)) return true;

  // 'full_body' is a universal override
  if (programKey === 'full_body') return true;

  // Match by movementGroup
  const movementGroup = exercise.movementGroup;
  if (movementGroup && PROGRAM_MOVEMENT_MAP[programKey]?.includes(movementGroup)) {
    return true;
  }

  // Match by primaryMuscle
  const primaryMuscle = exercise.primaryMuscle;
  if (primaryMuscle && PROGRAM_MUSCLE_MAP[programKey]?.includes(primaryMuscle)) {
    return true;
  }

  return false;
}

// ============================================================================
// CORE FUNCTION
// ============================================================================

/**
 * Resolve the effective user level for a specific exercise.
 *
 * Implements the 5-step priority cascade:
 *   0. Program ShadowMatrix override  (HIGHEST PRIORITY)
 *      Matches by movementGroup / primaryMuscle / programIds
 *   1. Global ShadowMatrix override
 *   2. MovementGroup ShadowMatrix override
 *   3. MuscleGroup ShadowMatrix override
 *   4. Normal domain-based Shadow Tracking from user profile
 *
 * @param exercise      The exercise whose level is being resolved.
 * @param userProfile   The full user profile (contains progression.domains).
 * @param shadowMatrix  Optional QA-testing override structure.
 * @returns             Effective level (1-20+) for this exercise.
 */
export function getEffectiveLevelForExercise(
  exercise: Exercise,
  userProfile: UserFullProfile,
  shadowMatrix?: ShadowMatrix,
): number {
  const exerciseName = typeof exercise.name === 'string'
    ? exercise.name
    : (exercise.name?.he || exercise.name?.en || exercise.id);

  // ── Step 0: Program override (HIGHEST PRIORITY) ─────────────────────────
  // Matches exercises by movementGroup / primaryMuscle classification,
  // NOT just the (often empty) exercise.programIds field.
  if (shadowMatrix?.programs) {
    for (const [programKey, po] of Object.entries(shadowMatrix.programs)) {
      if (po?.override && exerciseMatchesProgram(exercise, programKey)) {
        console.log(
          `[ShadowLevel] PROGRAM OVERRIDE: "${exerciseName}" → ` +
          `program="${programKey}" level=${po.level} ` +
          `(movementGroup=${exercise.movementGroup}, muscle=${exercise.primaryMuscle})`
        );
        return po.level;
      }
    }
  }

  // ── Step 1: Global override ─────────────────────────────────────────────
  if (shadowMatrix?.useGlobalLevel) {
    console.log(
      `[ShadowLevel] GLOBAL OVERRIDE: "${exerciseName}" → level=${shadowMatrix.globalLevel}`
    );
    return shadowMatrix.globalLevel;
  }

  // ── Step 2: MovementGroup override ──────────────────────────────────────
  const movementGroup = exercise.movementGroup;
  if (movementGroup && shadowMatrix?.movementGroups?.[movementGroup]?.override) {
    const level = shadowMatrix.movementGroups[movementGroup].level;
    console.log(
      `[ShadowLevel] MOVEMENT OVERRIDE: "${exerciseName}" → ` +
      `group="${movementGroup}" level=${level}`
    );
    return level;
  }

  // ── Step 3: MuscleGroup override ────────────────────────────────────────
  const primaryMuscle = exercise.primaryMuscle;
  if (primaryMuscle && shadowMatrix?.muscleGroups?.[primaryMuscle]?.override) {
    const level = shadowMatrix.muscleGroups[primaryMuscle]!.level;
    console.log(
      `[ShadowLevel] MUSCLE OVERRIDE: "${exerciseName}" → ` +
      `muscle="${primaryMuscle}" level=${level}`
    );
    return level;
  }

  // ── Step 4: Normal Shadow Tracking (domain-based) ──────────────────────
  const domainLevel = mapMovementGroupToDomainLevel(exercise, userProfile);
  console.log(
    `[ShadowLevel] DOMAIN (default): "${exerciseName}" → level=${domainLevel} ` +
    `(movementGroup=${movementGroup}, muscle=${primaryMuscle})`
  );
  return domainLevel;
}

// ============================================================================
// DOMAIN MAPPING (Internal)
// ============================================================================

/**
 * Map an exercise's movementGroup → the appropriate domain level from the
 * user's progression system.
 *
 * @see TRAINING_LOGIC.md Rule 2.2
 */
function mapMovementGroupToDomainLevel(
  exercise: Exercise,
  userProfile: UserFullProfile,
): number {
  const movementGroup = exercise.movementGroup;
  const domains = userProfile.progression?.domains ?? {};

  if (movementGroup) {
    // Push / Pull → upper_body
    if (UPPER_BODY_MOVEMENTS.includes(movementGroup)) {
      return getDomainLevel(domains, 'upper_body');
    }

    // Squat / Hinge → lower_body
    if (LOWER_BODY_MOVEMENTS.includes(movementGroup)) {
      return getDomainLevel(domains, 'lower_body');
    }

    // Core → core
    if (movementGroup === 'core') {
      return getDomainLevel(domains, 'core');
    }

    // Isolation → determine from primaryMuscle
    if (movementGroup === 'isolation') {
      return mapIsolationMuscleToDomainLevel(exercise.primaryMuscle, domains);
    }
  }

  // Fallback: try to infer from primaryMuscle even without movementGroup
  if (exercise.primaryMuscle) {
    return mapIsolationMuscleToDomainLevel(exercise.primaryMuscle, domains);
  }

  // Ultimate fallback
  return getDomainLevel(domains, 'full_body') || getDomainLevel(domains, 'upper_body') || 1;
}

/**
 * Map an isolation exercise's primaryMuscle to the correct domain level.
 */
function mapIsolationMuscleToDomainLevel(
  primaryMuscle: MuscleGroup | undefined,
  domains: UserFullProfile['progression']['domains'],
): number {
  if (!primaryMuscle) {
    return getDomainLevel(domains, 'full_body') || 1;
  }

  if (UPPER_BODY_MUSCLES.includes(primaryMuscle)) {
    return getDomainLevel(domains, 'upper_body');
  }

  if (LOWER_BODY_MUSCLES.includes(primaryMuscle)) {
    return getDomainLevel(domains, 'lower_body');
  }

  if (CORE_MUSCLES.includes(primaryMuscle)) {
    return getDomainLevel(domains, 'core');
  }

  // Misc (cardio, full_body, etc.)
  return getDomainLevel(domains, 'full_body') || getDomainLevel(domains, 'upper_body') || 1;
}

// ============================================================================
// HELPER
// ============================================================================

/**
 * Safely read a domain's currentLevel (returns 1 if missing/undefined).
 */
function getDomainLevel(
  domains: UserFullProfile['progression']['domains'],
  domainId: TrainingDomainId,
): number {
  return domains[domainId]?.currentLevel ?? 1;
}

// ============================================================================
// FACTORY: Build a default (all-auto) ShadowMatrix
// ============================================================================

/** The 5 program IDs available in the Shadow Matrix */
export const SHADOW_PROGRAM_IDS = [
  { id: 'pulling', label: 'משיכה' },
  { id: 'pushing', label: 'דחיפה' },
  { id: 'core', label: 'ליבה' },
  { id: 'upper_body', label: 'פלג גוף עליון' },
  { id: 'full_body', label: 'כל הגוף' },
] as const;

/**
 * Create an empty ShadowMatrix with every override disabled.
 * Useful as the initial state of the QA Control Room modal.
 */
export function createDefaultShadowMatrix(): ShadowMatrix {
  const movementGroups = {} as Record<MovementGroup, LevelOverride>;
  const allMovements: MovementGroup[] = [
    'horizontal_push',
    'vertical_push',
    'horizontal_pull',
    'vertical_pull',
    'squat',
    'hinge',
    'core',
    'isolation',
  ];
  for (const mg of allMovements) {
    movementGroups[mg] = { level: 10, override: false };
  }

  const muscleGroups: Partial<Record<MuscleGroup, LevelOverride>> = {};
  const allMuscles: MuscleGroup[] = [
    'chest', 'back', 'middle_back', 'shoulders', 'rear_delt',
    'abs', 'obliques', 'forearms', 'biceps', 'triceps',
    'quads', 'hamstrings', 'glutes', 'calves', 'traps',
    'cardio', 'full_body', 'core', 'legs',
  ];
  for (const mg of allMuscles) {
    muscleGroups[mg] = { level: 10, override: false };
  }

  // Programs — highest priority overrides
  const programs: Record<string, LevelOverride> = {};
  for (const p of SHADOW_PROGRAM_IDS) {
    programs[p.id] = { level: 10, override: false };
  }

  return {
    useGlobalLevel: false,
    globalLevel: 10,
    movementGroups,
    muscleGroups,
    programs,
  };
}
