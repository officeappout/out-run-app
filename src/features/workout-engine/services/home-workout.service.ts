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
  WorkoutExercise,
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
} from './user-profile.utils';
import { getBaseUserLevel, buildUserProgramLevels } from './level-resolution.utils';
import {
  getCachedPrograms,
  FULL_BODY_CHILD_DOMAINS,
  resolveChildDomainsForParent,
  resolveAncestorProgramIds,
  buildIdToSlugMapFromPrograms,
  resolveToSlug,
} from './program-hierarchy.utils';
import { prependWarmupExercises } from './warmup.service';
import { appendCooldownExercises } from './cooldown.service';
import type {
  HomeWorkoutOptions,
  HomeWorkoutResult,
  HomeWorkoutTrioResult,
  WorkoutTrioOption,
  WorkoutOptionLabel,
} from './home-workout.types';

// -- Trio extraction modules --
import {
  applyIntenseOption,
  applyFlowRegression,
  applyTagPreference,
  logTrioSummary,
} from './trio-modifiers.service';
import {
  fetchTrioLabels,
  computeLogicTagOverrides,
  computeFallbackLogicCue,
  computeLevelAwareLogicCue,
  type TrioOptionConfig,
} from './trio-labels.service';

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
 * DEFAULT_LOCATION: Until enough home-specific videos are uploaded,
 * default to 'park' so the engine prioritises exercises with pull-up bar
 * and parallel bar methods (which already have videos mapped).
 */
const DEFAULT_LOCATION: ExecutionLocation = 'park';

// ============================================================================
// MAIN ORCHESTRATOR — Thin Wrapper (delegates to Trio pipeline)
// ============================================================================

/**
 * Generate a single home workout for the user.
 *
 * Delegates to the unified trio pipeline and returns the Balanced option
 * (center card, index 1). This ensures every code path flows through the
 * same shared builder — no duplicate Firestore fetches or level resolution.
 *
 * @example
 * ```ts
 * const result = await generateHomeWorkout({
 *   userProfile,
 *   location: 'park',
 *   availableTime: 30,
 * });
 * // result.workout → GeneratedWorkout
 * ```
 */
export async function generateHomeWorkout(
  options: HomeWorkoutOptions,
): Promise<HomeWorkoutResult> {
  const trio = await generateHomeWorkoutTrio(options);
  return trio.options[1].result;
}

// ============================================================================
// RECOVERY WORKOUT — Budget Floor (when weekly budget is exhausted)
// ============================================================================

async function generateRecoveryWorkout(
  allExercises: Exercise[],
  location: ExecutionLocation,
  remainingBudget: number,
  daysInactive: number,
  persona: LifestylePersona | null,
  timeOfDay: TimeOfDay,
  injuries: InjuryShieldArea[],
): Promise<HomeWorkoutResult> {
  const pool = allExercises.filter(ex => {
    if (ex.exerciseRole === 'cooldown') return true;
    const tags = (ex.tags ?? []) as string[];
    return tags.includes('flexibility') || tags.includes('mobility') || tags.includes('stretching');
  });

  const shuffled = pool.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(4, pool.length));

  const exercises: WorkoutExercise[] = selected.map(ex => {
    const method = ex.executionMethods?.[0] ?? {};
    return {
      exercise: ex,
      method: method as any,
      mechanicalType: (ex.mechanicalType || 'none') as any,
      sets: Math.min(3, Math.max(2, Math.floor(Math.random() * 2) + 2)),
      reps: 15,
      repsRange: { min: 10, max: 20 },
      isTimeBased: ex.type === 'time' || ex.mechanicalType === 'straight_arm',
      restSeconds: 45,
      priority: 'isolation' as const,
      score: 0,
      reasoning: [`recovery_mode: weekly_budget_remaining=${remainingBudget}`],
      programLevel: 1,
      isOverLevel: false,
      tier: 'flow' as const,
      levelDelta: 0,
      isGoalExercise: false,
      exerciseRole: 'main' as const,
    };
  });

  if (exercises.length === 0) {
    console.log('[HomeWorkout] recovery_mode: no cooldown/mobility exercises → rest day recommendation');
    const restWorkout: GeneratedWorkout = {
      title: 'יום מנוחה',
      description: 'תקציב האימון השבועי מוצה — מומלץ לנוח היום.',
      exercises: [],
      estimatedDuration: 0,
      structure: 'standard',
      difficulty: 1,
      mechanicalBalance: { straightArm: 0, bentArm: 0, hybrid: 0, ratio: '0:0', isBalanced: true },
      stats: { calories: 0, coins: 0, totalReps: 0, totalHoldTime: 0, difficultyMultiplier: 1 },
      isRecovery: true,
      totalPlannedSets: 0,
      pipelineLog: ['recovery_mode: rest_day (weekly_budget_exhausted)'],
    };
    return {
      workout: restWorkout,
      meta: { daysInactive, persona, location, timeOfDay, injuryAreas: injuries, exercisesConsidered: 0, exercisesExcluded: 0 },
    };
  }

  const totalSets = exercises.reduce((s, e) => s + e.sets, 0);
  const durationMin = Math.max(15, Math.min(20, Math.round(exercises.length * 4)));

  const workout: GeneratedWorkout = {
    title: 'אימון שחרור והתאוששות',
    description: 'אימון קל לניידות ושחרור — תקציב הסטים השבועי כמעט מוצה.',
    exercises,
    estimatedDuration: durationMin,
    structure: 'standard',
    difficulty: 1,
    mechanicalBalance: { straightArm: 0, bentArm: 0, hybrid: 0, ratio: '0:0', isBalanced: true },
    stats: { calories: 0, coins: 0, totalReps: totalSets * 15, totalHoldTime: 0, difficultyMultiplier: 1 },
    isRecovery: true,
    totalPlannedSets: totalSets,
    pipelineLog: [`recovery_mode: weekly_budget_remaining=${remainingBudget}, exercises=${exercises.length}, sets=${totalSets}`],
  };

  console.log(
    `[HomeWorkout] Recovery workout: ${exercises.length} exercises, ${totalSets} sets, ~${durationMin} min`,
  );

  return {
    workout,
    meta: { daysInactive, persona, location, timeOfDay, injuryAreas: injuries, exercisesConsidered: allExercises.length, exercisesExcluded: allExercises.length - pool.length },
  };
}

// ============================================================================
// WARMUP & COOLDOWN — Delegated to ./warmup.service.ts & ./cooldown.service.ts
// ============================================================================

// ============================================================================
// WORKOUT TRIO — Sprint 4: Single-pass 3-option generation
// ============================================================================

// ── TRIO OPTION CONFIGS ─────────────────────────────────────────────────

/**
 * Carousel slot order: [0] = Right peek, [1] = CENTER (Best Match), [2] = Left peek
 *
 * Training Day:
 *   [0] Flow/Technical (1 bolt) — regression -1/-3, rep compensation, BW + essential gear
 *   [1] Balanced / Best Match (2 bolts) — primary schedule pick
 *   [2] Intense / David Rule Extended (3 bolts) — UserLevel +1/+3 inject, rest ≥90s
 *
 * Rest Day:
 *   [0] Flexibility (light)
 *   [1] Standard recovery (center)
 *   [2] Mobility (flow)
 */
const TRAINING_DAY_CONFIGS: TrioOptionConfig[] = [
  { key: 'option3Label', difficulty: 1, postProcess: 'flow_regression' },
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
 * Vertical Preference (+15/+8), Deficit-aware domainBudgets.
 */
export async function generateHomeWorkoutTrio(
  options: HomeWorkoutOptions,
): Promise<HomeWorkoutTrioResult> {
  const isRestDay = options.isScheduledRestDay || options.isRecoveryDay || false;

  console.group(`[WorkoutTrio] Generating 3 options — ${isRestDay ? 'REST DAY' : 'TRAINING DAY'}`);

  // ── 1. SHARED PIPELINE: fetch + context + score (ONCE) ────────────────
  const pipeline = await _buildSharedPipeline(options);

  // ── Budget Floor: if weekly budget is critically low, all 3 options become recovery
  const trioRemainingBudget = options.remainingWeeklyBudget;
  if (trioRemainingBudget != null && trioRemainingBudget < 6) {
    console.log(
      `[WorkoutTrio] recovery_mode: switching all options due to low budget (remaining: ${trioRemainingBudget})`,
    );
    const meta = pipeline.resultMeta;
    const recoveryResult = await generateRecoveryWorkout(
      pipeline.allExercises,
      meta.location,
      trioRemainingBudget,
      meta.daysInactive,
      meta.persona,
      meta.timeOfDay as TimeOfDay,
      meta.injuryAreas,
    );
    const recoveryOption: WorkoutTrioOption = {
      label: 'התאוששות',
      result: recoveryResult,
    };
    console.groupEnd();
    return {
      options: [recoveryOption, recoveryOption, recoveryOption],
      isRestDay: true,
      labelsSource: 'fallback',
      meta: recoveryResult.meta,
    };
  }

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

    // Post-processing (Option 2 & 3 modifiers) — delegated to trio-modifiers.service.ts
    if (cfg.postProcess === 'intense') {
      applyIntenseOption(workout, sessionBlacklist, pipeline.userProgramLevels, pipeline.allExercises);
    } else if (cfg.postProcess === 'flow_regression') {
      applyFlowRegression(workout, pipeline.userProgramLevels, pipeline.allExercises, sessionBlacklist);
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
        : cfg.postProcess === 'flow_regression' ? 'easy'
        : 'balanced';

      const logicTagOverrides = computeLogicTagOverrides(variant, workout, cfg);

      const metadata = await resolveWorkoutMetadata(optionMetaCtx, variant, logicTagOverrides);
      if (metadata.title) workout.title = metadata.title;
      if (metadata.description) workout.description = metadata.description;
      if (metadata.aiCue) workout.aiCue = metadata.aiCue;

      if (metadata.logicCue) {
        workout.logicCue = metadata.logicCue;
      } else {
        workout.logicCue = computeLevelAwareLogicCue(
          variant,
          pipeline.userProgramLevels,
          pipeline.resolvedChildDomains.length > 0 ? pipeline.resolvedChildDomains : undefined,
        );
      }

      // Persist winning bundleId for anti-repetition (center card only)
      if (i === 1 && metadata.bundleId && typeof window !== 'undefined') {
        try {
          const stored = JSON.parse(localStorage.getItem('recentBundleIds') || '[]') as string[];
          const updated = [metadata.bundleId, ...stored.filter(id => id !== metadata.bundleId)].slice(0, 5);
          localStorage.setItem('recentBundleIds', JSON.stringify(updated));
        } catch { /* ignore storage errors */ }
      }
    } catch {
      // Non-critical — generator fallback strings are already in place
    }

    // ── DESK WORKOUT CONSTRAINT ───────────────────────────────────────────
    // If the resolved title signals a desk workout, filter the exercise list
    // to keep only desk-friendly categories (flexibility, mobility, stretching).
    const DESK_TITLE_KEYWORDS = ['כיסא', 'שולחן'];
    const isDeskWorkout = workout.title
      ? DESK_TITLE_KEYWORDS.some(kw => workout.title.includes(kw))
      : false;

    if (isDeskWorkout) {
      console.log(`[WorkoutTrio] 🪑 isDeskWorkout=true — filtering exercises to desk-friendly pool (title: "${workout.title}")`);

      const DESK_FRIENDLY_CATEGORIES = ['desk_mobility', 'chair_stretch', 'stretching', 'flexibility', 'mobility'];

      const deskFiltered = workout.exercises.filter(we => {
        if (we.exerciseRole === 'warmup' || we.exerciseRole === 'cooldown') return true;
        const ex = we.exercise;
        const tags = (ex.tags ?? []) as string[];
        const group = ex.movementGroup ?? '';
        return (
          DESK_FRIENDLY_CATEGORIES.some(cat => tags.includes(cat as any)) ||
          group === 'flexibility' ||
          tags.includes('mobility' as any)
        );
      });

      if (deskFiltered.length >= 2) {
        workout.exercises = deskFiltered;
        console.log(`[WorkoutTrio] isDeskWorkout: kept ${deskFiltered.length} desk-friendly exercises`);
      } else {
        console.warn(`[WorkoutTrio] isDeskWorkout: insufficient desk exercises (${deskFiltered.length}), keeping original pool`);
      }
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
    location: _rawLocation,
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
    weeklySASets,
    levelDefaultRestSeconds,
    restMultiplier,
    selectedDate,
    scheduledProgramIds,
    isScheduledRestDay = false,
    domainSetsCompletedThisWeek,
    remainingScheduleDays,
    recentExerciseIds,
  } = options;

  const WEEKLY_SA_CAP = 6;

  // ── ULTIMATE PARK FORCE: Always override to 'park' ──
  // Until home-specific videos are available, every workout uses park
  // methods (pull-up bar, parallel bars) which have mapped videos.
  const location: ExecutionLocation = 'park';
  if (_rawLocation && _rawLocation !== 'park') {
    console.log(`[HomeWorkout] 🏞️ PARK FORCE: overriding requested "${_rawLocation}" → "park" (video coverage)`);
  } else if (!_rawLocation) {
    console.log(`[HomeWorkout] 🏞️ No location specified → "park" (PARK FORCE active)`);
  }

  // ── 0. UTS Schedule Override ──────────────────────────────────────────
  const fallbackProgram = userProfile.progression?.activePrograms?.[0]?.templateId;
  const effectiveProgramIds = scheduledProgramIds?.length ? scheduledProgramIds : fallbackProgram ? [fallbackProgram] : [];

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

  // ── 1b. Build Firestore ID → slug map (bridges exercise doc IDs to track slugs)
  const idToSlug = buildIdToSlugMapFromPrograms(allPrograms);

  // Master programs (display-only) are excluded from the engine's level map.
  const masterProgramIds = new Set(
    allPrograms.filter(p => p.isMaster).map(p => p.id),
  );
  const { levels: userProgramLevels } = buildUserProgramLevels(effectiveProfile, masterProgramIds, '[HomeWorkout:Trio]');

  const activeProgramId = effectiveProfile.progression?.activePrograms?.[0]?.templateId;
  const resolvedChildDomains = resolveChildDomainsForParent(activeProgramId, userProfile);

  // Slug alias map: handles 'pulling'→'pull', 'pushing'→'push', etc.
  const SLUG_ALIAS: Record<string, string[]> = {
    pulling: ['pull'],
    pushing: ['push'],
    upper_body: ['push', 'pull'],
    lower_body: ['legs'],
    full_body: ['push', 'pull', 'legs', 'core'],
  };

  /**
   * Resolve the user's effective level for an exercise's programId.
   * Handles three layers of indirection:
   *   1. Direct lookup (programId is already a slug like 'push')
   *   2. Firestore ID → slug (e.g. 'J0fLpmJhG0KDN2tQouxh' → 'push')
   *   3. Slug alias (e.g. 'pulling' → 'pull')
   * Falls back to baseUserLevel (NOT L1) when no mapping exists.
   */
  const resolveUserLevelForProgram = (programId: string): number => {
    // 1. Direct slug match
    const direct = userProgramLevels.get(programId);
    if (direct !== undefined) return direct;
    // 2. Firestore ID → slug
    const slug = idToSlug.get(programId);
    if (slug) {
      const slugLevel = userProgramLevels.get(slug);
      if (slugLevel !== undefined) return slugLevel;
      // 2b. The slug itself might be an alias (e.g. 'pulling')
      const aliases = SLUG_ALIAS[slug];
      if (aliases) {
        const aliasLevels = aliases.map(a => userProgramLevels.get(a)).filter((l): l is number => l !== undefined);
        if (aliasLevels.length > 0) return Math.max(...aliasLevels);
      }
    }
    // 3. Direct slug alias (programId itself is an alias like 'pulling')
    const aliases = SLUG_ALIAS[programId];
    if (aliases) {
      const aliasLevels = aliases.map(a => userProgramLevels.get(a)).filter((l): l is number => l !== undefined);
      if (aliasLevels.length > 0) return Math.max(...aliasLevels);
    }
    return baseUserLevel;
  };

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
            const userLevel = resolveUserLevelForProgram(tp.programId);
            return Math.abs(tp.level - userLevel) <= tolerance;
          });
        }
        if (ex.programIds?.length) {
          return ex.programIds.some(pid =>
            validProgramIds.has(pid) || validProgramIds.has(resolveToSlug(pid)),
          );
        }
        return false;
      });

    const domainHasExercises = (pool: Exercise[], domain: string): boolean =>
      pool.some(ex =>
        ex.targetPrograms?.some(tp =>
          tp.programId === domain || resolveToSlug(tp.programId) === domain,
        ) ||
        ex.programIds?.some(pid =>
          pid === domain || resolveToSlug(pid) === domain,
        ),
      );

    const allDomainsHaveExercises = (pool: Exercise[]): boolean =>
      resolvedChildDomains.every(d => domainHasExercises(pool, d));

    let levelMatched = filterByTolerance(1);
    if (!allDomainsHaveExercises(levelMatched) || levelMatched.length < 4) {
      levelMatched = filterByTolerance(2);
    }
    if (!allDomainsHaveExercises(levelMatched) || levelMatched.length < 4) {
      levelMatched = filterByTolerance(3);
    }
    // If some domains still have 0 exercises at ±3, merge in the full pool
    // for the missing domains while keeping the level-matched pool for the rest.
    if (!allDomainsHaveExercises(levelMatched) && resolvedChildDomains.length > 0) {
      const missingDomains = resolvedChildDomains.filter(d => !domainHasExercises(levelMatched, d));
      const domainRescue = allExercises.filter(ex =>
        missingDomains.some(d =>
          ex.targetPrograms?.some(tp =>
            tp.programId === d || resolveToSlug(tp.programId) === d,
          ) ||
          ex.programIds?.some(pid =>
            pid === d || resolveToSlug(pid) === d,
          ),
        ),
      );
      if (domainRescue.length > 0) {
        console.log(
          `[HomeWorkout:Trio] Domain rescue: domains [${missingDomains.join(', ')}] had 0 exercises at ±3. ` +
          `Injecting ${domainRescue.length} exercises from full pool.`,
        );
        levelMatched = [...levelMatched, ...domainRescue];
      }
    }
    exercises = levelMatched.length >= 4 ? levelMatched : allExercises;
  } else {
    exercises = allExercises;
  }

  // ── 2. Derive contextual values ──────────────────────────────────────
  const daysInactive = daysInactiveOverride ?? calculateDaysInactive(userProfile);
  const injuries = extractInjuryShield(userProfile, injuryOverride);
  const persona = mapPersonaIdToLifestylePersona(userProfile, personaOverride);
  const lifestyles = collectLifestyles(userProfile, persona);
  const ESSENTIAL_CALISTHENICS_GEAR = [
    'pullup_bar', 'pull_up_bar', 'dip_bar', 'dip_station', 'parallel_bars', 'bars',
  ];
  let availableEquipment = [
    ...resolveEquipment(userProfile, location, equipmentOverride),
    ...gymEquipmentList.map(eq => eq.id),
    ...ESSENTIAL_CALISTHENICS_GEAR,
  ];
  if (location === 'park' || location === 'street') {
    const parkGear = ['park_bench', 'park_step'];
    availableEquipment = [...new Set([...availableEquipment, ...parkGear])];
  }
  availableEquipment = [...new Set(availableEquipment)];
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

  const effectiveFilterLocation = location;

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
    activeDomains: activeProgramFilters.length > 0 ? activeProgramFilters : undefined,
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
    weeklySASets,
    weeklySACap: WEEKLY_SA_CAP,
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
    filterCounts: filterResult.filterCounts,
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

  let userAge: number | undefined;
  const birthDate = userProfile.core?.birthDate;
  if (birthDate) {
    const bd = birthDate instanceof Date ? birthDate : new Date(birthDate as any);
    if (!isNaN(bd.getTime())) {
      const diffMs = Date.now() - bd.getTime();
      userAge = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000));
    }
  }

  // Abroad auto-detection via timezone
  // TESTING: Hardcoded to false so Coach Logic shows strength cues, not vacation bundle.
  // TODO: Restore timezone detection for production.
  const isAbroad = false;
  // const isAbroad = typeof Intl !== 'undefined'
  //   ? Intl.DateTimeFormat().resolvedOptions().timeZone !== 'Asia/Jerusalem'
  //   : false;

  // Recent bundle IDs for anti-repetition (from localStorage)
  let recentBundleIds: string[] | undefined;
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('recentBundleIds');
      if (raw) recentBundleIds = JSON.parse(raw) as string[];
    } catch { /* ignore parse errors */ }
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
    isStudying: _rawLocation === 'library',
    dayPeriod: detectDayPeriod(),
    isActiveReserve: userProfile.core?.isActiveReserve ?? false,
    activeProgramId: activeChildProgramId,
    programLevel: childTrackLevel,
    ancestorProgramIds,
    userAge,
    isAbroad,
    recentBundleIds,
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
// EOF — Trio modifiers, labels, and logging live in:
//   trio-modifiers.service.ts
//   trio-labels.service.ts
// ============================================================================

// Dead code removed during Unified Pipeline Refactor.
// The following functions were moved:
//   applyIntenseModifiers → applyIntenseOption (trio-modifiers.service.ts)
//   applyNakedStrengthStrict → applyEssentialGearFilter (trio-modifiers.service.ts)
//   applyEasyLevelDowngrade → applyFlowRegression (trio-modifiers.service.ts)
//   applyTagPreference → applyTagPreference (trio-modifiers.service.ts)
//   logTrioSummary → logTrioSummary (trio-modifiers.service.ts)
//   fetchTrioLabels → fetchTrioLabels (trio-labels.service.ts)
//   _computeLogicTagOverrides → computeLogicTagOverrides (trio-labels.service.ts)
//   _computeFallbackLogicCue → computeFallbackLogicCue (trio-labels.service.ts)
// ESSENTIAL_GEAR_IDS, collectAllGearIds, isGearFree, etc. → trio-modifiers.service.ts

// NOTE: This trailing comment block replaces ~520 lines of moved code.

