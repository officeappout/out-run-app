/**
 * Progression Settings Types
 * Defines rules for progression calculation and bonus percentages
 */

/**
 * Linked Program Configuration
 * Defines how progress in one program affects another
 */
export interface LinkedProgramConfig {
  targetProgramId: string; // The program that receives partial progress
  multiplier: number; // Progress multiplier (e.g., 0.5 = 50% of gain)
}

/**
 * Progression Rule for a specific program and level
 * Stored in the 'progression_rules' collection
 */
export interface ProgressionRule {
  id: string;
  programId: string; // The domain/program ID (e.g., 'upper_body', 'lower_body', 'core')
  level: number; // The level this rule applies to (1, 2, 3, etc.)
  
  // === Progression Settings ===
  baseSessionGain: number; // Base % gain per session (e.g., 9 for level 3)
  bonusPercent: number; // Bonus % for exceeding target reps (e.g., 5, 10, 15)
  requiredSetsForFullGain: number; // Number of sets needed for 100% of baseSessionGain
  linkedPrograms: LinkedProgramConfig[]; // Programs that receive partial progress
  
  // === Optional Metadata ===
  description?: string; // Admin notes for this level
  
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Get default required sets based on level tier
 * Levels 1-5: 4 sets
 * Levels 6-15: 6 sets
 * Levels 16-25: 8 sets
 */
export function getDefaultRequiredSets(level: number): number {
  if (level <= 5) return 4;
  if (level <= 15) return 6;
  return 8;
}

/**
 * Default progression values per level tier
 * Used when no specific rule is defined
 */
export const DEFAULT_PROGRESSION_BY_LEVEL: Record<number, { baseGain: number; bonusPercent: number; requiredSets: number }> = {
  1: { baseGain: 15, bonusPercent: 5, requiredSets: 4 },   // Beginner: Fast progression
  2: { baseGain: 12, bonusPercent: 5, requiredSets: 4 },
  3: { baseGain: 10, bonusPercent: 8, requiredSets: 4 },
  4: { baseGain: 9, bonusPercent: 8, requiredSets: 4 },
  5: { baseGain: 8, bonusPercent: 10, requiredSets: 4 },   // Intermediate
  6: { baseGain: 7, bonusPercent: 10, requiredSets: 6 },
  7: { baseGain: 6, bonusPercent: 12, requiredSets: 6 },
  8: { baseGain: 5, bonusPercent: 12, requiredSets: 6 },
  9: { baseGain: 5, bonusPercent: 15, requiredSets: 6 },
  10: { baseGain: 4, bonusPercent: 15, requiredSets: 6 },  // Advanced: Slower progression
  // Levels 11+ use level 10 defaults with 6 sets (or 8 for 16+)
};

/**
 * Domain track progress structure
 * Stored in Firestore as: progression.tracks.[domain]
 */
export interface DomainTrackProgress {
  currentLevel: number; // Current level in this domain
  percent: number; // Progress percentage (0-100) toward next level
  lastWorkoutDate?: Date; // Track inactivity
  totalWorkoutsCompleted?: number; // Lifetime workouts in this domain
}

/**
 * Ready for Split Flag
 * Triggers when full_body level reaches threshold
 */
export interface ReadyForSplitStatus {
  isReady: boolean;
  triggeredAt?: Date;
  suggestedSplit: string[]; // e.g., ['upper_body', 'lower_body', 'push', 'pull']
}

/**
 * Workout Completion Data
 * Input for processWorkoutCompletion
 */
export interface WorkoutCompletionData {
  userId: string;
  activeProgramId: string; // The program the user was training
  exercises: WorkoutExerciseResult[];
  totalDuration: number; // In minutes
  completedAt: Date;
}

/**
 * Individual exercise result from a workout
 */
export interface WorkoutExerciseResult {
  exerciseId: string;
  exerciseName: string;
  programLevels: Record<string, number>; // From MockExercises programLevels
  setsCompleted: number;
  repsPerSet: number[];
  targetReps: number;
  isCompound: boolean;
}

/**
 * Volume breakdown for Dopamine Screen display
 */
export interface VolumeBreakdown {
  setsPerformed: number;
  requiredSets: number;
  volumeRatio: number; // 0-1, capped at 1
  isFullVolume: boolean; // true if volumeRatio >= 1
}

/**
 * Result of workout completion processing
 */
export interface WorkoutCompletionResult {
  success: boolean;
  activeProgramGain: {
    programId: string;
    baseGain: number;
    bonusGain: number;
    totalGain: number;
    newPercent: number;
    leveledUp: boolean;
    newLevel?: number;
  };
  linkedProgramGains: {
    programId: string;
    gain: number;
    newPercent: number;
    leveledUp: boolean;
    newLevel?: number;
  }[];
  volumeBreakdown: VolumeBreakdown; // Volume feedback for Dopamine Screen
  readyForSplit?: ReadyForSplitStatus;
}

/**
 * Master Program Progress Display
 * Unified view combining all sub-program progress
 */
export interface MasterProgramProgress {
  displayLevel: number; // Weighted average level across all sub-programs
  displayPercent: number; // Average percentage across all sub-programs
  subPrograms: {
    programId: string;
    level: number;
    percent: number;
  }[];
}

/**
 * Level Equivalence Rule
 * Defines automatic level mapping between programs.
 * When a user reaches `sourceLevel` in `sourceProgramId`,
 * the `targetProgramId` is automatically set to `targetLevel`
 * (only if the target's current level is lower).
 *
 * Stored in Firestore: collection 'level_equivalence_rules'
 *
 * Example: Push Lvl 15 -> Planche Lvl 4
 * { sourceProgramId: 'push', sourceLevel: 15, targetProgramId: 'planche', targetLevel: 4 }
 */
export interface LevelEquivalenceRule {
  id: string;
  sourceProgramId: string;   // The program whose level-up triggers the mapping
  sourceLevel: number;       // The level that triggers the mapping
  targetProgramId: string;   // The program that gets unlocked/set
  targetLevel: number;       // The level to set in the target program
  targetPercent?: number;    // Optional: initial percent in target (default 0)
  addToActivePrograms?: boolean; // If true, also adds target to user's activePrograms
  description?: string;      // Admin-facing description (e.g., "Push mastery unlocks Planche")
  isEnabled?: boolean;       // Toggle rule on/off without deleting (default true)
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Result of applying a level equivalence rule
 */
export interface LevelEquivalenceResult {
  ruleId: string;
  targetProgramId: string;
  previousLevel: number;
  newLevel: number;
  wasNewlyUnlocked: boolean; // true if the target had no track before
}
