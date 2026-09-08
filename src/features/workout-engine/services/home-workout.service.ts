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
import { resolveTabataFinisher, type TabataCandidate } from './tabata-finisher.utils';
import { genPerfMark, isGenVerboseEnabled } from '@/lib/gen-perf';
import {
  queryRestDayRecoveryVideos,
  buildRecoveryVideoWorkoutResult,
  type RecoveryVideoWorkoutContext,
} from './recovery-video-content.service';

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
import type { WorkoutMetadataSnapshot } from '../logic/workout-generator.types';
import { createPipelineOrchestrator } from '../core/pipeline/PipelineOrchestrator';
import { createPoolFactory } from '../core/pipeline/PoolFactory';
import { isTimeBasedExercise } from '../logic/workout-budgeting.utils';

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
  collectLifestyles,
} from './user-profile.utils';
import { ensureEquipmentCachesLoaded } from '../shared/utils/gear-mapping.utils';
import { selectMethodForContext } from '../shared/utils/method-selection.utils';
import { CONTEXT_AWARE_SELECTION_ENABLED } from '@/config/feature-flags';
import { MG_TO_DOMAIN } from '../shared/constants/domain-mapping.constants';
import {
  normalizeEquipmentArray,
  buildActiveProgramFilters,
  resolveExercisePool,
} from '../core/middleware/InputSanitizerMiddleware';
import { getBaseUserLevel, buildUserProgramLevels, resolveMostSpecificDomainBudget } from './level-resolution.utils';
import { getHistoryMapForExercises } from './exercise-history.service';
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
import { resolveEffectiveBoltTime } from '../logic/bolt-time.utils';
import {
  annotateRepRanges,
  enforceVolumeCap,
  roundRestSeconds,
  sortAndPair,
} from '../core/presentation/PresentationFormatter';
import { validatePromisesPostCut } from '../core/pipeline/GuaranteePassRunner';
import {
  derivePeriodizationWeek,
  resolveSessionPolicy,
  scaleByPeriodization,
  type SessionPolicy,
} from './periodization.service';
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

// ── Skill ID normalisation ─────────────────────────────────────────────────
// ScheduleStep.tsx (and the UTS recurringTemplate) stores SKILL_DISPLAY
// uppercase keys (PLANCHE, FRONT_LEVER, UPPER_CALISTHENICS) in programIds.
// The workout engine's KNOWN_SLUGS, MG_TO_DOMAIN, and resolveToSlug all
// operate on lowercase slugs, so we normalise at the service boundary —
// once, early in _buildSharedPipeline — before any resolve/filter calls.
const SKILL_ID_NORMALIZATION: Record<string, string> = {
  UPPER_CALISTHENICS: 'calisthenics_upper',
  PLANCHE:            'planche',
  FRONT_LEVER:        'front_lever',
  MUSCLE_UP:          'muscle_up',
  HANDSTAND:          'handstand',
  HSPU:               'hspu',
  OAPU:               'oap',
  UPPER_BODY:         'upper_body',
  FULL_BODY:          'full_body',
};

/** Normalise a single program ID: maps known SKILL_DISPLAY uppercase keys to
 *  their engine slug; everything else falls back to toLowerCase(). */
function normalizeProgramId(id: string): string {
  return SKILL_ID_NORMALIZATION[id] ?? id.toLowerCase();
}

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
  // When targetDifficulty is set the trio loop generates only that one option
  // and pads slots 1 & 2 with the same result.  Slot 0 is always the real one.
  if (options.targetDifficulty != null) return trio.options[0].result;
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
    // Recovery pool is location-agnostic stretches (cooldown/mobility/flexibility),
    // but still prefer the location-correct method; keep the [0] fallback since the
    // movement is the same everywhere (cosmetic which-video, not a gear leak).
    const method = (CONTEXT_AWARE_SELECTION_ENABLED
      ? selectMethodForContext(ex, location, [])
      : null) ?? ex.executionMethods?.[0] ?? {};
    return {
      exercise: ex,
      method: method as any,
      mechanicalType: (ex.mechanicalType || 'none') as any,
      sets: Math.min(3, Math.max(2, Math.floor(Math.random() * 2) + 2)),
      // Single source of truth (docs/workout-engine/06-TIME-VS-REPS.md): this
      // used to hardcode reps=15/repsRange=10-20 for every exercise in the
      // recovery pool regardless of whether it's a hold, and compute
      // isTimeBased via a reimplementation missing the name-heuristic fallback
      // (hold/plank/hang/החזק) — real snapshot data showed one exercise
      // ("שכיבות סמיכה ברכיים") reachable through this path with reps=15
      // stamped as if it were a 15-second hold, contradicting its 1-6 rep
      // range from the normal domain-quota path.
      reps: isTimeBasedExercise(ex) ? 20 : 15,
      repsRange: isTimeBasedExercise(ex) ? { min: 15, max: 25 } : { min: 10, max: 20 },
      isTimeBased: isTimeBasedExercise(ex),
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
// NEEDS-ASSESSMENT WORKOUT — absent=absent (⑨) safety net (BUG 1 rework)
// ============================================================================

/**
 * Builds the explicit "needs assessment" placeholder result used when the
 * intersection of {domains required for the request} ∩ {domains the user has
 * actually assessed} is empty. Mirrors `generateRecoveryWorkout`'s "rest day"
 * fallback (empty `exercises`, a distinguishing boolean flag, a human-readable
 * title/description) rather than throwing — this is the existing codebase
 * convention for "cannot generate real content, don't crash or return a blank
 * plan silently".
 */
export function buildNeedsAssessmentResult(
  domains: string[],
  meta: HomeWorkoutResult['meta'],
): HomeWorkoutResult {
  const domainList = domains.filter(Boolean);
  const workout: GeneratedWorkout = {
    title: 'נדרשת הערכת רמה',
    description: domainList.length > 0
      ? `עדיין לא הערכנו את הרמה שלך ב-${domainList.join(', ')}. השלימו שאלון קצר כדי לקבל אימון מותאם אישית.`
      : 'עדיין לא הערכנו את הרמה שלך. השלימו שאלון קצר כדי לקבל אימון מותאם אישית.',
    exercises: [],
    estimatedDuration: 0,
    structure: 'standard',
    difficulty: 1,
    mechanicalBalance: { straightArm: 0, bentArm: 0, hybrid: 0, ratio: '0:0', isBalanced: true },
    stats: { calories: 0, coins: 0, totalReps: 0, totalHoldTime: 0, difficultyMultiplier: 1 },
    isRecovery: false,
    needsAssessment: true,
    assessmentDomains: domainList,
    totalPlannedSets: 0,
    pipelineLog: [
      `needs_assessment: requested domains [${domainList.join(', ') || '(none)'}] have zero assessed ` +
      'level — absent=absent (⑨) safety net (no blank/invented workout composed)',
    ],
  };
  return { workout, meta };
}

// ============================================================================
// RECOVERY VIDEO TRIO — Admin-tagged rest-day follow-along videos
// ============================================================================

/**
 * Attempt to build a rest-day trio from admin-tagged recovery video exercises.
 *
 * Returns null when no matching exercises are found so the caller falls
 * through to the existing REST_DAY_CONFIGS cooldown loop without any change
 * in behaviour.
 *
 * Filtering rules (all must pass):
 *   1. exerciseRole === 'recovery'
 *   2. showOnRestDays === true
 *   3. restDayProgramIds intersects scheduledProgramIds
 *      (if scheduledProgramIds is empty, all recovery videos are eligible)
 *
 * --------------------------------------------------------------------------
 * CANONICAL VIDEO SLOT — `execution_methods[0].media` ONLY
 * --------------------------------------------------------------------------
 * The recovery video URL and its duration are sourced exclusively from the
 * first execution method's media object:
 *
 *   - `execution_methods[0].media.mainVideoUrl`        → the follow-along clip
 *   - `execution_methods[0].media.videoDurationSeconds` → timer sync duration
 *
 * Exercise-root media slots (`exercise.media.videoUrl`, `exercise.media.previewVideo`,
 * `exercise.media.fullTutorial`) are INTENTIONALLY IGNORED here. Those legacy
 * fields exist only as a fallback cascade for the runtime player (see
 * `resolveExerciseMedia()` levels 3–4) and are never trusted for rest-day
 * delivery. This single-source-of-truth rule lets the same Exercise carry
 * different videos per execution method (e.g. park vs. gym, or — soon —
 * strength vs. running segments) without schema branching.
 *
 * Why: The Lego-block architecture binds the video to the EXECUTION METHOD,
 * not to the abstract exercise archetype. The admin UI surfaces this constraint
 * via the teal Recovery Settings panel in `BasicsSection.tsx`, which warns when
 * either field is missing on the first execution method.
 */
/**
 * Rest-day fast path (25.08.2026, 17.8 build-plan): tries a targeted recovery-video query
 * BEFORE the full shared pipeline runs — see generateHomeWorkoutTrio's own call site and
 * recovery-video-content.service.ts's header for the measured performance motivation. Returns
 * null (falls through unchanged to the existing pipeline — tryBuildRecoveryVideoTrio below,
 * then Budget Floor, then REST_DAY_CONFIGS) when nothing qualifies, OR when the query itself
 * fails for any reason (missing index, permissions, network) — this must never be the reason
 * the whole home screen goes down; the entire point of a fast path is a safe, gracefully-
 * degrading shortcut, not a new single point of failure. (Code review finding, 25.08.2026.)
 *
 * needs-assessment guard (code review finding, 25.08.2026): the old pipeline checks
 * pipeline.needsAssessmentDomains BEFORE it even looks at isRestDay — an unassessed user on a
 * rest day gets the explicit "needs assessment" result today, regardless of video availability.
 * Replicating that check exactly isn't cheap: it depends on buildActiveProgramFilters +
 * shadowMatrix, both real _buildSharedPipeline outputs — computing them here would defeat the
 * fast path's own purpose. Mirrors full-strength.generator.ts's own already-established
 * cheap-path precedent instead (hasAnyAssessedDomain, a synchronous profile-only check) rather
 * than inventing a new approximation: a user with genuinely zero assessed domains/tracks
 * anywhere falls through to the old pipeline, which gates them correctly. This isn't a perfect
 * replica of needsAssessmentDomains' own per-program logic (a user assessed in some OTHER
 * domain than what's scheduled today could still hit the fast path) — recovery-video content
 * isn't level/domain-scored to begin with (see buildRecoveryVideoWorkoutResult), so that
 * residual gap is judged acceptable, unlike showing scored content to a genuinely brand-new
 * unassessed user.
 *
 * This function itself is a disposable legacy-shape adapter, NOT the reusable part: it pads to
 * exactly 3 options because HomeWorkoutTrioResult.options is a fixed 3-tuple today
 * (WorkoutSelectionCarousel's current contract) — the two genuinely reusable pieces
 * (queryRestDayRecoveryVideos, buildRecoveryVideoWorkoutResult) live in
 * recovery-video-content.service.ts, shaped so a future recovery-video.generator.ts can call
 * them directly without this padding step.
 */
async function tryRestDayFastPath(options: HomeWorkoutOptions): Promise<HomeWorkoutTrioResult | null> {
  const { scheduledProgramIds = [], userProfile } = options;

  const hasAnyAssessedDomain =
    Object.keys(userProfile?.progression?.domains ?? {}).length > 0 ||
    Object.keys(userProfile?.progression?.tracks ?? {}).length > 0;
  if (!hasAnyAssessedDomain) return null;

  try {
    const pool = await queryRestDayRecoveryVideos(scheduledProgramIds);
    if (pool.length === 0) return null;

    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, 3);
    while (picked.length < 3) picked.push(picked[picked.length - 1]);

    const { labels, source: labelsSource } = await fetchTrioLabels();
    const labelKeys: Array<keyof typeof labels.restDayLabels> = [
      'option1Label', 'option2Label', 'option3Label',
    ];

    const location = (options.location ?? DEFAULT_LOCATION);
    const daysInactive = calculateDaysInactive(userProfile);
    const persona = userProfile ? mapPersonaIdToLifestylePersona(userProfile) : null;
    const timeOfDay = detectTimeOfDay();
    const context: RecoveryVideoWorkoutContext = { location, daysInactive, persona, timeOfDay };

    const trio: WorkoutTrioOption[] = picked.map((ex, i) => ({
      label: labels.restDayLabels[labelKeys[i]] ?? 'התאוששות',
      result: buildRecoveryVideoWorkoutResult(ex, context, pool.length),
    }));

    console.log(
      `[WorkoutTrio] Rest-day fast path: ${trio.length} options from pool of ${pool.length} ` +
      '(targeted query, full pipeline skipped)',
    );

    return {
      options: trio as [WorkoutTrioOption, WorkoutTrioOption, WorkoutTrioOption],
      isRestDay: true,
      labelsSource,
      meta: {
        daysInactive,
        persona,
        location,
        timeOfDay,
        injuryAreas: [],
        exercisesConsidered: pool.length,
        exercisesExcluded: 0,
      },
    };
  } catch (error) {
    console.error('[WorkoutTrio] Rest-day fast path failed — falling back to the full pipeline', error);
    return null;
  }
}

async function tryBuildRecoveryVideoTrio(
  allExercises: Exercise[],
  options: HomeWorkoutOptions,
): Promise<HomeWorkoutTrioResult | null> {
  const { scheduledProgramIds = [], userProfile } = options;

  // --- 1. Filter bank ---
  let pool = allExercises.filter((ex) => {
    if ((ex as any).exerciseRole !== 'recovery') return false;
    if (!(ex as any).showOnRestDays) return false;
    return true;
  });

  // Program-affinity filter: strict match first, broad fallback
  if (scheduledProgramIds.length > 0) {
    const programMatched = pool.filter((ex) => {
      const ids: string[] = (ex as any).restDayProgramIds ?? [];
      return ids.some((id) => scheduledProgramIds.includes(id));
    });
    if (programMatched.length > 0) pool = programMatched;
  }

  if (pool.length === 0) return null;

  // --- 2. Shuffle and pick up to 3 (pad with last if fewer available) ---
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, 3);
  while (picked.length < 3) picked.push(picked[picked.length - 1]);

  // --- 3. Build trio options ---
  const { labels } = await fetchTrioLabels();
  const labelKeys: Array<keyof typeof labels.restDayLabels> = [
    'option1Label', 'option2Label', 'option3Label',
  ];

  const location = (options.location ?? DEFAULT_LOCATION);
  const daysInactive = calculateDaysInactive(userProfile);
  // Guard: pass the FULL profile (the fn extracts lifestyleTags/personaId itself,
  // matching the canonical call ~L1266). The prior arg — `.lifestyle?.selectedPersona
  // ?? null` — collapsed to null and crashed the fn's `userProfile.lifestyle` read.
  // Null profile → null persona (persona is metadata-only here; safe skip).
  const persona = userProfile
    ? mapPersonaIdToLifestylePersona(userProfile)
    : null;
  const timeOfDay = detectTimeOfDay();

  const trio: WorkoutTrioOption[] = picked.map((ex, i) => {
    // Rest-day recovery videos are location-agnostic stretches; prefer the
    // location-correct method, keep the [0] fallback (cosmetic which-video).
    const method = (CONTEXT_AWARE_SELECTION_ENABLED
      ? selectMethodForContext(ex, location, [])
      : null) ?? ex.execution_methods?.[0] ?? (ex as any).executionMethods?.[0] ?? {};
    const durationSeconds = (method as any)?.media?.videoDurationSeconds ?? null;
    const durationMin = durationSeconds ? Math.round(durationSeconds / 60) : 10;

    const exName = ex.name;
    const title = typeof exName === 'object'
      ? ((exName as any).he || (exName as any).en || '')
      : String(exName ?? '');

    const workoutExercise: WorkoutExercise = {
      exercise: ex,
      method: method as any,
      mechanicalType: (ex.mechanicalType || 'none') as any,
      sets: 1,
      reps: 1,
      repsRange: { min: 1, max: 1 },
      isTimeBased: true,
      restSeconds: 0,
      priority: 'isolation' as const,
      score: 0,
      reasoning: ['recovery_video_rest_day'],
      programLevel: 1,
      isOverLevel: false,
      tier: 'flow' as const,
      levelDelta: 0,
      isGoalExercise: false,
      exerciseRole: 'main' as const,
    };

    const workout: GeneratedWorkout = {
      title,
      description: '',
      exercises: [workoutExercise],
      estimatedDuration: durationMin,
      structure: 'standard',
      difficulty: 1 as DifficultyLevel,
      mechanicalBalance: { straightArm: 0, bentArm: 0, hybrid: 0, ratio: '0:0', isBalanced: true },
      stats: { calories: 0, coins: 0, totalReps: 0, totalHoldTime: 0, difficultyMultiplier: 1 },
      isRecovery: true,
      totalPlannedSets: 1,
      pipelineLog: ['recovery_video_rest_day'],
    };

    return {
      label: labels.restDayLabels[labelKeys[i]] ?? 'התאוששות',
      result: {
        workout,
        meta: {
          daysInactive,
          persona,
          location,
          timeOfDay,
          injuryAreas: [],
          exercisesConsidered: pool.length,
          exercisesExcluded: 0,
        },
      },
    };
  });

  console.log(
    `[WorkoutTrio] Recovery video trio: ${trio.length} options from pool of ${pool.length}`,
  );

  return {
    options: trio as [WorkoutTrioOption, WorkoutTrioOption, WorkoutTrioOption],
    isRestDay: true,
    labelsSource: 'firestore',
    meta: {
      daysInactive,
      persona,
      location,
      timeOfDay,
      injuryAreas: [],
      exercisesConsidered: pool.length,
      exercisesExcluded: 0,
    },
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
// ── Bolt-specific duration caps ─────────────────────────────────────────────
// These are the hard time ceilings for each bolt option.
//   Bolt 1 (Easy / Flow)     → 30 min
//   Bolt 2 (Normal / Mastery) → 45 min
//   Bolt 3 (Intense / Power)  → 60 min
//
// The caps control two things:
//   1. availableTime passed to WorkoutGenerator → determines exercise count
//      via getExerciseCountForDuration so each bolt gets a pool sized for
//      its target duration.
//   2. Post-generation Volume Guard → trims sets (≥2 minimum) if the
//      estimated duration still exceeds the cap after warmup/cooldown.
const BOLT_DURATION_CAPS: Record<DifficultyLevel, number> = {
  1: 30,
  2: 45,
  3: 60,
};

// Shared between the desk-workout filter's trigger check and
// reconcileDeskThemeMismatch's defensive re-check (a reconciled title should
// never itself signal a desk workout — there's no second filter pass to
// react to it).
const DESK_TITLE_KEYWORDS = ['כיסא', 'שולחן'];

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
 * Derives the {category, dominantMuscle, categoryLabel} triple that drives
 * title/description selection from an exercise list. Pulled out of the
 * original inline resolve logic as a pure, named step.
 *
 * Deliberately NOT reused for reconciliation: category/dominantMuscle are
 * not scoring inputs anywhere in workout-metadata.service.ts's
 * scoreContentRow, so re-deriving them from a mutated exercise list cannot
 * steer which content row wins (see reconcileDeskThemeMismatch, which fixes
 * the actual scoring input — persona — instead).
 */
export function resolveCategoryFromExercises(
  exercises: WorkoutExercise[],
  structure: GeneratedWorkout['structure'],
): { dominantMuscle: string | undefined; category: string; categoryLabel: string } {
  const CATEGORY_LABELS: Record<string, string> = {
    strength: 'כוח', volume: 'נפח', endurance: 'סיבולת',
    skills: 'סקילס', mobility: 'ניידות', hiit: 'HIIT',
    general: 'כללי', maintenance: 'תחזוקת גוף',
  };

  const muscleCounts: Record<string, number> = {};
  exercises.forEach(ex => {
    const muscle = ex.exercise.primaryMuscle;
    if (muscle) muscleCounts[muscle] = (muscleCounts[muscle] || 0) + 1;
  });
  const totalEx = exercises.length || 1;
  const dominantMuscle = Object.entries(muscleCounts)
    .filter(([, count]) => count / totalEx > 0.5)
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  const hasMobility = exercises.some(ex => ex.exercise.tags?.includes('mobility'));
  const hasSkills = exercises.some(ex => ex.exercise.tags?.includes('skill'));
  let category = 'general';
  if (hasMobility && exercises.filter(ex => ex.exercise.tags?.includes('mobility')).length > totalEx / 2) category = 'mobility';
  else if (hasSkills) category = 'skills';
  else if (structure === 'circuit' || structure === 'emom') category = 'hiit';

  return { dominantMuscle, category, categoryLabel: CATEGORY_LABELS[category] || 'אימון' };
}

/** Anti-repetition bookkeeping for the winning (recommended-slot) content bundle. */
function rememberBundleId(bundleId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const stored = JSON.parse(localStorage.getItem('recentBundleIds') || '[]') as string[];
    const updated = [bundleId, ...stored.filter(id => id !== bundleId)].slice(0, 5);
    localStorage.setItem('recentBundleIds', JSON.stringify(updated));
  } catch { /* ignore storage errors */ }
}

function resolveTrioVariant(cfg: Pick<TrioOptionConfig, 'postProcess'>): TrioVariant {
  return cfg.postProcess === 'intense' ? 'intense'
    : cfg.postProcess === 'flow_regression' ? 'easy'
    : 'balanced';
}

/**
 * Appends a dedup suffix when `title` already claimed by a sibling trio
 * option (tracked in `usedTitles`) — a shared workoutMetadata copy library
 * can hand two options the same row. Pure — caller owns adding the result
 * to `usedTitles`.
 */
export function applyTitleDedupSuffix(title: string, usedTitles: Set<string>, optionIndex: number): string {
  if (!usedTitles.has(title)) return title;
  const DEDUP_SUFFIXES = ['(משלים)', '(גמיש)'];
  const suffix = DEDUP_SUFFIXES[Math.min(optionIndex - 1, DEDUP_SUFFIXES.length - 1)] ?? `(${optionIndex + 1})`;
  return `${title} ${suffix}`;
}

/**
 * Swaps a title's registration in `usedTitles`: drops `staleTitle` (if any)
 * BEFORE dedup-checking `newTitle` against what's left, then registers the
 * result. Order matters — checking before deleting means a reconciled title
 * always "collides" with the workout's own prior entry. Mutates `usedTitles`
 * and returns the (possibly suffixed) title the caller should assign.
 */
export function replaceReconciledTitle(
  usedTitles: Set<string>,
  staleTitle: string | undefined,
  newTitle: string,
  optionIndex: number,
): string {
  if (staleTitle) usedTitles.delete(staleTitle);
  const finalTitle = applyTitleDedupSuffix(newTitle, usedTitles, optionIndex);
  usedTitles.add(finalTitle);
  return finalTitle;
}

/** The light scalar snapshot swap-all reads back to re-resolve metadata for a new location (§19). */
function toMetadataSnapshot(ctx: WorkoutMetadataContext): WorkoutMetadataSnapshot {
  return {
    persona: ctx.persona,
    timeOfDay: ctx.timeOfDay,
    gender: ctx.gender,
    category: ctx.category,
    categoryLabel: ctx.categoryLabel,
    difficulty: ctx.difficulty,
    dominantMuscle: ctx.dominantMuscle,
    experienceLevel: ctx.experienceLevel,
    sportType: ctx.sportType,
    motivationStyle: ctx.motivationStyle,
    currentProgram: ctx.currentProgram,
  };
}

/**
 * Re-resolves title/description/aiCue/logicCue for a workout whose desk
 * theme was abandoned: isDeskWorkout was true when the title was picked
 * (workout-metadata.service.ts's persona+time-window "Desk Reset Boost", +30
 * for office_worker/student, 12:00-14:00), but the desk-workout filter found
 * fewer than 2 desk-friendly exercises and silently kept the original
 * (non-desk) pool — leaving copy that promises a chair/desk session over a
 * plan that isn't one.
 *
 * category/dominantMuscle are NOT scoring inputs anywhere in
 * scoreContentRow — re-deriving them from the final exercise list cannot
 * steer the re-pick. The only lever that actually disables the boost (and
 * the "David Clause" demographic hard-exclusion office_worker/student rows
 * are already subject to) is `persona` itself, so this clears it for the
 * re-resolve — everything else (location, timeOfDay, gender, …) is carried
 * over unchanged, since only the desk theme was wrong, not the rest of the
 * user's context.
 *
 * Applies the result onto `workout` in place. No-ops when the re-resolve
 * returns no title (Firestore error, or no surviving candidate row) —
 * leaves the stale desk-themed copy rather than clobber it with a
 * description-less partial bundle.
 */
export async function reconcileDeskThemeMismatch(
  workout: GeneratedWorkout,
  priorCtx: WorkoutMetadataContext,
  variant: TrioVariant,
  logicTagOverrides: ReturnType<typeof computeLogicTagOverrides>,
): Promise<{ reconciled: boolean; newMetadataCtx?: WorkoutMetadataContext; bundleId?: string; staleTitle?: string }> {
  const neutralizedCtx: WorkoutMetadataContext = {
    ...priorCtx,
    persona: null,
    durationMinutes: workout.estimatedDuration,
    difficulty: workout.difficulty,
  };

  const metadata = await resolveWorkoutMetadata(neutralizedCtx, variant, logicTagOverrides);
  // Require BOTH title and description — the two-pass bundle-sync design
  // (resolveWorkoutMetadata fetches description with the winning title's
  // bundleId) means a title-only hit almost never happens for a real bundle,
  // but if it did, a fresh title over the stale desk-themed description
  // would be its own incoherence — the exact class of bug this exists to
  // fix. No-op instead, keeping the stale (but internally consistent) pair.
  if (!metadata.title || !metadata.description) return { reconciled: false };
  // A reconciled title should never itself read as desk-themed — there's no
  // second filter pass left to react to it. Guards against a future content
  // row authored with a desk keyword but no persona tag (which would
  // survive the neutral-persona hard-exclusion above).
  if (DESK_TITLE_KEYWORDS.some(kw => metadata.title!.includes(kw))) return { reconciled: false };

  const staleTitle = workout.title;
  workout.title = metadata.title;
  workout.description = metadata.description;
  if (metadata.aiCue) workout.aiCue = metadata.aiCue;
  if (metadata.logicCue) workout.logicCue = metadata.logicCue;

  return { reconciled: true, newMetadataCtx: neutralizedCtx, bundleId: metadata.bundleId, staleTitle };
}

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

  // Rest-day fast path (25.08.2026): try a targeted recovery-video query before paying for the
  // full shared pipeline below — measured ~2414ms -> ~1050-1100ms when a tagged video exists.
  // See tryRestDayFastPath's own doc comment + recovery-video-content.service.ts for the full
  // reasoning. Falls through unchanged (returns null) when nothing qualifies.
  if (isRestDay) {
    const fastPathResult = await tryRestDayFastPath(options);
    if (fastPathResult) return fastPathResult;
  }

  console.group(`[WorkoutTrio] Generating 3 options — ${isRestDay ? 'REST DAY' : 'TRAINING DAY'}`);

  // ── 1. SHARED PIPELINE: fetch + context + score (ONCE) ────────────────
  const pipeline = await _buildSharedPipeline(options);

  // ── absent=absent (⑨) safety net: all requested domains unassessed ─────
  // BUG 1 rework: short-circuit BEFORE any of the trio/label/generation loop
  // work below — none of the domains relevant to this request have ever been
  // assessed, so composing further would either produce a blank plan or (if a
  // fallback level path were used) an invented one. Return the same explicit
  // "needs assessment" result for all 3 slots, exactly like the existing
  // Budget-Floor recovery short-circuit further down does for its own case.
  if (pipeline.needsAssessmentDomains) {
    const needsAssessmentResult = buildNeedsAssessmentResult(pipeline.needsAssessmentDomains, pipeline.resultMeta);
    const needsAssessmentOption: WorkoutTrioOption = {
      label: 'הערכה נדרשת',
      result: needsAssessmentResult,
    };
    console.warn(
      `[WorkoutTrio] ⑨ needs-assessment short-circuit — requested domains ` +
      `[${pipeline.needsAssessmentDomains.join(', ') || '(none)'}] have no assessed level. ` +
      'Returning an explicit needs-assessment result instead of composing a blank workout.',
    );
    console.groupEnd();
    return {
      options: [needsAssessmentOption, needsAssessmentOption, needsAssessmentOption],
      isRestDay: false,
      needsAssessment: true,
      labelsSource: 'fallback',
      meta: needsAssessmentResult.meta,
    };
  }

  // ── Recovery Video Trio: admin-tagged follow-along videos for rest days ─
  // Checked before Budget Floor and the normal REST_DAY_CONFIGS loop.
  // Falls through silently when no recovery videos are published yet.
  if (isRestDay) {
    const recoveryVideoTrio = await tryBuildRecoveryVideoTrio(
      pipeline.allExercises,
      options,
    );
    if (recoveryVideoTrio) {
      console.groupEnd();
      return recoveryVideoTrio;
    }
    console.log('[WorkoutTrio] No tagged recovery videos found — falling through to REST_DAY_CONFIGS');
  }

  // ── Budget Floor: if weekly budget is critically low, all 3 options become recovery
  const trioRemainingBudget = options.remainingWeeklyBudget;

  // First-week bypass: a user whose active program was started within the past
  // 7 days (i.e. they just completed onboarding) cannot legitimately have
  // exhausted their weekly budget. Any remainingWeeklyBudget < 6 in that
  // window is stale Zustand store data from a same-UID test or a concurrent
  // store-reset race and must be ignored — skip recovery mode entirely.
  const activeProgramStartRaw =
    options.userProfile?.progression?.activePrograms?.[0]?.startDate;
  // startDate is typed as Date but may arrive as a Firestore Timestamp or
  // ISO string after JSON serialisation — coerce safely.
  const activeProgramStartMs = activeProgramStartRaw
    ? (activeProgramStartRaw instanceof Date
        ? activeProgramStartRaw.getTime()
        : new Date(activeProgramStartRaw as unknown as string).getTime())
    : 0;
  const isFirstProgramWeek =
    activeProgramStartMs > 0 &&
    Date.now() - activeProgramStartMs < 7 * 24 * 60 * 60 * 1000;

  if (isFirstProgramWeek && trioRemainingBudget != null && trioRemainingBudget < 6) {
    console.log(
      `[WorkoutTrio] Budget Floor bypassed — first-week user (program started ${Math.round((Date.now() - activeProgramStartMs) / 3_600_000)}h ago). ` +
      `Stale remainingBudget=${trioRemainingBudget} ignored; proceeding with normal workout generation.`,
    );
  }

  if (trioRemainingBudget != null && trioRemainingBudget < 6 && !isFirstProgramWeek) {
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
  genPerfMark('labels (fetchTrioLabels)');

  // ── 3. LOOP: generate 3 plans from the same scored pool ───────────────
  const configs = isRestDay ? REST_DAY_CONFIGS : TRAINING_DAY_CONFIGS;
  const results: WorkoutTrioOption[] = [];
  const sessionBlacklist = new Set<string>();
  const usedTitles = new Set<string>();
  // Core-block anti-repetition (docs/workout-engine/09-CORE-TABATA.md §3):
  // ONE array, SAME reference passed into all 3 bolts' context below, so
  // Step 6c (WorkoutGenerator.ts) can see what earlier bolts in this trio
  // already chose and never let all 3 land on the identical form.
  const coreFormsChosenThisTrio: ('single' | 'tabata' | 'follow_along')[] = [];

  // PipelineOrchestrator replaces the raw WorkoutGenerator call.
  // A fresh orchestrator instance is created once per trio — it is stateless
  // and safe to reuse across all 3 options.
  const orchestrator = createPipelineOrchestrator();

  // Fast-path target slot: which trio index generateSingleOption computes
  // alone (see resolveSingleOptionWantIndex above). Also doubles as the
  // bundleId anti-repetition tracking index below — falls back to 1
  // (today's exact behaviour) whenever single-option mode is not active,
  // so the full-trio path is unaffected.
  const singleOptionWantIndex: 0 | 1 | 2 = resolveSingleOptionWantIndex(
    options.generateSingleOption,
    options.targetOptionIndex,
    pipeline.sessionPolicy.defaultFocusIndex,
  );

  for (let i = 0; i < 3; i++) {
    // When the Custom Builder requests a specific difficulty, skip the other
    // two iteration slots to avoid generating workouts that are immediately
    // discarded, saving significant device processing overhead.
    if (options.targetDifficulty != null && configs[i].difficulty !== options.targetDifficulty) {
      continue;
    }

    // Fast-path: when the result feeds a preview drawer (schedule-card tap),
    // only the periodization-recommended slot (or an explicit
    // targetOptionIndex override) is generated — skip the other two to cut
    // Firestore reads and generation latency by ~66%. See
    // shouldSkipSingleOptionSlot above for the exact precedence rule vs.
    // targetDifficulty (Custom Builder) — in practice the two never
    // co-occur (Custom Builder never sets generateSingleOption).
    if (shouldSkipSingleOptionSlot(i, options.generateSingleOption, options.targetDifficulty, singleOptionWantIndex)) {
      continue;
    }

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

    // Resolve effective difficulty — cfg.difficulty is always honoured.
    // Intensity gating (isIntenseLocked) controls UI availability only;
    // it must not silently degrade a D3 generation to D2 after the user
    // has already chosen Intense.
    const optionDifficulty: DifficultyLevel = cfg.difficulty;

    // ── Bolt-specific availableTime CEILING — AUTOMATIC suggestions only ───
    // F4 (docs/workout-engine/03-CHANGES.md Addendum 15/19; 00-PLAN.md §16):
    // BOLT_DURATION_CAPS {30/45/60} exist so the automatic 3-option carousel
    // never over-sizes a pool for a bolt nobody explicitly asked for at that
    // exact length. `targetDifficulty != null` is exactly the signal that
    // this IS an explicit single-bolt request (the slider and Custom
    // Builder both set it — see F1 fix) — for those, the cap does not apply
    // at all; the requested duration is delivered in full, at every
    // difficulty. "קל" (easy) must mean fewer/easier sets, not a shorter
    // session — a user asking for 45 min got silently delivered ~14 min
    // before this fix (Addendum 17's own proof run caught it).
    const boltDurationCap = BOLT_DURATION_CAPS[optionDifficulty];
    const isExplicitChoice = options.targetDifficulty != null;
    const effectiveTime = resolveEffectiveBoltTime(options.availableTime, boltDurationCap, isExplicitChoice);
    if (effectiveTime !== boltDurationCap) {
      console.log(`[WorkoutTrio] Bolt${optionDifficulty}: honouring requested ${effectiveTime}min (ceiling ${boltDurationCap}min, explicit=${isExplicitChoice})`);
    }

    // Build per-option generator context (inherits all Sprint 3 context)
    const optionContext: WorkoutGenerationContext = {
      ...pipeline.baseGeneratorContext,
      difficulty: optionDifficulty,
      availableTime: effectiveTime,
      recentExerciseIds: sessionBlacklist.size > 0
        ? new Set([
            ...Array.from(pipeline.baseGeneratorContext.recentExerciseIds ?? []),
            ...Array.from(sessionBlacklist),
          ])
        : pipeline.baseGeneratorContext.recentExerciseIds,
      coreFormsChosenThisTrio,
    };

    // RULE 3 — Guaranteed Pyramid for Bolt-3 (Option 3 — עצים ומהיר)
    //
    // The intense-day option must always deliver a heavy pyramid block so
    // advanced users get structured progressive overload rather than a
    // randomly-chosen protocol.  We override the protocol lottery by pinning
    // preferredProtocols to ['pyramid'] at probability=1.0.  This bypasses
    // the random roll inside WorkoutGenerator.selectProtocol() while leaving
    // the pyramid-target selection logic (selectPyramidTargets) untouched so
    // it still picks the most appropriate elite compound exercise.
    //
    // Applies to training days only — rest-day configs have no "intense" slot.
    if (i === 2 && !isRestDay) {
      optionContext.preferredProtocols  = ['pyramid'];
      optionContext.protocolProbability = 1.0;
      console.log('[WorkoutTrio] Option 3 (Bolt3 — intense): pyramid protocol forced (p=1.0)');
    }

    // Generate workout via PipelineOrchestrator (empty-pool guard + blueprint-aware shim)
    const orchResult = orchestrator.run(optionPool, optionContext);
    const workout = orchResult.workout;

    // Attach AI cue fallback
    if (!workout.aiCue && pipeline.aiCue) {
      workout.aiCue = pipeline.aiCue;
    }

    // Warmup — use the FULL allExercises pool (not scoredExercises) so that
    // exercises with exerciseRole === 'warmup' are always available for Stage 1.
    // scoredExercises is filtered by ContextualEngine for the *main* workout and
    // intentionally excludes warmup-role exercises; allExercises retains them.
    // warmup.service.ts has its own independent filter stack (passesEquipmentAndLocation,
    // isPotentiationCandidate, etc.) so passing the full pool is safe.
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
      workout.difficulty,
      pipeline.baseGeneratorContext.availableEquipment,
      effectiveTime, // time-aware warmup: included in the user's budget
    );

    // Cooldown
    appendCooldownExercises(
      workout,
      pipeline.allExercises,
      pipeline.filterContext,
      pipeline.effectiveFilterLocation,
      effectiveTime, // time-aware cooldown: included in the user's budget
    );

    // Post-processing (Option 2 & 3 modifiers) — delegated to trio-modifiers.service.ts
    if (cfg.postProcess === 'intense') {
      applyIntenseOption(workout, sessionBlacklist, pipeline.userProgramLevels, pipeline.allExercises, pipeline.effectiveFilterLocation);
    } else if (cfg.postProcess === 'flow_regression') {
      applyFlowRegression(
        workout,
        pipeline.userProgramLevels,
        pipeline.allExercises,
        sessionBlacklist,
        pipeline.effectiveFilterLocation,
        pipeline.baseGeneratorContext.activeProgramId,
        pipeline.baseGeneratorContext.levelProgressPercent,
        pipeline.baseGeneratorContext.intentMode,
      );
    } else if (cfg.postProcess === 'mobility_tag') {
      applyTagPreference(workout, 'mobility', sessionBlacklist);
    } else if (cfg.postProcess === 'flexibility_tag') {
      applyTagPreference(workout, 'flexibility', sessionBlacklist);
    }

    // ── Volume Cap: enforce bolt duration ceiling (Tier-3 PresentationFormatter) ──
    //
    // Runs AFTER all post-processing (warmup, cooldown, intense/flow
    // modifiers) so the final plan reflects real timing.  Phase A prunes
    // expendable exercises (core → isolation → extra legs); Phase B trims
    // sets down to a floor of 2 by ascending tier priority.  Rest seconds
    // are never touched — the staircase is physiologically fixed.
    enforceVolumeCap(workout, {
      // Trim against the EFFECTIVE time (user request honoured above), not
      // the bolt ceiling — otherwise a 20-min request still ships 45 min.
      durationCap: effectiveTime,
      diagnosticLabel: `Bolt${optionDifficulty}`,
    });

    // Resolve dynamic title/description/logicCue from Firestore metadata.
    // Declared here (assigned inside the try below) so the reconciliation
    // pass after all exercise-list mutations settle (see "Title/Description
    // Reconciliation" further down) can rebuild an equivalent context with a
    // corrected category/dominantMuscle instead of reconstructing one from
    // the pruned workout.metadataCtx snapshot, which is missing fields
    // (location, daysInactive, weeklyGapDomain, …) that only
    // pipeline.metadataCtxBase carries.
    let optionMetaCtx: WorkoutMetadataContext | undefined;
    try {
      const initialCategoryMeta = resolveCategoryFromExercises(workout.exercises, workout.structure);

      optionMetaCtx = {
        ...pipeline.metadataCtxBase,
        category: initialCategoryMeta.category,
        durationMinutes: workout.estimatedDuration,
        difficulty: workout.difficulty,
        dominantMuscle: initialCategoryMeta.dominantMuscle,
        categoryLabel: initialCategoryMeta.categoryLabel,
      };

      const variant: TrioVariant = resolveTrioVariant(cfg);

      const logicTagOverrides = computeLogicTagOverrides(variant, workout, cfg);

      const metadata = await resolveWorkoutMetadata(optionMetaCtx, variant, logicTagOverrides);
      if (metadata.title) workout.title = metadata.title;
      if (metadata.description) workout.description = metadata.description;
      if (metadata.aiCue) workout.aiCue = metadata.aiCue;

      // Stash a LIGHT scalar snapshot (§19 eviction-safe) so swap-all can re-run
      // resolveWorkoutMetadata for a NEW location without rebuilding the pipeline
      // context. location + durationMinutes are re-injected at swap time, not stored.
      workout.metadataCtx = toMetadataSnapshot(optionMetaCtx);

      if (metadata.logicCue) {
        workout.logicCue = metadata.logicCue;
      } else {
        workout.logicCue = computeLevelAwareLogicCue(
          variant,
          pipeline.userProgramLevels,
          pipeline.resolvedChildDomains.length > 0 ? pipeline.resolvedChildDomains : undefined,
        );
      }

      // Persist winning bundleId for anti-repetition (recommended slot only —
      // center/D2 card in the full-trio path, or whichever index
      // generateSingleOption actually computed in the fast path).
      if (i === singleOptionWantIndex && metadata.bundleId) {
        rememberBundleId(metadata.bundleId);
      }
    } catch {
      // Non-critical — generator fallback strings are already in place
    }

    // ── DESK WORKOUT CONSTRAINT ───────────────────────────────────────────
    // If the resolved title signals a desk workout, filter the exercise list
    // to keep only desk-friendly categories (flexibility, mobility, stretching).
    const isDeskWorkout = workout.title
      ? DESK_TITLE_KEYWORDS.some(kw => workout.title.includes(kw))
      : false;

    // Set below (else branch) when isDeskWorkout is true but too few
    // desk-friendly exercises exist — the title still promises a desk/chair
    // session while the exercise list reverts to the original pool. Read
    // after sortAndPair (see "Desk-Theme Reconciliation" further down) to
    // re-resolve title/description without the persona that drove the
    // desk-themed pick in the first place.
    let deskThemeAbandoned = false;

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
        deskThemeAbandoned = true;
      }
    }

    // Dedup titles: if another option already claimed this title, append a suffix
    if (workout.title) {
      workout.title = applyTitleDedupSuffix(workout.title, usedTitles, i);
      usedTitles.add(workout.title);
    }

    // ── Post-cut promise validation ───────────────────────────────────────
    // Runs after every mutation above (warmup/cooldown, intense/flow-
    // regression + its gear-filter, enforceVolumeCap, desk-workout) and
    // before the final sort — the position verified against the full
    // per-bolt mutation sequence (docs/workout-engine/09-CORE-TABATA.md's
    // 05.09.2026 follow-up). Re-checks the domain promises the early
    // guarantees (GuaranteePassRunner.runAllGuarantees, inside the
    // generator) made ONCE and never re-verified — the exact gap that let
    // core silently disappear after a successful early injection. Core is
    // the only ENFORCED promise this pass (David's explicit scope); skipped
    // entirely for non-full-body sessions (checked internally).
    if (orchResult.blueprint) {
      workout.pipelineLog = workout.pipelineLog ?? [];
      const { exercises: validatedExercises } = validatePromisesPostCut(
        workout.exercises,
        optionContext,
        orchResult.blueprint,
        optionDifficulty,
        workout.pipelineLog,
      );
      workout.exercises = validatedExercises;
    }

    // ── Locked Final Ordering: antagonist re-pair → domain-priority sort ──
    //
    // sortAndPair() owns the two-step locked chain (Tier-3 PresentationFormatter):
    //   1. Re-apply antagonist pairing when the session is NOT single-domain
    //      AND either the generator's probability roll fired internally OR
    //      the Firestore admin config explicitly listed 'antagonist_pair'.
    //   2. Apply the strict Domain-Priority Sort (Step 5f-prime) — the
    //      ABSOLUTE last mutation on `workout.exercises` so legs / core
    //      can never jump above push / pull and break the CNS contract.
    sortAndPair(workout, {
      isSingleDomain: pipeline.isSingleDomain,
      adminPreferredProtocols: pipeline.adminPreferredProtocols,
      diagnosticLabel: label,
    });

    // ── Desk-Theme Reconciliation ──────────────────────────────────────────
    // deskThemeAbandoned (set above) means the title/description were picked
    // while isDeskWorkout was true, but too few desk-friendly exercises
    // existed to actually deliver a desk/chair session — workout.exercises
    // is back to the original (non-desk) pool. The desk theme itself comes
    // from workout-metadata.service.ts's persona+time-window "Desk Reset
    // Boost" (+30 for office_worker/student, 12:00-14:00) — category and
    // dominantMuscle are NEVER read by that scoring function, so re-deriving
    // them from the final exercise list cannot steer the re-pick away from
    // desk-themed copy. The only lever that actually works is the persona
    // field the boost (and the "David Clause" demographic hard-exclusion
    // both office_worker and student are already subject to,
    // scoreContentRow's userHasNoPersona branch) key off — clearing it for
    // this one re-resolve disables the boost AND hard-excludes
    // office_worker/student-tagged rows, falling back to generic copy that
    // actually matches a generic exercise list.
    //
    // Scoped deliberately to this one demonstrated case: post-cut promise
    // validation and sortAndPair don't feed any comparable persona/time-
    // gated content bonus, so there's nothing analogous to reconcile there
    // without a similarly demonstrated mismatch.
    if (deskThemeAbandoned && optionMetaCtx) {
      try {
        const reconVariant = resolveTrioVariant(cfg);
        const { reconciled, newMetadataCtx, bundleId, staleTitle } = await reconcileDeskThemeMismatch(
          workout,
          optionMetaCtx,
          reconVariant,
          computeLogicTagOverrides(reconVariant, workout, cfg),
        );

        if (reconciled) {
          console.warn(
            `[WorkoutTrio] desk theme abandoned for option ${i} — re-resolved title/description ` +
            `without persona to avoid shipping desk-themed copy over a non-desk exercise list`,
          );

          if (newMetadataCtx) {
            workout.metadataCtx = toMetadataSnapshot(newMetadataCtx);
          }

          // replaceReconciledTitle drops the stale (desk-themed) title —
          // already registered in usedTitles by the dedup check above —
          // before re-checking the new one, otherwise a workout always
          // collides with its own prior entry and gets a spurious suffix.
          if (workout.title) {
            workout.title = replaceReconciledTitle(usedTitles, staleTitle, workout.title, i);
          }

          if (i === singleOptionWantIndex && bundleId) {
            rememberBundleId(bundleId);
          }
        }
        // Not reconciled (Firestore error, or no surviving candidate row) —
        // leave the stale desk-themed copy in place rather than clobber it
        // with a description-less partial bundle.
      } catch {
        // Non-critical — keep the pre-reconciliation title/description
        // rather than risk showing nothing.
      }
    }

    // ── Pre-compute UI-ready rep range strings ───────────────────────────
    // After every mutation has settled, stamp `formattedRepRange` on every
    // exercise so React cards (StatsOverview, StrengthExerciseCard, etc.)
    // can read a pre-computed Hebrew string instead of re-formatting on
    // every render.  Idempotent — safe to re-run later if needed.
    annotateRepRanges(workout.exercises);

    // ── Round displayed rest to the nearest 15s (03-CHANGES.md Addendum 26) ──
    // Presentation-only: snaps the countdown target to a countable number
    // (60/75/90/…) after every other rest-affecting mutation has settled.
    // Must run last among rest-touching passes — enforceVolumeCap explicitly
    // never touches restSeconds, so ordering relative to it doesn't matter,
    // but this still belongs at the very end of the pipeline like
    // annotateRepRanges.
    roundRestSeconds(workout.exercises);

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

  // When a single difficulty was requested (Custom Builder OR drawer fast-path),
  // only one result was generated.  Pad slots 1 & 2 so the HomeWorkoutTrioResult
  // type contract is satisfied.  Callers always read results[focusIdx] (D2 = idx 1),
  // so the duplicates are never surfaced to the user.
  if ((options.targetDifficulty != null || options.generateSingleOption) && results.length === 1) {
    results.push(results[0]);
    results.push(results[0]);
    console.log('[WorkoutTrio] Single-option path — padded 3 slots with the same workout');
  }

  genPerfMark('#8 trio-loop (3× generate + metadata resolve)');

  // ── 4. Summary log ────────────────────────────────────────────────────
  logTrioSummary(results, isRestDay);

  // ── 5. Cycle Restart (Rebuild path) ───────────────────────────────────
  // When the gap >= 21 days, the policy flagged shouldRestartCycle = true.
  // We persist a fresh startDate to Firestore so the next session begins
  // a new 5-week cycle from Build (Week 1).
  if (pipeline.sessionPolicy.shouldRestartCycle && !options.skipCycleRestart) {
    await _persistCycleRestart(options.userProfile).catch(err =>
      console.warn('[Periodization] Cycle restart write failed (non-blocking):', err),
    );
  }

  console.groupEnd();

  return {
    options: results as [WorkoutTrioOption, WorkoutTrioOption, WorkoutTrioOption],
    isRestDay,
    labelsSource,
    meta: {
      ...pipeline.resultMeta,
      periodizationWeek: pipeline.sessionPolicy.periodizationWeek,
      coachCue: pipeline.sessionPolicy.coachCue,
      defaultFocusIndex: pipeline.sessionPolicy.defaultFocusIndex,
    },
  };
}

/**
 * Resets the active program's startDate to today, restarting the
 * 5-week periodization cycle. Triggered after long inactivity gaps (21+ days).
 */
async function _persistCycleRestart(userProfile: UserFullProfile): Promise<void> {
  const activePrograms = userProfile.progression?.activePrograms;
  if (!activePrograms?.length || !userProfile.id) {
    console.log('[Periodization] Cycle restart skipped — no active program or user ID');
    return;
  }

  const updated = activePrograms.map((ap, idx) =>
    // ISO string on purpose (crash fix, 09.07.2026): writing a Date here
    // stored a Firestore Timestamp, while the assignment path
    // (progression.service:926) writes ISO strings — the mixed formats broke
    // the profile reader after a cycle restart. One format everywhere.
    idx === 0 ? { ...ap, startDate: new Date().toISOString(), currentWeek: 1 } : ap,
  );

  // Lazy-import Firestore primitives to keep this hot path lean.
  const { doc, updateDoc } = await import('firebase/firestore');
  const { db } = await import('@/lib/firebase');

  const userDocRef = doc(db, 'users', userProfile.id);
  await updateDoc(userDocRef, {
    'progression.activePrograms': updated,
  });

  console.log(
    `[Periodization] Cycle restarted: ${activePrograms[0]?.name ?? 'active program'} ` +
    `→ startDate reset to ${new Date().toISOString().slice(0, 10)}, currentWeek=1`,
  );
}

// ============================================================================
// DOMAIN BUDGET RESOLUTION — absent=absent (⑨), shared by all master paths
// ============================================================================

export interface DomainBudgetEntry {
  domain: string;
  level: number;
  weekly: number;
  daily: number;
}

/**
 * Builds one budget entry per domain, but ONLY for domains present in
 * `userProgramLevels` (i.e. genuinely assessed — a real level > 0 somewhere
 * in `progression.domains`/`progression.tracks`, per `buildUserProgramLevels`'s
 * absent=absent ⑨ contract). A domain absent from the map is EXCLUDED from
 * the returned array entirely — never assigned `baseUserLevel` or any other
 * invented value (BUG 1 rework: this replaces every `userProgramLevels.get(x)
 * ?? baseUserLevel` call site in the calisthenics_upper and upper_body
 * master-session budget paths below with a single has()-guarded rule, so the
 * exclusion behaviour lives in exactly one place instead of being duplicated
 * — and possibly drifting — across 3 call sites).
 */
export function buildAssessedDomainBudgets(
  domains: string[],
  userProgramLevels: Map<string, number>,
  scheduleDays: number,
): DomainBudgetEntry[] {
  return domains
    .filter(domain => userProgramLevels.has(domain))
    .map(domain => {
      const level = userProgramLevels.get(domain)!;
      const weekly = calculateWeeklyBudget(level, scheduleDays);
      const daily = Math.max(1, Math.ceil(weekly / Math.max(1, scheduleDays)));
      return { domain, level, weekly, daily };
    });
}

/**
 * Resolves the effective execution location for workout generation ("Ultimate
 * Park Force"). `testLocation` (originally a QA/Master-Simulator bypass) wins
 * if set; otherwise an explicit `location` — what the real home-page caller
 * (generateHomeWorkoutTrio via StatsOverview.tsx) sends — is now ALSO
 * honored, the same way testLocation already was; only when NEITHER is
 * provided does it default to 'park'. No default/smart-selection logic
 * changed here — this fixes only the fact that `location` was previously
 * read solely for a log message and never actually applied.
 * Pure/exported so this specific decision is unit-testable in isolation
 * (see home-workout.location-resolution.test.ts) without the full async pipeline.
 */
export function resolveEffectivePipelineLocation(
  testLocation: ExecutionLocation | undefined,
  location: ExecutionLocation | undefined,
): ExecutionLocation {
  return testLocation ?? location ?? 'park';
}

/**
 * Resolves which trio slot index (0 = Easy/D1, 1 = Balanced/D2, 2 = Intense/D3)
 * `generateSingleOption`'s fast path computes alone. `targetOptionIndex` wins
 * when explicitly set; otherwise defers to the periodization engine's
 * `defaultFocusIndex` recommendation for this date (0 on Deload/Rebuild,
 * 2 on Peak, 1 otherwise) — this is the fix for the bug where the fast path
 * used to always compute D2 regardless of what the date actually called for,
 * silently mislabeling Deload/Peak-week previews. Falls back to 1 (today's
 * exact prior behaviour, and the bundleId-tracking default) whenever
 * single-option mode isn't active — the full-trio path is unaffected.
 * Pure/exported so this decision is unit-testable in isolation (see
 * home-workout.single-option-index.test.ts) without the full async pipeline.
 */
export function resolveSingleOptionWantIndex(
  generateSingleOption: boolean | undefined,
  targetOptionIndex: 0 | 1 | 2 | undefined,
  defaultFocusIndex: 0 | 1 | 2,
): 0 | 1 | 2 {
  return generateSingleOption ? (targetOptionIndex ?? defaultFocusIndex) : 1;
}

/**
 * Fast-path gate for the per-option loop below: returns `true` when
 * iteration index `i` should be SKIPPED (not computed) this call.
 * `targetDifficulty` (Custom Builder) takes precedence and is handled by
 * its own gate upstream in the loop — this one only fires when that gate is
 * inactive, so the two never double-skip. Exported and exercised directly by
 * the regression test — this is the exact function the production loop
 * calls, not a re-implementation, so a passing test proves the real gate.
 */
export function shouldSkipSingleOptionSlot(
  i: number,
  generateSingleOption: boolean | undefined,
  targetDifficulty: DifficultyLevel | undefined,
  wantIndex: 0 | 1 | 2,
): boolean {
  return !!generateSingleOption && targetDifficulty == null && i !== wantIndex;
}

// ============================================================================
// SHARED PIPELINE — Extract expensive I/O + scoring (run ONCE)
// ============================================================================

import type { ScoredExercise, ContextualFilterContext as _CFCtx } from '../logic/ContextualEngine';
import type { FilterStageCounts } from '../logic/contextual-engine.types';

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
  /** Resilient Smart Coach session policy (Periodization + Gap handling). */
  sessionPolicy: SessionPolicy;
  /** Protocol IDs preferred by the Firestore admin config for this session. */
  adminPreferredProtocols?: string[];
  /**
   * True when exactly one baseline domain is active (e.g. pure Pull, pure Push).
   * Used downstream to gate antagonist pairing — single-domain sessions must
   * render a clean flat sequence with no cross-domain pairedWith coupling.
   */
  isSingleDomain: boolean;
  /**
   * BUG 1 safety net (all-domains-unassessed): set when `activeProgramFilters`
   * resolved to an empty set — i.e. NONE of the domains relevant to this
   * request have ever been assessed (intersection of {requested domains} ∩
   * {assessed domains} is empty). Carries the normalised, originally-requested
   * program IDs so the caller can route the user to the right mini-questionnaire.
   * When set, `generateHomeWorkoutTrio` short-circuits to an explicit
   * "needs assessment" result instead of composing a blank/near-empty workout —
   * see `buildNeedsAssessmentResult`.
   */
  needsAssessmentDomains?: string[];
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
    previewNow,
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
    requiredDomains: requiredDomainsOverride,
    strictDomains,
    parkEquipmentIds,
    isManualOverride,
  } = options;

  const WEEKLY_SA_CAP = 6;

  // ── ULTIMATE PARK FORCE — see resolveEffectivePipelineLocation() above ──
  const location: ExecutionLocation = resolveEffectivePipelineLocation(options.testLocation, options.location);
  if (options.testLocation) {
    console.log(`[HomeWorkout] 🧪 testLocation bypass: using "${options.testLocation}" (Park Force disabled)`);
  } else if (options.location) {
    console.log(`[HomeWorkout] 📍 location honored: using "${options.location}" (Park Force disabled)`);
  } else {
    console.log(`[HomeWorkout] 🏞️ No location specified → "park" (PARK FORCE active)`);
  }

  // ── 0. UTS Schedule Override ──────────────────────────────────────────
  const fallbackProgram = userProfile.progression?.activePrograms?.[0]?.templateId;
  // ── 0a. Normalise scheduled program IDs ───────────────────────────────
  // SKILL_DISPLAY (ScheduleStep / recurringTemplate) stores uppercase keys —
  // PLANCHE, FRONT_LEVER, UPPER_CALISTHENICS — in entry.programIds.
  // The engine (KNOWN_SLUGS, MG_TO_DOMAIN, resolveToSlug) expects lowercase
  // slugs (planche, front_lever, calisthenics_upper).
  // Normalise here, once, before any downstream calls.
  const rawScheduledIds = scheduledProgramIds?.length
    ? scheduledProgramIds.map(normalizeProgramId)
    : fallbackProgram ? [normalizeProgramId(fallbackProgram)] : [];

  console.log(
    `[HomeWorkout] scheduledProgramIds normalised: [${(scheduledProgramIds ?? []).join(',')}]` +
    ` → [${rawScheduledIds.join(',')}]`,
  );

  const effectiveIsRecovery = isScheduledRestDay ? true : (isRecoveryDay ?? false);

  // ── 1. Fetch data ─────────────────────────────────────────────────────
  // getBaseUserLevel reads tracks/domains, not activePrograms — safe to call
  // with the original profile before the effective override is built.
  const baseUserLevel = getBaseUserLevel(userProfile);
  const [allExercises, gymEquipmentList, allPrograms] = await Promise.all([
    getAllExercises(),
    getAllGymEquipment(),
    getCachedPrograms(),
    ensureEquipmentCachesLoaded(),
  ]);
  genPerfMark('#3 data-fetch (exercises+gymEquip+programs)');

  // ── 1b. Build Firestore ID → slug map ─────────────────────────────────
  // CRITICAL: must happen before ANY resolveToSlug call.  On the first
  // invocation the module-level _idToSlugMap is null; calling resolveToSlug
  // before this point logs "ID→Slug map is NULL" and returns the raw ID —
  // which breaks master-program detection and child-domain resolution.
  const idToSlug = buildIdToSlugMapFromPrograms(allPrograms);

  // ── 1c. Master-program identity guard (safe now — map is populated) ───
  // WorkoutBuilderSheet passes the master ID first when the user selects a
  // master program (e.g. ['calisthenics_upper', 'planche', 'front_lever']).
  // The service derives child domains independently via resolveChildDomainsForParent,
  // so effectiveProfile.activePrograms must contain ONLY the master entry —
  // adding children would confuse downstream consumers keying on activePrograms[0].
  const MASTER_PROGRAM_SLUGS = new Set(['calisthenics_upper', 'full_body', 'upper_body', 'lower_body']);
  const firstId = rawScheduledIds[0] ?? '';
  const isLeadingMaster =
    MASTER_PROGRAM_SLUGS.has(firstId) ||
    MASTER_PROGRAM_SLUGS.has(resolveToSlug(firstId));
  const effectiveActiveIds = isLeadingMaster
    ? rawScheduledIds.slice(0, 1)   // master only — children via resolveChildDomainsForParent
    : rawScheduledIds;

  const effectiveProfile: typeof userProfile = {
    ...userProfile,
    progression: {
      ...userProfile.progression,
      activePrograms: effectiveActiveIds.map(id => ({
        id, templateId: id, name: id,
        startDate: new Date(), durationWeeks: 52, currentWeek: 1, focusDomains: [],
      })),
    },
  };

  // Master programs (display-only) are excluded from the engine's level map.
  const masterProgramIds = new Set(
    allPrograms.filter(p => p.isMaster).map(p => p.id),
  );
  const { levels: userProgramLevels } = buildUserProgramLevels(effectiveProfile, masterProgramIds, '[HomeWorkout:Trio]');

  const activeProgramId = effectiveProfile.progression?.activePrograms?.[0]?.templateId;
  let resolvedChildDomains = resolveChildDomainsForParent(activeProgramId, userProfile);

  // ── 1d. UPPER_CALISTHENICS child domain normalisation ─────────────────
  // When the scheduled day is a hybrid session (UPPER_CALISTHENICS, normalised
  // to 'calisthenics_upper'), resolveChildDomainsForParent reads
  // profile.progression.skillFocusIds which may:
  //   a) Contain Firestore hash IDs (old admin-panel assignment)  → resolve via idToSlug
  //   b) Be empty / return ['calisthenics_upper']                 → derive from tracks/activePrograms
  //   c) Already contain valid slugs (planche, front_lever, …)    → keep as-is
  // Without this normalisation the DomainBudget allocator looks for
  // programLevelSettings docs with hash-ID keys that don't exist, producing
  // an empty exercise pool.
  if (activeProgramId === 'calisthenics_upper') {
    // 'one_arm_pullup' — not 'oap' — matches the catalog (program-path
    // /page.tsx's SKILL_PROGRAMS) and every other skill-slug consumer in
    // this file (_CU_SKILL_PARENT/_SKILL_PARENT_MAP). 'oap' was this set's
    // own invention — confirmed 08.09.2026 by checking the real catalog,
    // not assumed. 'human_flag'/'back_lever' are real, recognized skill
    // domains elsewhere (MG_TO_DOMAIN, domain-mapping.constants.ts) but
    // aren't offered by today's onboarding catalog at all — deliberately
    // NOT added here; if a real account needs one, filterKnownSkills below
    // will now warn instead of silently dropping it, which is the signal
    // to add it, not a guess made in advance.
    const SKILL_SLUGS = new Set([
      'planche', 'front_lever', 'muscle_up', 'handstand', 'hspu', 'one_arm_pullup',
    ]);

    // A slug rejected here used to vanish with no trace — the reason this
    // exact bug (one_arm_pullup silently dropped, wrong exercises served)
    // stayed live long enough to need a diagnostic branch to find. Warn
    // loudly instead of dropping silently — never throw, a naming gap must
    // not fail a paying user's workout generation.
    const filterKnownSkills = (candidates: string[], source: string): string[] => {
      const known: string[] = [];
      for (const s of candidates) {
        if (SKILL_SLUGS.has(s)) {
          known.push(s);
        } else {
          console.warn(
            `[HomeWorkout] calisthenics_upper (${source}): unrecognized skill slug "${s}" rejected — ` +
            `not in SKILL_SLUGS [${Array.from(SKILL_SLUGS).join(', ')}]. If this is a real skill, add it to SKILL_SLUGS.`,
          );
        }
      }
      return known;
    };

    // Pass A: try to resolve every child ID through the now-built idToSlug map.
    const sluggedFromMap = filterKnownSkills(
      resolvedChildDomains.map((id) => idToSlug.get(id) ?? id),
      'idToSlug',
    );

    if (sluggedFromMap.length > 0) {
      resolvedChildDomains = sluggedFromMap;
      console.log(
        `[HomeWorkout] calisthenics_upper: child domains resolved via idToSlug → [${sluggedFromMap.join(', ')}]`,
      );
    } else {
      // Pass B: extract recognised skill slugs from the user's progression data.
      const trackSkills = filterKnownSkills(
        Object.keys(userProfile.progression?.tracks ?? {}),
        'tracks',
      );
      const programSkills = filterKnownSkills(
        (userProfile.progression?.activePrograms ?? [])
          .map((ap) => normalizeProgramId(ap.templateId ?? ap.id ?? '')),
        'activePrograms',
      );
      const derivedSet = new Set([...trackSkills, ...programSkills]);
      const derived = Array.from(derivedSet);

      if (derived.length > 0) {
        resolvedChildDomains = derived;
        console.log(
          `[HomeWorkout] calisthenics_upper: child domains derived from profile tracks → [${derived.join(', ')}]`,
        );
      } else {
        // Pass C: hardcoded last-resort so the session still generates something.
        resolvedChildDomains = ['planche', 'front_lever'];
        console.warn(
          '[HomeWorkout] calisthenics_upper: could not derive child skills from profile — ' +
          'falling back to [planche, front_lever]',
        );
      }
    }
  }

  // ── 1c. Resolve candidate exercise pool ──────────────────────────────
  // Tier 1 middleware applies the ±3 level tolerance + per-domain rescue,
  // then a graduated, logged fallback (±5 retry → parent-domain fallback →
  // return-as-is) if the pool is still thin — see resolveExercisePool's doc
  // comment. `relaxedConstraints`/`diagnostics` are threaded onto
  // baseGeneratorContext below so a relaxed session is visible on the
  // generated workout's own pipelineLog, not just in a console log.
  const poolResult = resolveExercisePool(
    allExercises,
    userProgramLevels,
    resolvedChildDomains,
    idToSlug,
    baseUserLevel,
  );
  const exercises: Exercise[] = poolResult.exercises;
  const exercisePoolRelaxedConstraints = poolResult.relaxedConstraints;
  const exercisePoolDiagnostics = poolResult.diagnostics;

  // ── 2. Derive contextual values ──────────────────────────────────────
  const daysInactive = daysInactiveOverride ?? calculateDaysInactive(userProfile);
  const injuries = extractInjuryShield(userProfile, injuryOverride);
  const persona = mapPersonaIdToLifestylePersona(userProfile, personaOverride);
  const lifestyles = collectLifestyles(userProfile, persona);

  // Tier 1 middleware: equipment normalization is the canonical place where
  // gym catalog injection, real park inventory, and the ESSENTIAL_PARK_GEAR
  // catastrophic fallback are composed and deduplicated.  After this, the
  // engine receives a non-empty array of canonical (raw) gear IDs.
  const availableEquipment: string[] = normalizeEquipmentArray(
    userProfile,
    location,
    parkEquipmentIds,
    gymEquipmentList,
    equipmentOverride,
  );
  const timeOfDay = timeOfDayOverride ?? detectTimeOfDay();

  // ── 2b. Lead Program Budget ──────────────────────────────────────────
  const [leadBudget, globalMaxIntense] = await Promise.all([
    resolveActiveProgramBudget(userProfile, allPrograms),
    resolveGlobalMaxIntense(userProfile, allPrograms),
  ]);

  // ── 2c. Split Decision Engine ────────────────────────────────────────
  const scheduleDays = (userProfile.lifestyle?.scheduleDays?.length ?? 0) || 3;

  // Full-body master: the static push/pull/legs/core quartet.
  const isFullBodyMaster =
    resolvedChildDomains.length >= 4 &&
    ['push', 'pull', 'legs', 'core'].every(d => resolvedChildDomains.includes(d));

  // Calisthenics-upper master: dynamic skill-track hybrid (e.g. planche + front_lever).
  // Requires at least one resolved child skill so the budget builder has data to work with.
  const activeProgramSlug = resolveToSlug(activeProgramId ?? '');
  const isCalisthenicsUpperMaster =
    (activeProgramId === 'calisthenics_upper' || activeProgramSlug === 'calisthenics_upper') &&
    resolvedChildDomains.length > 0;

  // Upper-body master: static push + pull wrapper program.
  // Recognised by slug OR by the fact that resolvedChildDomains resolved to exactly
  // ['push', 'pull'] (as returned by UPPER_BODY_CHILD_DOMAINS).
  const isUpperBodyMaster =
    (activeProgramId === 'upper_body' || activeProgramSlug === 'upper_body') &&
    resolvedChildDomains.includes('push') &&
    resolvedChildDomains.includes('pull') &&
    !isFullBodyMaster;

  // Unified gate: any master type triggers the per-domain budget infrastructure.
  const isMasterSession = isFullBodyMaster || isCalisthenicsUpperMaster || isUpperBodyMaster;

  console.log(
    `[DomainBudget] activeProgramId="${activeProgramId}" slug="${activeProgramSlug}" ` +
    `resolvedChildDomains=[${resolvedChildDomains.join(', ')}] ` +
    `isFullBodyMaster=${isFullBodyMaster} isCalisthenicsUpperMaster=${isCalisthenicsUpperMaster} ` +
    `isUpperBodyMaster=${isUpperBodyMaster}`,
  );

  let splitContext: SplitWorkoutContext;
  let resolvedDomainBudgets: Array<{ domain: string; level: number; weekly: number; daily: number }> | undefined;

  if (isFullBodyMaster) {
    // ── Full-Body master path (push/pull/legs/core) ─────────────────────
    // Fetches per-domain weeklyVolumeTarget from ProgramLevelSettings (Firestore).
    const aggregate = await resolveAggregateFullBodyBudget(scheduleDays, userProgramLevels, allPrograms);
    resolvedDomainBudgets = aggregate.domainBudgets;
    console.log(
      `[DomainBudget] resolvedDomainBudgets set: [${resolvedDomainBudgets.map(db => `${db.domain}=L${db.level}`).join(', ')}]`,
    );
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
  } else if (isCalisthenicsUpperMaster) {
    // ── Calisthenics-Upper master path (skill-track hybrid) ──────────────
    //
    // Reuses the full-body domain-budget infrastructure without calling
    // resolveAggregateFullBodyBudget (which only iterates the static push/pull/
    // legs/core MovementPattern quartet).  Instead, we build per-skill budgets
    // directly from userProgramLevels so that:
    //
    //   getUserLevelForExercise → resolvedDomainBudgets lookup → db.level
    //
    // returns planche=L5 / front_lever=L5 rather than the inflated foundational
    // track level (push=L16) that the legacy Master Unpack fallback was producing.
    //
    // The split context deliberately stays on the normal Path C path so
    // SplitDecisionService.resolvePrioritySkillIds can apply skill rotation
    // (Dominance Day / Dynamic Rotation / Pendulum) unmodified.
    // ── Skill-track budget entries (planche=L5, front_lever=L5, …) ─────────
    // Biomechanical parent map — mirrors _SKILL_PARENT_MAP defined later in
    // this file; duplicated here to avoid a forward-reference dependency.
    const _CU_SKILL_PARENT: Record<string, string> = {
      planche: 'push', handstand: 'push', handstand_pushup: 'push',
      front_lever: 'pull', back_lever: 'pull', muscle_up: 'pull', one_arm_pullup: 'pull',
    };
    // BUG 1 (rework): absent=absent (⑨) — a skill absent from userProgramLevels
    // (never assessed) must be EXCLUDED from this workout's budget/exercise
    // computation entirely, not assigned baseUserLevel (nor any other invented
    // value). resolveChildDomainsForParent already filters resolvedChildDomains
    // to assessed-only skills, but buildAssessedDomainBudgets stays has()-guarded
    // as defense-in-depth (e.g. a slug/hash key that somehow isn't dual-keyed in
    // userProgramLevels must never silently borrow the user's unrelated global level).
    const skillBudgetEntries = buildAssessedDomainBudgets(resolvedChildDomains, userProgramLevels, scheduleDays);

    // ── Parent foundational domain entries (push=L14, pull=L14, …) ─────────
    // Without these, the Bolt caps in WorkoutGenerator use
    //   max(planche=L5, front_lever=L5) + 1 = L6
    // as a single global ceiling, which excludes 100% of the user's actual
    // pull/push exercises (e.g. L14 pull candidates → 39 exercises dropped).
    // Adding push/pull at their real foundational levels lets the per-domain
    // Bolt cap apply L6 for planche exercises and L15 for pull exercises.
    // absent=absent (⑨): only add the parent foundational domain (push/pull) when
    // it is ITSELF assessed (buildAssessedDomainBudgets excludes it otherwise).
    // Previously `?? baseUserLevel` invented a foundational level from the user's
    // unrelated global max whenever the parent track had never been assessed —
    // e.g. a pure-planche user (push assessed, pull never assessed) would get a
    // fabricated 'pull' budget entry the moment any pull-family skill appeared
    // in resolvedChildDomains.
    const _cuParentsSeen = new Set<string>();
    const parentDomains: string[] = [];
    for (const skillId of resolvedChildDomains) {
      const parent = _CU_SKILL_PARENT[skillId];
      if (parent && !_cuParentsSeen.has(parent)) {
        _cuParentsSeen.add(parent);
        parentDomains.push(parent);
      }
    }
    const parentBudgetEntries = buildAssessedDomainBudgets(parentDomains, userProgramLevels, scheduleDays);

    resolvedDomainBudgets = [...skillBudgetEntries, ...parentBudgetEntries];
    console.log(
      `[DomainBudget] calisthenics_upper budgets (skills + parents): [${resolvedDomainBudgets.map(db => `${db.domain}=L${db.level}`).join(', ')}]`,
    );
    // Deficit-aware daily budget adjustment (mirrors full-body Phase 4 logic).
    // Skipped for manual-override sessions — the Custom Builder must never
    // receive domain daily budgets clamped to 0 by an exhausted weekly quota.
    if (!isManualOverride && domainSetsCompletedThisWeek && remainingScheduleDays && remainingScheduleDays > 0) {
      resolvedDomainBudgets = resolvedDomainBudgets.map(db => {
        const completed = domainSetsCompletedThisWeek[db.domain] ?? 0;
        const remaining = Math.max(0, db.weekly - completed);
        return { ...db, daily: Math.max(1, Math.ceil(remaining / remainingScheduleDays)) };
      });
    }
    const weeklyBudgetForSplit =
      leadBudget?.weeklyVolumeTarget ?? calculateWeeklyBudget(baseUserLevel, Math.max(1, scheduleDays));
    splitContext = getWorkoutContext({
      userProfile: effectiveProfile,
      weeklyBudget: weeklyBudgetForSplit,
      selectedDate: selectedDate ?? new Date().toISOString().split('T')[0],
      domainSetsCompletedThisWeek,
      remainingScheduleDays,
      isManualOverride,
    });
  } else if (isUpperBodyMaster) {
    // ── Upper-Body master path (push + pull) ─────────────────────────────
    //
    // upper_body is a display-only parent that wraps the push and pull tracks.
    // No programLevelSettings documents exist for the master slug itself (e.g.
    // upper_body_level_6) — volume budgets are sourced from the child tracks
    // exactly as calisthenics_upper sources them from its skill-track children.
    // absent=absent (⑨): resolvedChildDomains is already assessed-only for
    // upper_body (resolveChildDomainsForParent intersects with isAssessed), so
    // `isUpperBodyMaster` being true already guarantees both push and pull are
    // in userProgramLevels. Still built via has()-guarded filter (not `?? baseUserLevel`)
    // as defense-in-depth — an absent domain is excluded from the budget entirely,
    // never assigned the user's unrelated global level.
    resolvedDomainBudgets = buildAssessedDomainBudgets(['push', 'pull'], userProgramLevels, scheduleDays);
    console.log(
      `[DomainBudget] upper_body budgets: [${resolvedDomainBudgets.map(db => `${db.domain}=L${db.level}`).join(', ')}]`,
    );
    // Deficit-aware daily adjustment (mirrors calisthenics_upper Phase 4 logic).
    if (!isManualOverride && domainSetsCompletedThisWeek && remainingScheduleDays && remainingScheduleDays > 0) {
      resolvedDomainBudgets = resolvedDomainBudgets.map(db => {
        const completed = domainSetsCompletedThisWeek[db.domain] ?? 0;
        const remaining = Math.max(0, db.weekly - completed);
        return { ...db, daily: Math.max(1, Math.ceil(remaining / remainingScheduleDays)) };
      });
    }
    const weeklyBudgetForSplit =
      leadBudget?.weeklyVolumeTarget ?? calculateWeeklyBudget(baseUserLevel, Math.max(1, scheduleDays));
    splitContext = getWorkoutContext({
      userProfile: effectiveProfile,
      weeklyBudget: weeklyBudgetForSplit,
      selectedDate: selectedDate ?? new Date().toISOString().split('T')[0],
      domainSetsCompletedThisWeek,
      remainingScheduleDays,
      isManualOverride,
    });
  } else {
    // ── Single-track / standard path ────────────────────────────────────
    const weeklyBudgetForSplit =
      leadBudget?.weeklyVolumeTarget ?? calculateWeeklyBudget(baseUserLevel, Math.max(1, scheduleDays));
    // Phase 4 parity: single-track programs now receive the same deficit-aware
    // redistribution as Full Body.  domainSetsCompletedThisWeek and
    // remainingScheduleDays were already available in _buildSharedPipeline but
    // were never forwarded to Path B — fix that here.
    splitContext = getWorkoutContext({
      userProfile: effectiveProfile,
      weeklyBudget: weeklyBudgetForSplit,
      selectedDate: selectedDate ?? new Date().toISOString().split('T')[0],
      domainSetsCompletedThisWeek,
      remainingScheduleDays,
      isManualOverride,
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

  // ── Resilient Smart Coach: Periodization Clock + Gap Policy ──────────
  // Derives the current 5-week cycle position from the active program's
  // startDate, then resolves a unified SessionPolicy that bridges:
  //   - Build/Peak/Deload weeks (cycle-driven volume + delta + protocols)
  //   - Detraining (4-7 day gap → existing -40% logic preserved)
  //   - Long-gap deload (8-21 day gap → forces deload mode)
  //   - Rebuild (21+ day gap → forces deload + cycle restart hint)
  const activeProgramForCycle = userProfile.progression?.activePrograms?.[0];
  const cycleWeek = derivePeriodizationWeek(activeProgramForCycle);
  const sessionPolicy: SessionPolicy = resolveSessionPolicy(cycleWeek, daysInactive);

  const detrainingLock = sessionPolicy.detrainingLock;
  const volumeReductionOverride = sessionPolicy.volumeReductionOverride;

  // ── 3. Build ContextualEngine context + run scoring (ONCE) ───────────
  // Tier 1 middleware: shadow-matrix overrides + child-domain expansion +
  // skill-track sibling expansion are all consolidated here.  The result
  // exposes both the expanded filter array and the original
  // `baseDomainCount` (pre-expansion) so the caller can derive
  // `isSingleDomain` and pool strategy from the user's true intent.
  //
  // calisthenics_upper bridge: resolvedChildDomains was slug-normalised
  // in step 1d but lives only as a local variable — buildActiveProgramFilters
  // independently calls resolveChildDomainsForParent which may return raw
  // hash IDs or ['calisthenics_upper'].  Propagate the pre-normalised slugs
  // (PLUS their parent biomechanical domains — push/pull) through the first
  // active program's focusDomains so the Sanitizer's priority path picks them
  // up directly without relying on the inverse expansion that runs later.
  // This aligns the automated calisthenics_upper path with the working manual
  // multi-skill Smart Workout path where skillFocusIds already contain valid
  // slugs, ensuring both push movements (planche) and pull movements (front_lever)
  // survive ContextualEngine's exerciseMatchesProgram gate.

  // Biomechanical parent lookup for calisthenics skill-track slugs.
  const _SKILL_PARENT_MAP: Record<string, string> = {
    planche: 'push', handstand: 'push', handstand_pushup: 'push',
    front_lever: 'pull', back_lever: 'pull', muscle_up: 'pull', one_arm_pullup: 'pull',
  };

  const profileForFilters: typeof effectiveProfile =
    isCalisthenicsUpperMaster && resolvedChildDomains.length > 0
      ? (() => {
          // Spread child skill slugs + their parent domains into focusDomains
          // so buildActiveProgramFilters receives the complete filter set
          // without needing to reconstruct it from raw profile data.
          const parentDomains = Array.from(new Set(
            resolvedChildDomains
              .map((d) => _SKILL_PARENT_MAP[d])
              .filter((p): p is string => !!p && !resolvedChildDomains.includes(p)),
          ));
          const fullFocusDomains = [...resolvedChildDomains, ...parentDomains];
          console.log(
            `[HomeWorkout] calisthenics_upper focusDomains: [${fullFocusDomains.join(', ')}]`,
          );
          return {
            ...effectiveProfile,
            progression: {
              ...effectiveProfile.progression,
              activePrograms: [{
                ...effectiveProfile.progression!.activePrograms![0],
                focusDomains: fullFocusDomains as any,
              }],
            },
          };
        })()
      : effectiveProfile;

  const { filters: activeProgramFilters, baseDomainCount } =
    buildActiveProgramFilters(profileForFilters, userProfile, allPrograms, shadowMatrix);

  // absent=absent (⑨) intercept: an empty active-filter set means NO assessed strength domain
  // reached compose — i.e. the intersection of {domains required for this request} ∩ {domains
  // the user has actually assessed} is empty. The home hero-gate (`hasStrengthProgram`) routes
  // such users to the strength questionnaire BEFORE composing; this is defense-in-depth for
  // every OTHER caller (Custom Builder, schedule-card tap, hybrid preview, …) that can reach
  // compose without going through that UI gate. BUG 1 rework: escalated from a console.warn-only
  // bypass log to a real typed signal (`needsAssessmentDomains`) that `generateHomeWorkoutTrio`
  // uses to short-circuit into an explicit "needs assessment" result — never a blank/near-empty
  // workout silently scored from the whole exercise DB.
  let needsAssessmentDomains: string[] | undefined;
  if (activeProgramFilters.length === 0) {
    needsAssessmentDomains = [...rawScheduledIds];
    console.warn(
      '[home-workout] ⑨ compose reached with NO assessed domain for the requested program(s) ' +
      `[${rawScheduledIds.join(', ') || '(none)'}] (empty active filters) — short-circuiting to ` +
      'an explicit needs-assessment result instead of composing a blank workout.',
    );
  }

  const effectiveFilterLocation = location;

  const filterContext: ContextualFilterContext = {
    location: effectiveFilterLocation,
    lifestyles,
    injuryShield: injuries,
    intentMode,
    availableEquipment,
    getUserLevelForExercise: (exercise: Exercise) => {
      if (resolvedDomainBudgets?.length) {
        // ── Pass 1: movementGroup → domain ──────────────────────────────────
        // Fast path using the canonical MG_TO_DOMAIN map (foundational MGs
        // resolve to push/pull/legs/core; skill MGs resolve to their own
        // program slug — e.g. 'planche', 'muscle_up').
        const mgDomain = MG_TO_DOMAIN[exercise.movementGroup ?? ''];
        let db = resolvedDomainBudgets.find(d => d.domain === mgDomain);

        // ── Pass 2: targetPrograms → domain ─────────────────────────────────
        // Handles exercises whose movementGroup is non-standard (e.g. HSPU /
        // handstand_push, planche, etc.) by reading their program associations
        // instead. This mirrors the logic in applyDifficultyFilter so that the
        // SCORING level and the TIER level are always computed from the same
        // domain — preventing the "HSPU appears near-match at L18 but resolves
        // to flow against push-L22" discrepancy.
        //
        // Most-specific-wins, not first-in-array-wins (2026-09-08, David) —
        // see resolveMostSpecificDomainBudget's own doc comment
        // (level-resolution.utils.ts) for the full principle and the real
        // one_arm_pullup regression this closes.
        if (!db && exercise.targetPrograms?.length) {
          db = resolveMostSpecificDomainBudget(
            exercise.targetPrograms,
            resolvedDomainBudgets,
            _SKILL_PARENT_MAP,
            resolveToSlug,
          );
        }

        if (db) return db.level;
      }
      // ── Master Unpacking fallback (legacy / edge-case path) ────────────
      // For calisthenics_upper sessions, this block is now bypassed:
      // resolvedDomainBudgets is always populated (isCalisthenicsUpperMaster branch
      // above), so Pass 1 (MG_TO_DOMAIN → skill slug) and Pass 2 (targetPrograms)
      // in the block above return the correct granular skill level before we reach
      // here.  This fallback remains for future programs that may be master-like
      // but don't match either the full-body quartet or the calisthenics_upper gate,
      // and as a safety net for exercises with no MG and no matching targetPrograms.
      const rawTemplateId =
        effectiveProfile.progression?.activePrograms?.[0]?.templateId
        ?? effectiveProfile.progression?.activePrograms?.[0]?.id;

      let resolvedActiveProgramId: string | undefined = rawTemplateId;

      if (rawTemplateId === 'calisthenics_upper' && resolvedChildDomains.length > 0) {
        // Pick the first skill focus child whose programId matches one of the
        // exercise's targetPrograms entries — this is the exact track the
        // exercise belongs to, and the one that carries the correct user level.
        const matchingChild = resolvedChildDomains.find(child =>
          exercise.targetPrograms?.some(
            tp => tp.programId === child || resolveToSlug(tp.programId) === child,
          ),
        );
        resolvedActiveProgramId = matchingChild ?? resolvedChildDomains[0];
      }

      return getEffectiveLevelForExercise(
        exercise,
        userProfile,
        shadowMatrix,
        baseUserLevel,
        resolvedActiveProgramId,
      );
    },
    levelTolerance: 3,
    activeProgramFilters: activeProgramFilters.length > 0 ? activeProgramFilters : undefined,
    activeDomains: activeProgramFilters.length > 0 ? activeProgramFilters : undefined,
    // Primary active program (the user's headline training track, e.g. `planche`).
    // Forwarded to resolveExerciseLevelForDomains as the tiebreaker so multi-
    // assigned exercises resolve to the skill-level entry instead of being
    // hijacked by a foundational baseline (push/pull) indexed earlier.
    activeProgramId:
      effectiveProfile.progression?.activePrograms?.[0]?.templateId
      ?? effectiveProfile.progression?.activePrograms?.[0]?.id
      ?? undefined,
    excludedMuscleGroups:
      splitContext.excludedMuscleGroups.length > 0 ? splitContext.excludedMuscleGroups : undefined,
  };

  genPerfMark('#4-5 budgets+split+context-build');

  // ── 4. Run ContextualEngine via PoolFactory (SINGLE PASS — shared across all 3 options) ─
  // PoolFactory encapsulates filterAndScore + PoolRescue retry + profileStale guard.
  // The strategy is derived from the original base-domain count (before sibling
  // expansion) so PoolRescue fires correctly for single-domain sessions.
  //
  // Skipped entirely when `needsAssessmentDomains` is set (absent=absent ⑨, detected
  // above via `activeProgramFilters.length === 0`): every requested domain is
  // unassessed, so `generateHomeWorkoutTrio` discards this whole pipeline result and
  // short-circuits to an explicit needs-assessment response the moment this function
  // returns. Scoring the full exercise DB here would be pure waste — this was the
  // confirmed cause of a ~9s / 5000+ console.log map-generation stall (11.08.2026):
  // getEffectiveLevelForExercise ran (and logged) once per exercise in the DB, every
  // one of them resolving UNASSESSED_DOMAIN_LEVEL, for a result nobody was going to read.
  const poolStrategy = baseDomainCount === 1 ? 'single_domain'
    : baseDomainCount === 2 ? 'antagonist_split'
    : 'full_body';

  let scoredExercises: ScoredExercise[];
  let filterResult: { exercises: ScoredExercise[]; excludedCount: number; filterCounts: FilterStageCounts };

  if (needsAssessmentDomains) {
    scoredExercises = [];
    filterResult = {
      exercises: [],
      excludedCount: exercises.length,
      filterCounts: {
        pool_start: exercises.length,
        excluded_program_filter: 0,
        excluded_level_tolerance: 0,
        excluded_skill_gate: 0,
        excluded_exclusive_skill_gate: 0,
        excluded_balance_gate: 0,
        excluded_injury_shield: 0,
        excluded_48h_muscle: 0,
        excluded_field_mode: 0,
        excluded_location: 0,
        excluded_sweat: 0,
        excluded_noise: 0,
        after_hard_filters: 0,
      },
    };
    console.log(
      `[WorkoutTrio] Shared pipeline: SKIPPED scoring (${exercises.length} exercises) — ` +
      'needs-assessment short-circuit, see warning above',
    );
  } else {
    const candidatePool = createPoolFactory().build(
      exercises,
      filterContext,
      userProgramLevels,
      poolStrategy,
    );

    scoredExercises = candidatePool.candidates.get('__shared__') ?? [];

    // ── Precedence rule: explicit muscle intent WINS over program filter ─────
    // (Stability fix ד׳, 08.07.2026.) When BOTH a strict program filter and
    // explicit requiredDomains are active and their intersection empties the
    // pool (program keeps only X-domain exercises, chips demand Y), the old
    // behavior fell through to the rest-day fallback ("יום מנוחה") — a dead
    // end for the custom builder. Defined order: the user's EXPLICIT muscle
    // choice drives the session; the program filter is dropped for this
    // generation only (levels degrade gracefully to domain-level resolution).
    if (
      scoredExercises.length === 0 &&
      (filterContext.activeProgramFilters?.length ?? 0) > 0 &&
      strictDomains &&
      (requiredDomainsOverride?.length ?? 0) > 0
    ) {
      console.warn(
        '[WorkoutTrio] program↔domain conflict emptied the pool — ' +
        'retrying WITHOUT program filter (explicit domains win)',
      );
      const rescuePool = createPoolFactory().build(
        exercises,
        {
          ...filterContext,
          activeProgramFilters: undefined,
          activeDomains: requiredDomainsOverride,
        },
        userProgramLevels,
        poolStrategy,
      );
      scoredExercises = rescuePool.candidates.get('__shared__') ?? [];
      console.warn(`[WorkoutTrio] domain-precedence rescue recovered ${scoredExercises.length} exercises`);
    }

    filterResult = {
      exercises: scoredExercises,
      excludedCount: candidatePool.excludedCount,
      filterCounts: candidatePool.filterCounts,
    };

    console.log(
      `[WorkoutTrio] Shared pipeline: ${filterResult.exercises.length} scored exercises ` +
      `(${filterResult.excludedCount} excluded), ${allExercises.length} total in DB` +
      `${candidatePool.toleranceExpanded ? ' [tolerance expanded ±5]' : ''}`,
    );
    if (filterResult.filterCounts) {
      const fc = filterResult.filterCounts;
      console.log(
        `[WorkoutTrio] Filter breakdown — ` +
        `program_filter: ${fc.excluded_program_filter}, ` +
        `level_tolerance: ${fc.excluded_level_tolerance}, ` +
        `skill_gate: ${fc.excluded_skill_gate}, ` +
        `location: ${fc.excluded_location}, ` +
        `injury: ${fc.excluded_injury_shield}, ` +
        `passed: ${fc.after_hard_filters}`,
      );
    }
  }
  genPerfMark('filter+score (ContextualEngine/ParkGating, CPU)');

  // ── 5a. Progressive Overload goals ───────────────────────────────────
  let goalExerciseIds: Set<string> | undefined;
  let goalTargets: Map<string, { targetValue: number; unit: 'reps' | 'seconds' }> | undefined;
  let levelProgressPercent = 0;
  let workoutsCompletedInLevel = 0;

  const primaryProgramId = Array.from(userProgramLevels.entries())[0]?.[0];
  const primaryProgramLevel = primaryProgramId ? userProgramLevels.get(primaryProgramId) ?? 1 : 1;

  let adminPreferredProtocols: string[] | undefined;
  let adminProtocolProbability: number | undefined;

  // ── Protocol & Goal lookup: scan ALL enrolled programs, not just the first ──
  // userProgramLevels keys are domain SLUGS (e.g. 'push', 'pull') coming from
  // progression.tracks / progression.domains. But programLevelSettings documents
  // are stored with the Firestore PROGRAM ID (e.g. 'calisthenics-push-v2').
  // We must resolve slug → real Firestore program ID before the Firestore fetch,
  // otherwise the lookup always returns null for any program whose ID ≠ its slug.

  // Build slug → Firestore program ID reverse map from the full programs list.
  const slugToFirestoreId = new Map<string, string>();
  for (const prog of allPrograms) {
    const slug = prog.slug ?? prog.movementPattern ?? prog.name.toLowerCase().replace(/[\s-]+/g, '_');
    // Map both the slug AND the raw ID to the program ID (handles both cases).
    if (!slugToFirestoreId.has(slug)) slugToFirestoreId.set(slug, prog.id);
    slugToFirestoreId.set(prog.id, prog.id);
  }

  // Sort order for scanning:
  //   Tier 0 — explicitly scheduled programs (highest relevance to today's session)
  //   Tier 1 — programs with the highest user level (most advanced = richest settings)
  //   Tier 2 — primary program (first entry in userProgramLevels map)
  //   Tier 3 — everything else
  // This guarantees Push L18 is checked before Full Body L10 when settings are absent
  // on the Full Body document, and the highest-level program's protocols are inherited.
  const allProgramEntries = Array.from(userProgramLevels.entries())
    .sort(([idA, lvlA], [idB, lvlB]) => {
      const tierA = scheduledProgramIds?.includes(idA) ? 0
        : idA === primaryProgramId ? 2
        : 3;
      const tierB = scheduledProgramIds?.includes(idB) ? 0
        : idB === primaryProgramId ? 2
        : 3;
      if (tierA !== tierB) return tierA - tierB;
      // Within same tier: higher level first (Push L18 beats Full Body L10)
      return lvlB - lvlA;
    });

  // #6: protocol-scan logs gated behind GEN_VERBOSE — these fired per-doc (up to
  // ~14×/generation) and several build strings via .map().join(). Off by default.
  const genVerbose = isGenVerboseEnabled();
  if (genVerbose) {
    console.log(
      `[WorkoutTrio] Protocol scan order (${allProgramEntries.length} domains): ` +
      allProgramEntries.map(([id, lvl]) => {
        const firestoreId = slugToFirestoreId.get(id);
        const tag = scheduledProgramIds?.includes(id) ? '📅' : id === primaryProgramId ? '⭐' : '';
        return `${tag}${id}@L${lvl}${firestoreId && firestoreId !== id ? `(→${firestoreId})` : ''}`;
      }).join(' → '),
    );
  }

  // Deduplicate: avoid fetching the same Firestore document twice
  // (slug key and raw ID key can point to the same doc after slug→ID resolution).
  const lookedUpDocs = new Set<string>();
  // Track which program supplied goals and which supplied protocols (for the inheritance log).
  let goalsSource: string | undefined;
  let protocolSource: string | undefined;

  // Tabata union track (David 26.07): every scanned program's tabata setting,
  // collected in priority order; resolveTabataFinisher picks the highest-priority
  // enabler AFTER the loop. `sawTabataCandidate` lets the loop stop once the main
  // protocol + goals are locked AND a tabata enabler has been seen (else it keeps
  // scanning to find one — tabata is cross-program, not winner-takes-all).
  const tabataCandidates: TabataCandidate[] = [];
  let sawTabataCandidate = false;

  for (const [domainKey, domainLevel] of allProgramEntries) {
    // Main protocol + goals locked AND a tabata enabler seen → nothing left.
    if (goalExerciseIds && adminPreferredProtocols && sawTabataCandidate) break;

    // Resolve the domain slug to the actual Firestore program document ID.
    const firestoreProgId = slugToFirestoreId.get(domainKey) ?? domainKey;
    const docKey = `${firestoreProgId}_level_${domainLevel}`;

    if (lookedUpDocs.has(docKey)) continue;
    lookedUpDocs.add(docKey);

    try {
      // ── Document ID transparency ─────────────────────────────────────────
      // Log exactly what we're fetching so a mismatch between slug resolution
      // and the Admin Panel save path is immediately visible.
      if (genVerbose) {
        console.log(
          `[WorkoutTrio] 🔍 Fetching: collection=programLevelSettings` +
          ` docId="${firestoreProgId}_level_${domainLevel}"` +
          ` (domain slug="${domainKey}" → resolved firestoreId="${firestoreProgId}")`,
        );
      }

      const levelSettings = await getProgramLevelSetting(firestoreProgId, domainLevel);
      const hasProtocols = !!(levelSettings?.preferredProtocols?.length);
      const hasGoals    = !!(levelSettings?.targetGoals?.length);

      if (!levelSettings) {
        if (genVerbose) console.log(`[WorkoutTrio] ❌ ${docKey} → no document in programLevelSettings`);
        continue;
      }

      // ── Schema support warning ───────────────────────────────────────────
      // The document exists but has no protocol data — either it was saved
      // before the Admin Panel added protocol support, or the checkboxes were
      // never saved.  Check the RAW log above for the actual field names.
      if (!hasProtocols && genVerbose) {
        console.warn(
          `[WorkoutTrio] ⚠️  Document "${docKey}" found but 'preferredProtocols' field is ` +
          `missing or empty. Please open the Admin Panel → Programs → ${domainKey} → ` +
          `Level ${domainLevel} and click Save to write the protocol settings.`,
        );
      }

      if (genVerbose) {
        console.log(
          `[WorkoutTrio] ✅ ${docKey} found — ` +
          `protocols=[${(levelSettings.preferredProtocols ?? []).join(', ')}], ` +
          `probability=${levelSettings.protocolProbability ?? 'unset'}, ` +
          `goals=${levelSettings.targetGoals?.length ?? 0}`,
        );
      }

      // ── Tabata union track: collect this program's setting (priority order) ──
      tabataCandidates.push({
        source: `${domainKey}@L${domainLevel}`,
        preferredProtocols: levelSettings.preferredProtocols,
        tabataProbability: levelSettings.tabataProbability, // DEDICATED field, not the main protocolProbability
      });
      if ((levelSettings.preferredProtocols ?? []).includes('tabata')) sawTabataCandidate = true;

      // ── Goals: take from the first (highest-priority) program that has them ──
      if (!goalExerciseIds && hasGoals) {
        goalExerciseIds = new Set(levelSettings.targetGoals!.map(g => g.exerciseId));
        goalTargets = new Map(
          levelSettings.targetGoals!.map(g => [g.exerciseId, { targetValue: g.targetValue, unit: g.unit }]),
        );
        goalsSource = `${domainKey}@L${domainLevel}`;
      }

      // ── Main protocol: first (highest-priority) program with a NON-tabata
      // protocol. Tabata is stripped here — it rides the separate union track
      // above, so a higher-priority antagonist_pair/superset winner no longer
      // shadows a tabata enabler on a lower-priority program. (A tabata-ONLY
      // program contributes no main protocol → the loop continues to the next.)
      const nonTabataProtocols = (levelSettings.preferredProtocols ?? []).filter((p) => p !== 'tabata');
      if (!adminPreferredProtocols && nonTabataProtocols.length > 0) {
        adminPreferredProtocols = nonTabataProtocols;
        const hasAntagonistPair = nonTabataProtocols.includes('antagonist_pair');
        adminProtocolProbability = hasAntagonistPair ? 1.0 : (levelSettings.protocolProbability ?? 1.0);
        protocolSource = `${domainKey}@L${domainLevel}`;

        if (genVerbose) {
          const inheritMsg = (domainKey !== primaryProgramId && primaryProgramId)
            ? ` (primary "${primaryProgramId}" had no protocol settings — inheriting from "${domainKey}" L${domainLevel})`
            : '';
          console.log(
            `[WorkoutTrio] ✅ Protocols resolved from "${firestoreProgId}" L${domainLevel}:` +
            ` [${adminPreferredProtocols!.join(', ')}] probability=${adminProtocolProbability}` +
            `${hasAntagonistPair ? ' (antagonist_pair → 100%)' : ''}${inheritMsg}`,
          );
        }
      } else if (!adminProtocolProbability && levelSettings.protocolProbability != null) {
        adminProtocolProbability = levelSettings.protocolProbability;
      }
    } catch (err) {
      console.warn(`[WorkoutTrio] Non-critical error fetching ${docKey}:`, err);
    }
  }

  // Tabata finisher — the highest-priority enrolled program that enables it,
  // independent of the main-protocol winner (union track).
  const tabataFinisher = resolveTabataFinisher(tabataCandidates);

  // Summary log — always visible, makes the inheritance chain explicit.
  console.log(
    `[WorkoutTrio] Settings resolved → ` +
    `protocols: ${adminPreferredProtocols ? `[${adminPreferredProtocols.join(', ')}] from ${protocolSource}` : '⚠️  none (straight sets — check Firestore doc)'} | ` +
    `goals: ${goalExerciseIds ? `${goalExerciseIds.size} exercises from ${goalsSource}` : 'none'} | ` +
    `tabata: ${tabataFinisher ? `p=${tabataFinisher.probability} from ${tabataFinisher.source}` : 'off'}`,
  );
  genPerfMark('#6 protocol/goal reads (sequential getProgramLevelSetting loop)');

  // Progression tracking: use primary program
  if (primaryProgramId) {
    const track = userProfile.progression?.tracks?.[primaryProgramId];
    if (track) {
      levelProgressPercent = track.percent ?? 0;
      workoutsCompletedInLevel = track.totalWorkoutsCompleted ?? 0;
    }
  }

  // ── 5a-bis. Per-exercise history map (for the David Staircase floor) ─
  // Fetched ONCE for the post-filter exercise pool so that `assignVolume`
  // can clamp `reps` upward to whatever the user actually performed last
  // session — preventing regressions when the user is mid-level (e.g.
  // 50%+ progress with a strong prior session). Empty map when offline.
  let exerciseHistoryMap: Record<string, number[]> = {};
  try {
    const userIdForHistory = effectiveProfile.id;
    if (userIdForHistory) {
      const historyIds = filterResult.exercises
        .filter(se => se.method != null)
        .map(se => se.exercise.id);
      exerciseHistoryMap = await getHistoryMapForExercises(userIdForHistory, historyIds);
      console.log(
        `[WorkoutTrio] Exercise history loaded: ${Object.keys(exerciseHistoryMap).length}/${historyIds.length} exercises ` +
        `have prior session data (David Staircase floor active).`,
      );
    }
  } catch (e) {
    console.warn('[WorkoutTrio] Exercise history fetch failed (non-critical):', e);
  }
  genPerfMark('#7 exercise-history (fan-out getDoc)');

  // ── 5b. Base generator context (Sprint 3 integrity preserved) ────────
  const baseGeneratorContext: WorkoutGenerationContext = {
    availableTime,
    userLevel: baseUserLevel,
    relaxedConstraints: exercisePoolRelaxedConstraints,
    earlyPipelineNotes: exercisePoolDiagnostics,
    daysInactive,
    intentMode,
    persona,
    location,
    injuryCount: injuries.length,
    injuryShield: injuries,
    isManualOverride: !!isManualOverride,
    mainGoal: effectiveProfile.core?.mainGoal,
    energyLevel: 'medium',
    difficulty: requestedDifficulty,
    userWeight: effectiveProfile.core?.weight ?? 70,
    isFirstSessionInProgram,
    remainingWeeklyBudget,
    weeklyBudgetUsagePercent,
    isRecoveryDay: effectiveIsRecovery,
    detrainingLock,
    volumeReductionOverride,
    periodizationWeek: sessionPolicy.periodizationWeek,
    // Scale admin protocol probability by the policy multiplier (Peak ×1.5, Deload ×0).
    protocolProbability: (() => {
      const baseProb = adminProtocolProbability ?? protocolProbability ?? 0;
      const scaled = Math.min(1.0, baseProb * sessionPolicy.protocolMultiplier);
      if (sessionPolicy.protocolMultiplier === 0) {
        console.log(
          `[WorkoutTrio] ⛔ PROTOCOLS KILLED by periodization: ` +
          `baseProb=${baseProb} × multiplier=0 = 0 ` +
          `(reason: ${(sessionPolicy as any).reason ?? 'deload/rebuild'}, week=${sessionPolicy.periodizationWeek})`,
        );
      } else if (sessionPolicy.protocolMultiplier !== 1.0) {
        console.log(
          `[Periodization] Protocol probability: ${baseProb} × ${sessionPolicy.protocolMultiplier} = ${scaled.toFixed(2)}`,
        );
      } else {
        console.log(
          `[WorkoutTrio] Protocol probability passed to generator: ${scaled.toFixed(2)} ` +
          `(base=${baseProb}, multiplier=${sessionPolicy.protocolMultiplier}, week=${sessionPolicy.periodizationWeek})`,
        );
      }
      return scaled;
    })(),
    // Tabata finisher probability — SEPARATE union track, same periodization
    // scaling (Deload mult 0 kills the finisher too).
    tabataProbability: (() => {
      const base = tabataFinisher?.probability ?? 0;
      const scaled = scaleByPeriodization(base, sessionPolicy.protocolMultiplier);
      if (base > 0) {
        console.log(
          `[WorkoutTrio] Tabata finisher probability: ${base} × ${sessionPolicy.protocolMultiplier} = ` +
          `${scaled.toFixed(2)} (from ${tabataFinisher!.source})`,
        );
      }
      return scaled;
    })(),
    // Tabata is stripped here — it never competes in the main lottery (it rides
    // context.tabataProbability + the generator's separate roll).
    preferredProtocols: ((adminPreferredProtocols ?? preferredProtocols) as string[] | undefined)
      ?.filter((p) => p !== 'tabata') as any,
    // Dedicated tabata conditioning pool — ALL hiit_friendly exercises (incl.
    // program-less gems that never enter the scored strength pool). Filtered
    // from the already-loaded allExercises, so no extra Firestore read.
    tabataPool: allExercises.filter((ex) => ex.tags?.includes('hiit_friendly')),
    // Form C's follow-along ladder ("טבטה"/"טבטה +"/"טבטה מאתגר"/"טבטה מאתגר +")
    // is exerciseRole:'reinforcement', NOT hiit_friendly-tagged — a separate
    // pool from tabataPool above (docs/workout-engine/09-CORE-TABATA.md §1.6:
    // these 4 items were previously unreachable by any selection path because
    // nothing read this role at all).
    reinforcementPool: allExercises.filter((ex) => ex.exerciseRole === 'reinforcement'),
    // Apply straight-arm cap on Deload weeks for tendon protection.
    straightArmRatio: (() => {
      if (sessionPolicy.straightArmCap == null) return straightArmRatio;
      const baseSAR = straightArmRatio ?? 0.4;
      const capped = Math.min(baseSAR, sessionPolicy.straightArmCap);
      if (capped !== baseSAR) {
        console.log(
          `[Periodization] Straight-arm ratio capped: ${baseSAR} → ${capped} (Deload tendon protection)`,
        );
      }
      return capped;
    })(),
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
    requiredDomains: requiredDomainsOverride ?? (resolvedChildDomains.length > 0 ? resolvedChildDomains : undefined),
    strictDomains,
    // Use the contextually filtered pool (post-applyParkGating / equipment gating)
    // rather than the raw allExercises dump.  Every rescue pass (DavidRule,
    // HorizontalGuarantee, FullBodyGuarantee, domain-quota rescue) reads from
    // this pool — handing it the raw list was the zombie-exercise loophole.
    //
    // Belt-and-suspenders: explicitly exclude any ScoredExercise whose resolved
    // method is null.  After the strict-park ContextualEngine enforcement this
    // should never happen, but this guard future-proofs against regressions where
    // a null-method exercise somehow survives the filter step and would otherwise
    // be resurrected by findLevelAppropriateSubstitute via executionMethods[0].
    globalExercisePool: filterResult.exercises
      .filter(se => se.method != null)
      .map(se => se.exercise),
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
    gender: (userProfile.core?.gender as 'male' | 'female') ?? undefined,
    activeProgramId,
    availableEquipment,
    exerciseHistoryMap,
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
    activeProgramId: activeChildProgramId,
    programLevel: childTrackLevel,
    ancestorProgramIds,
    userAge,
    userLevel: baseUserLevel,
    isAbroad,
    recentBundleIds,
    previewNow,
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
    aiCue: undefined,
    // Expose so generateHomeWorkoutTrio can read them without crossing function scopes.
    adminPreferredProtocols,
    isSingleDomain: baseDomainCount === 1,
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
    sessionPolicy,
    needsAssessmentDomains,
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
// ESSENTIAL_GEAR_IDS, isGearFree, etc. → trio-modifiers.service.ts
// collectMethodGear → shared/constants/domain-mapping.constants.ts

// NOTE: This trailing comment block replaces ~520 lines of moved code.

