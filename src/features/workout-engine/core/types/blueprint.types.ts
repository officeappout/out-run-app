/**
 * Workout Blueprint Types
 * 
 * Based on WORKOUT_ENGINE_SPECS.md Section 3.2: Blueprint & Slot System
 * 
 * Workouts are not lists of exercises. They are lists of Slots.
 * - Slot 1 (Golden Slot): Skill/Power. Never superset. Fresh CNS.
 * - Slot 2 (Compounds): Supports AntagonistPairs (e.g., Push + Pull).
 * - Slot 3 (Accessory): High volume, shorter rest.
 */

import { MovementPattern } from './tracking-matrix.types';

// ============================================================================
// SLOT TYPES
// ============================================================================

/**
 * Slot categories based on training logic
 */
export type SlotType = 
  | 'golden'     // Slot 1: Skills/Power - Fresh CNS, never superset
  | 'compound'   // Slot 2: Main movements - Supports antagonist pairs
  | 'accessory'  // Slot 3: Isolation/Volume - Shorter rest
  | 'warmup'     // Pre-workout warmup
  | 'cooldown';  // Post-workout cooldown/stretch

/**
 * Set execution type
 */
export type SetType = 
  | 'straight'           // Standard sets with rest
  | 'antagonist_pair'    // Push + Pull superset
  | 'superset'           // Two exercises back-to-back
  | 'dropset'            // Decreasing weight/difficulty
  | 'rest_pause'         // Brief rest mid-set
  | 'amrap';             // As many reps as possible

/**
 * Rep range for Double Progression
 */
export interface RepRange {
  min: number;
  max: number;
}

/**
 * A single slot in a workout blueprint
 * This is a placeholder for what exercise to fill
 */
export interface BlueprintSlot {
  /** Unique slot identifier */
  id: string;
  
  /** Slot type (golden, compound, accessory, etc.) */
  type: SlotType;
  
  /** Required movement pattern for this slot */
  movementPattern: MovementPattern;
  
  /** Optional: Specific exercise ID (if locked) */
  lockedExerciseId?: string;
  
  /** Number of sets */
  sets: number;
  
  /** Target rep range (for Double Progression) */
  repRange: RepRange;
  
  /** Set execution type */
  setType: SetType;
  
  /** Paired slot ID (for supersets/antagonist pairs) */
  pairedSlotId?: string;
  
  /** Minimum sweat level (1-3) for this slot */
  minSweatLevel?: number;
  
  /** Maximum sweat level (1-3) for this slot */
  maxSweatLevel?: number;
  
  /** Equipment tags that should match */
  preferredEquipment?: string[];
  
  /** Priority order within slot type (lower = earlier) */
  priority: number;
  
  /** Whether this slot can be skipped in short workouts */
  isOptional: boolean;
  
  /** Slot belongs to Part A (Office) or Part B (Home) */
  fragmentPart?: 'A' | 'B';
}

// ============================================================================
// BLUEPRINT TYPES
// ============================================================================

/**
 * Session focus type
 */
export type SessionFocus = 
  | 'full_body'
  | 'upper_push'
  | 'upper_pull'
  | 'lower_body'
  | 'skills'
  | 'core'
  | 'recovery'
  | 'mixed';

/**
 * Intensity profile (Rule #5, #14, #18)
 */
export type IntensityProfile = 'light' | 'medium' | 'hard';

/**
 * A complete workout blueprint
 * This is the "template" that gets filled with actual exercises
 */
export interface WorkoutBlueprint {
  /** Unique blueprint identifier */
  id: string;
  
  /** Display name */
  name: string;
  
  /** Session focus */
  focus: SessionFocus;
  
  /** Intensity profile */
  intensity: IntensityProfile;
  
  /** Ordered list of slots */
  slots: BlueprintSlot[];
  
  /** Minimum duration in minutes */
  minDuration: number;
  
  /** Target duration in minutes */
  targetDuration: number;
  
  /** Maximum duration in minutes */
  maxDuration: number;
  
  /** Whether this blueprint supports fragmentation */
  canFragment: boolean;
  
  /** Blueprint version (for migrations) */
  version: number;
}

// ============================================================================
// FILLED SLOT (Exercise Instance)
// ============================================================================

/**
 * An exercise instance assigned to a slot
 */
export interface ExerciseInstance {
  /** Reference to the exercise in the database */
  exerciseId: string;
  
  /** Display name (localized) */
  displayName: string;
  
  /** Execution method selected for this context */
  executionMethodId?: string;
  
  /** Video URL for the selected method */
  videoUrl?: string;
  
  /** Image URL for preview */
  imageUrl?: string;
  
  /** Target sets */
  sets: number;
  
  /** Target reps (or seconds for time-based) */
  reps: number;
  
  /** Duration in seconds (for time-based exercises) */
  durationSeconds?: number;
  
  /** Rest time after this exercise (in seconds) */
  restSeconds: number;
  
  /** Set type being used */
  setType: SetType;
  
  /** If true, this exercise was swapped in by the user */
  wasSwapped: boolean;
  
  /** Reason for swap (for persistence logic) */
  swapReason?: 'equipment' | 'too_hard' | 'injury' | 'preference';
  
  /** User's selected level adjustment (-2 to +2) */
  levelAdjustment?: number;
  
  /** Execution cues (coaching points) */
  cues?: string[];
  
  /** Highlights (key points) */
  highlights?: string[];
}

/**
 * A filled slot with actual exercise
 */
export interface FilledSlot extends BlueprintSlot {
  /** The assigned exercise */
  exercise: ExerciseInstance;
  
  /** Calculated rest time (based on slot type and exercise) */
  calculatedRestSeconds: number;
  
  /** Paired exercise (for supersets) */
  pairedExercise?: ExerciseInstance;
}

// ============================================================================
// WORKOUT SESSION (Generated Output)
// ============================================================================

/**
 * Fragment part of a split workout
 */
export interface WorkoutFragment {
  /** Part identifier */
  part: 'A' | 'B';
  
  /** Part name (e.g., "Office Session", "Home Session") */
  name: string;
  
  /** Slots in this fragment */
  slots: FilledSlot[];
  
  /** Estimated duration in minutes */
  estimatedDuration: number;
  
  /** Whether this part is completed */
  isCompleted: boolean;
}

/**
 * A complete generated workout session
 */
export interface GeneratedSession {
  /** Unique session identifier */
  id: string;
  
  /** Reference to the blueprint used */
  blueprintId: string;
  
  /** Session name */
  name: string;
  
  /** Generated timestamp */
  generatedAt: Date;
  
  /** Is this a fragmented workout? */
  isFragmented: boolean;
  
  /** Fragments (if fragmented), otherwise empty */
  fragments: WorkoutFragment[];
  
  /** Full list of slots (if not fragmented) */
  slots: FilledSlot[];
  
  /** Total estimated duration */
  totalDuration: number;
  
  /** Intensity level */
  intensity: IntensityProfile;
  
  /** Focus */
  focus: SessionFocus;
  
  /** User level at generation time (for reference) */
  userLevelSnapshot: number;
  
  /** Context that was used to generate */
  generationContext: GenerationContext;
}

/**
 * Context passed to the workout generator
 */
export interface GenerationContext {
  /** Available time in minutes */
  timeAvailable: number;
  
  /** Current location */
  location: 'home' | 'park' | 'gym' | 'office' | 'street';
  
  /** Available equipment IDs */
  availableEquipment: string[];
  
  /** Is this a recovery day? */
  isRecoveryDay: boolean;
  
  /** Days since last workout (for reactivation logic) */
  daysSinceLastWorkout: number;
  
  /** Current week in periodization (1-5, 5 = deload) */
  periodizationWeek: number;
  
  /** User's energy level (1-5, self-reported) */
  energyLevel?: number;
  
  /** Injured body parts (to avoid) */
  injuredAreas?: string[];
  
  /** Preferred workout duration (if user has preference) */
  preferredDuration?: number;
}

// ============================================================================
// PRESET BLUEPRINTS
// ============================================================================

/**
 * Standard Full Body Blueprint (Rule #11)
 * Warmup -> Push Compound -> Pull Compound -> Legs -> Core
 */
export const FULL_BODY_BLUEPRINT: WorkoutBlueprint = {
  id: 'full_body_standard',
  name: 'Full Body',
  focus: 'full_body',
  intensity: 'medium',
  minDuration: 30,
  targetDuration: 45,
  maxDuration: 60,
  canFragment: true,
  version: 1,
  slots: [
    {
      id: 'warmup',
      type: 'warmup',
      movementPattern: 'mobility_upper',
      sets: 1,
      repRange: { min: 1, max: 1 },
      setType: 'straight',
      priority: 0,
      isOptional: false,
      fragmentPart: 'A',
    },
    {
      id: 'push_compound',
      type: 'compound',
      movementPattern: 'horizontal_push',
      sets: 3,
      repRange: { min: 6, max: 12 },
      setType: 'straight',
      priority: 1,
      isOptional: false,
      fragmentPart: 'B',
    },
    {
      id: 'pull_compound',
      type: 'compound',
      movementPattern: 'vertical_pull',
      sets: 3,
      repRange: { min: 6, max: 12 },
      setType: 'straight',
      priority: 2,
      isOptional: false,
      fragmentPart: 'B',
    },
    {
      id: 'legs',
      type: 'compound',
      movementPattern: 'squat',
      sets: 3,
      repRange: { min: 8, max: 15 },
      setType: 'straight',
      priority: 3,
      isOptional: false,
      fragmentPart: 'B',
    },
    {
      id: 'core',
      type: 'accessory',
      movementPattern: 'core_anti_extension',
      sets: 3,
      repRange: { min: 30, max: 60 },
      setType: 'straight',
      priority: 4,
      isOptional: true,
      fragmentPart: 'A',
    },
  ],
};

/**
 * Calisthenics Upper Body Blueprint (Rule #16)
 * Slot 1: Skills (Fresh CNS) -> Slot 2: Antagonist Pairs -> Slot 3: Accessory
 */
export const CALISTHENICS_UPPER_BLUEPRINT: WorkoutBlueprint = {
  id: 'calisthenics_upper',
  name: 'Calisthenics Upper',
  focus: 'skills',
  intensity: 'hard',
  minDuration: 40,
  targetDuration: 60,
  maxDuration: 75,
  canFragment: true,
  version: 1,
  slots: [
    {
      id: 'warmup',
      type: 'warmup',
      movementPattern: 'mobility_upper',
      sets: 1,
      repRange: { min: 1, max: 1 },
      setType: 'straight',
      priority: 0,
      isOptional: false,
    },
    {
      id: 'skill_golden',
      type: 'golden',
      movementPattern: 'handstand_balance',
      sets: 5,
      repRange: { min: 10, max: 30 }, // Seconds for static holds
      setType: 'straight',
      priority: 1,
      isOptional: false,
      fragmentPart: 'A', // Skills can be done anywhere
    },
    {
      id: 'push_compound',
      type: 'compound',
      movementPattern: 'horizontal_push',
      sets: 4,
      repRange: { min: 5, max: 10 },
      setType: 'antagonist_pair',
      pairedSlotId: 'pull_compound',
      priority: 2,
      isOptional: false,
      fragmentPart: 'B',
    },
    {
      id: 'pull_compound',
      type: 'compound',
      movementPattern: 'vertical_pull',
      sets: 4,
      repRange: { min: 5, max: 10 },
      setType: 'antagonist_pair',
      pairedSlotId: 'push_compound',
      priority: 2,
      isOptional: false,
      fragmentPart: 'B',
    },
    {
      id: 'accessory_grip',
      type: 'accessory',
      movementPattern: 'vertical_pull',
      sets: 3,
      repRange: { min: 20, max: 40 },
      setType: 'straight',
      priority: 3,
      isOptional: true,
      fragmentPart: 'A',
    },
    {
      id: 'accessory_core',
      type: 'accessory',
      movementPattern: 'core_anti_extension',
      sets: 3,
      repRange: { min: 30, max: 60 },
      setType: 'straight',
      priority: 4,
      isOptional: true,
      fragmentPart: 'A',
    },
  ],
};

/**
 * Recovery/Maintenance Blueprint (Rule #2)
 */
export const RECOVERY_BLUEPRINT: WorkoutBlueprint = {
  id: 'recovery_maintenance',
  name: 'Recovery',
  focus: 'recovery',
  intensity: 'light',
  minDuration: 15,
  targetDuration: 20,
  maxDuration: 30,
  canFragment: false,
  version: 1,
  slots: [
    {
      id: 'mobility_flow',
      type: 'warmup',
      movementPattern: 'mobility_upper',
      sets: 1,
      repRange: { min: 1, max: 1 },
      setType: 'straight',
      priority: 0,
      isOptional: false,
      maxSweatLevel: 1,
    },
    {
      id: 'core_light',
      type: 'accessory',
      movementPattern: 'core_anti_extension',
      sets: 2,
      repRange: { min: 20, max: 30 },
      setType: 'straight',
      priority: 1,
      isOptional: false,
      maxSweatLevel: 1,
    },
    {
      id: 'flexibility_flow',
      type: 'cooldown',
      movementPattern: 'mobility_lower',
      sets: 1,
      repRange: { min: 1, max: 1 },
      setType: 'straight',
      priority: 2,
      isOptional: false,
      maxSweatLevel: 1,
    },
  ],
};

/**
 * Get blueprint by focus type
 */
export function getBlueprintByFocus(focus: SessionFocus): WorkoutBlueprint {
  switch (focus) {
    case 'full_body':
      return FULL_BODY_BLUEPRINT;
    case 'skills':
    case 'upper_push':
    case 'upper_pull':
      return CALISTHENICS_UPPER_BLUEPRINT;
    case 'recovery':
      return RECOVERY_BLUEPRINT;
    default:
      return FULL_BODY_BLUEPRINT;
  }
}
