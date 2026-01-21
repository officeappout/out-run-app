/**
 * Exercise Management Types
 * Defines the structure for exercises in the 'exercises' collection
 */

export type ExerciseType = 'reps' | 'time' | 'rest';

export type LoggingMode = 'reps' | 'completion';

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
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

export type AppLanguage = 'he' | 'en' | 'es';

export interface LocalizedText {
  he: string;
  en: string;
  es?: string;
}

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
export type ExecutionLocation = 'home' | 'park' | 'street' | 'office' | 'school' | 'gym';
export type RequiredGearType = 'fixed_equipment' | 'user_gear' | 'improvised';

export interface ExecutionMethod {
  location: ExecutionLocation;
  requiredGearType: RequiredGearType;
  gearId: string; // Can be:
  // - gym_equipment ID (for fixed_equipment)
  // - gear_definitions ID (for user_gear)
  // - improvised item name like 'chair', 'door', 'wall' (for improvised)
  media: {
    /**
     * Main video that plays in the in-app player.
     * Can be a short loop (4-8s) OR a full follow-along video.
     */
    mainVideoUrl?: string;
    /**
     * Optional list of deep-dive instructional videos (external links).
     * Typically YouTube/Vimeo URLs per language.
     */
    instructionalVideos?: InstructionalVideo[];
    imageUrl?: string;
  };
}

export interface ExerciseContent {
  /**
   * Short, localized description of the exercise.
   * New multi-language field – use instead of legacy `goal` when available.
   */
  description?: LocalizedText;
  /**
   * Localized execution instructions / coaching cues.
   */
  instructions?: LocalizedText;
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
  muscleGroups: MuscleGroup[];
  programIds: string[]; // Links to 'upper_body', 'lower_body', 'core', etc.
  media: ExerciseMedia; // Legacy - kept for backward compatibility
  execution_methods?: ExecutionMethod[]; // New: Multiple execution methods with different videos
  content: ExerciseContent;
  stats: ExerciseStats;
  /**
   * Optional movement group classification (e.g. squat, horizontal_push)
   * Used to keep Smart Swap replacements within the same pattern family.
   */
  movementGroup?: MovementGroup;
  /**
   * Optional tagging of exercises to specific programs and levels
   * Used by admin for \"Suitable Programs\" linking
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
 * Helper: Resolve localized text by language with graceful fallback.
 */
export function getLocalizedText(
  value: LocalizedText | undefined,
  language: AppLanguage = 'he'
): string {
  if (!value) return '';
  if (language === 'he' && value.he) return value.he;
  if (language === 'en' && value.en) return value.en;
  if (language === 'es' && value.es) return value.es || value.en || value.he;
  // Fallback order: he -> en -> es
  return value.he || value.en || value.es || '';
}

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
