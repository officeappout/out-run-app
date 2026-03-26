/**
 * Level Resolution Utilities — Single Source of Truth
 *
 * Centralises ALL user-level resolution logic used by the workout engine:
 * domain levels, track levels, virtual core derivation, master derivation,
 * and global fallback.
 *
 * Every other module MUST import from here to prevent "Double Identity" bugs
 * where `.currentLevel` is checked in some places and `.level` in others.
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs.
 */

import { UserFullProfile } from '@/features/user/core/types/user.types';
import { resolveToSlug } from './program-hierarchy.utils';

// ============================================================================
// CONSTANTS
// ============================================================================

const MASTER_LEVEL_CAP = 15;
const MASTER_CHILD_TRACKS = ['push', 'pull', 'legs'] as const;

// ============================================================================
// CORE RESOLVER
// ============================================================================

/**
 * Robustly extract the numeric level from a track or domain data object.
 * Handles both `currentLevel` and `level` property names (Firestore may
 * store either depending on the migration path).
 * Returns 0 if no valid level found (distinguishes "no data" from "actual level 1").
 */
export function resolveDataLevel(data: any): number {
  if (!data) return 0;
  if (typeof data === 'number') return data;
  return data.currentLevel ?? data.level ?? 0;
}

// ============================================================================
// BASE USER LEVEL
// ============================================================================

/**
 * Get the base user level (highest effective level across all domains/tracks).
 * Checks tracks FIRST (source of truth), then domains as fallback.
 */
export function getBaseUserLevel(profile: UserFullProfile): number {
  const domains = profile.progression?.domains ?? {};
  const tracks = profile.progression?.tracks ?? {};
  let maxLevel = 1;

  const allIds = Array.from(new Set([...Object.keys(tracks), ...Object.keys(domains)]));
  for (const id of allIds) {
    const trackLevel = resolveDataLevel((tracks as Record<string, any>)[id]);
    const domainLevel = resolveDataLevel((domains as Record<string, any>)[id]);
    const effectiveLevel = (trackLevel > 1) ? trackLevel : (domainLevel || 1);
    if (effectiveLevel > maxLevel) maxLevel = effectiveLevel;
  }

  return maxLevel;
}

// ============================================================================
// TYPES
// ============================================================================

export interface ProgramLevelResult {
  /** Child-track levels used for exercise filtering (push, pull, legs, core, …). */
  levels: Map<string, number>;
  /** Display-only derived levels for master programs (e.g. full_body). */
  derivedMasterLevels: Map<string, number>;
}

// ============================================================================
// FULL PROGRAM LEVEL MAP
// ============================================================================

/**
 * Build the full userProgramLevels map from a user profile.
 *
 * Handles:
 *   1. Tracks-first resolution (tracks > 1 wins over domains)
 *   2. activePrograms fallback (default to L1 for unknown programs)
 *   3. Virtual Core derivation (avg of push/pull/legs if core=0)
 *   4. Master program exclusion (display-only aggregates)
 *   5. Per-domain integrity (each domain keeps its actual level — NO global elevation)
 *   6. Master Level Derivation — avg(push,pull,legs) capped at 15 (display only)
 */
export function buildUserProgramLevels(
  profile: UserFullProfile,
  masterProgramIds: Set<string>,
  logPrefix = '[LevelSync]',
): ProgramLevelResult {
  const userDomains = profile.progression?.domains ?? {};
  const userTracks = profile.progression?.tracks ?? {};
  const levels = new Map<string, number>();

  const allDomainIds = Array.from(new Set([
    ...Object.keys(userTracks),
    ...Object.keys(userDomains),
  ]));

  for (const domainId of allDomainIds) {
    if (masterProgramIds.has(domainId)) {
      console.log(`${logPrefix} Skipping master program "${domainId}" (display-only)`);
      continue;
    }
    const trackLevel = resolveDataLevel((userTracks as Record<string, any>)[domainId]);
    const domainLevel = resolveDataLevel((userDomains as Record<string, any>)[domainId]);
    const effectiveLevel = (trackLevel > 1) ? trackLevel : (domainLevel || 1);
    const source = (trackLevel > 1) ? 'Tracks' : (domainLevel > 0 ? 'Domains' : 'Default');
    levels.set(domainId, effectiveLevel);

    // Dual-key: also store under the slug-resolved form so lookups by
    // either Firestore doc ID or track slug always find the level.
    const slug = resolveToSlug(domainId);
    if (slug !== domainId && !levels.has(slug) && !masterProgramIds.has(slug)) {
      levels.set(slug, effectiveLevel);
      console.log(`${logPrefix} Domain '${domainId}' → slug '${slug}' dual-keyed at L${effectiveLevel} (Source: ${source})`);
    } else {
      console.log(`${logPrefix} Domain '${domainId}' resolved to L${effectiveLevel} (Source: ${source})`);
    }
  }

  for (const ap of profile.progression?.activePrograms ?? []) {
    if (ap.templateId && !levels.has(ap.templateId) && !masterProgramIds.has(ap.templateId)) {
      levels.set(ap.templateId, 1);
      console.warn(
        `${logPrefix} Program mapping not found for "${ap.templateId}" — defaulting to Level 1. ` +
        `Check progression.tracks and progression.domains.`
      );
    }
  }

  // Virtual Core Level — derive from avg of other domains if core=0
  const coreLevel = levels.get('core') ?? 0;
  if (coreLevel === 0) {
    const otherLevels = MASTER_CHILD_TRACKS
      .map(d => levels.get(d) ?? 0)
      .filter(l => l > 0);
    if (otherLevels.length > 0) {
      const derived = Math.round(otherLevels.reduce((a, b) => a + b, 0) / otherLevels.length);
      levels.set('core', derived);
      console.log(`${logPrefix} [CoreFix] core was 0 → derived ${derived} from avg(${otherLevels.join(',')})`);
    }
  }

  // Pro Athlete Core Floor: if globalLevel > 15, core and isolation
  // domains should never sit below L7.  A Level 19 athlete doing
  // knee planks is a UX failure.
  const globalMax = Math.max(...Array.from(levels.values()), 1);
  if (globalMax > 15) {
    const PRO_CORE_FLOOR = 7;
    const FLOOR_DOMAINS = ['core', 'isolation'];
    for (const fd of FLOOR_DOMAINS) {
      const current = levels.get(fd);
      if (current !== undefined && current < PRO_CORE_FLOOR) {
        levels.set(fd, PRO_CORE_FLOOR);
        console.log(
          `${logPrefix} [CoreFloor] '${fd}' elevated L${current} → L${PRO_CORE_FLOOR} (globalMax=L${globalMax}, pro floor)`,
        );
      }
    }
  }

  // Safety net: remove any master keys that may have leaked in
  Array.from(masterProgramIds).forEach(masterId => {
    if (levels.has(masterId)) {
      console.warn(`${logPrefix} Removing leaked master program "${masterId}"`);
      levels.delete(masterId);
    }
  });

  // Per-domain level integrity logging
  if (process.env.NODE_ENV !== 'production') {
    const maxLevel = Math.max(...Array.from(levels.values()), 1);
    for (const [domainId, level] of Array.from(levels.entries())) {
      if (level <= 1 && maxLevel > 3) {
        console.log(
          `${logPrefix} Domain '${domainId}' is L${level} (max across tracks: L${maxLevel})`,
        );
      }
    }
  }

  // ── Master Level Derivation (display/metadata only) ──────────────────
  // For each master program, compute avg(push, pull, legs) — core excluded
  // because it's often auto-derived itself. Capped at 15 (skill gate boundary).
  const derivedMasterLevels = new Map<string, number>();
  for (const masterId of Array.from(masterProgramIds)) {
    const childLevels = MASTER_CHILD_TRACKS
      .map(d => levels.get(d) ?? 0)
      .filter(l => l > 0);
    if (childLevels.length > 0) {
      const avg = Math.round(childLevels.reduce((a, b) => a + b, 0) / childLevels.length);
      const capped = Math.min(avg, MASTER_LEVEL_CAP);
      derivedMasterLevels.set(masterId, capped);
      console.log(
        `${logPrefix} [MasterDerive] "${masterId}" → L${capped} ` +
        `(avg of [${childLevels.join(',')}] = ${avg}, cap=${MASTER_LEVEL_CAP})`,
      );
    }
  }

  return { levels, derivedMasterLevels };
}
