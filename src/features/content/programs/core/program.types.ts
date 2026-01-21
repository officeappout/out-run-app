/**
 * Workout Management Types
 * Used for Admin-managed Levels and Programs
 */

export interface Level {
  id: string;
  name: string; // e.g., "Beginner", "Intermediate"
  order: number; // 1-5 (or more)
  description?: string;
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
