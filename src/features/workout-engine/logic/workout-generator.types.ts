/**
 * Workout Generator Types
 *
 * All type definitions, interfaces, and enums used across the workout
 * generation pipeline. Extracted from WorkoutGenerator.ts for modularity.
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs
 */

import { Exercise, MechanicalType } from '@/features/content/exercises/core/exercise.types';
import { ScoredExercise, IntentMode, LifestylePersona, FilterStageCounts } from './ContextualEngine';

// ============================================================================
// CORE TYPES
// ============================================================================

export type DifficultyLevel = 1 | 2 | 3;

export type WorkoutStructure = 'standard' | 'emom' | 'amrap' | 'circuit';

export type ExercisePriority = 'skill' | 'foundation' | 'compound' | 'accessory' | 'isolation';

// ============================================================================
// TIER ENGINE
// ============================================================================

export type TierName = 'elite' | 'hard' | 'match' | 'easy' | 'flow';

export interface TierConfig {
  reps:  { min: number; max: number };
  hold:  { min: number; max: number };
  rest:  { min: number; max: number };
  sets:  { min: number; max: number };
}

export const TIER_TABLE: Record<TierName, TierConfig> = {
  elite: { reps: { min: 1,  max: 3  }, hold: { min: 3,  max: 6  }, rest: { min: 180, max: 240 }, sets: { min: 4, max: 5 } },
  hard:  { reps: { min: 1,  max: 3  }, hold: { min: 5,  max: 10 }, rest: { min: 120, max: 180 }, sets: { min: 4, max: 5 } },
  match: { reps: { min: 3,  max: 6  }, hold: { min: 10, max: 15 }, rest: { min: 90,  max: 120 }, sets: { min: 3, max: 4 } },
  easy:  { reps: { min: 10, max: 15 }, hold: { min: 15, max: 25 }, rest: { min: 45,  max: 75  }, sets: { min: 3, max: 3 } },
  flow:  { reps: { min: 10, max: 15 }, hold: { min: 25, max: 45 }, rest: { min: 45,  max: 60  }, sets: { min: 3, max: 3 } },
};

/** Horizontal movements at match tier use a wider hypertrophy-friendly rep range */
export const MATCH_HORIZONTAL_REPS = { min: 6, max: 12 };

export const VERTICAL_MOVEMENT_GROUPS = new Set(['vertical_push', 'vertical_pull']);
export const HORIZONTAL_MOVEMENT_GROUPS = new Set(['horizontal_push', 'horizontal_pull']);

export function resolveTier(levelDelta: number): TierName {
  if (levelDelta >= 2) return 'elite';
  if (levelDelta === 1) return 'hard';
  if (levelDelta === 0) return 'match';
  if (levelDelta >= -2) return 'easy';
  return 'flow';
}

export function restSafetyFloor(tier: TierConfig): number {
  return Math.round(tier.rest.min * 0.7);
}

// ============================================================================
// WORKOUT EXERCISE
// ============================================================================

export interface WorkoutExercise {
  exercise: Exercise;
  method: ScoredExercise['method'];
  mechanicalType: MechanicalType;
  sets: number;
  reps: number;
  repsRange?: { min: number; max: number };
  isTimeBased: boolean;
  restSeconds: number;
  priority: ExercisePriority;
  score: number;
  reasoning: string[];
  programLevel?: number;
  isOverLevel?: boolean;
  tier?: TierName;
  levelDelta?: number;
  isGoalExercise?: boolean;
  rampedTarget?: number;
  exerciseRole?: 'warmup' | 'main' | 'cooldown';
  pairedWith?: string;
}

// ============================================================================
// GENERATED WORKOUT
// ============================================================================

export interface WorkoutStats {
  calories: number;
  coins: number;
  totalReps: number;
  totalHoldTime: number;
  difficultyMultiplier: number;
}

export interface GeneratedWorkout {
  title: string;
  description: string;
  aiCue?: string;
  /** Per-variant coaching explanation shown on the Overview page */
  logicCue?: string;
  exercises: WorkoutExercise[];
  estimatedDuration: number;
  structure: WorkoutStructure;
  difficulty: DifficultyLevel;
  volumeAdjustment?: VolumeAdjustment;
  blastMode?: BlastModeDetails;
  mechanicalBalance: MechanicalBalanceSummary;
  stats: WorkoutStats;
  isRecovery: boolean;
  totalPlannedSets: number;
  /** Why Logger: end-to-end pipeline summary for debugging/auditing */
  pipelineLog?: string[];
}

export interface VolumeAdjustment {
  reason: 'inactivity' | 'beginner' | 'injury_recovery' | 'detraining' | 'weekly_budget';
  reductionPercent: number;
  originalSets: number;
  adjustedSets: number;
  badge: string;
}

export interface BlastModeDetails {
  type: 'emom' | 'amrap';
  durationMinutes: number;
  rounds?: number;
  workSeconds?: number;
  restSeconds?: number;
}

export interface MechanicalBalanceSummary {
  straightArm: number;
  bentArm: number;
  hybrid: number;
  ratio: string;
  isBalanced: boolean;
}

// ============================================================================
// GENERATION CONTEXT
// ============================================================================

export interface WorkoutGenerationContext {
  availableTime: number;
  userLevel: number;
  daysInactive: number;
  intentMode: IntentMode;
  persona: LifestylePersona | null;
  location: string;
  injuryCount: number;
  energyLevel?: 'low' | 'medium' | 'high';
  difficulty?: DifficultyLevel;
  userWeight?: number;
  sessionCount?: number;
  isFirstSessionInProgram?: boolean;
  remainingWeeklyBudget?: number;
  weeklyBudgetUsagePercent?: number;
  isRecoveryDay?: boolean;
  detrainingLock?: boolean;
  volumeReductionOverride?: number;
  protocolProbability?: number;
  preferredProtocols?: ('emom' | 'pyramid' | 'antagonist_pair' | 'superset')[];
  straightArmRatio?: number;
  weeklySASets?: number;
  weeklySACap?: number;
  maxSets?: number;
  /** @deprecated */
  levelDefaultRestSeconds?: number;
  /** @deprecated */
  restMultiplier?: number;
  goalExerciseIds?: Set<string>;
  goalTargets?: Map<string, { targetValue: number; unit: 'reps' | 'seconds' }>;
  levelProgressPercent?: number;
  workoutsCompletedInLevel?: number;
  splitType?: string;
  dominanceRatio?: { p1: number; p2: number; p3?: number };
  priority1SkillIds?: string[];
  priority2SkillIds?: string[];
  priority3SkillIds?: string[];
  dailySetBudget?: number;
  requiredDomains?: string[];
  globalExercisePool?: Exercise[];
  userProgramLevels?: Map<string, number>;
  userId?: string;
  selectedDate?: string;
  /** Per-domain daily set budgets from resolveAggregateFullBodyBudget (Master Programs). */
  domainBudgets?: Array<{ domain: string; level: number; weekly: number; daily: number }>;
  /** Phase 4B: Exercise IDs used in last 2 sessions (for Variety Guard anti-boredom penalty). */
  recentExerciseIds?: Set<string>;
  /** Why Logger: per-filter pool counts from ContextualEngine (passed through for pipeline log). */
  filterCounts?: FilterStageCounts;
}
