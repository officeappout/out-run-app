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
import type { PersonaId } from '@/types/persona.types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Supported lifestyle personas (up to 3 can be selected). Redefined
 * 01.09.2026 to reuse the canonical PersonaId directly — this used to be
 * an independent 10-value enum (school_student/home_worker/high_tech/
 * senior/athlete/reservist/active_soldier didn't even match the onboarding
 * UI's own spelling for the same concepts). home_worker/high_tech/athlete
 * dropped outright — confirmed zero real exercise content tagged with any
 * of them (live Firestore check, 373 exercises / 1302 execution_methods,
 * 01.09.2026). See docs/research/military-persona-unified-architecture.md.
 */
export type LifestylePersona = PersonaId;

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
 * Sentinel for `getUserLevelForExercise` (09.08.2026, "absent=absent" for partial
 * assessment): an unassessed domain must stay absent/no-content, not fall back to
 * baseUserLevel — but the interface's contract is a plain `number` consumed by numeric
 * comparisons in ContextualEngine.ts (tolerance filter, skill gate, scoring) and
 * compose-hybrid-session.service.ts's field-fallback band check. `-Infinity` (not
 * `undefined`/`NaN`) is deliberate: `undefined`/`NaN` comparisons are ALWAYS false in JS
 * (`NaN < x` and `NaN > x` are both false), which would silently ADMIT the exercise with
 * no level bound at all — the opposite of the intent. `-Infinity` fails every "is this
 * within range / above the gate" check correctly, so all 4 existing call sites exclude
 * the exercise WITHOUT needing their own explicit absent-check. This is IN ADDITION to
 * the existing full-block gate (hasAssessedStrengthDomain / needsAssessmentDomains) —
 * not a replacement: that blocks the WHOLE session when NO domain is assessed at all;
 * this handles ONE unassessed domain inside an otherwise-partially-assessed session.
 */
export const UNASSESSED_DOMAIN_LEVEL = -Infinity;

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
   *
   * May return `UNASSESSED_DOMAIN_LEVEL` (see below) for an exercise whose resolved
   * domain the user has NOT assessed — resolvers signal "absent" this way instead of
   * fabricating a number, so the existing numeric comparisons below (tolerance filter,
   * skill gate, scoring) correctly exclude it without needing their own absent-checks.
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

  /**
   * Active domain IDs for domain-aware level resolution.
   * When set, the engine resolves each exercise's level from the matching
   * targetPrograms entry for these domains (e.g., ['push','pull','legs','core']).
   * Without this, the engine falls back to targetPrograms[0] which can pick
   * the wrong level from a different program.
   */
  activeDomains?: string[];

  /**
   * Primary active program template ID (e.g. `planche`, `front_lever`,
   * `full_body`).  When provided, `resolveExerciseLevelForDomains` returns
   * the matching `targetPrograms` entry for this id unconditionally — so
   * multi-assigned exercises like פלאנץ׳ בטאק (tagged both
   * `{push, L5}` and `{planche, L7}`) resolve to the skill-level entry
   * instead of being hijacked by the foundational baseline simply because
   * it indexed first in `targetPrograms` or `activeDomains`.
   */
  activeProgramId?: string;
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
 * Per-filter exclusion counts produced by ContextualEngine.filterAndScore.
 * Tracks how many exercises each hard filter removed from the pool.
 */
export interface FilterStageCounts {
  pool_start: number;
  excluded_program_filter: number;
  excluded_level_tolerance: number;
  excluded_skill_gate: number;
  /** Exercises dropped because they belong exclusively to an inactive gated skill domain. */
  excluded_exclusive_skill_gate: number;
  /** Exercises dropped because their balanceScore exceeds the freestanding-handstand threshold
   *  and the user has no active handstand / hspu program in this session. */
  excluded_balance_gate: number;
  excluded_injury_shield: number;
  excluded_48h_muscle: number;
  excluded_field_mode: number;
  excluded_location: number;
  excluded_sweat: number;
  excluded_noise: number;
  after_hard_filters: number;
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

  /** Per-filter pool tracking for the Why Logger */
  filterCounts?: FilterStageCounts;
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
  service: { sweatLimit: 3, noiseLimit: 3, methodPriority: 1, bypassLimits: true },
};

/**
 * Lifestyle persona labels (Hebrew)
 */
export const LIFESTYLE_LABELS: Record<LifestylePersona, string> = {
  parent: 'הורה',
  student: 'סטודנט',
  pupil: 'תלמיד',
  office_worker: 'עובד משרד',
  military: 'צה"ל',
  vatikim: 'גיל הזהב',
  pro_athlete: 'ספורטאי קצה',
};
