/**
 * Visual Assessment System — Type Definitions
 *
 * Covers three Firestore collections:
 *   1. visual_assessment_content  — videos/text per category+level
 *   2. assessment_rules           — data-driven branching rules
 *   3. program_thresholds         — data-driven program mapping
 */

import { MultilingualText } from '@/types/onboarding-questionnaire';

// ════════════════════════════════════════════════════════════════════
// 1. Visual Assessment Content
// ════════════════════════════════════════════════════════════════════

/**
 * Primary categories that every assessment uses.
 * Custom admin-defined categories (e.g. 'handstand', 'skills') are
 * stored as plain strings, so the resolver accepts `string` too.
 */
export type AssessmentCategory = 'push' | 'pull' | 'legs' | 'core';

/** A single video variant stored inside a content document. */
export interface VideoVariant {
  id: string;
  /** Legacy / fallback URL (still supported). */
  videoUrl: string;
  /** HEVC-with-Alpha for iOS / Safari (.mov). */
  videoUrlMov?: string;
  /** VP9-with-Alpha for Android / Chrome / Firefox (.webm). */
  videoUrlWebm?: string;
  thumbnailUrl?: string;
  gender: 'male' | 'female' | 'all';
  ageRange: {
    min: number;
    max: number;
  };
  isDefault: boolean;
}

/**
 * One document in `visual_assessment_content`.
 * Document ID format: `{category}_{level}` (e.g. `push_5`).
 */
export interface VisualAssessmentContent {
  id: string;
  category: string;          // AssessmentCategory or custom admin-defined
  level: number;             // 1-25
  videoVariants: VideoVariant[];
  boldTitle: MultilingualText;
  detailedDescription: MultilingualText;
  /** Links this visual content to a specific program in the training DB. */
  linkedProgramId?: string;
  /** Links to a specific level within the linked program. */
  linkedLevelId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ════════════════════════════════════════════════════════════════════
// 2. Assessment Rules (Data-Driven Branching)
// ════════════════════════════════════════════════════════════════════

export type ComparisonOperator = '>' | '>=' | '<' | '<=' | '==' | '!=';

export interface RuleCondition {
  field: 'push' | 'pull' | 'legs' | 'core' | 'average';
  operator: ComparisonOperator;
  value: number;
}

/**
 * Level mode determines how the user's starting level is set.
 *
 * - `'manual'`  — A fixed Level ID is assigned (child / standalone programs).
 * - `'auto'`    — The user's per-category sub-levels (push, pull, legs, core)
 *                 are written to `progression.tracks` and the parent program's
 *                 level is computed by the existing engine via
 *                 `recalculateAncestorMasters()`.
 */
export type LevelMode = 'manual' | 'auto';

export interface RuleAction {
  type:
    | 'BRANCH_TO_FOLLOW_UP'
    | 'SKIP_TO_RESULT'
    | 'INJECT_QUESTIONS'
    | 'SKIP_CATEGORY'
    | 'SET_PROGRAM_TRACK';
  /** Categories to display in the follow-up slider screen. */
  followUpCategories?: string[];
  followUpTitle?: MultilingualText;
  followUpDescription?: MultilingualText;
  /** Override the program assignment when action is SKIP_TO_RESULT. */
  forceProgramId?: string;
  /**
   * How the starting level is determined for SKIP_TO_RESULT.
   * Defaults to 'manual' for backward compatibility.
   */
  forceLevelMode?: LevelMode;
  /** Static level used only when forceLevelMode === 'manual'. */
  forceLevelId?: string;
  /**
   * For INJECT_QUESTIONS: question IDs to add into the flow.
   * The engine will insert them after the current question.
   */
  injectQuestionIds?: string[];
  /**
   * For SKIP_CATEGORY: category tags to skip.
   * Questions whose `logic.category` matches any of these tags are hidden.
   */
  skipCategories?: string[];
  /**
   * For SET_PROGRAM_TRACK: the primary track to assign to the user.
   * Written to lifestyle.primaryTrack and lifestyle.dashboardMode on onboarding completion.
   */
  programTrack?: 'health' | 'strength' | 'run' | 'hybrid';
}

/** One document in `assessment_rules`. */
export interface AssessmentRule {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  priority: number;
  conditions: RuleCondition[];
  action: RuleAction;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
}

// ════════════════════════════════════════════════════════════════════
// 3. Program Thresholds (Data-Driven Program Mapping)
// ════════════════════════════════════════════════════════════════════

export interface ThresholdCondition {
  type: 'AND' | 'OR';
  checks: {
    field: 'push' | 'pull' | 'legs' | 'core' | 'average';
    operator: ComparisonOperator;
    value: number;
  }[];
}

/** One document in `program_thresholds`. */
export interface ProgramThreshold {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  priority: number;
  averageRange?: {
    min: number;
    max: number;
  };
  conditions?: ThresholdCondition[];
  programId: string;
  /**
   * How the starting level is determined.
   * - `'manual'`  — Use the static `levelId` (child / standalone programs).
   * - `'auto'`    — Write per-category sub-levels and let the engine compute
   *                  the parent program level.
   * Defaults to 'manual' for backward compatibility.
   */
  levelMode: LevelMode;
  /** Static level — only used when levelMode === 'manual'. */
  levelId: string;
  displayName: MultilingualText;
  displayDescription?: MultilingualText;
  createdAt?: Date;
  updatedAt?: Date;
}

// ════════════════════════════════════════════════════════════════════
// 4. Shared helpers
// ════════════════════════════════════════════════════════════════════

export interface AssessmentLevels {
  push: number;
  pull: number;
  legs: number;
  core: number;
  [key: string]: number;     // support custom categories
}

export interface UserDemographics {
  age: number;
  gender: 'male' | 'female';
}

// ════════════════════════════════════════════════════════════════════
// 5. Assessment Context (passed to the Dynamic Questionnaire Engine)
// ════════════════════════════════════════════════════════════════════

/**
 * Snapshot of the visual-assessment results that the Dynamic Questionnaire
 * Engine uses for branching logic (visibility conditions & rule overrides).
 *
 * Stored in sessionStorage under `onboarding_assessment_context`.
 */
export interface AssessmentContext {
  /** Per-category levels from the visual slider (1–25). */
  levels: AssessmentLevels;
  /** Average of Push + Pull + Legs (Core excluded). */
  average: number;
  /** Tier selected in the first step of the visual assessment. */
  tier: 'beginner' | 'intermediate' | 'advanced';
  /** If an assessment rule matched, its ID. */
  matchedRuleId?: string;
  /** The action type that the matched rule triggered. */
  matchedRuleAction?: string;
  /** Categories that rules dictate should be skipped in the questionnaire. */
  skippedCategories?: string[];
  /** Extra question IDs that rules dictate should be injected. */
  injectedQuestionIds?: string[];
  /** When a SET_PROGRAM_TRACK rule fires, the track override to persist. */
  programTrack?: 'health' | 'strength' | 'run' | 'hybrid';
}
