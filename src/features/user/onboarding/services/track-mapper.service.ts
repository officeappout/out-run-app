/**
 * Track Mapper Service
 *
 * Derives a PrimaryTrack from the user's questionnaire goals.
 * This is the single source of truth for mapping onboarding output
 * to the persona-based track system.
 *
 * Track → DashboardMode mapping:
 *   health   → DEFAULT  (WHO rings, general fitness)
 *   strength → PERFORMANCE (volume gauge, skill tracking)
 *   run      → RUNNING  (distance, pace, cardio stats)
 *   hybrid   → DEFAULT  (blended view, all rings)
 */

import type { PrimaryTrack, DashboardMode } from '@/features/user/core/types/user.types';

// ============================================================================
// GOAL → TRACK MAPPING
// ============================================================================

/**
 * Maps each questionnaire goal ID to its natural track.
 * Goal IDs come from GOAL_OPTIONS in PersonaStep.tsx:
 *   routine, aesthetics, fitness, performance, skills, community
 */
const GOAL_TO_TRACK: Record<string, PrimaryTrack> = {
  // Health-oriented goals
  routine: 'health',
  fitness: 'health',
  community: 'health',

  // Strength-oriented goals
  aesthetics: 'strength',
  performance: 'strength',
  skills: 'strength',
};

/**
 * Maps each PrimaryTrack to its corresponding DashboardMode.
 * This ensures a single, deterministic path from track to UI.
 */
const TRACK_TO_DASHBOARD: Record<PrimaryTrack, DashboardMode> = {
  health: 'DEFAULT',
  strength: 'PERFORMANCE',
  run: 'RUNNING',
  hybrid: 'DEFAULT',
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Derive the user's PrimaryTrack from their selected goal IDs.
 *
 * Algorithm:
 *  1. Score each track by counting how many selected goals map to it.
 *  2. If two tracks tie (e.g., 1 health + 1 strength), return 'hybrid'.
 *  3. If no goals match, check onboardingAnswers.primaryGoal as fallback.
 *  4. Ultimate fallback: 'health' (safest default for WHO compliance).
 *
 * @param goalIds - Array of selected goal IDs from PersonaStep (e.g., ['skills', 'fitness'])
 * @param onboardingAnswers - Optional raw onboarding answers for legacy fallback
 * @returns The derived PrimaryTrack
 */
export function derivePrimaryTrack(
  goalIds: string[],
  onboardingAnswers?: Record<string, any>,
): PrimaryTrack {
  if (!goalIds || goalIds.length === 0) {
    // Fallback: try legacy primaryGoal from onboarding answers
    const legacyGoal = onboardingAnswers?.primaryGoal as string | undefined;
    if (legacyGoal && GOAL_TO_TRACK[legacyGoal]) {
      return GOAL_TO_TRACK[legacyGoal];
    }
    return 'health'; // Safest default
  }

  // Score each track
  const scores: Record<PrimaryTrack, number> = {
    health: 0,
    strength: 0,
    run: 0,
    hybrid: 0,
  };

  for (const goalId of goalIds) {
    const track = GOAL_TO_TRACK[goalId];
    if (track) {
      scores[track]++;
    }
  }

  // Find the winning track(s)
  const maxScore = Math.max(scores.health, scores.strength, scores.run);

  if (maxScore === 0) {
    return 'health'; // No recognized goals → safe default
  }

  // Count how many tracks share the max score
  const winners = (['health', 'strength', 'run'] as PrimaryTrack[]).filter(
    (t) => scores[t] === maxScore,
  );

  if (winners.length === 1) {
    return winners[0];
  }

  // Tie between two or more tracks → hybrid
  return 'hybrid';
}

/**
 * Convert a PrimaryTrack to its corresponding DashboardMode.
 * Used when writing the user profile during onboarding sync.
 */
export function trackToDashboardMode(track: PrimaryTrack): DashboardMode {
  return TRACK_TO_DASHBOARD[track];
}
