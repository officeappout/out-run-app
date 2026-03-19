/**
 * User Profile Utilities
 *
 * Pure helper functions for resolving user-profile data into
 * engine-ready primitives: persona mapping, injury extraction,
 * equipment resolution, lifestyle collection, and base level derivation.
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs.
 */

import { InjuryShieldArea, ExecutionLocation } from '@/features/content/exercises/core/exercise.types';
import { UserFullProfile } from '@/features/user/core/types/user.types';
import type { LifestylePersona } from '../logic/ContextualEngine';

// ============================================================================
// PERSONA MAPPING
// ============================================================================

/**
 * Known persona IDs that map directly to LifestylePersona values.
 * This mapping handles the transition from Firestore personaId strings
 * to the engine's LifestylePersona type.
 */
const PERSONA_ID_MAP: Record<string, LifestylePersona> = {
  parent: 'parent',
  student: 'student',
  school_student: 'school_student',
  office_worker: 'office_worker',
  home_worker: 'home_worker',
  high_tech: 'high_tech',
  senior: 'senior',
  athlete: 'athlete',
  reservist: 'reservist',
  active_soldier: 'active_soldier',
  // Aliases / legacy IDs
  busy_parent: 'parent',
  work_from_home: 'home_worker',
  soldier: 'active_soldier',
  'high-tech': 'high_tech',
};

const VALID_PERSONAS: Set<string> = new Set([
  'parent', 'student', 'school_student', 'office_worker', 'home_worker', 'high_tech', 'senior', 'athlete', 'reservist', 'active_soldier',
]);

function isLifestylePersona(value: string): boolean {
  return VALID_PERSONAS.has(value);
}

/**
 * Map a user profile's persona/lifestyle data to a LifestylePersona.
 *
 * Resolution order:
 *   1. Explicit override (from modal)
 *   2. lifestyle.lifestyleTags[0] (most specific)
 *   3. personaId field
 *   4. null (no persona)
 */
export function mapPersonaIdToLifestylePersona(
  userProfile: UserFullProfile,
  overridePersona?: LifestylePersona,
): LifestylePersona | null {
  if (overridePersona) return overridePersona;

  // Try lifestyleTags first (set during onboarding from persona selection)
  const lifestyleTags = userProfile.lifestyle?.lifestyleTags;
  if (lifestyleTags?.length) {
    const mapped = PERSONA_ID_MAP[lifestyleTags[0]];
    if (mapped) return mapped;
    // If the tag itself IS a valid LifestylePersona, use it directly
    if (isLifestylePersona(lifestyleTags[0])) return lifestyleTags[0] as LifestylePersona;
  }

  // Fallback to personaId
  if (userProfile.personaId) {
    const mapped = PERSONA_ID_MAP[userProfile.personaId];
    if (mapped) return mapped;
    if (isLifestylePersona(userProfile.personaId)) return userProfile.personaId as LifestylePersona;
  }

  return null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate the number of days since the user's last workout.
 *
 * @returns 0 if never active or active today, positive integer otherwise.
 * @see TRAINING_LOGIC.md Rule 2.3 (Reactivation Protocol)
 */
export function calculateDaysInactive(userProfile: UserFullProfile): number {
  const lastActiveDate = userProfile.progression?.lastActiveDate;

  if (!lastActiveDate) {
    return 0;
  }

  // Parse 'YYYY-MM-DD' format from Firestore
  const lastActive = new Date(lastActiveDate);
  const today = new Date();

  // Zero-out time portion for clean day diff
  lastActive.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffMs = today.getTime() - lastActive.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
}

/**
 * Extract injury shield areas from the user's health profile.
 * Returns them as typed `InjuryShieldArea[]` used by ContextualEngine.
 *
 * @see ContextualEngine.passesInjuryShield() – zero-score hard exclusion
 */
export function extractInjuryShield(
  userProfile: UserFullProfile,
  overrideInjuries?: InjuryShieldArea[],
): InjuryShieldArea[] {
  if (overrideInjuries) return overrideInjuries;
  return (userProfile.health?.injuries ?? []) as InjuryShieldArea[];
}

/**
 * Resolve available equipment based on location and user profile.
 * Returns ['bodyweight'] as a guaranteed fallback so the engine always
 * has something to work with and never crashes on an empty equipment profile.
 */
export function resolveEquipment(
  userProfile: UserFullProfile,
  location: ExecutionLocation,
  equipmentOverride?: string[],
): string[] {
  if (equipmentOverride?.length) return equipmentOverride;

  const eq = userProfile.equipment;
  let result: string[] = [];

  if (eq) {
    switch (location) {
      case 'home':
        result = eq.home ?? [];
        break;
      case 'office':
        result = eq.office ?? [];
        break;
      case 'park':
      case 'street':
        result = eq.outdoor ?? [];
        break;
      default:
        result = [];
    }
  }

  if (result.length === 0) {
    console.log(
      `[HomeWorkout] Empty equipment profile for location "${location}" — defaulting to bodyweight`,
    );
    return ['bodyweight'];
  }

  return result;
}

/**
 * Collect all lifestyle personas for the user (primary + extras from tags).
 */
export function collectLifestyles(
  userProfile: UserFullProfile,
  primaryPersona: LifestylePersona | null,
): LifestylePersona[] {
  const lifestyles = new Set<LifestylePersona>();

  if (primaryPersona) lifestyles.add(primaryPersona);

  const tags = userProfile.lifestyle?.lifestyleTags ?? [];
  for (const tag of tags) {
    if (isLifestylePersona(tag)) {
      lifestyles.add(tag as LifestylePersona);
    }
  }

  return Array.from(lifestyles).slice(0, 3); // Max 3
}

/**
 * Derive the base user level (used for WorkoutGenerator volume calc).
 * Re-exported from level-resolution.utils.ts (Single Source of Truth).
 */
export { getBaseUserLevel } from './level-resolution.utils';

/**
 * Ensure the core track has a level even when the user didn't assess core.
 * Derives a "Virtual Core Level" from the average of push, pull, and legs.
 * Returns the original tracks if core already has a level > 0.
 */
export function ensureVirtualCoreLevel(
  tracks: Record<string, { currentLevel: number; percent: number }>,
): Record<string, { currentLevel: number; percent: number }> {
  const coreLevel = tracks.core?.currentLevel ?? 0;
  if (coreLevel > 0) return tracks;

  const assessed = (['push', 'pull', 'legs'] as const)
    .map(k => tracks[k]?.currentLevel ?? 0)
    .filter(l => l > 0);

  if (assessed.length === 0) return tracks;

  const virtualCore = Math.round(assessed.reduce((a, b) => a + b, 0) / assessed.length);
  return {
    ...tracks,
    core: { currentLevel: virtualCore, percent: 0 },
  };
}
