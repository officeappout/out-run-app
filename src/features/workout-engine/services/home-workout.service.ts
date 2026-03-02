/**
 * Home Workout Orchestrator
 *
 * Pure orchestration layer -- the single entry-point for the Home Dashboard
 * to generate a personalised workout session. This file owns NO domain
 * logic of its own; every responsibility is delegated:
 *
 *   Module                          | Responsibility
 *   --------------------------------|--------------------------------------
 *   ./user-profile.utils.ts         | Persona, injury, equipment, level
 *   ./program-hierarchy.utils.ts    | Program cache, child/ancestor lookup
 *   ./warmup.service.ts             | Movement-preparation prepend
 *   ./cooldown.service.ts           | Mandatory cooldown append
 *   ./home-workout.types.ts         | HomeWorkoutOptions / HomeWorkoutResult
 *   ../logic/ContextualEngine.ts    | Filtering + scoring
 *   ../logic/WorkoutGenerator.ts    | Volume, structure, rescue, sorting
 *   ./shadow-level.utils.ts         | Per-exercise level resolution
 *   ./lead-program.service.ts       | Lead Program budget resolution
 *   ./intensity-gating.service.ts   | Difficulty gating
 *   ./workout-metadata.service.ts   | Firestore title/description/AI cue
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks.
 *
 * @see TRAINING_LOGIC.md
 * @see HOME_WORKOUT_SERVICE_FINAL_ARCHITECTURE.md
 * @see HOME_WORKOUT_SERVICE_PROFESSIONAL_ARCHITECTURE.md
 */

// -- External domain imports --
import { Exercise, InjuryShieldArea, ExecutionLocation } from '@/features/content/exercises/core/exercise.types';
import { getAllExercises } from '@/features/content/exercises/core/exercise.service';
import { getAllGymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.service';
import { UserFullProfile } from '@/features/user/core/types/user.types';
import { getProgramLevelSetting } from '@/features/content/programs/core/programLevelSettings.service';

// -- Engine imports --
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

// -- Sibling service imports --
import {
  getAvailableDifficulties,
  getDefaultMaxIntensePerWeek,
  type IntensityGatingContext,
} from './intensity-gating.service';
import { ShadowMatrix, getEffectiveLevelForExercise } from './shadow-level.utils';
import {
  resolveWorkoutMetadata,
  detectTimeOfDay,
  detectDayPeriod,
  TimeOfDay,
  WorkoutMetadataContext,
  TrioVariant,
} from './workout-metadata.service';
import {
  resolveActiveProgramBudget,
  resolveGlobalMaxIntense,
  resolveAggregateFullBodyBudget,
} from './lead-program.service';
import { getWorkoutContext, type SplitWorkoutContext } from './split-decision';
import { calculateWeeklyBudget } from '../core/store/useWeeklyVolumeStore';

// -- Extracted utility modules --
import {
  mapPersonaIdToLifestylePersona,
  calculateDaysInactive,
  extractInjuryShield,
  resolveEquipment,
  collectLifestyles,
  getBaseUserLevel,
} from './user-profile.utils';
import {
  getCachedPrograms,
  FULL_BODY_CHILD_DOMAINS,
  resolveChildDomainsForParent,
  resolveAncestorProgramIds,
} from './program-hierarchy.utils';
import { prependWarmupExercises } from './warmup.service';
import { appendCooldownExercises } from './cooldown.service';
import type {
  HomeWorkoutOptions,
  HomeWorkoutResult,
  HomeWorkoutTrioResult,
  WorkoutTrioOption,
  WorkoutOptionLabel,
  TrioLabelsConfig,
} from './home-workout.types';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// -- Re-exports consumed by the barrel (index.ts) and external callers --
export { mapPersonaIdToLifestylePersona, calculateDaysInactive, extractInjuryShield } from './user-profile.utils';
export type { HomeWorkoutOptions, HomeWorkoutResult, HomeWorkoutTrioResult, WorkoutTrioOption, WorkoutOptionLabel, TrioLabelsConfig } from './home-workout.types';
export type { ShadowMatrix } from './shadow-level.utils';
export { createDefaultShadowMatrix } from './shadow-level.utils';
export type { TimeOfDay } from './workout-metadata.service';
export { detectTimeOfDay, TIME_OF_DAY_OPTIONS } from './workout-metadata.service';

// ============================================================================
// CONFIG
// ============================================================================

/**
 * USE_PARK_FOR_TESTING: Until Home/Office exercises are uploaded, override
 * location to 'park' for the ExerciseFilter so Level 6/7 exercises (which
 * often have park execution methods) are included. Set to false in production.
 */
const USE_PARK_FOR_TESTING = true;

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
    difficulty: requestedDifficulty = 2,
    shadowMatrix,
    injuryOverride,
    equipmentOverride,
    daysInactiveOverride,
    personaOverride,
    timeOfDay: timeOfDayOverride,
    isFirstSessionInProgram,
    // Training OS context
    remainingWeeklyBudget,
    weeklyBudgetUsagePercent,
    weeklyIntenseCount = 0,
    isRecoveryDay,
    maxIntenseWorkoutsPerWeek,
    protocolProbability,
    preferredProtocols,
    straightArmRatio,
    levelDefaultRestSeconds,
    restMultiplier,
    // UTS Phase 1 — schedule-aware options
    selectedDate,
    scheduledProgramIds,
    isScheduledRestDay = false,
    // Phase 4 — Deficit Redistribution & Synergy
    domainSetsCompletedThisWeek,
    remainingScheduleDays,
    recentExerciseIds,
  } = options;

  // ── 0. UTS Schedule Override ───────────────────────────────────────────
  // When the caller pre-resolved programIds from UserSchedule, temporarily
  // override the profile's activePrograms so ALL downstream level/rule/budget
  // lookups target the scheduled programs. This is a shallow merge — the
  // original profile object is never mutated.
  //
  // CRITICAL: Never hardcode 'default'. When no schedule exists, use the
  // user's active program so Level 6+ progression is respected.
  //
  // Active Recovery (isScheduledRestDay): sets isRecoveryDay:true ONLY.
  // Difficulty is NOT forced to 1 — difficulty is irrelevant for recovery days
  // because the pool is stripped to cooldown/flexibility/warmup exercises.
  // Difficulty 1 = light strength workout (separate concept).
  const fallbackProgram = userProfile.progression?.activePrograms?.[0]?.templateId || 'full_body';
  const effectiveProgramIds =
    scheduledProgramIds?.length
      ? scheduledProgramIds
      : [fallbackProgram];

  const effectiveProfile: typeof userProfile = {
    ...userProfile,
    progression: {
      ...userProfile.progression,
      activePrograms: effectiveProgramIds.map(id => ({
        id,
        templateId: id,
        name: id,
        startDate: new Date(),
        durationWeeks: 52,
        currentWeek: 1,
        focusDomains: [],
      })),
    },
  };

  const effectiveDifficulty: typeof requestedDifficulty = requestedDifficulty;

  const effectiveIsRecovery = isScheduledRestDay ? true : (isRecoveryDay ?? false);

  if (selectedDate) {
    console.log(
      `[UTS] generateHomeWorkout → date:${selectedDate}` +
      ` programs:[${effectiveProgramIds.join(',')}]` +
      ` restDay:${isScheduledRestDay}`,
    );
  }

  // ── 1. Fetch data ──────────────────────────────────────────────────────
  const baseUserLevel = getBaseUserLevel(effectiveProfile);

  const [allExercises, gymEquipmentList, allPrograms] = await Promise.all([
    getAllExercises(),
    getAllGymEquipment(),
    getCachedPrograms(),
  ]);

  // ── 1a. ADMIN DATA AUDIT: exercises missing base_movement_id ────────────
  // Outputs a clean console.table so admins can copy IDs into the Admin panel.
  const missingBaseMovement = allExercises.filter(ex => !ex.base_movement_id);
  if (missingBaseMovement.length > 0) {
    console.warn(
      `[HomeWorkout] 🔍 DATA AUDIT: ${missingBaseMovement.length}/${allExercises.length} exercises are missing base_movement_id`,
    );
    console.table(
      missingBaseMovement.map(ex => ({
        exerciseId: ex.id,
        name: typeof ex.name === 'string' ? ex.name : (ex.name as any)?.he || ex.id,
        programs: ex.programIds?.join(', ') || '—',
        level: ex.targetPrograms?.[0]?.level ?? '—',
        type: ex.type || '—',
      })),
    );
  }

  // ── 1b. LEVEL-AWARE EXERCISE FILTERING ─────────────────────────────────
  // Prefer exercises that are explicitly assigned to the user's current
  // program + level via targetPrograms[].  This ensures the workout
  // matches the admin-defined content for the user's level document.
  //
  // CRITICAL: progression.tracks holds assessment levels (Path B/C). Populate
  // userProgramLevels from tracks FIRST — skill programs (planche, handstand)
  // exist only in tracks, not in domains.
  const userDomains = effectiveProfile.progression?.domains ?? {};
  const userTracks = effectiveProfile.progression?.tracks ?? {};
  const userProgramLevels = new Map<string, number>();

  // 1. Populate from tracks (assessment levels from Path B/C — highest priority)
  for (const [trackId, trackData] of Object.entries(userTracks)) {
    const level = trackData?.currentLevel ?? 1;
    userProgramLevels.set(trackId, level);
  }

  // 2. Populate from domains (for domains not yet in tracks)
  // BOTTOM-UP: Child domains (push, pull, legs, core) hold the actual levels.
  // Do NOT propagate parent level down — that would destroy asymmetrical personalization.
  for (const [domainId, domainData] of Object.entries(userDomains)) {
    if (!userProgramLevels.has(domainId)) {
      const trackLevel = userTracks[domainId]?.currentLevel;
      const domainLevel = domainData?.currentLevel;
      const level = trackLevel ?? domainLevel ?? 1;
      userProgramLevels.set(domainId, level);
    }
  }

  // 3. activePrograms: only default to 1 if track doesn't exist (ensures program is in filter)
  for (const ap of effectiveProfile.progression?.activePrograms ?? []) {
    if (ap.templateId && !userProgramLevels.has(ap.templateId)) {
      userProgramLevels.set(ap.templateId, 1);
      console.warn(
        `[HomeWorkout] Program mapping not found for "${ap.templateId}" — defaulting to Level 1. ` +
        `Check progression.tracks and progression.domains for this program.`
      );
    }
  }

  // ── VERIFICATION: Log progression from DB before workout generation ──
  console.group('[HomeWorkout] Progression (from profile, before workout generation)');
  console.log('progression.tracks:', userTracks);
  console.log('progression.domains:', userDomains);
  console.log('progression.activePrograms:', effectiveProfile.progression?.activePrograms);
  console.log('userProgramLevels (final):', Object.fromEntries(userProgramLevels));
  console.groupEnd();

  console.log(
    '[HomeWorkout] userProgramLevels (used for level-aware filter):',
    Object.fromEntries(userProgramLevels)
  );

  // Resolve child domains for parent delegation (full_body → [push,pull,legs,core]; calisthenics_upper → skillFocusIds)
  const activeProgramId = effectiveProfile.progression?.activePrograms?.[0]?.templateId;
  const resolvedChildDomains = resolveChildDomainsForParent(activeProgramId, userProfile);

  let exercises: Exercise[];
  if (userProgramLevels.size > 0 || resolvedChildDomains.length > 0) {
    // Build a Set of all valid program IDs for fast lookup.
    // Include resolved child domains so exercises targeting push/pull/legs/core (or skills) are in the pool.
    const validProgramIds = new Set([
      ...userProgramLevels.keys(),
      ...resolvedChildDomains,
    ]);

    // BOTTOM-UP: Use each child domain's specific level. Fallback to baseUserLevel only when missing.
    const filterByTolerance = (tolerance: number) =>
      allExercises.filter((ex) => {
        // Path A: Has targetPrograms with level info → level-aware match
        if (ex.targetPrograms && ex.targetPrograms.length > 0) {
          return ex.targetPrograms.some((tp) => {
            const userLevel = userProgramLevels.get(tp.programId) ?? baseUserLevel;
            return Math.abs(tp.level - userLevel) <= tolerance;
          });
        }
        // Path B: No targetPrograms → match on legacy programIds (any program match)
        if (ex.programIds && ex.programIds.length > 0) {
          return ex.programIds.some(pid => validProgramIds.has(pid));
        }
        // Path C: No program info at all → include with low priority (universal exercise)
        return false;
      });

    let levelMatched = filterByTolerance(1); // ±1 first pass
    let usedTolerance = 1;

    if (levelMatched.length < 4) {
      levelMatched = filterByTolerance(2); // ±2 second pass
      usedTolerance = 2;
    }

    if (levelMatched.length < 4) {
      // ±3 emergency pass — very wide tolerance
      levelMatched = filterByTolerance(3);
      usedTolerance = 3;
    }

    // Diagnostic: count exercises by match type
    let countTargetPrograms = 0;
    let countProgramIds = 0;
    let countNeither = 0;
    for (const ex of allExercises) {
      if (ex.targetPrograms && ex.targetPrograms.length > 0) countTargetPrograms++;
      else if (ex.programIds && ex.programIds.length > 0) countProgramIds++;
      else countNeither++;
    }

    if (levelMatched.length >= 4) {
      exercises = levelMatched;
      console.log(
        `[HomeWorkout] Level-aware filter (±${usedTolerance}): ${levelMatched.length}/${allExercises.length} exercises match. ` +
        `User programs: [${[...userProgramLevels.entries()].map(([k, v]) => `${k}:L${v}`).join(', ')}]. ` +
        `Exercise pool: ${countTargetPrograms} with targetPrograms, ${countProgramIds} with programIds only, ${countNeither} with neither.`
      );
    } else {
      exercises = allExercises;
      console.warn(
        `[HomeWorkout] Level-aware filter found only ${levelMatched.length} exercises (±${usedTolerance}) — falling back to FULL pool (${allExercises.length}). ` +
        `User programs: [${[...userProgramLevels.entries()].map(([k, v]) => `${k}:L${v}`).join(', ')}]. ` +
        `Exercise pool: ${countTargetPrograms} with targetPrograms, ${countProgramIds} with programIds only, ${countNeither} with neither.`
      );
    }
  } else {
    exercises = allExercises;
    console.log(`[HomeWorkout] No user program levels found — using full exercise pool (${allExercises.length})`);
  }

  // ── 2. Derive contextual values ────────────────────────────────────────
  const daysInactive = daysInactiveOverride ?? calculateDaysInactive(userProfile);
  const injuries = extractInjuryShield(userProfile, injuryOverride);
  const persona = mapPersonaIdToLifestylePersona(userProfile, personaOverride);
  const lifestyles = collectLifestyles(userProfile, persona);
  let availableEquipment = [
    ...resolveEquipment(userProfile, location, equipmentOverride),
    ...gymEquipmentList.map(eq => eq.id),
  ];
  // Environmental gear: park/street infrastructure (Bulgarian splits, etc.)
  const envLocation = USE_PARK_FOR_TESTING ? 'park' : location;
  if (envLocation === 'park' || envLocation === 'street') {
    const parkGear = ['park_bench', 'park_step', 'pullup_bar', 'dip_bar', 'bars'];
    availableEquipment = [...new Set([...availableEquipment, ...parkGear])];
  }
  const timeOfDay = timeOfDayOverride ?? detectTimeOfDay();

  // ── 2b. TRAINING OS: Lead Program Budget Resolution ───────────────────
  // Volume + intensity limits come from the Lead Program for the active
  // movement pattern (the program where the user has the highest level
  // among all same-pattern programs).  Protocol settings still come from
  // the specific ProgramLevelSettings (per-program).
  const [leadBudget, globalMaxIntense] = await Promise.all([
    resolveActiveProgramBudget(userProfile, allPrograms),
    resolveGlobalMaxIntense(userProfile, allPrograms),
  ]);

  if (leadBudget) {
    console.log(
      `[HomeWorkout] Lead Program: ${leadBudget.leadProgramName} ` +
      `(${leadBudget.pattern} L${leadBudget.level}) → ` +
      `volume=${leadBudget.weeklyVolumeTarget}, maxIntense=${leadBudget.maxIntenseWorkoutsPerWeek}, maxSets=${leadBudget.maxSets ?? '—'}`,
    );
  }

  // ── 2c. SPLIT DECISION ENGINE ─────────────────────────────────────────
  const scheduleDays = (userProfile.lifestyle?.scheduleDays?.length ?? 0) || 3;
  const scheduleDaysForBudget = Math.max(1, scheduleDays);
  const isFullBodyMaster =
    resolvedChildDomains.length >= 4 &&
    ['push', 'pull', 'legs', 'core'].every((d) => resolvedChildDomains.includes(d));

  let splitContext: SplitWorkoutContext;
  let resolvedDomainBudgets: Array<{ domain: string; level: number; weekly: number; daily: number }> | undefined;

  if (isFullBodyMaster) {
    const aggregate = await resolveAggregateFullBodyBudget(
      scheduleDays,
      userProgramLevels,
      allPrograms,
    );
    resolvedDomainBudgets = aggregate.domainBudgets;
    splitContext = getWorkoutContext({
      userProfile: effectiveProfile,
      selectedDate: selectedDate ?? new Date().toISOString().split('T')[0],
      aggregateBudgetInfo: aggregate,
      domainSetsCompletedThisWeek,
      remainingScheduleDays,
    });

    // Phase 4: Override domainBudgets with deficit-aware daily values
    if (domainSetsCompletedThisWeek && remainingScheduleDays && remainingScheduleDays > 0) {
      resolvedDomainBudgets = aggregate.domainBudgets.map(db => {
        const completed = domainSetsCompletedThisWeek[db.domain] ?? 0;
        const remaining = Math.max(0, db.weekly - completed);
        const deficitDaily = Math.max(1, Math.ceil(remaining / remainingScheduleDays));
        return { ...db, daily: deficitDaily };
      });
      console.group('[Phase 4] Deficit-Adjusted Domain Budgets');
      for (const db of resolvedDomainBudgets) {
        const completed = domainSetsCompletedThisWeek[db.domain] ?? 0;
        console.log(
          `  ${db.domain} L${db.level}: ${db.weekly} weekly - ${completed} done = ` +
          `${db.weekly - completed} left ÷ ${remainingScheduleDays} days = ${db.daily} sets/day`
        );
      }
      console.groupEnd();
    }
  } else {
    const weeklyBudgetForSplit =
      leadBudget?.weeklyVolumeTarget ??
      calculateWeeklyBudget(baseUserLevel, scheduleDaysForBudget);
    splitContext = getWorkoutContext({
      userProfile: effectiveProfile,
      weeklyBudget: weeklyBudgetForSplit,
      selectedDate: selectedDate ?? new Date().toISOString().split('T')[0],
    });
  }

  if (splitContext.excludedMuscleGroups?.length) {
    console.log(
      `[HomeWorkout] 48h Muscle Shield: excluding [${splitContext.excludedMuscleGroups.join(', ')}]`
    );
  }

  const resolvedMaxIntense =
    maxIntenseWorkoutsPerWeek ?? globalMaxIntense;

  const gatingContext: IntensityGatingContext = {
    userLevel: baseUserLevel,
    daysInactive,
    weeklyIntenseCount,
    maxIntenseWorkoutsPerWeek: resolvedMaxIntense,
  };
  const gatingResult = getAvailableDifficulties(gatingContext);

  // Clamp difficulty if intense is locked.
  // Rest days bypass difficulty entirely (pool is filtered by ActiveRecovery Guard).
  let difficulty: DifficultyLevel = effectiveDifficulty;
  let detrainingLock = false;
  let volumeReductionOverride: number | undefined;

  if (difficulty === 3 && gatingResult.isIntenseLocked) {
    difficulty = 2; // Downgrade to Challenging
    console.log(`[HomeWorkout] Intense locked: ${gatingResult.lockReason}`);
  }

  // Habit Builder path: force max intensity 1 (1 Lightning Bolt)
  if (splitContext.splitLogic.isHabitBuilder && splitContext.splitLogic.maxIntensity === 1) {
    difficulty = 1;
    console.log(`[HomeWorkout] Habit Builder path → forcing difficulty 1`);
  }

  // Detraining protection: 40% volume reduction if daysInactive > 3
  if (daysInactive > 3) {
    detrainingLock = true;
    volumeReductionOverride = 0.40; // 40% reduction
    console.log(`[HomeWorkout] Detraining protection active: ${daysInactive} days inactive → 40% volume reduction`);
  }

  // ── 3. Build ContextualEngine context ──────────────────────────────────
  //    The key callback: per-exercise shadow level resolution

  // Detect active program filters from Shadow Matrix OR user profile.
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

  // Auto-derive program filter from user's assigned domains/activePrograms
  // when no shadow matrix override is present.
  // Parent-to-Child delegation: full_body → [push,pull,legs,core]; calisthenics_upper → skillFocusIds
  if (activeProgramFilters.length === 0) {
    const ap = effectiveProfile.progression?.activePrograms?.[0];
    const parentId = ap?.templateId ?? ap?.id;

    // Parent-to-Child resolution (Static Master vs Dynamic Hybrid)
    const resolvedDomains = resolveChildDomainsForParent(parentId, userProfile);
    if (resolvedDomains.length > 0) {
      activeProgramFilters.push(...resolvedDomains);
      console.log(
        `[WorkoutGenerator] Resolving Parent Program '${parentId ?? 'unknown'}' -> Child Domains: [${resolvedDomains.join(', ')}].`
      );
    } else if (ap?.focusDomains && Array.isArray(ap.focusDomains) && ap.focusDomains.length > 0) {
      // Path B (muscle focus): Use focusDomains when set — strict filter for selected domains only
      activeProgramFilters.push(...ap.focusDomains);
      console.log(
        `[HomeWorkout] STRICT PROGRAM FILTER from focusDomains (Path B): [${activeProgramFilters.join(', ')}]`
      );
    } else {
      const userDomains = Object.keys(userProfile.progression?.domains ?? {});
      const userActiveTemplates = (userProfile.progression?.activePrograms ?? [])
        .map(p => p.templateId)
        .filter(Boolean);
      const derived = [...new Set([...userDomains, ...userActiveTemplates])];
      if (derived.length > 0) {
        // Also include child sub-programs for master programs
        for (const pid of derived) {
          const prog = allPrograms.find(p => p.id === pid);
          if (prog?.isMaster && prog.subPrograms?.length) {
            for (const child of prog.subPrograms) {
              if (!derived.includes(child)) derived.push(child);
            }
          }
        }
        activeProgramFilters.push(...derived);
        console.log(
          `[HomeWorkout] AUTO PROGRAM FILTER from user profile: [${activeProgramFilters.join(', ')}]`
        );
      }
    }
  }

  if (activeProgramFilters.length > 0 && shadowMatrix?.programs) {
    console.log(
      `[HomeWorkout] STRICT PROGRAM FILTER active: [${activeProgramFilters.join(', ')}]`
    );
  }

  const effectiveFilterLocation = USE_PARK_FOR_TESTING ? 'park' : location;
  if (USE_PARK_FOR_TESTING) {
    console.log(
      `[HomeWorkout] USE_PARK_FOR_TESTING: overriding filter location '${location}' → 'park' (Level 6/7 testing)`
    );
  }

  const filterContext: ContextualFilterContext = {
    location: effectiveFilterLocation,
    lifestyles,
    injuryShield: injuries,
    intentMode,
    availableEquipment,
    getUserLevelForExercise: (exercise: Exercise) =>
      getEffectiveLevelForExercise(exercise, userProfile, shadowMatrix, baseUserLevel),
    levelTolerance: 3,
    activeProgramFilters: activeProgramFilters.length > 0 ? activeProgramFilters : undefined,
    excludedMuscleGroups:
      splitContext.excludedMuscleGroups.length > 0 ? splitContext.excludedMuscleGroups : undefined,
  };

  // ── 4. Run ContextualEngine ────────────────────────────────────────────
  const engine = createContextualEngine();
  const filterResult = engine.filterAndScore(exercises, filterContext);

  // ── 5a. PROGRESSIVE OVERLOAD: Load goal exercises from ProgramLevelSettings ─
  let goalExerciseIds: Set<string> | undefined;
  let goalTargets: Map<string, { targetValue: number; unit: 'reps' | 'seconds' }> | undefined;
  let levelProgressPercent = 0;
  let workoutsCompletedInLevel = 0;

  // Determine the primary program for goal loading
  const primaryProgramId = [...userProgramLevels.entries()][0]?.[0];
  const primaryProgramLevel = primaryProgramId ? userProgramLevels.get(primaryProgramId) ?? 1 : 1;

  if (primaryProgramId) {
    try {
      const levelSettings = await getProgramLevelSetting(primaryProgramId, primaryProgramLevel);
      if (levelSettings?.targetGoals?.length) {
        goalExerciseIds = new Set(levelSettings.targetGoals.map(g => g.exerciseId));
        goalTargets = new Map(
          levelSettings.targetGoals.map(g => [g.exerciseId, { targetValue: g.targetValue, unit: g.unit }])
        );
        console.log(
          `[HomeWorkout] Progressive Overload: ${goalExerciseIds.size} goal exercises loaded for ${primaryProgramId} L${primaryProgramLevel}`
        );
      }
    } catch (e) {
      console.warn('[HomeWorkout] Failed to load goal targets for progressive overload:', e);
    }

    // Read progress & session count from user tracks
    const track = userProfile.progression?.tracks?.[primaryProgramId];
    if (track) {
      levelProgressPercent = track.percent ?? 0;
      workoutsCompletedInLevel = track.totalWorkoutsCompleted ?? 0;
    }
  }

  // ── 5b. Build WorkoutGenerator context ──────────────────────────────────
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
    userWeight: effectiveProfile.core?.weight ?? 70,
    isFirstSessionInProgram,
    // Training OS context
    remainingWeeklyBudget,
    weeklyBudgetUsagePercent,
    isRecoveryDay: effectiveIsRecovery,
    detrainingLock,
    volumeReductionOverride,
    protocolProbability,
    preferredProtocols,
    straightArmRatio,
    levelDefaultRestSeconds,
    restMultiplier,
    // Safety Brake (Hard Cap) — from Lead Program
    maxSets: leadBudget?.maxSets,
    // Split Engine context
    splitType: splitContext.splitType,
    dominanceRatio: splitContext.splitLogic.dominanceRatio,
    priority1SkillIds: splitContext.priority1SkillIds,
    priority2SkillIds: splitContext.priority2SkillIds,
    priority3SkillIds: splitContext.priority3SkillIds,
    dailySetBudget: splitContext.dailySetBudget,
    // Domain quotas (full_body: reserve 1 per push/pull/legs/core)
    requiredDomains: resolvedChildDomains.length > 0 ? resolvedChildDomains : undefined,
    // Global pool for domain rescue (WorkoutGenerator injects bodyweight when scored pool has 0)
    globalExercisePool: allExercises,
    // User level per domain for smart rescue (exact level match first)
    userProgramLevels,
    // Deterministic shuffle seed (userId + date; DEBUG_SHUFFLE_ON_REFRESH overrides in dev)
    userId: effectiveProfile.id,
    selectedDate: selectedDate ?? new Date().toISOString().split('T')[0],
    // Progressive Overload context
    goalExerciseIds,
    goalTargets,
    levelProgressPercent,
    workoutsCompletedInLevel,
    // Per-domain daily budgets (Master Programs only — Phase 1 plumbing)
    domainBudgets: resolvedDomainBudgets,
    // Phase 4B: Variety Guard — exercise IDs from last 2 sessions
    recentExerciseIds: recentExerciseIds?.length
      ? new Set(recentExerciseIds)
      : undefined,
  };

  // ── 6. Run WorkoutGenerator ────────────────────────────────────────────
  const generator = createWorkoutGenerator();
  const workout = generator.generateWorkout(filterResult.exercises, generatorContext);

  // Attach AI cue from engine if generator didn't produce one
  if (!workout.aiCue && filterResult.aiCue) {
    workout.aiCue = filterResult.aiCue;
  }

  // ── 6b. Specific Warmup (Movement Preparation) — potentiation + domain regressions ─
  const generatedMainExercises = workout.exercises.filter(
    (ex) => ex.exerciseRole !== 'warmup' && ex.exerciseRole !== 'cooldown',
  );
  prependWarmupExercises(
    workout,
    allExercises,
    userProgramLevels,
    effectiveFilterLocation,
    resolvedChildDomains,
    generatedMainExercises,
  );

  // ── 7. Mandatory Cool-Down — append 2-3 stretching exercises ──────────
  // Pass raw allExercises (not level-filtered `exercises`) so cooldown candidates
  // at any level are visible. The level filter would silently drop L1 cooldowns
  // for high-level users (e.g. |1 - 7| = 6 > tolerance).
  appendCooldownExercises(workout, allExercises, filterContext, effectiveFilterLocation);

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
  // Fallback chain: track level → userProgramLevels (built from domains) → primary level
  const childTrackLevel = activeChildProgramId
    ? (programTracks[activeChildProgramId]?.level
       ?? userProgramLevels.get(activeChildProgramId)
       ?? primaryProgramLevel)
    : primaryProgramLevel;

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
// WARMUP & COOLDOWN — Delegated to ./warmup.service.ts & ./cooldown.service.ts
// ============================================================================

// ============================================================================
// WORKOUT TRIO — Sprint 4: Single-pass 3-option generation
// ============================================================================

// ── LABEL DEFAULTS (fallback when Firestore doc is missing) ─────────────
const DEFAULT_TRIO_LABELS: TrioLabelsConfig = {
  trainingLabels: { option1Label: 'מאוזן', option2Label: 'עצים ומהיר', option3Label: 'ללא ציוד' },
  restDayLabels:  { option1Label: 'שגרתי', option2Label: 'זרימה',      option3Label: 'שחרור' },
};

// Pre-seed the cache with the canonical Hebrew labels so they're always
// available even if Firestore is unreachable. A successful Firestore read
// will overwrite these with any admin overrides.
let _cachedTrioLabels: TrioLabelsConfig | null = { ...DEFAULT_TRIO_LABELS };

/**
 * Fetch trio option labels from Firestore: app_config/workout_trio.
 *
 * Admin defines 3 keys per mode: option1Label, option2Label, option3Label.
 * The cache is pre-seeded with DEFAULT_TRIO_LABELS so callers always get
 * valid Hebrew labels — even on the very first call when Firestore is slow.
 */
async function fetchTrioLabels(): Promise<{ labels: TrioLabelsConfig; source: 'firestore' | 'fallback' }> {
  try {
    const snap = await getDoc(doc(db, 'app_config', 'workout_trio'));
    if (!snap.exists()) {
      console.log('[WorkoutTrio] No app_config/workout_trio doc → using pre-seeded Hebrew labels');
      return { labels: _cachedTrioLabels!, source: 'fallback' };
    }

    const data = snap.data() as Partial<TrioLabelsConfig>;
    const merged: TrioLabelsConfig = {
      trainingLabels: {
        option1Label: data.trainingLabels?.option1Label || DEFAULT_TRIO_LABELS.trainingLabels.option1Label,
        option2Label: data.trainingLabels?.option2Label || DEFAULT_TRIO_LABELS.trainingLabels.option2Label,
        option3Label: data.trainingLabels?.option3Label || DEFAULT_TRIO_LABELS.trainingLabels.option3Label,
      },
      restDayLabels: {
        option1Label: data.restDayLabels?.option1Label || DEFAULT_TRIO_LABELS.restDayLabels.option1Label,
        option2Label: data.restDayLabels?.option2Label || DEFAULT_TRIO_LABELS.restDayLabels.option2Label,
        option3Label: data.restDayLabels?.option3Label || DEFAULT_TRIO_LABELS.restDayLabels.option3Label,
      },
    };

    _cachedTrioLabels = merged;
    console.log(`[WorkoutTrio] Labels loaded from Firestore:`, merged);
    return { labels: merged, source: 'firestore' };
  } catch (e) {
    console.warn('[WorkoutTrio] Label fetch failed → using pre-seeded Hebrew labels:', e);
    return { labels: _cachedTrioLabels!, source: 'fallback' };
  }
}

// ── TRIO OPTION CONFIGS ─────────────────────────────────────────────────

interface TrioOptionConfig {
  key: 'option1Label' | 'option2Label' | 'option3Label';
  difficulty: DifficultyLevel;
  postProcess?: 'intense' | 'naked' | 'easy_naked' | 'mobility_tag' | 'flexibility_tag';
}

/**
 * Carousel slot order: [0] = Right peek, [1] = CENTER (Best Match), [2] = Left peek
 *
 * Training Day:
 *   [0] Easy / Naked (1 bolt) — bodyweight, UserLevel-1
 *   [1] Balanced / Best Match (2 bolts) — primary schedule pick
 *   [2] Intense / David Rule (3 bolts) — UserLevel+1 inject
 *
 * Rest Day:
 *   [0] Flexibility (light)
 *   [1] Standard recovery (center)
 *   [2] Mobility (flow)
 */
const TRAINING_DAY_CONFIGS: TrioOptionConfig[] = [
  { key: 'option3Label', difficulty: 1, postProcess: 'easy_naked' },
  { key: 'option1Label', difficulty: 2 },
  { key: 'option2Label', difficulty: 3, postProcess: 'intense' },
];

const REST_DAY_CONFIGS: TrioOptionConfig[] = [
  { key: 'option3Label', difficulty: 2, postProcess: 'flexibility_tag' },
  { key: 'option1Label', difficulty: 2 },
  { key: 'option2Label', difficulty: 2, postProcess: 'mobility_tag' },
];

/**
 * Generate 3 unique workout options in a SINGLE PASS.
 *
 * Architecture:
 *   1. Fetch data + score exercises ONCE (shared pipeline)
 *   2. Fetch dynamic labels from Firestore (1 read, cached)
 *   3. Loop 3 times: generate → warmup → cooldown → post-process
 *   4. Session Blacklist: Options 2 & 3 penalize IDs from prior options (-50)
 *
 * All Sprint 3 integrity is preserved: 4-vs-6 sets fix (Budget),
 * Vertical Preference (+25/+12), Deficit-aware domainBudgets.
 */
export async function generateHomeWorkoutTrio(
  options: HomeWorkoutOptions,
): Promise<HomeWorkoutTrioResult> {
  const isRestDay = options.isScheduledRestDay || options.isRecoveryDay || false;

  console.group(`[WorkoutTrio] Generating 3 options — ${isRestDay ? 'REST DAY' : 'TRAINING DAY'}`);

  // ── 1. SHARED PIPELINE: fetch + context + score (ONCE) ────────────────
  const pipeline = await _buildSharedPipeline(options);

  // ── 2. DYNAMIC LABELS from Firestore ──────────────────────────────────
  const { labels, source: labelsSource } = await fetchTrioLabels();
  const modeLabels = isRestDay ? labels.restDayLabels : labels.trainingLabels;

  console.log(`[WorkoutTrio] Labels (${labelsSource}): [${modeLabels.option1Label}, ${modeLabels.option2Label}, ${modeLabels.option3Label}]`);

  // ── 3. LOOP: generate 3 plans from the same scored pool ───────────────
  const configs = isRestDay ? REST_DAY_CONFIGS : TRAINING_DAY_CONFIGS;
  const results: WorkoutTrioOption[] = [];
  const sessionBlacklist = new Set<string>();
  const usedTitles = new Set<string>();

  const generator = createWorkoutGenerator();

  for (let i = 0; i < 3; i++) {
    const cfg = configs[i];
    const label = modeLabels[cfg.key];

    // Clone the scored pool so each option starts from the same base
    let optionPool = pipeline.scoredExercises.map(se => ({
      ...se,
      score: se.score,
      reasoning: [...se.reasoning],
    }));

    // Session Blacklist: penalize exercises from prior options
    if (sessionBlacklist.size > 0) {
      for (const se of optionPool) {
        if (sessionBlacklist.has(se.exercise.id)) {
          se.score -= 50;
          se.reasoning.push('trio_blacklist:-50');
        }
      }
    }

    // Resolve effective difficulty (respect intensity gating)
    let optionDifficulty: DifficultyLevel = cfg.difficulty;
    if (optionDifficulty === 3 && pipeline.gatingResult.isIntenseLocked) {
      optionDifficulty = 2;
      console.log(`[WorkoutTrio] Option ${i + 1}: Intense locked → clamped to D2`);
    }

    // Build per-option generator context (inherits all Sprint 3 context)
    const optionContext: WorkoutGenerationContext = {
      ...pipeline.baseGeneratorContext,
      difficulty: optionDifficulty,
      recentExerciseIds: sessionBlacklist.size > 0
        ? new Set([
            ...Array.from(pipeline.baseGeneratorContext.recentExerciseIds ?? []),
            ...Array.from(sessionBlacklist),
          ])
        : pipeline.baseGeneratorContext.recentExerciseIds,
    };

    // Generate workout from the shared scored pool
    const workout = generator.generateWorkout(optionPool, optionContext);

    // Attach AI cue fallback
    if (!workout.aiCue && pipeline.aiCue) {
      workout.aiCue = pipeline.aiCue;
    }

    // Warmup (using shared allExercises, userProgramLevels, childDomains)
    const mainExercises = workout.exercises.filter(
      ex => ex.exerciseRole !== 'warmup' && ex.exerciseRole !== 'cooldown',
    );
    prependWarmupExercises(
      workout,
      pipeline.allExercises,
      pipeline.userProgramLevels,
      pipeline.effectiveFilterLocation,
      pipeline.resolvedChildDomains,
      mainExercises,
    );

    // Cooldown
    appendCooldownExercises(
      workout,
      pipeline.allExercises,
      pipeline.filterContext,
      pipeline.effectiveFilterLocation,
    );

    // Post-processing (Option 2 & 3 modifiers)
    if (cfg.postProcess === 'intense') {
      applyIntenseModifiers(workout, sessionBlacklist, pipeline.userProgramLevels, pipeline.allExercises);
    } else if (cfg.postProcess === 'easy_naked') {
      applyNakedStrengthStrict(workout, sessionBlacklist, pipeline.allExercises);
      applyEasyLevelDowngrade(workout, pipeline.userProgramLevels, pipeline.allExercises);
    } else if (cfg.postProcess === 'naked') {
      applyNakedStrengthStrict(workout, sessionBlacklist, pipeline.allExercises);
    } else if (cfg.postProcess === 'mobility_tag') {
      applyTagPreference(workout, 'mobility', sessionBlacklist);
    } else if (cfg.postProcess === 'flexibility_tag') {
      applyTagPreference(workout, 'flexibility', sessionBlacklist);
    }

    // Resolve dynamic title/description/logicCue from Firestore metadata
    try {
      const muscleCounts: Record<string, number> = {};
      workout.exercises.forEach(ex => {
        const muscle = ex.exercise.primaryMuscle;
        if (muscle) muscleCounts[muscle] = (muscleCounts[muscle] || 0) + 1;
      });
      const totalEx = workout.exercises.length || 1;
      const dominantMuscle = Object.entries(muscleCounts)
        .filter(([, count]) => count / totalEx > 0.5)
        .sort((a, b) => b[1] - a[1])[0]?.[0];

      const categoryLabelsMap: Record<string, string> = {
        strength: 'כוח', volume: 'נפח', endurance: 'סיבולת',
        skills: 'סקילס', mobility: 'ניידות', hiit: 'HIIT',
        general: 'כללי', maintenance: 'תחזוקת גוף',
      };
      const hasMobility = workout.exercises.some(ex => ex.exercise.tags?.includes('mobility'));
      const hasSkills = workout.exercises.some(ex => ex.exercise.tags?.includes('skill'));
      let cat = 'general';
      if (hasMobility && workout.exercises.filter(ex => ex.exercise.tags?.includes('mobility')).length > totalEx / 2) cat = 'mobility';
      else if (hasSkills) cat = 'skills';
      else if (workout.structure === 'circuit' || workout.structure === 'emom') cat = 'hiit';

      const optionMetaCtx: WorkoutMetadataContext = {
        ...pipeline.metadataCtxBase,
        category: cat,
        durationMinutes: workout.estimatedDuration,
        difficulty: workout.difficulty,
        dominantMuscle,
        categoryLabel: categoryLabelsMap[cat] || 'אימון',
      };

      const variant: TrioVariant = cfg.postProcess === 'intense' ? 'intense'
        : cfg.postProcess === 'easy_naked' ? 'easy'
        : cfg.postProcess === 'naked' ? 'naked'
        : 'balanced';

      const logicTagOverrides = _computeLogicTagOverrides(variant, workout, cfg);

      const metadata = await resolveWorkoutMetadata(optionMetaCtx, variant, logicTagOverrides);
      if (metadata.title) workout.title = metadata.title;
      if (metadata.description) workout.description = metadata.description;
      if (metadata.aiCue) workout.aiCue = metadata.aiCue;

      if (metadata.logicCue) {
        workout.logicCue = metadata.logicCue;
      } else {
        workout.logicCue = _computeFallbackLogicCue(variant);
      }
    } catch {
      // Non-critical — generator fallback strings are already in place
    }

    // Dedup titles: if another option already claimed this title, append a suffix
    if (workout.title && usedTitles.has(workout.title)) {
      const DEDUP_SUFFIXES = ['(משלים)', '(גמיש)'];
      const suffix = DEDUP_SUFFIXES[Math.min(i - 1, DEDUP_SUFFIXES.length - 1)] ?? `(${i + 1})`;
      workout.title = `${workout.title} ${suffix}`;
    }
    if (workout.title) usedTitles.add(workout.title);

    // Collect main exercise IDs into blacklist for next iteration
    workout.exercises
      .filter(ex => ex.exerciseRole !== 'warmup' && ex.exerciseRole !== 'cooldown')
      .forEach(ex => sessionBlacklist.add(ex.exercise.id));

    const result: HomeWorkoutResult = {
      workout,
      meta: pipeline.resultMeta,
    };

    results.push({ label, result });

    console.log(
      `[WorkoutTrio] Option ${i + 1} (${label}): ` +
      `D${optionDifficulty}, ${workout.exercises.length} exercises, ` +
      `${workout.totalPlannedSets} sets, ~${workout.estimatedDuration}min`,
    );
  }

  // ── 4. Summary log ────────────────────────────────────────────────────
  logTrioSummary(results, isRestDay);

  console.groupEnd();

  return {
    options: results as [WorkoutTrioOption, WorkoutTrioOption, WorkoutTrioOption],
    isRestDay,
    labelsSource,
    meta: pipeline.resultMeta,
  };
}

// ============================================================================
// SHARED PIPELINE — Extract expensive I/O + scoring (run ONCE)
// ============================================================================

import type { ScoredExercise, ContextualFilterContext as _CFCtx } from '../logic/ContextualEngine';

interface SharedPipelineState {
  scoredExercises: ScoredExercise[];
  allExercises: Exercise[];
  filterContext: ContextualFilterContext;
  baseGeneratorContext: WorkoutGenerationContext;
  userProgramLevels: Map<string, number>;
  resolvedChildDomains: string[];
  effectiveFilterLocation: ExecutionLocation;
  gatingResult: { isIntenseLocked: boolean; lockReason?: string };
  aiCue?: string;
  resultMeta: HomeWorkoutResult['meta'];
  metadataCtxBase: WorkoutMetadataContext;
}

/**
 * Builds the shared pipeline state: fetches data, resolves context, runs
 * ContextualEngine for scoring. Everything that is IDENTICAL across the 3
 * options is computed here — exactly once.
 *
 * Sprint 3 integrity: domainBudgets, Vertical Preference (+25/+12), and the
 * 4-vs-6 sets fix all flow through baseGeneratorContext untouched.
 */
async function _buildSharedPipeline(
  options: HomeWorkoutOptions,
): Promise<SharedPipelineState> {
  const {
    userProfile,
    location = 'home',
    intentMode = 'normal',
    availableTime = 30,
    difficulty: requestedDifficulty = 2,
    shadowMatrix,
    injuryOverride,
    equipmentOverride,
    daysInactiveOverride,
    personaOverride,
    timeOfDay: timeOfDayOverride,
    isFirstSessionInProgram,
    remainingWeeklyBudget,
    weeklyBudgetUsagePercent,
    weeklyIntenseCount = 0,
    isRecoveryDay,
    maxIntenseWorkoutsPerWeek,
    protocolProbability,
    preferredProtocols,
    straightArmRatio,
    levelDefaultRestSeconds,
    restMultiplier,
    selectedDate,
    scheduledProgramIds,
    isScheduledRestDay = false,
    domainSetsCompletedThisWeek,
    remainingScheduleDays,
    recentExerciseIds,
  } = options;

  // ── 0. UTS Schedule Override ──────────────────────────────────────────
  const fallbackProgram = userProfile.progression?.activePrograms?.[0]?.templateId || 'full_body';
  const effectiveProgramIds = scheduledProgramIds?.length ? scheduledProgramIds : [fallbackProgram];

  const effectiveProfile: typeof userProfile = {
    ...userProfile,
    progression: {
      ...userProfile.progression,
      activePrograms: effectiveProgramIds.map(id => ({
        id, templateId: id, name: id,
        startDate: new Date(), durationWeeks: 52, currentWeek: 1, focusDomains: [],
      })),
    },
  };

  const effectiveIsRecovery = isScheduledRestDay ? true : (isRecoveryDay ?? false);

  // ── 1. Fetch data ─────────────────────────────────────────────────────
  const baseUserLevel = getBaseUserLevel(effectiveProfile);
  const [allExercises, gymEquipmentList, allPrograms] = await Promise.all([
    getAllExercises(),
    getAllGymEquipment(),
    getCachedPrograms(),
  ]);

  // ── 1b. Level-aware exercise filtering (same as generateHomeWorkout) ─
  const userDomains = effectiveProfile.progression?.domains ?? {};
  const userTracks = effectiveProfile.progression?.tracks ?? {};
  const userProgramLevels = new Map<string, number>();
  for (const [trackId, trackData] of Object.entries(userTracks)) {
    userProgramLevels.set(trackId, trackData?.currentLevel ?? 1);
  }
  for (const [domainId, domainData] of Object.entries(userDomains)) {
    if (!userProgramLevels.has(domainId)) {
      userProgramLevels.set(domainId, userTracks[domainId]?.currentLevel ?? domainData?.currentLevel ?? 1);
    }
  }
  for (const ap of effectiveProfile.progression?.activePrograms ?? []) {
    if (ap.templateId && !userProgramLevels.has(ap.templateId)) {
      userProgramLevels.set(ap.templateId, 1);
    }
  }

  const activeProgramId = effectiveProfile.progression?.activePrograms?.[0]?.templateId;
  const resolvedChildDomains = resolveChildDomainsForParent(activeProgramId, userProfile);

  let exercises: Exercise[];
  if (userProgramLevels.size > 0 || resolvedChildDomains.length > 0) {
    const validProgramIds = new Set([
      ...Array.from(userProgramLevels.keys()),
      ...resolvedChildDomains,
    ]);
    const filterByTolerance = (tolerance: number) =>
      allExercises.filter(ex => {
        if (ex.targetPrograms?.length) {
          return ex.targetPrograms.some(tp => {
            const userLevel = userProgramLevels.get(tp.programId) ?? baseUserLevel;
            return Math.abs(tp.level - userLevel) <= tolerance;
          });
        }
        if (ex.programIds?.length) return ex.programIds.some(pid => validProgramIds.has(pid));
        return false;
      });
    let levelMatched = filterByTolerance(1);
    if (levelMatched.length < 4) levelMatched = filterByTolerance(2);
    if (levelMatched.length < 4) levelMatched = filterByTolerance(3);
    exercises = levelMatched.length >= 4 ? levelMatched : allExercises;
  } else {
    exercises = allExercises;
  }

  // ── 2. Derive contextual values ──────────────────────────────────────
  const daysInactive = daysInactiveOverride ?? calculateDaysInactive(userProfile);
  const injuries = extractInjuryShield(userProfile, injuryOverride);
  const persona = mapPersonaIdToLifestylePersona(userProfile, personaOverride);
  const lifestyles = collectLifestyles(userProfile, persona);
  let availableEquipment = [
    ...resolveEquipment(userProfile, location, equipmentOverride),
    ...gymEquipmentList.map(eq => eq.id),
  ];
  const envLocation = USE_PARK_FOR_TESTING ? 'park' : location;
  if (envLocation === 'park' || envLocation === 'street') {
    const parkGear = ['park_bench', 'park_step', 'pullup_bar', 'dip_bar', 'bars'];
    availableEquipment = [...new Set([...availableEquipment, ...parkGear])];
  }
  const timeOfDay = timeOfDayOverride ?? detectTimeOfDay();

  // ── 2b. Lead Program Budget ──────────────────────────────────────────
  const [leadBudget, globalMaxIntense] = await Promise.all([
    resolveActiveProgramBudget(userProfile, allPrograms),
    resolveGlobalMaxIntense(userProfile, allPrograms),
  ]);

  // ── 2c. Split Decision Engine ────────────────────────────────────────
  const scheduleDays = (userProfile.lifestyle?.scheduleDays?.length ?? 0) || 3;
  const isFullBodyMaster =
    resolvedChildDomains.length >= 4 &&
    ['push', 'pull', 'legs', 'core'].every(d => resolvedChildDomains.includes(d));

  let splitContext: SplitWorkoutContext;
  let resolvedDomainBudgets: Array<{ domain: string; level: number; weekly: number; daily: number }> | undefined;

  if (isFullBodyMaster) {
    const aggregate = await resolveAggregateFullBodyBudget(scheduleDays, userProgramLevels, allPrograms);
    resolvedDomainBudgets = aggregate.domainBudgets;
    splitContext = getWorkoutContext({
      userProfile: effectiveProfile,
      selectedDate: selectedDate ?? new Date().toISOString().split('T')[0],
      aggregateBudgetInfo: aggregate,
      domainSetsCompletedThisWeek,
      remainingScheduleDays,
    });
    // Phase 4: Deficit-aware daily budgets
    if (domainSetsCompletedThisWeek && remainingScheduleDays && remainingScheduleDays > 0) {
      resolvedDomainBudgets = aggregate.domainBudgets.map(db => {
        const completed = domainSetsCompletedThisWeek[db.domain] ?? 0;
        const remaining = Math.max(0, db.weekly - completed);
        return { ...db, daily: Math.max(1, Math.ceil(remaining / remainingScheduleDays)) };
      });
    }
  } else {
    const weeklyBudgetForSplit =
      leadBudget?.weeklyVolumeTarget ?? calculateWeeklyBudget(baseUserLevel, Math.max(1, scheduleDays));
    splitContext = getWorkoutContext({
      userProfile: effectiveProfile,
      weeklyBudget: weeklyBudgetForSplit,
      selectedDate: selectedDate ?? new Date().toISOString().split('T')[0],
    });
  }

  const resolvedMaxIntense = maxIntenseWorkoutsPerWeek ?? globalMaxIntense;

  // ── Intensity gating ─────────────────────────────────────────────────
  const gatingResult = getAvailableDifficulties({
    userLevel: baseUserLevel,
    daysInactive,
    weeklyIntenseCount,
    maxIntenseWorkoutsPerWeek: resolvedMaxIntense,
  });

  let detrainingLock = false;
  let volumeReductionOverride: number | undefined;
  if (daysInactive > 3) {
    detrainingLock = true;
    volumeReductionOverride = 0.40;
  }

  // ── 3. Build ContextualEngine context + run scoring (ONCE) ───────────
  const activeProgramFilters: string[] = [];
  if (shadowMatrix?.programs) {
    for (const [programKey, po] of Object.entries(shadowMatrix.programs)) {
      if (po?.override) activeProgramFilters.push(programKey);
    }
  }
  if (activeProgramFilters.length === 0) {
    const ap = effectiveProfile.progression?.activePrograms?.[0];
    const parentId = ap?.templateId ?? ap?.id;
    const resolvedDomains = resolveChildDomainsForParent(parentId, userProfile);
    if (resolvedDomains.length > 0) {
      activeProgramFilters.push(...resolvedDomains);
    } else if (ap?.focusDomains?.length) {
      activeProgramFilters.push(...ap.focusDomains);
    } else {
      const derived = [...new Set([
        ...Object.keys(userProfile.progression?.domains ?? {}),
        ...(userProfile.progression?.activePrograms ?? []).map(p => p.templateId).filter(Boolean),
      ])];
      for (const pid of derived) {
        const prog = allPrograms.find(p => p.id === pid);
        if (prog?.isMaster && prog.subPrograms?.length) {
          for (const child of prog.subPrograms) {
            if (!derived.includes(child)) derived.push(child);
          }
        }
      }
      if (derived.length > 0) activeProgramFilters.push(...derived);
    }
  }

  const effectiveFilterLocation = USE_PARK_FOR_TESTING ? 'park' : location;

  const filterContext: ContextualFilterContext = {
    location: effectiveFilterLocation,
    lifestyles,
    injuryShield: injuries,
    intentMode,
    availableEquipment,
    getUserLevelForExercise: (exercise: Exercise) =>
      getEffectiveLevelForExercise(exercise, userProfile, shadowMatrix, baseUserLevel),
    levelTolerance: 3,
    activeProgramFilters: activeProgramFilters.length > 0 ? activeProgramFilters : undefined,
    excludedMuscleGroups:
      splitContext.excludedMuscleGroups.length > 0 ? splitContext.excludedMuscleGroups : undefined,
  };

  // ── 4. Run ContextualEngine (SINGLE PASS — shared across all 3 options) ─
  const engine = createContextualEngine();
  const filterResult = engine.filterAndScore(exercises, filterContext);

  console.log(
    `[WorkoutTrio] Shared pipeline: ${filterResult.exercises.length} scored exercises ` +
    `(${filterResult.excludedCount} excluded), ${allExercises.length} total in DB`,
  );

  // ── 5a. Progressive Overload goals ───────────────────────────────────
  let goalExerciseIds: Set<string> | undefined;
  let goalTargets: Map<string, { targetValue: number; unit: 'reps' | 'seconds' }> | undefined;
  let levelProgressPercent = 0;
  let workoutsCompletedInLevel = 0;

  const primaryProgramId = Array.from(userProgramLevels.entries())[0]?.[0];
  const primaryProgramLevel = primaryProgramId ? userProgramLevels.get(primaryProgramId) ?? 1 : 1;

  if (primaryProgramId) {
    try {
      const levelSettings = await getProgramLevelSetting(primaryProgramId, primaryProgramLevel);
      if (levelSettings?.targetGoals?.length) {
        goalExerciseIds = new Set(levelSettings.targetGoals.map(g => g.exerciseId));
        goalTargets = new Map(
          levelSettings.targetGoals.map(g => [g.exerciseId, { targetValue: g.targetValue, unit: g.unit }]),
        );
      }
    } catch { /* non-critical */ }
    const track = userProfile.progression?.tracks?.[primaryProgramId];
    if (track) {
      levelProgressPercent = track.percent ?? 0;
      workoutsCompletedInLevel = track.totalWorkoutsCompleted ?? 0;
    }
  }

  // ── 5b. Base generator context (Sprint 3 integrity preserved) ────────
  const baseGeneratorContext: WorkoutGenerationContext = {
    availableTime,
    userLevel: baseUserLevel,
    daysInactive,
    intentMode,
    persona,
    location,
    injuryCount: injuries.length,
    energyLevel: 'medium',
    difficulty: requestedDifficulty,
    userWeight: effectiveProfile.core?.weight ?? 70,
    isFirstSessionInProgram,
    remainingWeeklyBudget,
    weeklyBudgetUsagePercent,
    isRecoveryDay: effectiveIsRecovery,
    detrainingLock,
    volumeReductionOverride,
    protocolProbability,
    preferredProtocols,
    straightArmRatio,
    levelDefaultRestSeconds,
    restMultiplier,
    maxSets: leadBudget?.maxSets,
    splitType: splitContext.splitType,
    dominanceRatio: splitContext.splitLogic.dominanceRatio,
    priority1SkillIds: splitContext.priority1SkillIds,
    priority2SkillIds: splitContext.priority2SkillIds,
    priority3SkillIds: splitContext.priority3SkillIds,
    dailySetBudget: splitContext.dailySetBudget,
    requiredDomains: resolvedChildDomains.length > 0 ? resolvedChildDomains : undefined,
    globalExercisePool: allExercises,
    userProgramLevels,
    userId: effectiveProfile.id,
    selectedDate: selectedDate ?? new Date().toISOString().split('T')[0],
    goalExerciseIds,
    goalTargets,
    levelProgressPercent,
    workoutsCompletedInLevel,
    domainBudgets: resolvedDomainBudgets,
    recentExerciseIds: recentExerciseIds?.length ? new Set(recentExerciseIds) : undefined,
  };

  // ── Build metadata context base for per-option title/description resolution ─
  const activeChildProgramId = userProfile.progression?.activePrograms?.[0]?.templateId ?? undefined;
  const programTracks = userProfile.progression?.tracks ?? {};
  const childTrackLevel = activeChildProgramId
    ? (programTracks[activeChildProgramId]?.level
       ?? userProgramLevels.get(activeChildProgramId)
       ?? (primaryProgramId ? userProgramLevels.get(primaryProgramId) ?? 1 : 1))
    : (primaryProgramId ? userProgramLevels.get(primaryProgramId) ?? 1 : 1);

  let ancestorProgramIds: string[] = [];
  if (activeChildProgramId) {
    try {
      ancestorProgramIds = await resolveAncestorProgramIds(activeChildProgramId);
    } catch { /* non-critical */ }
  }

  const metadataCtxBase: WorkoutMetadataContext = {
    persona,
    location,
    timeOfDay,
    gender: (userProfile.core?.gender as 'male' | 'female') ?? undefined,
    daysInactive,
    sportType: userProfile.progression?.tracks?.['current']?.sportType,
    programProgress: userProfile.progression?.programProgress,
    currentProgram: userProfile.progression?.currentProgram,
    targetLevel: userProfile.progression?.targetLevel,
    isStudying: location === 'library',
    dayPeriod: detectDayPeriod(),
    isActiveReserve: userProfile.core?.isActiveReserve ?? false,
    activeProgramId: activeChildProgramId,
    programLevel: childTrackLevel,
    ancestorProgramIds,
  };

  return {
    scoredExercises: filterResult.exercises,
    allExercises,
    filterContext,
    baseGeneratorContext,
    userProgramLevels,
    resolvedChildDomains,
    effectiveFilterLocation,
    gatingResult,
    aiCue: filterResult.aiCue,
    resultMeta: {
      daysInactive,
      persona,
      location,
      timeOfDay,
      injuryAreas: injuries,
      exercisesConsidered: filterResult.exercises.length,
      exercisesExcluded: filterResult.excludedCount,
    },
    metadataCtxBase,
  };
}

// ============================================================================
// TRIO MODIFIERS — Post-processing for Options 2 & 3
// ============================================================================

/**
 * Option 2 — "Intense" post-processor.
 *
 * Aggressive trimming for a focused, high-intensity session:
 *   1. Strip ALL general warmups. Keep only 1 potentiation warmup.
 *   2. From main pool: keep top 3 high-score exercises + 1 core exercise.
 *   3. Flat 45 s rest for every exercise (warmup, main, cooldown).
 *   4. Override workout.difficulty = 3 → UI shows ⚡⚡⚡.
 *   5. DAVID RULE: At least one exercise must be userLevel + 1.
 *      If none exists, scan the global pool for a level+1 bodyweight exercise.
 *   6. Recalculate estimatedDuration and totalPlannedSets.
 */
function applyIntenseModifiers(
  workout: GeneratedWorkout,
  _blacklistedIds: Set<string>,
  userProgramLevels: Map<string, number>,
  allExercises: Exercise[],
): void {
  const FLAT_REST = 45;
  const MAX_MAIN = 3;
  const MAX_CORE = 1;
  const MAX_POTENTIATION = 1;

  const warmups = workout.exercises.filter(ex => ex.exerciseRole === 'warmup');
  const cooldowns = workout.exercises.filter(ex => ex.exerciseRole === 'cooldown');
  const main = workout.exercises.filter(
    ex => ex.exerciseRole !== 'warmup' && ex.exerciseRole !== 'cooldown',
  );

  const potentiationWarmups = warmups.filter(ex =>
    ex.reasoning.some(r => r.includes('potentiation')),
  );
  const keptWarmups = potentiationWarmups.slice(0, MAX_POTENTIATION);
  const droppedWarmups = warmups.length - keptWarmups.length;

  const isCore = (ex: typeof main[0]): boolean => {
    const mg = ex.exercise.movementGroup;
    const pm = ex.exercise.primaryMuscle;
    return mg === 'core' || pm === 'core' || pm === 'abs';
  };

  const corePool = main.filter(isCore).sort((a, b) => b.score - a.score);
  const nonCorePool = main.filter(ex => !isCore(ex));

  nonCorePool.sort((a, b) => {
    const aVert = a.exercise.movementGroup?.includes('vertical') ? 1 : 0;
    const bVert = b.exercise.movementGroup?.includes('vertical') ? 1 : 0;
    if (bVert !== aVert) return bVert - aVert;
    return b.score - a.score;
  });

  const keptNonCore = nonCorePool.slice(0, MAX_MAIN);
  const keptCore = corePool.slice(0, MAX_CORE);
  const keptMain = [...keptNonCore, ...keptCore];

  // ── DAVID RULE: ensure at least one exercise is userLevel + 1 ────────
  const hasLevelPlusOne = keptMain.some(ex => {
    if (!ex.exercise.targetPrograms?.length) return false;
    return ex.exercise.targetPrograms.some(tp => {
      const userLvl = userProgramLevels.get(tp.programId);
      return userLvl !== undefined && tp.level === userLvl + 1;
    });
  });

  if (!hasLevelPlusOne) {
    const usedIds = new Set(keptMain.map(ex => ex.exercise.id));
    const targetLevel = Math.max(...Array.from(userProgramLevels.values())) + 1;
    const candidate = allExercises.find(ex =>
      !usedIds.has(ex.id)
      && ex.targetPrograms?.some(tp => tp.level === targetLevel)
      && ex.exerciseRole !== 'cooldown'
      && ex.exerciseRole !== 'warmup',
    );
    if (candidate && keptMain.length > 0) {
      const replaced = keptMain[keptMain.length - 1];
      keptMain[keptMain.length - 1] = {
        ...replaced,
        exercise: candidate,
        reasoning: [...replaced.reasoning, `david_rule:level_${targetLevel}_inject`],
      };
      console.log(
        `[WorkoutTrio] David Rule: injected "${candidate.id}" (L${targetLevel}) ` +
        `replacing "${replaced.exercise.id}"`,
      );
    }
  }

  const allKept = [...keptWarmups, ...keptMain, ...cooldowns];
  for (const ex of allKept) {
    ex.restSeconds = FLAT_REST;
    ex.reasoning.push('express:flat-45s');
  }

  workout.exercises = allKept;
  workout.totalPlannedSets = allKept.reduce((s, ex) => s + ex.sets, 0);

  const durationSeconds = allKept.reduce(
    (acc, ex) => acc + ex.sets * ((ex.isTimeBased ? ex.reps : 45) + ex.restSeconds),
    0,
  );
  workout.estimatedDuration = Math.max(1, Math.round(durationSeconds / 60));

  workout.difficulty = 3 as any;

  console.log(
    `[WorkoutTrio] Intense: ${keptWarmups.length} potentiation, ` +
    `${keptNonCore.length} main + ${keptCore.length} core, ` +
    `dropped ${droppedWarmups} warmups, rest=flat ${FLAT_REST}s, ` +
    `David Rule: ${hasLevelPlusOne ? 'natural' : 'injected'} → ~${workout.estimatedDuration} min`,
  );
}

/**
 * Option 3 Training: "ללא ציוד" — STRICT ZERO GEAR
 *
 * Enforces 0 equipment items across all main exercises:
 *   1. Remove every main exercise that requires gear.
 *   2. If the remaining pool < 3 exercises, backfill from the global pool
 *      with bodyweight-only alternatives (matching user programs when possible).
 *   3. Difficulty is set to 2 (2 bolts).
 */
function applyNakedStrengthStrict(
  workout: GeneratedWorkout,
  _blacklistedIds: Set<string>,
  allExercises: Exercise[],
): void {
  const isNaked = (ex: typeof workout.exercises[0]): boolean => {
    const methodAny = ex.method as { gearIds?: string[]; gearId?: string } | undefined;
    const allGear = methodAny?.gearIds ?? (methodAny?.gearId ? [methodAny.gearId] : []);
    return allGear.length === 0
      || allGear.every(g => !g || g.toLowerCase() === 'bodyweight' || g.toLowerCase() === 'none');
  };

  const isRawExNaked = (ex: Exercise): boolean => {
    const methods = ex.executionMethods ?? [];
    if (methods.length === 0) return true;
    return methods.some(m => {
      const gear = (m as any).gearIds ?? ((m as any).gearId ? [(m as any).gearId] : []);
      return gear.length === 0
        || gear.every((g: string) => !g || g.toLowerCase() === 'bodyweight' || g.toLowerCase() === 'none');
    });
  };

  const warmups = workout.exercises.filter(ex => ex.exerciseRole === 'warmup');
  const cooldowns = workout.exercises.filter(ex => ex.exerciseRole === 'cooldown');
  const main = workout.exercises.filter(
    ex => ex.exerciseRole !== 'warmup' && ex.exerciseRole !== 'cooldown',
  );

  let nakedMain = main.filter(ex => isNaked(ex));
  const gearRemoved = main.length - nakedMain.length;

  // Backfill from global pool if we lost too many exercises
  const MIN_EXERCISES = 3;
  if (nakedMain.length < MIN_EXERCISES) {
    const usedIds = new Set([
      ...nakedMain.map(ex => ex.exercise.id),
      ...Array.from(_blacklistedIds),
    ]);
    const candidates = allExercises.filter(ex =>
      !usedIds.has(ex.id)
      && isRawExNaked(ex)
      && ex.exerciseRole !== 'cooldown'
      && ex.exerciseRole !== 'warmup',
    );
    const needed = MIN_EXERCISES - nakedMain.length;
    const backfill = candidates.slice(0, needed);
    for (const raw of backfill) {
      nakedMain.push({
        exercise: raw,
        score: 0,
        reasoning: ['naked_backfill:bodyweight_global_pool'],
        sets: 3,
        reps: 10,
        restSeconds: 60,
        isTimeBased: false,
        exerciseRole: 'main',
        method: (raw.executionMethods?.[0] ?? {}) as any,
      } as any);
    }
    console.log(
      `[WorkoutTrio] Naked: backfilled ${backfill.length} bodyweight exercises from global pool`,
    );
  }

  workout.exercises = [...warmups, ...nakedMain, ...cooldowns];
  workout.totalPlannedSets = workout.exercises.reduce((s, ex) => s + ex.sets, 0);

  // Final gear audit
  const finalGearIds = new Set<string>();
  for (const ex of workout.exercises) {
    if (ex.exerciseRole === 'warmup' || ex.exerciseRole === 'cooldown') continue;
    const method = ex.method as { gearIds?: string[]; gearId?: string } | undefined;
    const ids = method?.gearIds ?? (method?.gearId ? [method.gearId] : []);
    for (const g of ids) {
      if (g && g.toLowerCase() !== 'bodyweight' && g.toLowerCase() !== 'none') {
        finalGearIds.add(g);
      }
    }
  }

  console.log(
    `[WorkoutTrio] Naked STRICT: removed ${gearRemoved} gear exercises, ` +
    `${nakedMain.length} bodyweight remain → ${workout.totalPlannedSets} total sets, ` +
    `Gear count: ${finalGearIds.size} ${finalGearIds.size === 0 ? '(0 Gear ✓)' : `⚠️ [${Array.from(finalGearIds).join(', ')}]`}`,
  );
}

/**
 * Easy Option — Level Downgrade (David's Rule, easy side)
 *
 * For the 1-bolt "easy day" option, prefer exercises at UserLevel - 1
 * where possible. If an exercise is at the user's exact level (or higher)
 * and a level-1 alternative exists in the global pool, swap it in.
 *
 * Also forces difficulty = 1.
 */
function applyEasyLevelDowngrade(
  workout: GeneratedWorkout,
  userProgramLevels: Map<string, number>,
  allExercises: Exercise[],
): void {
  workout.difficulty = 1 as any;

  const main = workout.exercises.filter(
    ex => ex.exerciseRole !== 'warmup' && ex.exerciseRole !== 'cooldown',
  );
  if (main.length === 0) return;

  const maxUserLevel = Math.max(...Array.from(userProgramLevels.values()), 1);
  const easyLevel = Math.max(1, maxUserLevel - 1);
  const usedIds = new Set(workout.exercises.map(ex => ex.exercise.id));

  let swapped = 0;
  for (const ex of main) {
    const tp = ex.exercise.targetPrograms;
    if (!tp?.length) continue;

    const exLevel = tp[0]?.level ?? maxUserLevel;
    if (exLevel <= easyLevel) continue;

    const replacement = allExercises.find(raw =>
      !usedIds.has(raw.id)
      && raw.targetPrograms?.some(t => t.level === easyLevel)
      && raw.exerciseRole !== 'cooldown'
      && raw.exerciseRole !== 'warmup'
      && raw.primaryMuscle === ex.exercise.primaryMuscle,
    );
    if (replacement) {
      usedIds.delete(ex.exercise.id);
      usedIds.add(replacement.id);
      ex.exercise = replacement;
      ex.reasoning.push(`easy_downgrade:L${exLevel}→L${easyLevel}`);
      ex.method = (replacement.executionMethods?.[0] ?? ex.method) as any;
      swapped++;
    }
  }

  console.log(
    `[WorkoutTrio] Easy Downgrade: target L${easyLevel}, swapped ${swapped}/${main.length} exercises`,
  );
}

/**
 * Rest Day Options 2 & 3: Tag-based preference
 *   - Boost exercises matching the tag (+30), re-sort by score
 */
// ============================================================================
// LOGIC CUE HELPERS
// ============================================================================

function _computeLogicTagOverrides(
  variant: TrioVariant,
  _workout: GeneratedWorkout,
  _cfg: TrioOptionConfig,
): { intensityReason?: string; challengeType?: string; equipmentAdaptation?: string } {
  switch (variant) {
    case 'intense':
      return {
        intensityReason: 'מנוחות מקוצרות ללחץ מטבולי',
        challengeType: 'תרגיל ברמה +1 הוזרק לאתגר כוח',
      };
    case 'easy':
      return {
        intensityReason: 'עצימות מופחתת להתאוששות',
        challengeType: 'תרגילים ברמה -1 ליום קליל',
        equipmentAdaptation: 'חלופות משקל גוף בלבד – ללא ציוד',
      };
    case 'naked':
      return {
        equipmentAdaptation: 'חלופות משקל גוף בלבד – ללא ציוד',
      };
    default:
      return {};
  }
}

function _computeFallbackLogicCue(variant: TrioVariant): string {
  switch (variant) {
    case 'intense':
      return 'אימון עם אתגר רמה +1 ומנוחות מקוצרות – לדחיפת גבולות.';
    case 'easy':
      return 'אימון קליל ללא ציוד, עם תרגילים ברמה נמוכה יותר – ליום התאוששות.';
    case 'naked':
      return 'אימון ללא ציוד – חלופות משקל גוף מלא.';
    default:
      return 'אימון מאוזן המותאם לפרופיל שלך.';
  }
}

function applyTagPreference(
  workout: GeneratedWorkout,
  tag: string,
  _blacklistedIds: Set<string>,
): void {
  const mainExercises = workout.exercises.filter(
    ex => ex.exerciseRole !== 'warmup' && ex.exerciseRole !== 'cooldown',
  );

  let boosted = 0;
  for (const ex of mainExercises) {
    const tags = (ex.exercise.tags as string[]) ?? [];
    const matchesTag = tags.includes(tag)
      || ex.exercise.exerciseRole === tag
      || ex.exercise.movementGroup === tag;
    if (matchesTag) {
      ex.score += 30;
      ex.reasoning.push(`rest_tag_pref:+30(${tag})`);
      boosted++;
    }
  }

  mainExercises.sort((a, b) => b.score - a.score);
  const warmups = workout.exercises.filter(ex => ex.exerciseRole === 'warmup');
  const cooldowns = workout.exercises.filter(ex => ex.exerciseRole === 'cooldown');
  workout.exercises = [...warmups, ...mainExercises, ...cooldowns];

  console.log(`[WorkoutTrio] Tag preference '${tag}': boosted ${boosted}/${mainExercises.length} exercises`);
}

// ============================================================================
// TRIO LOGGING
// ============================================================================

function logTrioSummary(
  options: WorkoutTrioOption[],
  isRestDay: boolean,
): void {
  const boltLabel = (d: number) => '⚡'.repeat(Math.min(3, Math.max(1, d)));

  console.group(`[WorkoutTrio] ═══ SUMMARY (${isRestDay ? 'REST DAY' : 'TRAINING DAY'}) ═══`);
  for (let idx = 0; idx < options.length; idx++) {
    const opt = options[idx];
    const w = opt.result.workout;
    const mainExercises = w.exercises.filter(
      ex => ex.exerciseRole !== 'warmup' && ex.exerciseRole !== 'cooldown',
    );
    const warmupCount = w.exercises.filter(ex => ex.exerciseRole === 'warmup').length;
    const exerciseNames = mainExercises.map(ex => {
      const name = typeof ex.exercise.name === 'string'
        ? ex.exercise.name
        : (ex.exercise.name as any)?.he || ex.exercise.id;
      return name;
    });

    const gearIds = new Set<string>();
    for (const ex of w.exercises) {
      if (ex.exerciseRole === 'warmup' || ex.exerciseRole === 'cooldown') continue;
      const method = ex.method as { gearIds?: string[]; gearId?: string } | undefined;
      const ids = method?.gearIds ?? (method?.gearId ? [method.gearId] : []);
      for (const g of ids) {
        if (g && g.toLowerCase() !== 'bodyweight' && g.toLowerCase() !== 'none') {
          gearIds.add(g);
        }
      }
    }

    console.group(`Option ${idx + 1}: ${opt.label}`);
    console.log(`  Difficulty: ${w.difficulty} ${boltLabel(w.difficulty)}`);
    console.log(`  Title: ${w.title || '(fallback)'}`);
    console.log(`  Duration: ~${w.estimatedDuration} min`);
    console.log(`  Warmups: ${warmupCount} | Main: ${mainExercises.length} | Sets: ${w.totalPlannedSets}`);
    console.log(`  Gear: ${gearIds.size} ${gearIds.size === 0 ? '(0 Gear ✓)' : `⚠️ [${Array.from(gearIds).join(', ')}]`}`);
    console.log(`  Exercises: [${exerciseNames.join(', ')}]`);
    console.groupEnd();
  }

  const sets = options.map(o =>
    new Set(
      o.result.workout.exercises
        .filter(ex => ex.exerciseRole !== 'warmup' && ex.exerciseRole !== 'cooldown')
        .map(ex => ex.exercise.id),
    ),
  );
  const overlap = (a: Set<string>, b: Set<string>) => Array.from(a).filter(id => b.has(id)).length;
  console.log(
    `Overlap: 1↔2=${overlap(sets[0], sets[1])}, 1↔3=${overlap(sets[0], sets[2])}, 2↔3=${overlap(sets[1], sets[2])}`,
  );
  console.groupEnd();
}
