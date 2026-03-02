'use client';

/**
 * Access Control Service
 * 
 * Determines a user's effective access tier and checks whether they can access
 * specific content (programs, exercises, levels).
 * 
 * Tier Logic:
 *   1 = Starter (free / anonymous)
 *   2 = Municipal (GPS-detected city affiliation)
 *   3 = Pro/Elite (school code, company, or purchased)
 * 
 * Access granted when:
 *   userTier >= resource.requiredTier   (tier-based)
 *   OR
 *   resource.id is in user.unlockedProgramIds  (purchase/code bypass)
 */

import type { UserFullProfile, AccessTier, UserAffiliation } from '../../core/types/user.types';
import type { Program, Level } from '@/features/content/programs/core/program.types';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

// ============================================================================
// CORE — Effective Access Level
// ============================================================================

/**
 * Calculate the user's effective access level using Math.max() across
 * all affiliations.  Falls back to 1 (Starter) if no affiliations exist.
 */
export function getUserAccessLevel(user: UserFullProfile | null): AccessTier {
  if (!user) return 1;

  // If explicitly set, honour it
  if (user.core.accessLevel) return user.core.accessLevel;

  const affiliations: UserAffiliation[] = user.core.affiliations || [];
  if (affiliations.length === 0) return 1;

  const maxTier = Math.max(...affiliations.map((a) => a.tier));
  return Math.min(Math.max(maxTier, 1), 3) as AccessTier;
}

// ============================================================================
// GUARDS — Can the user access a specific resource?
// ============================================================================

/**
 * Check if a user can access a resource.
 * Access is granted when:
 *   1. userTier >= resource.requiredTier   (default requiredTier = 1)
 *   2. OR resource.id is in the user's unlockedProgramIds array
 */
export function canUserAccess(
  user: UserFullProfile | null,
  resource: { id?: string; requiredTier?: number },
): boolean {
  if (!resource.requiredTier || resource.requiredTier <= 1) return true; // free content
  if (!user) return false;

  // Tier-based access
  const userLevel = getUserAccessLevel(user);
  if (userLevel >= resource.requiredTier) return true;

  // Individual unlock (purchase / promo code)
  if (resource.id && user.core.unlockedProgramIds?.includes(resource.id)) return true;

  return false;
}

// ============================================================================
// FILTERS — Filter collections by access
// ============================================================================

/**
 * Return only the programs the user can access.
 */
export function getAccessiblePrograms(
  programs: Program[],
  user: UserFullProfile | null,
): Program[] {
  return programs.filter((p) => canUserAccess(user, p));
}

/**
 * Return only the exercises the user can access.
 */
export function getAccessibleExercises(
  exercises: Exercise[],
  user: UserFullProfile | null,
): Exercise[] {
  return exercises.filter((e) => canUserAccess(user, e));
}

/**
 * Return only the levels the user can access.
 */
export function getAccessibleLevels(
  levels: Level[],
  user: UserFullProfile | null,
): Level[] {
  return levels.filter((l) => canUserAccess(user, l));
}

// ============================================================================
// HELPERS
// ============================================================================

/** Human-readable label for an access tier */
export const ACCESS_TIER_LABELS: Record<AccessTier, { he: string; en: string }> = {
  1: { he: 'סטארטר', en: 'Starter' },
  2: { he: 'עירוני', en: 'Municipal' },
  3: { he: 'פרו / עילית', en: 'Pro / Elite' },
};

/** Check if user has completed their profile (100% completion) */
export function isUserVerified(user: UserFullProfile | null): boolean {
  if (!user) return false;
  return (user.onboardingProgress ?? 0) >= 100 || user.core.isVerified === true;
}
