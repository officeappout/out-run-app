/**
 * suggestion.types — the shared `Suggestion` contract (docs/architecture/
 * workout-recommendation-engine.md §4.2). TYPES ONLY, Step 1 of the build order (§11.1).
 *
 * This is the canonical shape the branch-only `feat/home-daily-goal-v1` stub
 * (`src/features/home/utils/postWorkoutSuggestion.ts`) is meant to be superseded by — its own
 * header comment already says so. Do not build a second competing `Suggestion` shape anywhere
 * else; every surface (map/home/post-workout/nudge) constructs THIS type.
 */

import type { UserContextSurface } from './user-context.types';
import type { GeneratedWorkout } from '../../logic/WorkoutGenerator';

export type SuggestionType =
  | 'daily_workout'
  | 'post_workout'
  | 'program_recommendation'
  | 'micro_nudge';

export interface SuggestionStructure {
  warmupMin?: number;
  segments: number;
  durationMin: number;
  totalSets?: number;
}

/**
 * Per-factor ranking scores (doc §8.1). Named factors match the doc's weighted-rules table;
 * additional ad-hoc factors may be added by a generator without a type change (index
 * signature), but the named ones should stay stable — the suggestion engine (§11.5) reads
 * them by name for transparency/debugging, not just the total `score`.
 */
export interface ScoreBreakdown {
  goalMatch: number;
  gapFilling: number;
  stepDeficit: number;
  preferenceMatch: number;
  recoveryMatch: number;
  locationBonus: number;
  timeOfDayMatch: number;
  /** Not one of the doc's original 8 §8.1 factors — see rank-suggestions.ts's own
   *  alreadyTrained() (17.8 build-plan Section 1/Step 0, 25.08.2026). */
  alreadyTrained: number;
  [factor: string]: number;
}

export interface Suggestion {
  id: string;
  type: SuggestionType;

  /** Which `Generator` (§7.1) produced this — e.g. `'full-park-workout'`, `'tabata'`. */
  generatorId: string;

  title: string;
  subtitle?: string;

  structure: SuggestionStructure;

  /** Which `ProtocolMethod` ids (method.types.ts) this suggestion's workout uses. */
  methodsUsed: string[];

  difficulty: 1 | 2 | 3;
  goalTags: string[];

  /** Estimated steps/activity this suggestion would add — feeds the feedback loop (§9.4). */
  stepContribution?: number;

  surfaceEligibility: UserContextSurface[];
  requiresLocation: boolean;

  score: number;
  scoreBreakdown: ScoreBreakdown;

  /**
   * Cheap, immediately-available preview (17.8 build-plan, Section 1, 26.08.2026) — a minimal
   * GeneratedWorkout built from a targeted, single-exercise query, NOT the full generation
   * pipeline. Lets a generator rank AND render something real on the home carousel's non-focused
   * cards without paying full-pipeline cost for every candidate up front. Superseded by a real,
   * full GeneratedWorkout once the focused card is decided and (for it immediately, for the
   * others via background prefetch) each generator's own Tier-2 resolver runs — see
   * full-strength.generator.ts's resolveFullStrengthWorkout for the first concrete
   * implementation. Absent (undefined) is a normal, valid state: not every generator has a
   * cheap preview worth building (e.g. safety-net's suggestion IS its own full content already).
   */
  preview?: GeneratedWorkout;
}
