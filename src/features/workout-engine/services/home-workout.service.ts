/**
 * Home Workout Service
 *
 * Centralized orchestrator that ties together:
 *   - ContextualEngine (filtering + scoring)
 *   - WorkoutGenerator  (volume + structure)
 *   - Shadow Level Utils (per-exercise level resolution)
 *
 * This service is the single entry-point for the Home Dashboard to
 * generate a personalised workout.  It fetches data, builds contexts,
 * delegates to the existing isomorphic engines, and returns a
 * `GeneratedWorkout` ready for rendering.
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks.
 *
 * @see TRAINING_LOGIC.md          – Source of truth for all rules
 * @see HOME_WORKOUT_SERVICE_FINAL_ARCHITECTURE.md – Full architecture
 * @see HOME_WORKOUT_SERVICE_PROFESSIONAL_ARCHITECTURE.md – Math + flow
 */

import { Exercise, InjuryShieldArea, ExecutionLocation } from '@/features/content/exercises/core/exercise.types';
import { getAllExercises } from '@/features/content/exercises/core/exercise.service';
import { getAllGymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.service';
import { UserFullProfile } from '@/features/user/core/types/user.types';
import {
  createContextualEngine,
  ContextualFilterContext,
  LifestylePersona,
  IntentMode,
} from '../logic/ContextualEngine';
import {
  createWorkoutGenerator,
  GeneratedWorkout,
  WorkoutGenerationContext,
  DifficultyLevel,
} from '../logic/WorkoutGenerator';
import {
  ShadowMatrix,
  getEffectiveLevelForExercise,
} from './shadow-level.utils';
import {
  resolveWorkoutMetadata,
  detectTimeOfDay,
  detectDayPeriod,
  TimeOfDay,
  WorkoutMetadataContext,
} from './workout-metadata.service';
import { getAllPrograms } from '@/features/content/programs/core/program.service';
import type { Program } from '@/features/content/programs/core/program.types';

// Re-export for convenience
export type { ShadowMatrix } from './shadow-level.utils';
export { createDefaultShadowMatrix } from './shadow-level.utils';
export type { TimeOfDay } from './workout-metadata.service';
export { detectTimeOfDay, TIME_OF_DAY_OPTIONS } from './workout-metadata.service';

// ── Program hierarchy cache ──────────────────────────────────────────
let _programsCacheTs = 0;
let _programsCache: Program[] = [];
const PROGRAMS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCachedPrograms(): Promise<Program[]> {
  const now = Date.now();
  if (_programsCache.length && now - _programsCacheTs < PROGRAMS_CACHE_TTL) {
    return _programsCache;
  }
  try {
    _programsCache = await getAllPrograms();
    _programsCacheTs = now;
  } catch (e) {
    console.warn('[HomeWorkout] Failed to load programs for hierarchy:', e);
  }
  return _programsCache;
}

/**
 * Resolve ancestor (parent/grandparent) program IDs for a given child program.
 * For example: 'push' → ['upper_body', 'full_body'] if:
 *   upper_body.subPrograms includes 'push', and
 *   full_body.subPrograms includes 'upper_body'.
 */
async function resolveAncestorProgramIds(childProgramId: string): Promise<string[]> {
  const programs = await getCachedPrograms();
  const ancestors: string[] = [];
  const visited = new Set<string>();
  let currentId = childProgramId;

  while (true) {
    if (visited.has(currentId)) break; // prevent cycles
    visited.add(currentId);

    const parent = programs.find(
      (p) => p.isMaster && p.subPrograms?.includes(currentId)
    );
    if (!parent) break;
    ancestors.push(parent.id);
    currentId = parent.id;
  }

  return ancestors;
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Options accepted by `generateHomeWorkout()`.
 *
 * The caller (e.g. StatsOverview, AdjustWorkoutModal) builds this object
 * from the user's context and any QA overrides.
 */
export interface HomeWorkoutOptions {
  /** User's full Firestore profile */
  userProfile: UserFullProfile;

  /** Current execution location (default: 'home') */
  location?: ExecutionLocation;

  /** Intent mode (default: 'normal') */
  intentMode?: IntentMode;

  /** Available workout time in minutes (default: 30) */
  availableTime?: number;

  /** Difficulty override (1-3, default: 2) */
  difficulty?: DifficultyLevel;

  /** Optional QA Shadow Matrix (all overrides disabled = use real profile) */
  shadowMatrix?: ShadowMatrix;

  /** Override injury areas for testing (default: extracted from profile) */
  injuryOverride?: InjuryShieldArea[];

  /** Override equipment list for testing */
  equipmentOverride?: string[];

  /** Override days-inactive for testing (default: calculated from profile) */
  daysInactiveOverride?: number;

  /** Override persona for testing */
  personaOverride?: LifestylePersona;

  /** Time of day override (default: auto-detected from clock) */
  timeOfDay?: TimeOfDay;

  /** Whether this is the user's first session in the program */
  isFirstSessionInProgram?: boolean;
}

/**
 * Full result returned by `generateHomeWorkout()`.
 * Wraps the generated workout with context metadata for the UI.
 */
export interface HomeWorkoutResult {
  /** The generated workout session */
  workout: GeneratedWorkout;

  /** Context metadata (for display / debugging) */
  meta: {
    daysInactive: number;
    persona: LifestylePersona | null;
    location: ExecutionLocation;
    timeOfDay: TimeOfDay;
    injuryAreas: InjuryShieldArea[];
    exercisesConsidered: number;
    exercisesExcluded: number;
  };
}

// ============================================================================
// PERSONA MAPPING
// ============================================================================

/**
 * Known persona IDs that map directly to LifestylePersona values.
 * This mapping handles the transition from Firestore personaId strings
 * to the engine's LifestylePersona type.
 */
const PERSONA_ID_MAP: Record<string, LifestylePersona> = {
  parent: 'parent',
  student: 'student',
  school_student: 'school_student',
  office_worker: 'office_worker',
  home_worker: 'home_worker',
  senior: 'senior',
  athlete: 'athlete',
  reservist: 'reservist',
  active_soldier: 'active_soldier',
  // Aliases / legacy IDs
  busy_parent: 'parent',
  work_from_home: 'home_worker',
  soldier: 'active_soldier',
};

/**
 * Map a user profile's persona/lifestyle data to a LifestylePersona.
 *
 * Resolution order:
 *   1. Explicit override (from modal)
 *   2. lifestyle.lifestyleTags[0] (most specific)
 *   3. personaId field
 *   4. null (no persona)
 */
export function mapPersonaIdToLifestylePersona(
  userProfile: UserFullProfile,
  overridePersona?: LifestylePersona,
): LifestylePersona | null {
  if (overridePersona) return overridePersona;

  // Try lifestyleTags first (set during onboarding from persona selection)
  const lifestyleTags = userProfile.lifestyle?.lifestyleTags;
  if (lifestyleTags?.length) {
    const mapped = PERSONA_ID_MAP[lifestyleTags[0]];
    if (mapped) return mapped;
    // If the tag itself IS a valid LifestylePersona, use it directly
    if (isLifestylePersona(lifestyleTags[0])) return lifestyleTags[0] as LifestylePersona;
  }

  // Fallback to personaId
  if (userProfile.personaId) {
    const mapped = PERSONA_ID_MAP[userProfile.personaId];
    if (mapped) return mapped;
    if (isLifestylePersona(userProfile.personaId)) return userProfile.personaId as LifestylePersona;
  }

  return null;
}

const VALID_PERSONAS: Set<string> = new Set([
  'parent', 'student', 'school_student', 'office_worker', 'home_worker', 'senior', 'athlete', 'reservist', 'active_soldier',
]);

function isLifestylePersona(value: string): boolean {
  return VALID_PERSONAS.has(value);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate the number of days since the user's last workout.
 *
 * @returns 0 if never active or active today, positive integer otherwise.
 * @see TRAINING_LOGIC.md Rule 2.3 (Reactivation Protocol)
 */
export function calculateDaysInactive(userProfile: UserFullProfile): number {
  const lastActiveDate = userProfile.progression?.lastActiveDate;

  if (!lastActiveDate) {
    // No previous activity recorded – treat as first workout
    return 0;
  }

  // Parse 'YYYY-MM-DD' format from Firestore
  const lastActive = new Date(lastActiveDate);
  const today = new Date();

  // Zero-out time portion for clean day diff
  lastActive.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffMs = today.getTime() - lastActive.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
}

/**
 * Extract injury shield areas from the user's health profile.
 * Returns them as typed `InjuryShieldArea[]` used by ContextualEngine.
 *
 * @see ContextualEngine.passesInjuryShield() – zero-score hard exclusion
 */
export function extractInjuryShield(
  userProfile: UserFullProfile,
  overrideInjuries?: InjuryShieldArea[],
): InjuryShieldArea[] {
  if (overrideInjuries) return overrideInjuries;
  // health.injuries is stored as string[] in Firestore
  return (userProfile.health?.injuries ?? []) as InjuryShieldArea[];
}

/**
 * Resolve available equipment based on location and user profile.
 */
function resolveEquipment(
  userProfile: UserFullProfile,
  location: ExecutionLocation,
  equipmentOverride?: string[],
): string[] {
  if (equipmentOverride?.length) return equipmentOverride;

  const eq = userProfile.equipment;
  if (!eq) return [];

  switch (location) {
    case 'home':
      return eq.home ?? [];
    case 'office':
      return eq.office ?? [];
    case 'park':
    case 'street':
      return eq.outdoor ?? [];
    default:
      return [];
  }
}

/**
 * Collect all lifestyle personas for the user (primary + extras from tags).
 */
function collectLifestyles(
  userProfile: UserFullProfile,
  primaryPersona: LifestylePersona | null,
): LifestylePersona[] {
  const lifestyles = new Set<LifestylePersona>();

  if (primaryPersona) lifestyles.add(primaryPersona);

  // Add additional tags that are valid personas
  const tags = userProfile.lifestyle?.lifestyleTags ?? [];
  for (const tag of tags) {
    if (isLifestylePersona(tag)) {
      lifestyles.add(tag as LifestylePersona);
    }
  }

  return Array.from(lifestyles).slice(0, 3); // Max 3
}

/**
 * Derive the base user level (used for WorkoutGenerator volume calc).
 * Takes the highest domain level as the representative base.
 */
function getBaseUserLevel(userProfile: UserFullProfile): number {
  const domains = userProfile.progression?.domains ?? {};
  let maxLevel = 1;

  for (const domainId of Object.keys(domains)) {
    const level = domains[domainId as keyof typeof domains]?.currentLevel;
    if (level && level > maxLevel) {
      maxLevel = level;
    }
  }

  return maxLevel;
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

/**
 * Generate a complete home workout for the user.
 *
 * This is the single entry-point that:
 *   1. Fetches exercises & gym equipment from Firestore
 *   2. Extracts context from the user profile
 *   3. Delegates to ContextualEngine for filtering + scoring
 *   4. Delegates to WorkoutGenerator for volume + structure
 *   5. Returns a ready-to-render `HomeWorkoutResult`
 *
 * @example
 * ```ts
 * const result = await generateHomeWorkout({
 *   userProfile,
 *   location: 'home',
 *   availableTime: 30,
 * });
 * // result.workout → GeneratedWorkout
 * ```
 */
export async function generateHomeWorkout(
  options: HomeWorkoutOptions,
): Promise<HomeWorkoutResult> {
  const {
    userProfile,
    location = 'home',
    intentMode = 'normal',
    availableTime = 30,
    difficulty = 2,
    shadowMatrix,
    injuryOverride,
    equipmentOverride,
    daysInactiveOverride,
    personaOverride,
    timeOfDay: timeOfDayOverride,
    isFirstSessionInProgram,
  } = options;

  // ── 1. Fetch data ──────────────────────────────────────────────────────
  const [exercises, gymEquipmentList] = await Promise.all([
    getAllExercises(),
    getAllGymEquipment(),
  ]);

  // ── 2. Derive contextual values ────────────────────────────────────────
  const daysInactive = daysInactiveOverride ?? calculateDaysInactive(userProfile);
  const injuries = extractInjuryShield(userProfile, injuryOverride);
  const persona = mapPersonaIdToLifestylePersona(userProfile, personaOverride);
  const lifestyles = collectLifestyles(userProfile, persona);
  const availableEquipment = [
    ...resolveEquipment(userProfile, location, equipmentOverride),
    ...gymEquipmentList.map(eq => eq.id),
  ];
  const baseUserLevel = getBaseUserLevel(userProfile);
  const timeOfDay = timeOfDayOverride ?? detectTimeOfDay();

  // ── 3. Build ContextualEngine context ──────────────────────────────────
  //    The key callback: per-exercise shadow level resolution

  // Detect active program filters from Shadow Matrix.
  // When any program checkbox is checked (override: true), it becomes
  // a STRICT filter — only exercises matching that program are included.
  const activeProgramFilters: string[] = [];
  if (shadowMatrix?.programs) {
    for (const [programKey, po] of Object.entries(shadowMatrix.programs)) {
      if (po?.override) {
        activeProgramFilters.push(programKey);
      }
    }
  }

  if (activeProgramFilters.length > 0) {
    console.log(
      `[HomeWorkout] STRICT PROGRAM FILTER active: [${activeProgramFilters.join(', ')}]`
    );
  }

  const filterContext: ContextualFilterContext = {
    location,
    lifestyles,
    injuryShield: injuries,
    intentMode,
    availableEquipment,
    getUserLevelForExercise: (exercise: Exercise) =>
      getEffectiveLevelForExercise(exercise, userProfile, shadowMatrix),
    levelTolerance: 3,
    activeProgramFilters: activeProgramFilters.length > 0 ? activeProgramFilters : undefined,
  };

  // ── 4. Run ContextualEngine ────────────────────────────────────────────
  const engine = createContextualEngine();
  const filterResult = engine.filterAndScore(exercises, filterContext);

  // ── 5. Build WorkoutGenerator context ──────────────────────────────────
  const generatorContext: WorkoutGenerationContext = {
    availableTime,
    userLevel: baseUserLevel,
    daysInactive,
    intentMode,
    persona,
    location,
    injuryCount: injuries.length,
    energyLevel: 'medium',
    difficulty,
    userWeight: userProfile.core?.weight ?? 70,
    isFirstSessionInProgram,
  };

  // ── 6. Run WorkoutGenerator ────────────────────────────────────────────
  const generator = createWorkoutGenerator();
  const workout = generator.generateWorkout(filterResult.exercises, generatorContext);

  // Attach AI cue from engine if generator didn't produce one
  if (!workout.aiCue && filterResult.aiCue) {
    workout.aiCue = filterResult.aiCue;
  }

  // ── 7. Mandatory Cool-Down — append 2-3 stretching exercises ──────────
  appendCooldownExercises(workout, exercises, filterContext, location);

  // ── 8. ZERO HARDCODING — Override title/description/aiCue from Firestore

  // Analyze dominant muscle from generated workout (>50% of exercises)
  const muscleCounts: Record<string, number> = {};
  workout.exercises.forEach(ex => {
    const muscle = ex.exercise.primaryMuscle;
    if (muscle) {
      muscleCounts[muscle] = (muscleCounts[muscle] || 0) + 1;
    }
  });
  const totalExCount = workout.exercises.length || 1;
  const dominantMuscle = Object.entries(muscleCounts)
    .filter(([, count]) => count / totalExCount > 0.5)
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  // Infer category from workout content
  const categoryLabelsMap: Record<string, string> = {
    strength: 'כוח',
    volume: 'נפח',
    endurance: 'סיבולת',
    skills: 'סקילס',
    mobility: 'ניידות',
    hiit: 'HIIT',
    general: 'כללי',
    maintenance: 'תחזוקת גוף',
  };

  function inferCategory(): string {
    // Check if most exercises are mobility/stretch
    const hasMobility = workout.exercises.some(ex => ex.exercise.tags?.includes('mobility'));
    const hasSkills = workout.exercises.some(ex => ex.exercise.tags?.includes('skill'));
    if (hasMobility && workout.exercises.filter(ex => ex.exercise.tags?.includes('mobility')).length > totalExCount / 2) return 'mobility';
    if (hasSkills) return 'skills';
    if (workout.structure === 'circuit' || workout.structure === 'emom') return 'hiit';
    return 'general';
  }

  const workoutCategory = inferCategory();

  // ── Determine active child program + level for hierarchy scoring ─────
  const activeChildProgramId = userProfile.progression?.activePrograms?.[0]?.templateId ?? undefined;
  const programTracks = userProfile.progression?.tracks ?? {};
  const childTrackLevel = activeChildProgramId
    ? (programTracks[activeChildProgramId]?.level ?? undefined)
    : undefined;

  // Build ancestor chain for hierarchy-aware content filtering
  // (populated async below if needed)
  let ancestorProgramIds: string[] = [];

  const metadataCtx: WorkoutMetadataContext = {
    persona,
    location,
    timeOfDay,
    gender: (userProfile.core?.gender as 'male' | 'female') ?? undefined,
    daysInactive,
    sportType: userProfile.progression?.tracks?.['current']?.sportType,
    motivationStyle: undefined,
    experienceLevel: undefined,
    programProgress: userProfile.progression?.programProgress,
    currentProgram: userProfile.progression?.currentProgram,
    targetLevel: userProfile.progression?.targetLevel,
    isStudying: location === 'library',
    dayPeriod: detectDayPeriod(),
    // Workout analysis fields
    category: workoutCategory,
    durationMinutes: workout.estimatedDuration,
    difficulty: workout.difficulty,
    dominantMuscle,
    categoryLabel: categoryLabelsMap[workoutCategory] || 'אימון',
    // Hierarchy scoring fields
    isActiveReserve: userProfile.core?.isActiveReserve ?? false,
    activeProgramId: activeChildProgramId,
    programLevel: childTrackLevel,
    ancestorProgramIds,
  };

  // Resolve ancestor program chain for hierarchy-aware content filtering
  if (activeChildProgramId) {
    try {
      metadataCtx.ancestorProgramIds = await resolveAncestorProgramIds(activeChildProgramId);
    } catch (e) {
      console.warn('[HomeWorkout] Ancestor resolution failed:', e);
    }
  }

  try {
    const metadata = await resolveWorkoutMetadata(metadataCtx);
    if (metadata.title) workout.title = metadata.title;
    if (metadata.description) workout.description = metadata.description;
    if (metadata.aiCue) workout.aiCue = metadata.aiCue;

    if (metadata.source === 'firestore') {
      console.log('[HomeWorkout] Metadata resolved from Firestore:', {
        title: !!metadata.title,
        description: !!metadata.description,
        aiCue: !!metadata.aiCue,
      });
    }
  } catch (err) {
    // Non-critical — generator fallback strings are already in place
    console.warn('[HomeWorkout] Metadata fetch failed, using generator defaults:', err);
  }

  // ── 9. Return result ──────────────────────────────────────────────────
  //    exercisesConsidered = how many exercises passed ALL filters
  //    (including strict program filter). This lets the UI show a
  //    realistic count that drops when a program is selected.
  return {
    workout,
    meta: {
      daysInactive,
      persona,
      location,
      timeOfDay,
      injuryAreas: injuries,
      exercisesConsidered: filterResult.exercises.length,
      exercisesExcluded: filterResult.excludedCount,
    },
  };
}

// ============================================================================
// MANDATORY COOL-DOWN
// ============================================================================

/**
 * Append 2-3 cool-down exercises matching the primary muscles worked.
 *
 * Selection rules:
 *   1. Only exercises with `exerciseRole === 'cooldown'`
 *   2. Prefer exercises whose primaryMuscle matches a muscle used in the workout
 *   3. Must have an execution method for the current location (or 'home' fallback)
 *   4. Cap at 3 exercises
 */
function appendCooldownExercises(
  workout: GeneratedWorkout,
  allExercises: Exercise[],
  filterContext: ContextualFilterContext,
  location: ExecutionLocation,
): void {
  // Collect primary muscles used in the current workout
  const usedMuscles = new Set<string>();
  for (const ex of workout.exercises) {
    if (ex.exercise.primaryMuscle) usedMuscles.add(ex.exercise.primaryMuscle);
  }

  // Collect IDs already in the workout to avoid duplicates
  const workoutIds = new Set(workout.exercises.map(e => e.exercise.id));

  // Find cooldown candidates
  const cooldownCandidates = allExercises.filter(ex => {
    if (ex.exerciseRole !== 'cooldown') return false;
    if (workoutIds.has(ex.id)) return false;

    // Must have an execution method for the current location (or home fallback)
    const methods = ex.execution_methods || ex.executionMethods || [];
    const hasMethod = methods.some(
      m => m.location === location || m.location === 'home' || m.locationMapping?.includes(location),
    );
    return hasMethod;
  });

  // Score: +2 if muscle matches, +1 if has video
  const scored = cooldownCandidates.map(ex => {
    let score = 0;
    if (ex.primaryMuscle && usedMuscles.has(ex.primaryMuscle)) score += 2;
    const methods = ex.execution_methods || ex.executionMethods || [];
    const bestMethod = methods.find(m => m.location === location) || methods.find(m => m.location === 'home') || methods[0];
    if (bestMethod?.media?.mainVideoUrl) score += 1;
    return { exercise: ex, method: bestMethod!, score };
  });

  // Sort by score descending, pick 2-3
  scored.sort((a, b) => b.score - a.score);
  const targetCount = Math.min(3, Math.max(2, scored.length));
  const selected = scored.slice(0, targetCount);

  // Convert to WorkoutExercise format and append
  for (const item of selected) {
    if (!item.method) continue;

    const cooldownExercise = {
      exercise: item.exercise,
      method: {
        exercise: item.exercise,
        method: item.method,
        score: item.score,
        reasoning: ['cooldown: muscle match'],
        mechanicalType: item.exercise.mechanicalType || 'none' as const,
      }.method,
      mechanicalType: (item.exercise.mechanicalType || 'none') as any,
      sets: 1,
      reps: item.exercise.type === 'time' ? 30 : 10,
      isTimeBased: item.exercise.type === 'time',
      restSeconds: 0,
      priority: 'isolation' as const,
      score: item.score,
      reasoning: ['mandatory cooldown — muscle match'],
    };

    workout.exercises.push(cooldownExercise);
  }
}
