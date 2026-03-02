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
  preferredProtocols?: ('emom' | 'pyramid' | 'antagonist_pair' | 'superset')[];
  /** straightArmRatio from ProgramLevelSettings (SA/BA tendonitis guard) */
  straightArmRatio?: number;
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
  labelsSource: 'firestore' | 'fallback';
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
