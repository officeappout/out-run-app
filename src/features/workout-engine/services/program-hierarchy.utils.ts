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
// FIRESTORE ID → SLUG MAP
// ============================================================================

/**
 * Bi-directional map between Firestore program doc IDs and track slugs.
 *
 * Exercises in Firestore use document IDs (e.g. 'J0fLpmJhG0KDN2tQouxh') as
 * their targetPrograms.programId. User progression tracks use slugs ('push',
 * 'pull', 'legs', 'core'). This map bridges the gap.
 *
 * Slug priority:
 *   1. program.movementPattern ('push' | 'pull' | 'legs' | 'core')
 *   2. Lowercased/underscored program.name (e.g. 'Full Body' → 'full_body')
 */
let _idToSlugMap: Map<string, string> | null = null;
let _slugToIdMap: Map<string, string> | null = null;
let _slugMapTs = 0;

export async function getIdToSlugMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (_idToSlugMap && now - _slugMapTs < PROGRAMS_CACHE_TTL) return _idToSlugMap;
  const programs = await getCachedPrograms();
  _idToSlugMap = new Map<string, string>();
  _slugToIdMap = new Map<string, string>();
  for (const p of programs) {
    const slug = p.movementPattern || p.name.toLowerCase().replace(/[\s-]+/g, '_');
    _idToSlugMap.set(p.id, slug);
    if (!_slugToIdMap.has(slug)) _slugToIdMap.set(slug, p.id);
  }
  _slugMapTs = now;
  return _idToSlugMap;
}

export async function getSlugToIdMap(): Promise<Map<string, string>> {
  if (!_slugToIdMap) await getIdToSlugMap();
  return _slugToIdMap!;
}

/**
 * Synchronous version — only works AFTER getCachedPrograms() has been called.
 * Returns null if the map hasn't been built yet.
 */
export function getIdToSlugMapSync(): Map<string, string> | null {
  return _idToSlugMap;
}

/**
 * Build the map synchronously from an already-loaded programs array.
 * Call this right after getCachedPrograms() to make the sync getter available.
 *
 * Also registers each Firestore ID → slug in the KNOWN_SLUG_PATTERNS cache
 * so resolveToSlug can do a hardcoded fallback even after cache eviction.
 */
export function buildIdToSlugMapFromPrograms(programs: Program[]): Map<string, string> {
  _idToSlugMap = new Map<string, string>();
  _slugToIdMap = new Map<string, string>();
  for (const p of programs) {
    const slug = p.movementPattern || p.name.toLowerCase().replace(/[\s-]+/g, '_');
    _idToSlugMap.set(p.id, slug);
    KNOWN_SLUG_PATTERNS[p.id] = slug;
    if (!_slugToIdMap.has(slug)) _slugToIdMap.set(slug, p.id);
  }
  _slugMapTs = Date.now();

  if (process.env.NODE_ENV !== 'production') {
    const entries = Array.from(_idToSlugMap.entries()).map(([id, s]) => `${id.slice(0, 8)}…→${s}`);
    console.log(`[buildIdToSlugMap] Built ${_idToSlugMap.size} entries: [${entries.join(', ')}]`);
  }

  return _idToSlugMap;
}

/**
 * Look up the user's level for a given Firestore program ID using the
 * userProgramLevels map. Resolves through three layers:
 *   1. Direct key match (Firestore ID or slug)
 *   2. Firestore ID → slug via resolveToSlug
 *   3. Slug alias (pulling → pull, etc.)
 *
 * Returns undefined when no match is found (caller decides the fallback).
 */
export function resolveUserLevelFromMap(
  programId: string,
  userProgramLevels: Map<string, number>,
  slugAlias?: Record<string, string[]>,
): number | undefined {
  const direct = userProgramLevels.get(programId);
  if (direct !== undefined) return direct;

  const slug = resolveToSlug(programId);
  if (slug !== programId) {
    const slugLevel = userProgramLevels.get(slug);
    if (slugLevel !== undefined) return slugLevel;
    if (slugAlias) {
      const aliases = slugAlias[slug];
      if (aliases) {
        const levels = aliases.map(a => userProgramLevels.get(a)).filter((l): l is number => l !== undefined);
        if (levels.length > 0) return Math.max(...levels);
      }
    }
  }

  if (slugAlias) {
    const aliases = slugAlias[programId];
    if (aliases) {
      const levels = aliases.map(a => userProgramLevels.get(a)).filter((l): l is number => l !== undefined);
      if (levels.length > 0) return Math.max(...levels);
    }
  }

  return undefined;
}

/**
 * Hardcoded category check: catches well-known Firestore IDs even when
 * the slug map hasn't been built or is missing an entry. This is the
 * absolute last-resort — prevents L1 fallbacks for core program domains.
 */
const KNOWN_SLUG_PATTERNS: Record<string, string> = {};
const KNOWN_SLUGS = new Set(['push', 'pull', 'legs', 'core', 'planche', 'front_lever', 'handstand', 'oap', 'hspu', 'full_body', 'upper_body', 'lower_body', 'calisthenics_upper']);

/**
 * Resolve a programId (which may be a Firestore doc ID) to its track slug.
 * If the ID is already a known slug (e.g. 'push'), returns it as-is.
 *
 * Safety layers:
 *   1. Direct map lookup (primary path — fast)
 *   2. Known-slug passthrough (ID is already a slug like 'push')
 *   3. Dev-mode error when map is null (catch lifecycle bugs early)
 */
export function resolveToSlug(programId: string): string {
  // Fast path: ID is already a known slug
  if (KNOWN_SLUGS.has(programId)) return programId;

  if (!_idToSlugMap) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(
        `[resolveToSlug] ❌ ID→Slug map is NULL — buildIdToSlugMapFromPrograms was never called! ` +
        `programId="${programId}" will pass through as-is. Fix the call order.`,
      );
    }
    return programId;
  }

  const slug = _idToSlugMap.get(programId);
  if (slug) return slug;

  // Map exists but ID wasn't found — likely an orphan Firestore ID
  if (_idToSlugMap.size > 0 && programId.length > 15 && !programId.includes('_')) {
    // Looks like a Firestore doc ID (long alphanumeric, no underscores)
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[resolveToSlug] ⚠️ Firestore ID "${programId}" not found in slug map ` +
        `(${_idToSlugMap.size} entries). Returning as-is — exercise may get wrong level.`,
      );
    }
  }

  return programId;
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
