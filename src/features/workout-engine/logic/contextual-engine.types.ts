/**
 * Contextual Engine Types & Constants
 *
 * All type definitions, interfaces, and static configuration for the
 * ContextualEngine filtering and scoring system. Separated from the
 * engine class so consumers can import lightweight types without
 * pulling in the full engine implementation.
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs.
 */

import {
  Exercise,
  ExecutionLocation,
  ExecutionMethod,
  MechanicalType,
  InjuryShieldArea,
  MuscleGroup,
  NoiseLevel,
  SweatLevel,
} from '@/features/content/exercises/core/exercise.types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Supported lifestyle personas (up to 3 can be selected)
 */
export type LifestylePersona = 
  | 'parent'
  | 'student'
  | 'school_student'
  | 'office_worker'
  | 'home_worker'
  | 'senior'
  | 'athlete'
  | 'reservist'
  | 'active_soldier';

/**
 * Location constraint profiles
 * Maps locations to their environmental constraints
 */
export interface LocationConstraints {
  sweatLimit: NoiseLevel;
  noiseLimit: SweatLevel;
  methodPriority: 1 | 2 | 3;
  bypassLimits: boolean;
  requireFieldReady?: boolean;
}

/**
 * Intent override configuration
 */
export type IntentMode = 
  | 'normal'
  | 'blast'
  | 'on_the_way'
  | 'field';

/**
 * Program IDs for multi-level exercise mapping
 */
export type ProgramId = 
  | 'upper_body'
  | 'calisthenics'
  | 'lower_body'
  | 'handstand'
  | 'planche'
  | 'front_lever'
  | 'one_arm_pullup'
  | 'hspu';

/**
 * Full context for contextual filtering
 */
export interface ContextualFilterContext {
  /** User's location */
  location: ExecutionLocation;
  
  /** User's lifestyle personas (up to 3) */
  lifestyles: LifestylePersona[];
  
  /** User's injury areas to avoid */
  injuryShield: InjuryShieldArea[];
  
  /** Active intent override */
  intentMode: IntentMode;
  
  /** Available equipment (for park facility mapping) */
  availableEquipment: string[];
  
  /**
   * Per-exercise level callback (Shadow Tracking).
   * Maps each exercise's movementGroup/primaryMuscle to the user's
   * domain-specific level (e.g., upper_body=12, lower_body=5).
   * Replaces the old single `userLevel` field.
   */
  getUserLevelForExercise: (exercise: Exercise) => number;
  
  /** Maximum duration in minutes (for on_the_way mode) */
  maxDuration?: number;
  
  /** Selected program for level filtering (optional) */
  selectedProgram?: ProgramId;
  
  /** Level tolerance for filtering (default: 3) */
  levelTolerance?: number;

  /**
   * STRICT PROGRAM FILTER -- Active program IDs from Shadow Matrix.
   * When set and non-empty, ONLY exercises matching at least one of these
   * programs (via exerciseMatchesProgram) are included in the strength
   * portion.
   */
  activeProgramFilters?: string[];

  /**
   * 48-Hour Muscle Shield -- Muscle groups to exclude (trained in last session).
   * Exercises with primaryMuscle or secondaryMuscles in this set are hard-excluded.
   * Used for Habit Builder path (beginners 4-6 days/week).
   */
  excludedMuscleGroups?: MuscleGroup[];
}

/**
 * Exercise selection with scoring details
 */
export interface ScoredExercise {
  exercise: Exercise;
  method: ExecutionMethod;
  score: number;
  reasoning: string[];
  mechanicalType: MechanicalType;
  /** Level of this exercise in the selected program */
  programLevel?: number;
}

/**
 * Result of contextual filtering
 */
export interface ContextualFilterResult {
  /** Filtered and scored exercises */
  exercises: ScoredExercise[];
  
  /** Active filters applied */
  activeFilters: FilterDescription[];
  
  /** SA:BA balance stats */
  mechanicalBalance: MechanicalBalance;
  
  /** Exercises removed by filters */
  excludedCount: number;
  
  /** AI cue to show user (for on_the_way, etc.) */
  aiCue?: string;
  
  /** Adjusted rest time (for blast mode) */
  adjustedRestSeconds?: number;
}

/**
 * Filter description for UI display
 */
export interface FilterDescription {
  type: 'location' | 'lifestyle' | 'injury' | 'mechanical' | 'intent' | 'equipment';
  label: string;
  value: string;
}

/**
 * Mechanical balance stats
 */
export interface MechanicalBalance {
  straightArm: number;
  bentArm: number;
  hybrid: number;
  none: number;
  ratio: string;
  isBalanced: boolean;
  warning?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Location constraint configurations
 */
export const LOCATION_CONSTRAINTS: Record<ExecutionLocation, LocationConstraints> = {
  office: { sweatLimit: 1, noiseLimit: 1, methodPriority: 3, bypassLimits: false },
  airport: { sweatLimit: 1, noiseLimit: 1, methodPriority: 3, bypassLimits: false },
  school: { sweatLimit: 1, noiseLimit: 1, methodPriority: 3, bypassLimits: false },
  home: { sweatLimit: 2, noiseLimit: 2, methodPriority: 2, bypassLimits: false },
  gym: { sweatLimit: 3, noiseLimit: 3, methodPriority: 1, bypassLimits: false },
  street: { sweatLimit: 3, noiseLimit: 3, methodPriority: 1, bypassLimits: false },
  park: { sweatLimit: 3, noiseLimit: 3, methodPriority: 1, bypassLimits: true },
  library: { sweatLimit: 1, noiseLimit: 1, methodPriority: 3, bypassLimits: false },
};

/**
 * Lifestyle persona labels (Hebrew)
 */
export const LIFESTYLE_LABELS: Record<LifestylePersona, string> = {
  parent: 'הורה',
  student: 'סטודנט',
  school_student: 'תלמיד',
  office_worker: 'עובד משרד',
  home_worker: 'עובד מהבית',
  senior: 'גיל הזהב',
  athlete: 'ספורטאי',
  reservist: 'מילואימניק',
  active_soldier: 'חייל סדיר',
};
