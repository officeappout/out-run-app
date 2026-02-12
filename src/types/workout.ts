/**
 * Workout Management Types
 * Used for Admin-managed Levels and Programs
 */

/**
 * Target exercise goal for a specific level.
 * Admin defines these to track user mastery at each level.
 */
export interface LevelGoal {
  exerciseId: string;   // Exercise document ID from 'exercises' collection
  exerciseName: string; // Display name (e.g., "Push-ups", "Plank")
  targetValue: number;  // Target reps or seconds
  unit: 'reps' | 'seconds'; // Unit of measurement
}

export interface Level {
  id: string;
  name: string; // e.g., "Beginner", "Intermediate"
  order: number; // 1-5 (or more)
  description?: string;

  // XP Thresholds — used internally to calculate globalLevel from globalXP
  minXP?: number; // Minimum XP to reach this level (e.g., 0 for Level 1)
  maxXP?: number; // XP ceiling before next level (e.g., 100 for Level 1)

  // Target Exercise Goals — admin-defined mastery goals for this level
  targetGoals?: LevelGoal[];

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
