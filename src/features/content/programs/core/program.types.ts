/**
 * Workout Management Types
 * Used for Admin-managed Levels and Programs
 */

export { type LevelGoal } from '@/types/workout';

export interface Level {
  id: string;
  name: string; // e.g., "Beginner", "Intermediate"
  order: number; // 1-5 (or more)
  description?: string;

  // XP Thresholds
  minXP?: number;
  maxXP?: number;

  // Target Exercise Goals
  targetGoals?: import('@/types/workout').LevelGoal[];

  createdAt?: Date;
  updatedAt?: Date;
}

export interface Program {
  id: string;
  name: string; // e.g., "Full Body", "Upper Body"
  description?: string;
  maxLevels?: number; // Maximum level this program supports
  isMaster: boolean; // Master programs (e.g., "Full Body") track sub-levels
  imageUrl?: string; // Optional image for program display
  subPrograms?: string[]; // IDs of sub-programs (for Master Programs)
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Program Level Settings
 * Stores metadata for a specific level within a specific program
 * This is separate from exercise assignment - focuses on level configuration
 */
export interface ProgramLevelSettings {
  id: string;
  programId: string;           // Reference to Program
  levelNumber: number;          // The level number (1, 2, 3, etc.)
  levelDescription: string;     // Instructional/contextual text for this level
  progressionWeight: number;    // How much completing a workout contributes (0.0 - 1.0, default 1.0)
  
  // Future-proofing fields for intensity modifiers
  intensityModifier?: number;   // Optional intensity multiplier (default 1.0)
  restMultiplier?: number;      // Optional rest time multiplier (default 1.0)
  volumeAdjustment?: number;    // Optional volume adjustment percentage (-50 to +50)
  focusAreas?: string[];        // Optional focus areas for this level
  prerequisites?: string[];     // Optional: level descriptions that should be completed first

  // Target Exercise Goals for this specific program-level
  targetGoals?: import('@/types/workout').LevelGoal[];
  
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Program Level Settings with resolved program name (for UI display)
 */
export interface ProgramLevelSettingsWithProgram extends ProgramLevelSettings {
  programName: string;
}
