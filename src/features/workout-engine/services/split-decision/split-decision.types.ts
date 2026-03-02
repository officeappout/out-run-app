/**
 * Split Decision Types — Dynamic Training Frequency & Split Engine
 *
 * Defines the SplitMatrix, SessionType, SplitLogic, and related types
 * for frequency-aware workout generation.
 *
 * @see FREQUENCY_SPLIT_RESEARCH.md
 * @see Dynamic Training Frequency & Split Engine TDD
 */

import type { MuscleGroup } from '@/features/content/exercises/core/exercise.types';

// ============================================================================
// SESSION TYPES (from the Split Matrix)
// ============================================================================

export type SessionType =
  | 'full_body_basic' // 1-2 days, L1-5
  | 'full_body_high' // 1-2 days, L6-13
  | 'full_body_max' // 1-2 days, L14-25
  | 'full_body_ab' // 3 days, L1-5
  | 'upper_lower' // 3 days, L6-13
  | 'push_pull_mixed' // 3 days, L14-25 (65/35)
  | 'habit_builder' // 4-5 days, L1-5
  | 'push_pull_rotation' // 4-5 days, L6-13
  | 'skill_dominance' // 4-5 days, L14-25
  | 'habit_builder_ultra' // 6 days, L1-5
  | 'push_pull_legs' // 6 days, L6-13
  | 'hyper_skill_blocks'; // 6 days, L14-25

// ============================================================================
// LEVEL TIER
// ============================================================================

export type LevelTier = 'beginner' | 'intermediate' | 'advanced';

// ============================================================================
// SPLIT LOGIC METADATA
// ============================================================================

export interface SplitLogic {
  sessionType: SessionType;
  isHabitBuilder: boolean;
  isSkillDominance: boolean;
  maxIntensity?: 1 | 2 | 3;
  dominanceRatio?: { p1: number; p2: number; p3?: number };
  contentMix?: { strength: number; maintenance: number };
}

// ============================================================================
// SPLIT WORKOUT CONTEXT (returned by getWorkoutContext)
// ============================================================================

export interface SplitWorkoutContext {
  splitType: SessionType;
  splitLogic: SplitLogic;
  excludedMuscleGroups: MuscleGroup[];
  dailySetBudget: number;
  lastSessionFocus?: string;
  priority1SkillIds?: string[];
  priority2SkillIds?: string[];
  /** Third-slot skill(s) for multi-skill dynamic rotation (P1+P2 fixed, P3+ rotates) */
  priority3SkillIds?: string[];
}

// ============================================================================
// SPLIT MATRIX
// ============================================================================

/**
 * 2D matrix: [frequencyIndex][levelTier] -> SessionType
 * frequencyIndex: 0=1-2 days, 1=3 days, 2=4-5 days, 3=6 days
 * levelTier: beginner(1-5), intermediate(6-13), advanced(14-25)
 */
export const SPLIT_MATRIX: Record<number, Record<LevelTier, SessionType>> = {
  0: {
    beginner: 'full_body_basic',
    intermediate: 'full_body_high',
    advanced: 'full_body_max',
  },
  1: {
    beginner: 'full_body_ab',
    intermediate: 'upper_lower',
    advanced: 'push_pull_mixed',
  },
  2: {
    beginner: 'habit_builder',
    intermediate: 'push_pull_rotation',
    advanced: 'skill_dominance',
  },
  3: {
    beginner: 'habit_builder_ultra',
    intermediate: 'push_pull_legs',
    advanced: 'hyper_skill_blocks',
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getLevelTier(userLevel: number): LevelTier {
  if (userLevel <= 5) return 'beginner';
  if (userLevel <= 13) return 'intermediate';
  return 'advanced';
}

export function getFrequencyIndex(scheduleDays: number): number {
  if (scheduleDays <= 2) return 0;
  if (scheduleDays === 3) return 1;
  if (scheduleDays <= 5) return 2;
  return 3;
}

export function resolveSplitLogic(sessionType: SessionType): SplitLogic {
  const habitBuilderTypes: SessionType[] = ['habit_builder', 'habit_builder_ultra'];
  const skillDominanceTypes: SessionType[] = [
    'push_pull_mixed',
    'skill_dominance',
    'hyper_skill_blocks',
  ];

  const isHabitBuilder = habitBuilderTypes.includes(sessionType);
  const isSkillDominance = skillDominanceTypes.includes(sessionType);

  const base: SplitLogic = {
    sessionType,
    isHabitBuilder,
    isSkillDominance,
  };

  if (isHabitBuilder) {
    base.maxIntensity = 1;
    base.contentMix = { strength: 0.5, maintenance: 0.5 };
  }

  if (isSkillDominance) {
    base.dominanceRatio = { p1: 0.65, p2: 0.35 };
  }

  return base;
}
