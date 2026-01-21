/**
 * Progression Settings Types
 * Defines rules for progression calculation and bonus percentages
 */

/**
 * Progression Rule for a specific program and level
 * Stored in the 'program_level_settings' collection
 */
export interface ProgressionRule {
  id: string;
  programId: string; // The domain/program ID (e.g., 'upper_body', 'lower_body', 'core')
  level: number; // The level this rule applies to (1, 2, 3, etc.)
  bonusPercent: number; // Bonus percentage to apply (e.g., 5, 10, 15)
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Domain track progress structure
 * Stored in Firestore as: progression.tracks.[domain]
 */
export interface DomainTrackProgress {
  currentLevel: number; // Current level in this domain
  percent: number; // Progress percentage (0-100) toward next level
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
