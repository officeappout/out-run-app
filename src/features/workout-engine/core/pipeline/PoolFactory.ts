/**
 * PoolFactory — Candidate Pool Builder
 *
 * Responsible for a single, well-defined transformation:
 *
 *   Exercise[]  +  ContextualFilterContext  →  CandidatePool
 *
 * Migrated from the inline `filterAndScore` + pool-rescue block inside
 * `_buildSharedPipeline` (home-workout.service.ts lines 1257–1281).
 *
 * Responsibilities:
 *   1. Run `ContextualEngine.filterAndScore()` with the provided context
 *   2. PoolRescue retry: if strategy === 'single_domain' and the filtered
 *      count falls below MIN_HEALTHY_POOL (6), expand levelTolerance to ±5
 *      and re-run — only if the expanded pass yields more candidates
 *   3. Onboarding Safety Guard: if ALL userProgramLevels entries are ≤ 1
 *      the profile is likely still mid-write from the background
 *      recalculateAncestorMasters call (non-awaited before router.replace).
 *      Flag `profileStale: true`; generation proceeds with L1 defaults
 *   4. Expose `findLevelAppropriateSubstitute` — migrated from WorkoutGenerator.ts
 *      line 321. Used by PoolFactory for balance-complement slot resolution and
 *      re-exported for WorkoutGenerator backward compat while the migration
 *      is still in progress
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs.
 */

import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import { getLocalizedText } from '@/features/content/exercises/core/exercise.types';
import type {
  ScoredExercise,
  ContextualFilterContext,
} from '../../logic/contextual-engine.types';
import { createContextualEngine } from '../../logic/ContextualEngine';
import type { DifficultyLevel } from '../../logic/workout-generator.types';
import { resolveToSlug } from '../../services/program-hierarchy.utils';
import type { CandidatePool, SessionStrategy } from './pipeline.types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Minimum candidate count before the PoolRescue retry fires */
export const MIN_HEALTHY_POOL = 6;

/** Expanded level tolerance used in the rescue retry */
export const EXPANDED_LEVEL_TOLERANCE = 5;

// ============================================================================
// LEVEL SUBSTITUTE RESULT
// ============================================================================

/** Return type for findLevelAppropriateSubstitute */
export interface LevelSubstituteResult {
  exercise: Exercise;
  level: number;
  gap: number;
  radius: number;
}

// ============================================================================
// POOL FACTORY
// ============================================================================

export class PoolFactory {
  /**
   * Build a CandidatePool from the raw exercise database.
   *
   * The `filterContext` object is mutated in-place for the rescue retry
   * (levelTolerance expanded). Callers that need to reuse the original
   * context should pass a shallow clone: `{ ...filterContext }`.
   *
   * @param exercises        Full exercise DB
   * @param filterContext    Pre-built contextual filter config
   * @param userProgramLevels  Per-domain level map (for profileStale check)
   * @param strategy         Session strategy (drives PoolRescue eligibility)
   */
  build(
    exercises: Exercise[],
    filterContext: ContextualFilterContext,
    userProgramLevels: Map<string, number> | undefined,
    strategy: SessionStrategy,
  ): CandidatePool {
    const engine = createContextualEngine();

    // ── Pass 1: initial filter + score ───────────────────────────────────────
    let filterResult = engine.filterAndScore(exercises, filterContext);
    let toleranceExpanded = false;

    // ── PoolRescue: single-domain + low pool ─────────────────────────────────
    // When a focused track (Pull-only, Push-only, etc.) yields fewer candidates
    // than the healthy threshold after the default ±3 tolerance pass, widen the
    // level window and re-run. Only fires for single_domain to avoid inflating
    // full-body or multi-domain sessions where a small pool may be intentional.
    if (strategy === 'single_domain' && filterResult.exercises.length < MIN_HEALTHY_POOL) {
      const originalTolerance = filterContext.levelTolerance;
      filterContext.levelTolerance = EXPANDED_LEVEL_TOLERANCE;
      const expanded = engine.filterAndScore(exercises, filterContext);

      if (expanded.exercises.length > filterResult.exercises.length) {
        console.log(
          `[PoolFactory][PoolRescue] Expanded level tolerance ` +
          `±${originalTolerance} → ±${EXPANDED_LEVEL_TOLERANCE}: ` +
          `${filterResult.exercises.length} → ${expanded.exercises.length} candidates ` +
          `(strategy=${strategy})`,
        );
        filterResult = expanded;
        toleranceExpanded = true;
      } else {
        // Rescue did not help — restore original tolerance to keep logs honest
        filterContext.levelTolerance = originalTolerance ?? 3;
        console.log(
          `[PoolFactory][PoolRescue] Expansion did not improve pool ` +
          `(${filterResult.exercises.length} candidates); original tolerance restored`,
        );
      }
    }

    // ── Onboarding Safety Guard ───────────────────────────────────────────────
    const profileStale = PoolFactory.detectProfileStale(userProgramLevels);
    if (profileStale) {
      console.warn(
        `[PoolFactory] ⚠️ profileStale: all userProgramLevels are L≤1 — ` +
        `onboarding background sync (recalculateAncestorMasters) may still be in flight. ` +
        `Proceeding with L1 defaults; workout will regenerate on next mount.`,
      );
    }

    const scored = filterResult.exercises;
    const totalCandidates = scored.length;
    const excludedCount = filterResult.excludedCount ?? 0;

    // Build candidates map
    // Phase 5.B: slot-specific mapping when PoolFactory fully drives slot resolution
    // For now: single '__shared__' key carries the entire scored pool,
    // consumed by PipelineOrchestrator as the monolithic input to WorkoutGenerator.
    const candidates = new Map<string, ScoredExercise[]>([
      ['__shared__', scored],
    ]);

    const filterCounts = filterResult.filterCounts ?? {
      pool_start:                    exercises.length,
      excluded_program_filter:       0,
      excluded_level_tolerance:      0,
      excluded_skill_gate:           0,
      excluded_exclusive_skill_gate: 0,
      excluded_balance_gate:         0,
      excluded_injury_shield:        0,
      excluded_48h_muscle:           0,
      excluded_field_mode:           0,
      excluded_location:             0,
      excluded_sweat:                0,
      excluded_noise:                0,
      after_hard_filters:            totalCandidates,
    };

    return {
      candidates,
      filterCounts,
      toleranceExpanded,
      profileStale,
      totalCandidates,
      excludedCount,
    };
  }

  // ── Static helpers ─────────────────────────────────────────────────────────

  /**
   * Returns true when every value in `userProgramLevels` is ≤ 1.
   * This indicates the profile may be mid-write from the onboarding background
   * sync (recalculateAncestorMasters is non-awaited before router.replace('/home')).
   */
  static detectProfileStale(levels: Map<string, number> | undefined): boolean {
    return !levels || levels.size === 0 ? false : Array.from(levels.values()).every(v => v <= 1);
  }
}

// ============================================================================
// FIND LEVEL APPROPRIATE SUBSTITUTE
// Migrated from WorkoutGenerator.ts line 321.
// WorkoutGenerator re-imports this from here while the full migration is
// still in progress (no circular deps: PoolFactory → logic, WorkoutGenerator → core/pipeline).
// ============================================================================

/**
 * Progressive-radius level-appropriate exercise substitute finder.
 *
 * Selection algorithm:
 *   Radius pass 1 (±2): ideal level fit
 *   Radius pass 2 (±4): widened tolerance
 *   Radius pass 3 (±6): hard outer bound (skip if nothing found here)
 *
 * Directional gap bias:
 *   bolt 1 (Easy)  — above-level exercises get +3 penalty → prefer below-level
 *   bolt 3 (Hard)  — below-level exercises get +3 penalty → prefer at/above-level
 *
 * Domain filter: when `domain` is supplied, only targetPrograms entries whose
 * programId slug matches are considered — prevents foreign-domain level leaks
 * (e.g. push L16 + planche L7 from the same exercise sneaking in via planche).
 *
 * Strict domain mode: when `strictDomainMatch` is true AND `domain` is provided,
 * any exercise that has targetPrograms but NONE matching the domain is immediately
 * excluded.  This closes the loophole where multi-keyed exercises without a
 * domain-specific entry could otherwise be evaluated via a foreign-domain level
 * (e.g. full_body L14 sneaking into a pull L16 slot).
 *
 * Returns null when no candidate exists within ±6 — callers MUST NOT inject
 * a wildly off-level exercise in that case.
 */
export function findLevelAppropriateSubstitute(
  pool: Exercise[],
  targetGroup: string,
  domainLevel: number,
  usedIds: Set<string>,
  _userLevelsMap: Map<string, number> | undefined,
  domain: string | undefined,
  difficulty?: DifficultyLevel,
  strictDomainMatch = false,
): LevelSubstituteResult | null {
  const RADII = [2, 4, 6] as const;

  const groupCandidates = pool.filter(
    ex => ex.movementGroup === targetGroup && !usedIds.has(ex.id),
  );

  if (groupCandidates.length === 0) return null;

  type Flat = { exercise: Exercise; level: number; gap: number };

  const flatten = (ex: Exercise): Flat[] => {
    const programs = ex.targetPrograms ?? [];

    if (domain) {
      const domainMatches = programs.filter(tp => {
        const slug = resolveToSlug(tp.programId);
        return slug === domain || tp.programId === domain;
      });

      if (domainMatches.length > 0) {
        // Evaluate strictly against the domain-specific entry only.
        return domainMatches.map(tp => {
          const rawGap = Math.abs(tp.level - domainLevel);
          const DIRECTION_PENALTY = 3;
          let gap = rawGap;
          if (difficulty === 1 && tp.level > domainLevel) gap = rawGap + DIRECTION_PENALTY;
          if (difficulty === 3 && tp.level < domainLevel) gap = rawGap + DIRECTION_PENALTY;
          return { exercise: ex, level: tp.level, gap };
        });
      }

      // No matching domain entry found.
      if (strictDomainMatch) {
        // Strict mode: exclude exercises without a domain-specific entry.
        // Prevents multi-keyed exercises from being scored via a foreign-domain
        // level (e.g. full_body L14 leaking into a pull L16 slot).
        return [];
      }

      // Non-strict / no domain: fall through to evaluate all program entries.
    }

    // Evaluate against all targetPrograms entries (legacy / non-domain path).
    return programs.map(tp => {
      const rawGap = Math.abs(tp.level - domainLevel);
      const DIRECTION_PENALTY = 3;
      let gap = rawGap;
      if (difficulty === 1 && tp.level > domainLevel) gap = rawGap + DIRECTION_PENALTY;
      if (difficulty === 3 && tp.level < domainLevel) gap = rawGap + DIRECTION_PENALTY;
      return { exercise: ex, level: tp.level, gap };
    });
  };

  const allFlat: Flat[] = groupCandidates.flatMap(flatten);

  for (const radius of RADII) {
    const inRange = allFlat.filter(c => c.gap <= radius);
    if (inRange.length === 0) continue;

    inRange.sort((a, b) => {
      if (a.gap !== b.gap) return a.gap - b.gap;

      // Directional tie-break
      if (difficulty === 1) {
        const aAbove = a.level > domainLevel;
        const bAbove = b.level > domainLevel;
        if (aAbove !== bAbove) return aAbove ? 1 : -1;
      }
      if (difficulty === 3) {
        const aBelow = a.level < domainLevel;
        const bBelow = b.level < domainLevel;
        if (aBelow !== bBelow) return aBelow ? 1 : -1;
      }

      return difficulty === 1 ? a.level - b.level : b.level - a.level;
    });

    const best = inRange[0];
    console.log(
      `[findLevelSub] ✅ ${targetGroup}: picked "${getLocalizedText(best.exercise.name)}" ` +
      `L${best.level} (gap=${best.gap}, radius=±${radius}, domain=${domain ?? '?'} L${domainLevel}, D${difficulty ?? 2})`,
    );
    return { exercise: best.exercise, level: best.level, gap: best.gap, radius };
  }

  console.warn(
    `[findLevelSub] ❌ ${targetGroup}: no candidate within ±6 of L${domainLevel} ` +
    `(${groupCandidates.length} candidates checked, domain=${domain ?? '?'})`,
  );
  return null;
}

// ============================================================================
// FILTER FOR DOMAIN
// Domain-strict post-filter for a pre-scored exercise pool.
//
// Addresses the context-blind level evaluation bug:
//   The ContextualEngine's shared `filterAndScore()` pass uses
//   `getUserLevelForExercise`, which can match the FIRST program entry whose
//   slug resolves to any active domain.  For a multi-keyed exercise that has
//   {programId: 'full_body', level: 14} AND {programId: 'pull', level: 2},
//   the engine may score it against the user's full_body level (L16) giving
//   gap = 2 — well within tolerance — even though its pull level (L2) is 14
//   levels below the user's pull level (L16).
//
//   By running this filter after the shared pool is built (before passing to
//   WorkoutGenerator for selection), we enforce that only exercises whose
//   domain-specific entry is within `toleranceRadius` of the user's domain
//   level can appear in domain-specific workout slots.
//
// Semantics:
//   • Exercise has a domain entry           → keep only if |entry.level – userDomainLevel| ≤ radius
//   • Exercise has NO domain entry at all
//       – programs array is empty (legacy/unkeyed)  → pass through (no domain metadata to gate on)
//       – programs array is non-empty but no match  → EXCLUDE (has programs but wrong domain)
// ============================================================================

/**
 * Post-filters a pre-scored exercise pool to only include exercises that are
 * level-appropriate for the given domain slot.
 *
 * @param scoredExercises    The shared pool from ContextualEngine.filterAndScore()
 * @param domain             Target domain slug (e.g. 'pull', 'push', 'legs')
 * @param userDomainLevel    User's actual level in that domain
 * @param toleranceRadius    Level tolerance radius (typically 3; 5 when rescue fired)
 * @param additionalSlugs    Optional skill-track slugs that are biomechanically part
 *                           of `domain` (e.g. ['planche'] for push, ['front_lever'] for
 *                           pull).  An exercise whose targetPrograms entry matches one
 *                           of these slugs is kept even when no `domain` entry exists —
 *                           the level check is performed against that skill track's user
 *                           level from `userProgramLevels`, falling back to `userDomainLevel`
 *                           when the skill is not yet in the map.
 * @param userProgramLevels  Per-track level map from the generation context.  Required
 *                           for accurate per-skill level evaluation when `additionalSlugs`
 *                           is provided; has no effect when `additionalSlugs` is absent.
 */
export function filterForDomain(
  scoredExercises: ScoredExercise[],
  domain: string,
  userDomainLevel: number,
  toleranceRadius: number,
  additionalSlugs?: string[],
  userProgramLevels?: Map<string, number>,
): ScoredExercise[] {
  const hasAdditional = additionalSlugs && additionalSlugs.length > 0;

  return scoredExercises.filter(ex => {
    const programs = ex.exercise.targetPrograms ?? [];

    // Legacy / unkeyed exercises have no program metadata — pass through.
    if (programs.length === 0) return true;

    // Find this exercise's level entry for the primary target domain.
    const domainEntry = programs.find(tp => {
      const slug = resolveToSlug(tp.programId);
      return slug === domain || tp.programId === domain;
    });

    if (domainEntry) {
      // Enforce primary domain-specific level proximity.
      return Math.abs(domainEntry.level - userDomainLevel) <= toleranceRadius;
    }

    // No primary domain entry — check additional skill-track slugs.
    // This handles multi-skill hybrid sessions (e.g. calisthenics_upper) where
    // exercises are tagged with a granular skill slug ('planche', 'front_lever')
    // rather than the foundational domain slug ('push', 'pull').  The exercise is
    // kept if it has an entry for ANY of the provided skill-track slugs AND that
    // entry is within tolerance of the user's level for that specific track.
    if (hasAdditional) {
      for (const tp of programs) {
        const slug = resolveToSlug(tp.programId);
        const matched = additionalSlugs!.includes(slug) || additionalSlugs!.includes(tp.programId);
        if (matched) {
          // Use the user's level for this specific skill track when available;
          // fall back to the parent domain level as a safe proxy.
          const skillKey = additionalSlugs!.includes(slug) ? slug : tp.programId;
          const userSkillLevel = userProgramLevels?.get(skillKey) ?? userDomainLevel;
          return Math.abs(tp.level - userSkillLevel) <= toleranceRadius;
        }
      }
    }

    // Exercise has program entries but NONE for the requested domain or any
    // allowed skill-track slugs.  Exclude it to prevent foreign-domain level
    // evaluations (e.g. full_body L14) from qualifying a wrong-domain exercise.
    return false;
  });
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Returns a fresh PoolFactory instance.
 * Stateless factory pattern — each call produces an isolated instance.
 */
export function createPoolFactory(): PoolFactory {
  return new PoolFactory();
}
