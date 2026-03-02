/**
 * Program Hierarchy Utilities
 *
 * Manages a TTL-based program cache and resolves parent/child/ancestor
 * relationships in the program tree. Used by the Home Workout orchestrator
 * to translate a user's active program into concrete child domains for
 * exercise filtering.
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks.
 */

import { getAllPrograms } from '@/features/content/programs/core/program.service';
import type { Program } from '@/features/content/programs/core/program.types';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

// ============================================================================
// PROGRAM CACHE
// ============================================================================

let _programsCacheTs = 0;
let _programsCache: Program[] = [];
const PROGRAMS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getCachedPrograms(): Promise<Program[]> {
  const now = Date.now();
  if (_programsCache.length && now - _programsCacheTs < PROGRAMS_CACHE_TTL) {
    return _programsCache;
  }
  try {
    _programsCache = await getAllPrograms();
    _programsCacheTs = now;
  } catch (e) {
    console.warn('[HomeWorkout] Failed to load programs for hierarchy:', e);
  }
  return _programsCache;
}

// ============================================================================
// CHILD DOMAIN RESOLUTION
// ============================================================================

/** Static Master: full_body child domains (push, pull, legs, core) */
export const FULL_BODY_CHILD_DOMAINS = ['push', 'pull', 'legs', 'core'] as const;

/**
 * Resolve parent program to child domains for exercise filtering.
 * - Static Master (full_body): strictly ['push', 'pull', 'legs', 'core']
 * - Dynamic Hybrid (calisthenics_upper): from profile.progression.skillFocusIds
 * - Other: returns [activeProgramId] (no delegation)
 */
export function resolveChildDomainsForParent(
  activeProgramId: string | undefined,
  profile: UserFullProfile,
): string[] {
  if (!activeProgramId) return [];

  if (activeProgramId === 'full_body') {
    return [...FULL_BODY_CHILD_DOMAINS];
  }

  if (activeProgramId === 'calisthenics_upper') {
    const skillIds = profile.progression?.skillFocusIds;
    if (skillIds && Array.isArray(skillIds) && skillIds.length > 0) {
      return [...skillIds];
    }
    return [activeProgramId];
  }

  return [activeProgramId];
}

// ============================================================================
// ANCESTOR RESOLUTION
// ============================================================================

/**
 * Resolve ancestor (parent/grandparent) program IDs for a given child program.
 * For example: 'push' -> ['upper_body', 'full_body'] if:
 *   upper_body.subPrograms includes 'push', and
 *   full_body.subPrograms includes 'upper_body'.
 */
export async function resolveAncestorProgramIds(childProgramId: string): Promise<string[]> {
  const programs = await getCachedPrograms();
  const ancestors: string[] = [];
  const visited = new Set<string>();
  let currentId = childProgramId;

  while (true) {
    if (visited.has(currentId)) break;
    visited.add(currentId);

    const parent = programs.find(
      (p) => p.isMaster && p.subPrograms?.includes(currentId)
    );
    if (!parent) break;
    ancestors.push(parent.id);
    currentId = parent.id;
  }

  return ancestors;
}
