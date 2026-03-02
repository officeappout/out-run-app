/**
 * Shadow Level Utilities
 *
 * Implements the Shadow Tracking Matrix: per-movement-group and per-muscle-group
 * level resolution for the workout engine.
 *
 * Priority cascade (6 steps):
 *   0. Program override       → shadowMatrix.programs[programId] (HIGHEST)
 *   1. Global override        → shadowMatrix.globalLevel
 *   2. MovementGroup override → shadowMatrix.movementGroups[group].level
 *   3. MuscleGroup override   → shadowMatrix.muscleGroups[muscle].level
 *   4. User assessment level  → tracks/domains currentLevel (via targetPrograms match)
 *   5. Normal Shadow Tracking → userProfile.progression.domains.[domain].currentLevel
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
  getLocalizedText,
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
 * Priority cascade (6 steps):
 *   0. Program override       → shadowMatrix.programs[id] (HIGHEST)
 *   1. Global override        → shadowMatrix.globalLevel
 *   2. MovementGroup override → shadowMatrix.movementGroups[group].level
 *   3. MuscleGroup override   → shadowMatrix.muscleGroups[muscle].level
 *   4. User assessment level  → tracks/domains currentLevel (via targetPrograms match)
 *   5. Normal Shadow Tracking → userProfile.progression.domains
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
  // full_body child domains (static master)
  push:   ['horizontal_push', 'vertical_push'],
  pull:   ['horizontal_pull', 'vertical_pull'],
  legs:   ['squat', 'hinge'],
  // full_body matches everything — handled separately
};

const PROGRAM_MUSCLE_MAP: Record<string, MuscleGroup[]> = {
  core: ['abs', 'obliques', 'core'],
  upper_body: ['chest', 'back', 'middle_back', 'shoulders', 'rear_delt', 'biceps', 'triceps', 'traps', 'forearms'],
  pulling: ['back', 'middle_back', 'biceps', 'rear_delt'],
  pushing: ['chest', 'shoulders', 'triceps'],
  // full_body child domains
  push:  ['chest', 'shoulders', 'triceps'],
  pull:  ['back', 'middle_back', 'biceps', 'rear_delt'],
  legs:  ['quads', 'hamstrings', 'glutes', 'calves', 'legs'],
};

/**
 * Check if an exercise matches a given program key.
 * Matching order:
 *   1. Explicit exercise.programIds includes the key
 *   2. targetPrograms match
 *   3. programIds/targetPrograms includes 'lower_body' → matches 'legs'
 *   4. movementGroup is in the program's movement map (squat, hinge, lunge)
 *   5. primaryMuscle is in the program's muscle map
 *   6. 'full_body' matches everything
 */
export function exerciseMatchesProgram(exercise: Exercise, programKey: string): boolean {
  if (exercise.programIds?.includes(programKey)) return true;
  if (exercise.targetPrograms?.some((tp) => tp.programId === programKey)) return true;

  if (programKey === 'full_body') return true;

  // Legs: triple-fallback — movementGroup OR primaryMuscle OR name/tags string
  if (programKey === 'legs') {
    if (exercise.programIds?.includes('lower_body')) return true;
    if (exercise.targetPrograms?.some((tp) => tp.programId === 'lower_body')) return true;
    const mg = exercise.movementGroup;
    if (mg && ['squat', 'hinge', 'lunge'].includes(mg as string)) return true;
    const pm = exercise.primaryMuscle;
    if (pm && ['quads', 'hamstrings', 'glutes', 'calves', 'legs'].includes(pm)) return true;
    const nameStr = (getLocalizedText(exercise.name) ?? '').toLowerCase();
    const tagsStr = (exercise.tags ?? []).join(' ').toLowerCase();
    const combined = `${nameStr} ${tagsStr}`;
    if (['squat', 'סקוואט', 'legs', 'רגליים', 'lunge'].some((s) => combined.includes(s.toLowerCase()))) return true;
    return false;
  }

  // Core: triple-fallback — movementGroup OR primaryMuscle OR name/tags string
  if (programKey === 'core') {
    const mg = exercise.movementGroup;
    if (mg === 'core') return true;
    const pm = exercise.primaryMuscle;
    if (pm && ['abs', 'core', 'obliques'].includes(pm)) return true;
    if (exercise.programIds?.includes('core')) return true;
    if (exercise.targetPrograms?.some((tp) => tp.programId === 'core')) return true;
    const nameStr = (getLocalizedText(exercise.name) ?? '').toLowerCase();
    const tagsStr = (exercise.tags ?? []).join(' ').toLowerCase();
    const combined = `${nameStr} ${tagsStr}`;
    if (['core', 'plank', 'abs', 'בטן', 'פלאנק'].some((s) => combined.includes(s.toLowerCase()))) return true;
    return false;
  }

  const movementGroup = exercise.movementGroup;
  if (movementGroup && PROGRAM_MOVEMENT_MAP[programKey]?.includes(movementGroup)) {
    return true;
  }

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
 * Implements the 6-step priority cascade:
 *   0. Program ShadowMatrix override  (HIGHEST PRIORITY)
 *      Matches by movementGroup / primaryMuscle / programIds
 *   1. Global ShadowMatrix override
 *   2. MovementGroup ShadowMatrix override
 *   3. MuscleGroup ShadowMatrix override
 *   4. User assessment level (tracks/domains) via targetPrograms program match
 *   5. Normal domain-based Shadow Tracking from user profile
 *
 * BOTTOM-UP: Child domains (push, pull, legs, core) hold granular levels.
 * Only when a child domain is completely missing do we fall back to baseUserLevel.
 *
 * @param exercise       The exercise whose level is being resolved.
 * @param userProfile    The full user profile (contains progression.domains).
 * @param shadowMatrix   Optional QA-testing override structure.
 * @param baseUserLevel  Fallback when a child domain level is missing (default: 1).
 * @returns              Effective level (1-20+) for this exercise.
 */
export function getEffectiveLevelForExercise(
  exercise: Exercise,
  userProfile: UserFullProfile,
  shadowMatrix?: ShadowMatrix,
  baseUserLevel?: number,
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

  // ── Step 4: User assessment level via targetPrograms ──────────────────
  // When an exercise has targetPrograms matching the user's active programs,
  // resolve the level from the user's OWN progression (tracks > domains),
  // NOT the admin-assigned level on the exercise document. The admin level
  // is a content-classification tag; the user's assessment level is the
  // runtime driver.
  if (exercise.targetPrograms?.length) {
    const userDomains = userProfile.progression?.domains ?? {};
    const userTracks = userProfile.progression?.tracks ?? {};
    const activeIds = new Set<string>([
      ...Object.keys(userDomains),
      ...Object.keys(userTracks),
      ...(userProfile.progression?.activePrograms ?? []).map(p => p.templateId).filter(Boolean),
    ]);

    for (const tp of exercise.targetPrograms) {
      if (activeIds.has(tp.programId)) {
        const userLevel = userTracks[tp.programId]?.currentLevel
          ?? userDomains[tp.programId as TrainingDomainId]?.currentLevel
          ?? tp.level;
        console.log(
          `[ShadowLevel] TARGET PROGRAM: "${exerciseName}" → ` +
          `program="${tp.programId}" userLevel=${userLevel} (adminTag=${tp.level}) ` +
          `(movementGroup=${movementGroup}, muscle=${primaryMuscle})`
        );
        return userLevel;
      }
    }
  }

  // ── Step 5: Normal Shadow Tracking (domain-based) ──────────────────────
  const domainLevel = mapMovementGroupToDomainLevel(exercise, userProfile, baseUserLevel);
  console.log(
    `[ShadowLevel] DOMAIN (default): "${exerciseName}" → level=${domainLevel} ` +
    `(movementGroup=${movementGroup}, muscle=${primaryMuscle})`
  );
  return domainLevel;
}

// ============================================================================
// DOMAIN MAPPING (Internal)
// ============================================================================

/** Fallback when no domain level exists (prevents errors). */
const DEFAULT_LEVEL = 1;

/**
 * Map an exercise's movementGroup → the appropriate domain level from the
 * user's progression system. BOTTOM-UP: prefers child domains (push/pull/legs)
 * over parent (upper_body/lower_body). Falls back to baseUserLevel only when
 * the specific domain is completely missing.
 *
 * @see TRAINING_LOGIC.md Rule 2.2
 */
function mapMovementGroupToDomainLevel(
  exercise: Exercise,
  userProfile: UserFullProfile,
  baseUserLevel?: number,
): number {
  const movementGroup = exercise.movementGroup;
  const domains = userProfile.progression?.domains ?? {};
  const tracks = userProfile.progression?.tracks ?? {};
  const d = (id: string) => getDomainLevelIfExists(domains, id, tracks);
  const fallback = baseUserLevel ?? DEFAULT_LEVEL;

  if (movementGroup) {
    // Push movements: prefer granular 'push' over 'upper_body' (BOTTOM-UP)
    if (UPPER_BODY_MOVEMENTS.filter((mg) => mg.includes('push')).includes(movementGroup)) {
      return d('push') ?? d('upper_body') ?? fallback;
    }
    // Pull movements: prefer granular 'pull' over 'upper_body'
    if (UPPER_BODY_MOVEMENTS.filter((mg) => mg.includes('pull')).includes(movementGroup)) {
      return d('pull') ?? d('upper_body') ?? fallback;
    }
    // Other upper-body (isolation etc.)
    if (UPPER_BODY_MOVEMENTS.includes(movementGroup)) {
      return d('upper_body') ?? fallback;
    }

    // Squat / Hinge: prefer granular 'legs' over 'lower_body'
    if (LOWER_BODY_MOVEMENTS.includes(movementGroup)) {
      return d('legs') ?? d('lower_body') ?? fallback;
    }

    // Core → core
    if (movementGroup === 'core') {
      return d('core') ?? fallback;
    }

    // Flexibility → maintenance/full_body domain
    if (movementGroup === 'flexibility') {
      return d('full_body') ?? fallback;
    }

    // Isolation → determine from primaryMuscle
    if (movementGroup === 'isolation') {
      return mapIsolationMuscleToDomainLevel(exercise.primaryMuscle, domains, tracks, baseUserLevel);
    }
  }

  // Fallback: try to infer from primaryMuscle even without movementGroup
  if (exercise.primaryMuscle) {
    return mapIsolationMuscleToDomainLevel(exercise.primaryMuscle, domains, tracks, baseUserLevel);
  }

  // Ultimate fallback
  return d('full_body') ?? d('upper_body') ?? fallback;
}

/**
 * Map an isolation exercise's primaryMuscle to the correct domain level.
 * Prefers granular push/pull/legs when they exist (BOTTOM-UP).
 * Falls back to baseUserLevel only when the domain is completely missing.
 */
function mapIsolationMuscleToDomainLevel(
  primaryMuscle: MuscleGroup | undefined,
  domains: UserFullProfile['progression']['domains'],
  tracks?: UserFullProfile['progression']['tracks'],
  baseUserLevel?: number,
): number {
  const d = (id: string) => getDomainLevelIfExists(domains, id, tracks);
  const fallback = baseUserLevel ?? DEFAULT_LEVEL;

  if (!primaryMuscle) {
    return d('full_body') ?? d('upper_body') ?? fallback;
  }

  // Push muscles: chest, shoulders, triceps
  if (['chest', 'shoulders', 'triceps'].includes(primaryMuscle)) {
    return d('push') ?? d('upper_body') ?? fallback;
  }
  // Pull muscles: back, biceps, rear_delt, etc.
  if (['back', 'middle_back', 'biceps', 'rear_delt', 'traps', 'forearms'].includes(primaryMuscle)) {
    return d('pull') ?? d('upper_body') ?? fallback;
  }
  if (UPPER_BODY_MUSCLES.includes(primaryMuscle)) {
    return d('upper_body') ?? fallback;
  }

  if (LOWER_BODY_MUSCLES.includes(primaryMuscle)) {
    return d('legs') ?? d('lower_body') ?? fallback;
  }

  if (CORE_MUSCLES.includes(primaryMuscle)) {
    return d('core') ?? fallback;
  }

  return d('full_body') ?? d('upper_body') ?? fallback;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Read a domain's currentLevel from tracks or domains (BOTTOM-UP).
 * Returns undefined when the domain is completely missing (no track, no domain entry).
 * Used for proper fallback: only fall back to baseUserLevel when domain is missing.
 */
function getDomainLevelIfExists(
  domains: UserFullProfile['progression']['domains'],
  domainId: string,
  tracks?: UserFullProfile['progression']['tracks'],
): number | undefined {
  const t = tracks ?? {};
  const dom = domains as Record<string, { currentLevel?: number }>;
  const fromTrack = t[domainId]?.currentLevel;
  const fromDomain = dom[domainId]?.currentLevel;
  const level = fromTrack ?? fromDomain;
  return level !== undefined && level !== null ? level : undefined;
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
    'flexibility',
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
