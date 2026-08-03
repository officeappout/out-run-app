/**
 * Home Workout Types
 *
 * Public interfaces for the Home Workout orchestrator's input/output
 * contract. Consumed by UI components (StatsOverview, AdjustWorkoutModal)
 * and re-exported through the workout-engine barrel.
 */

import type { ExecutionLocation, InjuryShieldArea } from '@/features/content/exercises/core/exercise.types';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import type { LifestylePersona, IntentMode } from '../logic/ContextualEngine';
import type { GeneratedWorkout, DifficultyLevel } from '../logic/WorkoutGenerator';
import type { ShadowMatrix } from './shadow-level.utils';
import type { TimeOfDay } from './workout-metadata.service';

// ============================================================================
// OPTIONS (input)
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

  /** Current execution location (default: 'park' — has mapped videos) */
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

  // === Training OS Context ===
  /** Remaining weekly set budget (from WeeklyVolumeStore) */
  remainingWeeklyBudget?: number;
  /** Weekly budget usage percentage (0-100) */
  weeklyBudgetUsagePercent?: number;
  /** Number of intense sessions completed this week */
  weeklyIntenseCount?: number;
  /** Whether this session is explicitly flagged as recovery */
  isRecoveryDay?: boolean;
  /** maxIntenseWorkoutsPerWeek -- override. If omitted, resolved via Lead Program logic. */
  maxIntenseWorkoutsPerWeek?: number;
  /** protocolProbability from ProgramLevelSettings (program-specific) */
  protocolProbability?: number;
  /** preferredProtocols from ProgramLevelSettings (program-specific) */
  preferredProtocols?: ('emom' | 'pyramid' | 'antagonist_pair' | 'superset' | 'tabata')[];
  /** straightArmRatio from ProgramLevelSettings (SA/BA tendonitis guard) */
  straightArmRatio?: number;
  /** Straight-arm sets completed this week (from WeeklyVolumeStore) */
  weeklySASets?: number;
  /** levelDefaultRestSeconds from ProgramLevelSettings */
  levelDefaultRestSeconds?: number;
  /** restMultiplier from ProgramLevelSettings */
  restMultiplier?: number;

  // === UTS Phase 1 -- Schedule-Aware Generation ===
  /**
   * ISO date ('YYYY-MM-DD') for which this workout is being generated.
   * Used for logging/caching; does not change exercise selection logic.
   */
  selectedDate?: string;
  /**
   * Firestore program document IDs pre-resolved from UserSchedule.
   * When provided, these override userProfile.progression.activePrograms
   * so the engine generates a workout focused on the scheduled programs.
   * Downstream level/rule lookups all operate on these IDs.
   */
  scheduledProgramIds?: string[];
  /**
   * When true, the engine is generating an Active Recovery session
   * for a scheduled rest day. This:
   *   - Sets difficulty to 1 (recovery bolt)
   *   - Sets isRecoveryDay to true
   *   - WorkoutGenerator targets exerciseRole:'cooldown' exercises
   *   - These feed the Maintenance/Flexibility (purple) ring
   *   - Session is excluded from the weekly volume budget
   */
  isScheduledRestDay?: boolean;

  // === Phase 4: Deficit Redistribution ===
  /** Per-domain completed sets this week (from useWeeklyVolumeStore). */
  domainSetsCompletedThisWeek?: Record<string, number>;
  /** Number of scheduled training days remaining in the current week (including today). */
  remainingScheduleDays?: number;
  /** Exercise IDs from last 2 sessions (for Variety Guard anti-boredom). */
  recentExerciseIds?: string[];

  /**
   * Restrict generated exercises to these movement domains.
   * e.g. ['push', 'pull'] for upper-body focus, ['core'] for core day.
   * When undefined, the engine selects domains automatically from the
   * scheduled programs. Set by UserWorkoutAdjuster via muscle-chip selection.
   */
  requiredDomains?: string[];

  /**
   * When true, generated exercises are restricted strictly to `requiredDomains`.
   * Disables VerticalFoundation, HorizontalGuarantee, and the domain-overflow
   * fill path so only explicitly requested domains appear.
   * Has no effect when `requiredDomains` is undefined.
   */
  strictDomains?: boolean;

  // === Simulator / QA ===
  /**
   * When set, bypasses the "Ultimate Park Force" override and uses this
   * location for the entire pipeline.  Only used by the Master Simulator
   * and internal tests — production callers should never set this.
   */
  testLocation?: ExecutionLocation;

  /**
   * Equipment IDs from the selected park's gymEquipment inventory.
   * Merged into availableEquipment so methods tagged with specific
   * Firestore equipment IDs (e.g. dip station brand IDs) pass gating.
   */
  parkEquipmentIds?: string[];

  /**
   * When set by the Custom Builder, only the workout for this difficulty level
   * is generated, skipping the other two slots in the Trio loop to save
   * device processing overhead.  generateHomeWorkout returns this option directly.
   */
  targetDifficulty?: DifficultyLevel;

  /**
   * When true, the request originates from the Custom Builder panel (explicit
   * manual user selection — e.g. picking Planche or Front Lever from the pill UI).
   *
   * Bypasses the weekly deficit-redistribution clamping in SplitDecisionService
   * and the domain-level deficit adjustment in _buildSharedPipeline so the
   * generated session always receives a viable set budget regardless of how
   * many sets have already been completed this week.
   *
   * Without this flag, a fully-exhausted weekly budget (Remaining Sets: 0)
   * collapses dailySetBudget to the min-2 floor, which reduces domain quotas
   * to 0 and causes "DOMAIN QUOTA FAILED" for all selected skills.
   */
  isManualOverride?: boolean;

  /**
   * When `true`, only the middle Balanced option (Difficulty 2) is generated.
   * Difficulty-1 (Active Recovery) and Difficulty-3 (Intense) slots are skipped
   * entirely, cutting Firestore reads and generation latency by ~66%.
   *
   * Use when the result feeds directly into a preview drawer where the D1/D3
   * alternatives are never surfaced to the user (e.g. schedule-card tap flow).
   */
  generateSingleOption?: boolean;

  /**
   * When `true`, suppresses the 21-day-gap periodization Cycle Restart write
   * (`users/{id}.progression.activePrograms` startDate reset) that
   * `generateHomeWorkoutTrio` would otherwise persist as a side effect.
   *
   * Set by READ-ONLY callers that generate a recommendation for preview/planning
   * without committing the user to it — e.g. the hybrid "full workout in the park"
   * card, which reuses the home recommendation but must never mutate the user's
   * program cycle from a preview. Default (false / undefined) preserves the
   * existing write behaviour byte-for-byte for all current callers.
   */
  skipCycleRestart?: boolean;
}

// ============================================================================
// RESULT (output)
// ============================================================================

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
// WORKOUT TRIO (Sprint 4)
// ============================================================================

/** Dynamic label (fetched from Firestore, with Hebrew fallbacks) */
export type WorkoutOptionLabel = string;

/** Admin-configurable labels for the 3 workout options (Firestore: app_config/workout_trio) */
export interface TrioLabelsConfig {
  trainingLabels: { option1Label: string; option2Label: string; option3Label: string };
  restDayLabels:  { option1Label: string; option2Label: string; option3Label: string };
}

/** A single workout option inside the trio */
export interface WorkoutTrioOption {
  label: WorkoutOptionLabel;
  result: HomeWorkoutResult;
}

/** The full trio returned by generateHomeWorkoutTrio */
export interface HomeWorkoutTrioResult {
  options: [WorkoutTrioOption, WorkoutTrioOption, WorkoutTrioOption];
  isRestDay: boolean;
  /**
   * BUG 1 safety-net (absent=absent ⑨): true when all 3 options were short-circuited
   * to the same explicit "needs assessment" placeholder because none of the domains
   * relevant to the request have ever been assessed. Mirrors `isRestDay`'s pattern —
   * a typed flag the UI can check, not a thrown error. See `workout.needsAssessment`
   * / `workout.assessmentDomains` on each option's result for routing detail.
   */
  needsAssessment?: boolean;
  labelsSource: 'firestore' | 'fallback';
  meta: {
    daysInactive: number;
    persona: LifestylePersona | null;
    location: ExecutionLocation;
    timeOfDay: TimeOfDay;
    injuryAreas: InjuryShieldArea[];
    exercisesConsidered: number;
    exercisesExcluded: number;
    /** Active week in the 5-week periodization cycle (1=Build, 4=Peak, 5=Deload). */
    periodizationWeek?: number;
    /** UI message explaining the active session mode (Peak / Deload / Reactivation / Rebuild). */
    coachCue?: string;
    /** Trio carousel default focus: 0 = Easy, 1 = Normal, 2 = Intense. */
    defaultFocusIndex?: 0 | 1 | 2;
  };
}
