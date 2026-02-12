/**
 * Exercise Management Types
 * Defines the structure for exercises in the 'exercises' collection
 */

import { LocalizedText, AppLanguage, getLocalizedText } from '../../shared/localized-text.types';

// Re-export shared types for backward compatibility
export type { LocalizedText, AppLanguage };
export { getLocalizedText };

// ============================================================================
// GENDERED TEXT TYPES
// ============================================================================

/**
 * Gender type for user profiles
 */
export type UserGender = 'male' | 'female';

/**
 * Text that can be gender-specific
 * Used for exercise cues, highlights, and notifications
 */
export interface GenderedText {
  male: string;
  female: string;
}

/**
 * Helper function to check if a value is a GenderedText object
 */
export function isGenderedText(value: unknown): value is GenderedText {
  return (
    typeof value === 'object' &&
    value !== null &&
    'male' in value &&
    'female' in value &&
    typeof (value as GenderedText).male === 'string' &&
    typeof (value as GenderedText).female === 'string'
  );
}

/**
 * Get the appropriate text based on user's gender
 * Supports both simple strings and GenderedText objects
 * 
 * @param text - Either a simple string or a GenderedText object
 * @param gender - User's gender (defaults to 'male' for neutral/unknown)
 * @returns The appropriate string for the user's gender
 */
export function getGenderedText(
  text: string | GenderedText | undefined | null,
  gender: UserGender = 'male'
): string {
  if (!text) return '';
  
  // Simple string - return as-is
  if (typeof text === 'string') return text;
  
  // GenderedText object - return appropriate version
  if (isGenderedText(text)) {
    return text[gender] || text.male || '';
  }
  
  return '';
}

/**
 * Convert a simple string to a GenderedText object (same text for both genders)
 */
export function toGenderedText(text: string): GenderedText {
  return { male: text, female: text };
}

/**
 * Normalize a value that could be string or GenderedText to a consistent format
 * Returns the text as-is if it's already in the desired format
 */
export function normalizeGenderedText(
  value: string | GenderedText | undefined | null
): GenderedText | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return { male: value, female: value };
  if (isGenderedText(value)) return value;
  return undefined;
}

// ============================================================================
// EXERCISE TYPES
// ============================================================================

export type ExerciseType = 'reps' | 'time' | 'rest';

export type LoggingMode = 'reps' | 'completion';

/**
 * Noise level scale for exercise classification
 * 1 = Silent (no noise, apartment-friendly)
 * 2 = Moderate (some noise, acceptable)
 * 3 = Loud (jumping, requires space)
 */
export type NoiseLevel = 1 | 2 | 3;

/**
 * Sweat/Intensity level scale
 * 1 = Low/No Sweat (light exercises)
 * 2 = Medium (moderate effort)
 * 3 = High/Intense (cardio-heavy, HIIT)
 */
export type SweatLevel = 1 | 2 | 3;

/**
 * Body parts that may be stressed by an exercise
 * Used for injury prevention and personalization
 */
export type InjuryShieldArea = 
  | 'wrist'
  | 'elbow'
  | 'shoulder'
  | 'lower_back'
  | 'neck'
  | 'knees'
  | 'ankles'
  | 'hips';

/**
 * Labels for noise levels (for UI display)
 */
export const NOISE_LEVEL_LABELS: Record<NoiseLevel, { he: string; en: string }> = {
  1: { he: 'שקט', en: 'Silent' },
  2: { he: 'בינוני', en: 'Moderate' },
  3: { he: 'רועש', en: 'Loud' },
};

/**
 * Labels for sweat levels (for UI display)
 */
export const SWEAT_LEVEL_LABELS: Record<SweatLevel, { he: string; en: string }> = {
  1: { he: 'נמוך', en: 'Low' },
  2: { he: 'בינוני', en: 'Medium' },
  3: { he: 'גבוה', en: 'High' },
};

/**
 * Labels for injury shield areas (for UI display)
 */
export const INJURY_SHIELD_LABELS: Record<InjuryShieldArea, { he: string; en: string }> = {
  wrist: { he: 'שורש כף היד', en: 'Wrist' },
  elbow: { he: 'מרפק', en: 'Elbow' },
  shoulder: { he: 'כתף', en: 'Shoulder' },
  lower_back: { he: 'גב תחתון', en: 'Lower Back' },
  neck: { he: 'צוואר', en: 'Neck' },
  knees: { he: 'ברכיים', en: 'Knees' },
  ankles: { he: 'קרסוליים', en: 'Ankles' },
  hips: { he: 'מפרקי ירך', en: 'Hips' },
};

/**
 * Mechanical type classification for calisthenics exercises
 * Used to balance straight arm vs bent arm work in workout generation
 */
export type MechanicalType = 'straight_arm' | 'bent_arm' | 'hybrid' | 'none';

/**
 * Labels for mechanical types (for UI display)
 */
export const MECHANICAL_TYPE_LABELS: Record<MechanicalType, { he: string; en: string; abbr: string }> = {
  straight_arm: { he: 'יד ישרה', en: 'Straight Arm', abbr: 'SA' },
  bent_arm: { he: 'יד כפופה', en: 'Bent Arm', abbr: 'BA' },
  hybrid: { he: 'היברידי', en: 'Hybrid', abbr: 'Hybrid' },
  none: { he: 'ללא סיווג', en: 'None', abbr: 'N/A' },
};

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'middle_back'
  | 'shoulders'
  | 'rear_delt'
  | 'abs'
  | 'obliques'
  | 'forearms'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'traps'
  | 'cardio'
  | 'full_body'
  | 'core'
  | 'legs';

/**
 * Labels for muscle groups (for UI display)
 */
export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, { he: string; en: string }> = {
  chest: { he: 'חזה', en: 'Chest' },
  back: { he: 'גב', en: 'Back' },
  middle_back: { he: 'אמצע גב / טרפזים', en: 'Middle Back' },
  shoulders: { he: 'כתפיים', en: 'Shoulders' },
  rear_delt: { he: 'כתף אחורית', en: 'Rear Delt' },
  abs: { he: 'בטן', en: 'Abs' },
  obliques: { he: 'אלכסונים', en: 'Obliques' },
  forearms: { he: 'אמות', en: 'Forearms' },
  biceps: { he: 'דו-ראשי', en: 'Biceps' },
  triceps: { he: 'תלת-ראשי', en: 'Triceps' },
  quads: { he: 'ארבע-ראשי', en: 'Quads' },
  hamstrings: { he: 'המסטרינג', en: 'Hamstrings' },
  glutes: { he: 'ישבן', en: 'Glutes' },
  calves: { he: 'שוקיים', en: 'Calves' },
  traps: { he: 'טרפז', en: 'Traps' },
  cardio: { he: 'קרדיו', en: 'Cardio' },
  full_body: { he: 'כל הגוף', en: 'Full Body' },
  core: { he: 'ליבה', en: 'Core' },
  legs: { he: 'רגליים', en: 'Legs' },
};

export type EquipmentType =
  | 'rings'
  | 'bar'
  | 'dumbbells'
  | 'bands'
  | 'pullUpBar'
  | 'mat'
  | 'kettlebell'
  | 'bench'
  | 'lowBar'
  | 'highBar'
  | 'dipStation'
  | 'wall'
  | 'stairs'
  | 'streetBench'
  | 'none'; // Bodyweight only

/**
 * High-level movement pattern for Smart Swap logic
 */
export type MovementGroup =
  | 'squat'
  | 'hinge'
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'core'
  | 'isolation';

/**
 * Exercise tags for classification and filtering
 */
export type ExerciseTag = 'skill' | 'compound' | 'isolation' | 'explosive' | 'hiit_friendly';

/**
 * Exercise role in a workout
 */
export type ExerciseRole = 'warmup' | 'cooldown' | 'main';

export interface ExerciseMedia {
  videoUrl?: string;
  imageUrl?: string;
}

export type InstructionalVideoLang = 'he' | 'en' | 'es';

export interface InstructionalVideo {
  lang: InstructionalVideoLang;
  url: string;
}

/**
 * Execution Method for an Exercise
 * Defines how an exercise can be performed in different contexts
 */
export type ExecutionLocation = 'home' | 'park' | 'street' | 'office' | 'school' | 'gym' | 'airport' | 'library';
export type RequiredGearType = 'fixed_equipment' | 'user_gear' | 'improvised';

/**
 * Production Workflow Status for tracking content production
 */
export interface ProductionWorkflow {
  /** Has this method been filmed? */
  filmed: boolean;
  /** Timestamp when filming was completed */
  filmedAt?: Date | null;
  /** Has audio been recorded/added? */
  audio: boolean;
  /** Timestamp when audio was completed */
  audioAt?: Date | null;
  /** Has editing been completed? */
  edited: boolean;
  /** Timestamp when editing was completed */
  editedAt?: Date | null;
  /** Has the final video been uploaded to storage? */
  uploaded: boolean;
  /** Timestamp when upload was completed */
  uploadedAt?: Date | null;
}

/**
 * Explanation content status for long-form content
 */
export type ExplanationStatus = 'missing' | 'ready';

export interface ExecutionMethod {
  methodName?: string; // Hebrew name for this execution method variant
  
  /**
   * Text shown in push notification (max 100 chars)
   * Can be a simple string or gender-specific: { male: "...", female: "..." }
   */
  notificationText?: string | GenderedText;
  
  location: ExecutionLocation;
  requiredGearType: RequiredGearType;
  
  // ========================================================================
  // NEW: Array-based equipment/gear fields (supports multiple selections)
  // ========================================================================
  
  /** Array of gear IDs (user_gear or improvised items) */
  gearIds?: string[];
  /** Array of gym equipment IDs (for fixed_equipment) */
  equipmentIds?: string[];
  
  // ========================================================================
  // DEPRECATED: Legacy single-value fields (for backward compatibility)
  // Migration: These are automatically converted to arrays by sanitization
  // ========================================================================
  
  /** @deprecated Use gearIds instead. Kept for data migration from older records. */
  gearId?: string;
  /** @deprecated Use equipmentIds instead. Kept for data migration from older records. */
  equipmentId?: string;
  
  brandId?: string | null; // Reference to outdoorBrands collection (for fixed_equipment with specific brand)
  locationMapping?: ExecutionLocation[]; // Array of locations where this method is available (e.g., ['home', 'office'])
  lifestyleTags?: string[]; // Array of lifestyle tags (e.g., ['student', 'parent', 'office_worker'])
  
  /**
   * Specific execution cues for THIS method variant.
   * Short, actionable coaching points (e.g., "Keep elbows tight", "Squeeze at the top")
   * Each cue can be a simple string or gender-specific: { male: "...", female: "..." }
   */
  specificCues?: (string | GenderedText)[];
  
  /**
   * Highlights/key points for THIS method variant.
   * Benefits, tips, or important notes specific to this execution method.
   * Each highlight can be a simple string or gender-specific: { male: "...", female: "..." }
   */
  highlights?: (string | GenderedText)[];
  
  media: {
    /**
     * Main video that plays in the in-app player.
     * Can be a short loop (4-8s) OR a full follow-along video.
     */
    mainVideoUrl?: string | null;
    /**
     * Video duration in seconds (required for follow-along exercises).
     * Used to auto-advance to the next part of the workout.
     */
    videoDurationSeconds?: number | null;
    /**
     * Optional list of deep-dive instructional videos (external links).
     * Typically YouTube/Vimeo URLs per language.
     */
    instructionalVideos?: InstructionalVideo[];
    imageUrl?: string | null;
  };
  
  // ========================================================================
  // PRODUCTION WORKFLOW - For tracking filming, editing, upload status
  // ========================================================================
  
  /**
   * Production workflow status for this execution method
   * Tracks: filmed -> audio -> edited -> uploaded
   */
  workflow?: ProductionWorkflow;
  
  /**
   * Whether this method needs a long explanation video
   * (for complex movements that need detailed breakdown)
   */
  needsLongExplanation?: boolean;
  
  /**
   * Status of the long explanation content
   * 'missing' = needs to be created, 'ready' = available
   */
  explanationStatus?: ExplanationStatus;
}

export interface ExerciseContent {
  /**
   * Short, localized description of the exercise.
   * New multi-language field – use instead of legacy `goal` when available.
   */
  description?: LocalizedText;
  /**
   * Localized execution instructions / coaching cues.
   * Long-form detailed instructions for proper form and technique.
   */
  instructions?: LocalizedText;
  /**
   * Specific execution cues - short, actionable coaching points.
   * E.g., "Keep elbows tight", "Squeeze at the top"
   */
  specificCues?: string[];
  /**
   * Legacy single-language goal field (kept for backward compatibility).
   */
  goal?: string;
  notes?: string[];
  highlights?: string[];
}

export interface ExerciseStats {
  views: number;
}

/**
 * Alternative Equipment Requirement with Priority
 * Allows exercises to have multiple equipment options checked in priority order
 */
export type EquipmentRequirementType = 'gym_equipment' | 'urban_asset' | 'user_gear';

export interface AlternativeEquipmentRequirement {
  priority: number; // 1 = highest priority, 2 = medium, 3 = lowest
  type: EquipmentRequirementType;
  // For gym_equipment: ID from gym_equipment collection
  equipmentId?: string;
  // For user_gear: ID from gear_definitions collection
  gearId?: string;
  // For urban_asset: Name of generic asset (e.g., "Street Bench", "Park Step")
  urbanAssetName?: string;
}

/**
 * Exercise document structure in Firestore
 */
export interface Exercise {
  id: string;
  /**
   * Localized exercise name (multi-language).
   */
  name: LocalizedText;
  type: ExerciseType;
  /**
   * How the exercise should be logged during workout
   * - 'reps': Standard input for numbers (reps, time, etc.)
   * - 'completion': Simple checkmark for warmups/stretches where no numbers are needed
   */
  loggingMode: LoggingMode;
  equipment: EquipmentType[]; // Legacy - kept for backward compatibility
  muscleGroups: MuscleGroup[]; // Legacy - kept for backward compatibility
  /**
   * Primary muscle targeted by this exercise (single selection)
   */
  primaryMuscle?: MuscleGroup;
  /**
   * Secondary muscles engaged during this exercise (multi-selection)
   */
  secondaryMuscles?: MuscleGroup[];
  programIds: string[]; // Links to 'upper_body', 'lower_body', 'core', etc.
  media: ExerciseMedia; // Legacy - kept for backward compatibility
  execution_methods?: ExecutionMethod[]; // New: Multiple execution methods with different videos (Firestore field name)
  executionMethods?: ExecutionMethod[]; // Alias for execution_methods (camelCase for TypeScript/JS access)
  content: ExerciseContent;
  stats: ExerciseStats;
  /**
   * Optional movement group classification (e.g. squat, horizontal_push)
   * Used to keep Smart Swap replacements within the same pattern family.
   */
  movementGroup?: MovementGroup;
  /**
   * Optional tagging of exercises to specific programs and levels
   * Used by admin for "Suitable Programs" linking
   * Level is determined from targetPrograms. If empty, defaults to Level 1.
   */
  targetPrograms?: TargetProgramRef[];
  // Legacy requirements (kept for backward compatibility)
  requiredGymEquipment?: string;
  requiredUserGear?: string[];
  // New alternative requirements system
  alternativeEquipmentRequirements?: AlternativeEquipmentRequirement[];
  // Base movement ID for grouping exercise variations (e.g., all pull-up variations)
  base_movement_id?: string;
  /**
   * Exercise tags for classification (skill, compound, isolation, explosive, hiit_friendly)
   */
  tags?: ExerciseTag[];
  /**
   * Exercise role in a workout (warmup, cooldown, or main exercise)
   */
  exerciseRole?: ExerciseRole;
  /**
   * Follow-along mode: When true, the video plays from start to finish and timer syncs with video length.
   * Defaults to true for warmup/cooldown exercises.
   */
  isFollowAlong?: boolean;
  /**
   * Whether the exercise video has audio that should be played.
   * When false (default), the player mutes the video.
   */
  hasAudio?: boolean;
  /**
   * Seconds per rep (for timing calculations in workout builder).
   * Default: 3 seconds.
   */
  secondsPerRep?: number;
  /**
   * Default rest seconds between sets for this exercise.
   * Default: 30 seconds.
   * Note: This is a fallback value. Advanced workout programs will override this.
   */
  defaultRestSeconds?: number;
  /**
   * Movement type classification (compound or isolation)
   */
  movementType?: 'compound' | 'isolation';
  /**
   * Exercise symmetry (bilateral or unilateral)
   * If unilateral, duration calculation should double the total time.
   */
  symmetry?: 'bilateral' | 'unilateral';
  
  // ========================================================================
  // GENERAL METRICS - For filtering and personalization
  // ========================================================================
  
  /**
   * Noise level of the exercise (1-3 scale)
   * 1 = Silent (apartment-friendly)
   * 2 = Moderate
   * 3 = Loud (jumping, requires space)
   */
  noiseLevel?: NoiseLevel;
  /**
   * Sweat/intensity level (1-3 scale)
   * 1 = Low/No Sweat
   * 2 = Medium
   * 3 = High/Intense
   */
  sweatLevel?: SweatLevel;
  /**
   * Body parts that may be stressed by this exercise
   * Used for injury prevention - exercises stressing injured areas can be filtered out
   */
  injuryShield?: InjuryShieldArea[];
  /**
   * Calisthenics technical classification
   * Used to balance straight arm vs bent arm work in workouts
   * - straight_arm: Planche, front lever, back lever, etc.
   * - bent_arm: Pull-ups, dips, push-ups, etc.
   * - hybrid: Muscle-up, etc. (combines both)
   * - none: Non-calisthenics exercises (mobility, cardio, etc.)
   */
  mechanicalType?: MechanicalType;
  /**
   * Field/Tactical ready - can be performed in field conditions
   * No equipment, no specific surface requirements
   * Used for military/tactical training modes
   */
  fieldReady?: boolean;
  
  // ========================================================================
  // PRODUCTION REQUIREMENTS - For tracking which locations are required
  // ========================================================================
  
  /**
   * Locations where this exercise MUST have an execution method.
   * Used for gap analysis - missing methods for required locations are flagged.
   * If not set, no location-based gaps will be flagged.
   */
  requiredLocations?: ExecutionLocation[];
  
  createdAt?: Date;
  updatedAt?: Date;
  // Legacy field - deprecated, use targetPrograms instead
  /** @deprecated Use targetPrograms instead. Level is now determined from targetPrograms, defaulting to 1 if empty. */
  recommendedLevel?: number;
}

export interface TargetProgramRef {
  programId: string;
  level: number;
}

/**
 * Form data for creating/editing exercises
 */
export type ExerciseFormData = Omit<Exercise, 'id' | 'createdAt' | 'updatedAt' | 'stats'> & {
  stats?: Partial<ExerciseStats>;
};

/**
 * Helper: Pick the best instructional video URL for a given language.
 */
export function getInstructionalVideoForLanguage(
  videos: InstructionalVideo[] | undefined,
  language: InstructionalVideoLang = 'he'
): string | undefined {
  if (!videos || videos.length === 0) return undefined;
  // Exact language match
  const exact = videos.find((v) => v.lang === language)?.url;
  if (exact) return exact;
  // Reasonable fallbacks
  if (language === 'es') {
    return (
      videos.find((v) => v.lang === 'en')?.url ||
      videos.find((v) => v.lang === 'he')?.url
    );
  }
  if (language === 'en') {
    return (
      videos.find((v) => v.lang === 'he')?.url ||
      videos.find((v) => v.lang === 'es')?.url
    );
  }
  // he fallback
  return (
    videos.find((v) => v.lang === 'en')?.url ||
    videos.find((v) => v.lang === 'es')?.url
  );
}

// ============================================================================
// LOCATION-AWARE MEDIA RESOLUTION
// ============================================================================

/**
 * Find the execution method that matches a given location.
 * Falls back through: exact match → locationMapping → first method with media.
 *
 * Used by the workout player to select the correct video/image for the
 * workout's active location, preventing Home/Park media mix-ups.
 */
export function findMethodForLocation(
  exercise: Exercise | { execution_methods?: ExecutionMethod[]; executionMethods?: ExecutionMethod[] },
  location?: string | null,
): ExecutionMethod | null {
  const methods = (exercise as any).execution_methods || (exercise as any).executionMethods || [];
  if (!methods.length) return null;

  if (location) {
    // 1. Exact location match
    const exact = methods.find((m: ExecutionMethod) => m.location === location);
    if (exact) return exact;

    // 2. locationMapping includes this location
    const mapped = methods.find((m: ExecutionMethod) => m.locationMapping?.includes(location as ExecutionLocation));
    if (mapped) return mapped;
  }

  // 3. Fallback: first method that has any media at all
  for (const m of methods) {
    if (m?.media?.mainVideoUrl || m?.media?.imageUrl) return m;
  }

  // 4. Last resort: first method (even if no media)
  return methods[0] || null;
}

/**
 * Resolve the main video URL for a given exercise + location.
 */
export function resolveVideoForLocation(
  exercise: Exercise | { execution_methods?: ExecutionMethod[]; executionMethods?: ExecutionMethod[] },
  location?: string | null,
): string {
  const method = findMethodForLocation(exercise, location);
  return method?.media?.mainVideoUrl || (exercise as any).media?.videoUrl || '';
}

/**
 * Resolve the image URL for a given exercise + location.
 */
export function resolveImageForLocation(
  exercise: Exercise | { execution_methods?: ExecutionMethod[]; executionMethods?: ExecutionMethod[] },
  location?: string | null,
): string {
  const method = findMethodForLocation(exercise, location);
  return method?.media?.imageUrl || method?.media?.mainVideoUrl || (exercise as any).media?.imageUrl || '';
}
