/**
 * Workout Management Types
 * Used for Admin-managed Levels and Programs
 */

export { type LevelGoal } from '@/types/workout';

/** Access tier required to view/use this content. 1=Starter, 2=Municipal, 3=Pro/Elite */
export type ContentTier = 1 | 2 | 3;

/**
 * Movement pattern of a program.
 * Programs sharing the same pattern share a physiological weekly volume budget.
 * The "Lead Program" (highest user level among same-pattern programs) dictates
 * the weeklyVolumeTarget used for all exercises under that pattern.
 */
export type MovementPattern = 'push' | 'pull' | 'legs' | 'core';

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

  /** Access tier required for this level. Default: 1 (Starter / free) */
  requiredTier?: ContentTier;

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

  /** Access tier required for this program. Default: 1 (Starter / free) */
  requiredTier?: ContentTier;

  /**
   * Movement pattern this program targets.
   * Programs with the same pattern share a physiological volume budget.
   * The Lead Program (highest user level) dictates the shared limit.
   * Master programs typically have no pattern (they aggregate children).
   */
  movementPattern?: MovementPattern;

  /**
   * Training type classification for activity ring routing.
   * Determines which ActivityCategory ring a completed workout fills.
   * - 'strength': logs to the Strength ring (cyan)
   * - 'cardio': logs to the Cardio ring (lime)
   * Defaults to 'strength' when absent.
   */
  trainingType?: 'strength' | 'cardio';

  /**
   * Icon key for UI display (program cards, dashboard circles).
   * Maps to a visual icon in the app. Examples: 'muscle', 'pullup', 'leg', 'shoe', 'core'.
   */
  iconKey?: string;

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

  // ── Training OS: Volume Budget (Lead Program Model) ─────────────────
  /** Weekly set budget for this program-level.
   *  At runtime, the engine uses the "Lead Program" for the movement pattern:
   *  it finds the program where the user has the HIGHEST level among all
   *  programs sharing the same movementPattern, and uses that program's
   *  weeklyVolumeTarget as the shared limit for the entire pattern.
   *  @see lead-program.service.ts */
  weeklyVolumeTarget?: number;

  // ── Training OS: Intensity Gating ─────────────────────────────────
  /** Max 3-bolt sessions per week.
   *  Resolved via the same Lead Program logic — the most advanced program
   *  dictates the user's overall intensity capacity.
   *  Default: 0 for L1-5, 2 for L6-12, 99 for L13+. */
  maxIntenseWorkoutsPerWeek?: number;

  // ── Training OS: Straight Arm / Bent Arm Balance ────────────────────
  /** Target ratio of straight-arm exercises in the workout (0.0-1.0).
   *  E.g. 0.4 = 40% SA, 60% BA.  Prevents tendonitis from too much SA work.
   *  If unset, the generator uses a default of 0.4 for levels ≤10 and 0.5 above.
   *  @see WorkoutGenerator – enforced during exercise selection */
  straightArmRatio?: number;

  // ── Training OS: Weekly SA Safety Cap ──────────────────────────────
  /** Maximum straight-arm sets per week for this level.
   *  Prevents tendinopathy from excessive SA work across all programs.
   *  The generator checks cumulative SA sets and throttles when cap is hit.
   *  If unset, no cap is applied (unlimited SA sets). */
  weeklySACap?: number;

  // ── Training OS: Safety Brake (Hard Cap) ─────────────────────────────
  /** Maximum total sets per session for this program/muscle group.
   *  Prevents "junk volume" during high-frequency periods.
   *  Enforced even when Weekly Catch-up, Overflow Bonuses, or User Vibe Overrides are active.
   *  If unset, no per-session cap is applied. */
  maxSets?: number;

  /** Minimum sets per session (legacy/ref only — NOT used in gain calc; Pay-as-you-go applies). */
  minSets?: number;

  // ── Progression: Base Gains & Bonuses ────────────────────────────────
  /** Base % gain per session (e.g., 8 for L1-5, 6 for L6-13, 4 for L14-19, 2 for L20-25). */
  baseGain?: number;
  /** First-session bonus % (e.g., +3 for L1-13, +1.5 for L14-19, +0.5 for L20-25). */
  firstSessionBonus?: number;

  // ── Progression: Monthly Streak (Persistence) ───────────────────────
  /** Session number in month → bonus %. E.g. { "2": 0.5, "5": 1.0, "7": 1.5 }. */
  persistenceBonusConfig?: Record<string, number>;

  // ── Progression: RPE-based Bonus ─────────────────────────────────────
  /** RPE value → bonus %. E.g. { "8": 0.5, "9": 1.0, "10": 1.5 }. */
  rpeBonusConfig?: Record<string, number>;

  // ── Grandchild Inheritance (e.g. OAP L1 → Pull L10) ──────────────────
  /** Maps grandchild level → parent level for maxSets inheritance.
   *  E.g. { "1": 10 } means OAP Level 1 inherits from Pull Level 10. */
  parentLevelMapping?: Record<string, number>;

  // ── Training OS: Default Rest ──────────────────────────────────────
  /** @deprecated — Tier Engine is now the single source of truth for rest.
   *  Kept for Firestore backward compat but no longer consumed by the generator. */
  defaultRestSeconds?: number;

  // ── Training OS: Protocol Injection (Program-specific) ──────────────
  /** Probability (0.0-1.0) of injecting an advanced protocol (EMOM, Pyramid, Superset).
   *  Default: 0.0 for easy, 0.2 for intense sessions. */
  protocolProbability?: number;

  /** Preferred protocols for this program-level combination.
   *  Engine uses this list when protocol injection triggers. */
  preferredProtocols?: ('emom' | 'pyramid' | 'antagonist_pair' | 'superset')[];

  // ── Assessment Slider (Admin Panel Source of Truth) ─────────────────
  /** Video URL for visual assessment slider. Uploaded via Admin Panel. */
  assessmentVideoUrl?: string;
  /** HEVC with Alpha for iOS / Safari (.mov). */
  assessmentVideoUrlMov?: string;
  /** VP9 with Alpha for Android / Chrome (.webm). */
  assessmentVideoUrlWebm?: string;
  /** Thumbnail for video preview. */
  assessmentThumbnailUrl?: string;
  /** Bold title for assessment slider display (overrides levelDescription if set). */
  assessmentBoldTitle?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Program Level Settings with resolved program name (for UI display)
 */
export interface ProgramLevelSettingsWithProgram extends ProgramLevelSettings {
  programName: string;
}
