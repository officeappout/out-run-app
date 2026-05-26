/**
 * Workout Engine — Input Sanitizer Middleware (Tier 1)
 *
 * Tier 1 of the 3-Tier Clean Architecture.  Owns ALL input pre-processing
 * that the deterministic pipeline (Tier 2) and the presentation layer
 * (Tier 3) require.  No domain logic lives here — every function is a
 * pure transform that converts caller input into the exact shape the
 * downstream engine expects.
 *
 * Responsibilities:
 *   A. normalizeEquipmentArray       — single source of truth for
 *                                      ESSENTIAL_PARK_GEAR catastrophic
 *                                      fallback + park/gym injection
 *                                      + dedup.  After this runs,
 *                                      ContextualEngine.findMatchingMethod
 *                                      receives a non-empty normalized
 *                                      availableEquipment array and no
 *                                      longer needs its own fallback.
 *   B. buildActiveProgramFilters     — shadow-matrix overrides + child
 *                                      domain expansion + skill-track
 *                                      sibling expansion (Anomaly-1
 *                                      fix).  Returns both the expanded
 *                                      filter array and the original
 *                                      `baseDomainCount` so the caller
 *                                      can derive `isSingleDomain`.
 *   C. resolveExercisePool           — ±3 level tolerance pre-filter +
 *                                      per-domain rescue pool.  Falls
 *                                      back to the full exercise list
 *                                      when fewer than 4 exercises
 *                                      survive.
 *   D. resolveEffectiveDifficulty    — periodization clock + detraining
 *                                      lock + first-session guard.
 *                                      Resolves the FINAL difficulty
 *                                      that the deterministic pipeline
 *                                      consumes, so `generateWorkout()`
 *                                      never re-derives it.
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs.
 */

import type { Exercise, ExecutionLocation } from '@/features/content/exercises/core/exercise.types';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import type { Program } from '@/features/content/programs/core/program.types';
import { ESSENTIAL_PARK_GEAR } from '../../shared/utils/gear-mapping.utils';
import type { ShadowMatrix } from '../../services/shadow-level.utils';
import { resolveEquipment } from '../../services/user-profile.utils';
import {
  resolveChildDomainsForParent,
  resolveToSlug,
} from '../../services/program-hierarchy.utils';
import type { SessionPolicy } from '../../services/periodization.service';
import type { DifficultyLevel } from '../../logic/workout-generator.types';

// ============================================================================
// FUNCTION A — Equipment Normalization
// ============================================================================

/**
 * Build the canonical, deduplicated `availableEquipment` array consumed
 * by ContextualEngine and downstream gear gating.
 *
 * Composition order (later items override earlier dedup but all coexist
 * in the final Set):
 *   1. `resolveEquipment(profile, location, equipmentOverride)` —
 *      always returns at least `['bodyweight']` so the array is never
 *      empty.
 *   2. Gym catalog injection — only when `location === 'gym'` so that
 *      Park / Home / Street sessions never gain access to the user's
 *      gym-only inventory.
 *   3. Park / Street fixtures —
 *        a. Real `parkEquipmentIds` when provided.
 *        b. ESSENTIAL_PARK_GEAR catastrophic fallback when no park
 *           inventory was resolved (canonical place this fires).
 *      Plus universal outdoor fixtures (`park_bench`, `park_step`).
 *
 * The result is deduplicated via `new Set(...)` so the array is stable
 * regardless of overlap between the user's profile equipment, the gym
 * catalog, and the park fixtures.
 *
 * Post-condition: returned array is **always non-empty** and **always
 * contains canonical (unnormalized) gear IDs**.  Callers that need
 * canonical IDs should map through `normalizeGearId` from
 * `gear-mapping.utils.ts`.
 */
export function normalizeEquipmentArray(
  profile: UserFullProfile,
  location: ExecutionLocation,
  parkEquipmentIds: string[] | undefined,
  gymEquipmentList: GymEquipment[],
  equipmentOverride?: string[],
): string[] {
  let availableEquipment = [
    ...resolveEquipment(profile, location, equipmentOverride),
    // Only inject the full gym catalog when the user is actually at a gym.
    // For park/home/street, injecting the entire catalog would grant access
    // to resistance_bands, rings, TRX, etc. that the user doesn't own.
    ...(location === 'gym' ? gymEquipmentList.map(eq => eq.id) : []),
  ];

  if (location === 'park' || location === 'street') {
    if (parkEquipmentIds?.length) {
      // Real park inventory is the primary source of truth.
      // Universal outdoor fixtures (bench, step) are additive regardless.
      availableEquipment = [
        ...availableEquipment,
        ...parkEquipmentIds,
        'park_bench',
        'park_step',
      ];
      console.log(
        `[InputSanitizer] 🏞️ Park inventory (real): [${parkEquipmentIds.join(', ')}]`,
      );
    } else {
      // Catastrophic fallback — no park resolved; assume baseline calisthenics fixtures.
      const fallback = Array.from(ESSENTIAL_PARK_GEAR);
      availableEquipment = [
        ...availableEquipment,
        ...fallback,
        'park_bench',
        'park_step',
      ];
      console.warn(
        '[InputSanitizer] ⚠️ No park inventory resolved — ESSENTIAL_PARK_GEAR fallback active',
      );
    }
  }

  return Array.from(new Set(availableEquipment));
}

// ============================================================================
// FUNCTION B — Active Program Filters
// ============================================================================

/**
 * Result of `buildActiveProgramFilters`.
 *
 * `filters`         — the expanded array (post skill-sibling expansion)
 *                     that ContextualEngine consumes as its program
 *                     filter / activeDomains list.
 * `baseDomainCount` — the count BEFORE expansion, captured so the
 *                     caller can derive `isSingleDomain` and the
 *                     pool-strategy without being misled by the
 *                     expansion width.
 */
export interface ActiveProgramFiltersResult {
  filters: string[];
  baseDomainCount: number;
}

/**
 * Compute the canonical `activeProgramFilters` array.
 *
 * Resolution priority:
 *   1. Shadow-matrix `override` flags (admin / Master Simulator).
 *   2. The first active program's children (resolved via
 *      `resolveChildDomainsForParent` — handles Static Master
 *      `full_body`, Dynamic Hybrid `calisthenics_upper`, etc.).
 *   3. The first active program's `focusDomains`.
 *   4. Fallback derivation from `progression.domains` keys + active
 *      program template IDs, with master-program children expansion.
 *
 * After the filters are populated, applies the **biomechanical skill-
 * track sibling expansion** (Anomaly-1 fix) so single-domain sessions
 * still pull skill-only exercises that share the parent biomechanical
 * pattern (e.g. pure Pull session pulls in `muscle_up`, `front_lever`,
 * `back_lever`, `one_arm_pullup`).
 *
 * `baseDomainCount` is captured BEFORE the sibling expansion so that
 * downstream pool strategy and `isSingleDomain` reflect the user's
 * original session topology — not the expanded filter width.
 *
 * @param effectiveProfile  Profile with scheduled-program override
 *                          applied (used to read the active program).
 * @param originalProfile   Original user profile (used for
 *                          `resolveChildDomainsForParent` so that
 *                          `skillFocusIds` is read from the real
 *                          user state, not the schedule override).
 */
export function buildActiveProgramFilters(
  effectiveProfile: UserFullProfile,
  originalProfile: UserFullProfile,
  programs: Program[],
  shadowMatrix: ShadowMatrix | undefined,
): ActiveProgramFiltersResult {
  const activeProgramFilters: string[] = [];

  if (shadowMatrix?.programs) {
    for (const [programKey, po] of Object.entries(shadowMatrix.programs)) {
      if (po?.override) activeProgramFilters.push(programKey);
    }
  }

  if (activeProgramFilters.length === 0) {
    const ap = effectiveProfile.progression?.activePrograms?.[0];
    const parentId = ap?.templateId ?? ap?.id;

    // Priority 1 — explicit focusDomains injected by the caller.
    //
    // home-workout.service.ts populates focusDomains with the slug-normalised
    // resolvedChildDomains for calisthenics_upper sessions (see "profileForFilters"
    // bridge in _buildSharedPipeline).  This must be checked BEFORE calling
    // resolveChildDomainsForParent, which reads skillFocusIds raw and may return
    // un-normalised hash IDs or ['calisthenics_upper'] — neither of which
    // survives ContextualEngine's exerciseMatchesProgram gate.
    if (ap?.focusDomains?.length) {
      activeProgramFilters.push(...ap.focusDomains);
      console.log(
        `[InputSanitizer] focusDomains priority path: ` +
        `[${ap.focusDomains.join(', ')}] → activeProgramFilters`,
      );
    } else {
      const resolvedDomains = resolveChildDomainsForParent(parentId, originalProfile);
      if (resolvedDomains.length > 0) {
        activeProgramFilters.push(...resolvedDomains);
      } else {
        const derived = Array.from(new Set<string>([
          ...Object.keys(originalProfile.progression?.domains ?? {}),
          ...(originalProfile.progression?.activePrograms ?? [])
            .map(p => p.templateId)
            .filter((id): id is string => Boolean(id)),
        ]));
        for (const pid of derived) {
          const prog = programs.find(p => p.id === pid);
          if (prog?.isMaster && prog.subPrograms?.length) {
            for (const child of prog.subPrograms) {
              if (!derived.includes(child)) derived.push(child);
            }
          }
        }
        if (derived.length > 0) activeProgramFilters.push(...derived);
      }
    }
  }

  // ── Biomechanical skill-track sibling expansion (Anomaly-1 fix) ──────────
  // Forward direction (single_domain session): when exactly one baseline
  // domain is active (e.g. 'pull'), exercises tagged only with a skill
  // sub-track (e.g. 'muscle_up') would be hard-excluded by ContextualEngine's
  // strict program filter.  Fix: also accept every skill subordinate to that
  // baseline domain.
  //
  // Inverse direction (multi-skill master session, e.g. calisthenics_upper):
  // activeProgramFilters = ['planche', 'front_lever'] — both are skill-track
  // slugs. Exercises tagged only with their parent baseline domain ('push' /
  // 'pull') are hard-excluded because neither slug appears in the filter list.
  // Fix: when any skill-track slug is present in the filter, also add its
  // parent baseline domain so foundational exercises remain visible.
  const SKILL_SIBLINGS: Record<string, string[]> = {
    pull: ['muscle_up', 'front_lever', 'back_lever', 'one_arm_pullup'],
    push: ['planche', 'handstand', 'handstand_pushup'],
  };

  // Derive the inverse map once from SKILL_SIBLINGS so there is a single
  // source of truth for which skill belongs to which parent.
  const SKILL_PARENT: Record<string, string> = {};
  for (const [parent, children] of Object.entries(SKILL_SIBLINGS)) {
    for (const child of children) {
      SKILL_PARENT[child] = parent;
    }
  }

  // baseDomainCount is captured BEFORE either expansion so downstream
  // callers can still determine the user's original intended domain count.
  const baseDomainCount = activeProgramFilters.length;

  // ── Forward expansion: baseline → include skill siblings ─────────────
  if (baseDomainCount === 1) {
    const siblings = SKILL_SIBLINGS[activeProgramFilters[0]];
    if (siblings) {
      activeProgramFilters.push(...siblings);
      console.log(
        `[InputSanitizer] Skill-sibling expansion for '${activeProgramFilters[0]}': ` +
        `added [${siblings.join(', ')}] → filters now [${activeProgramFilters.join(', ')}]`,
      );
    }
  }

  // ── Inverse expansion: skill tracks → include parent baseline domains ─
  // Runs for ALL session types (single or multi-skill) so that exercises
  // tagged only with the parent domain ('pull', 'push') are never starved
  // out of skill-track sessions. Uses a Set to deduplicate.
  const parentsToAdd = new Set<string>();
  for (const filter of activeProgramFilters) {
    const parent = SKILL_PARENT[filter];
    if (parent && !activeProgramFilters.includes(parent)) {
      parentsToAdd.add(parent);
    }
  }
  if (parentsToAdd.size > 0) {
    activeProgramFilters.push(...parentsToAdd);
    console.log(
      `[InputSanitizer] Inverse parent expansion: added [${[...parentsToAdd].join(', ')}] ` +
      `(skill tracks present in filter) → filters now [${activeProgramFilters.join(', ')}]`,
    );
  }

  return { filters: activeProgramFilters, baseDomainCount };
}

// ============================================================================
// FUNCTION C — Exercise Pool Resolution
// ============================================================================

/**
 * Slug aliases for cross-domain level resolution.  Maps a coarse program
 * slug (e.g. 'pulling') to one or more canonical domain slugs whose
 * user level should be considered when no direct match is found.
 */
const SLUG_ALIAS: Record<string, string[]> = {
  pulling: ['pull'],
  pushing: ['push'],
  upper_body: ['push', 'pull'],
  lower_body: ['legs'],
  full_body: ['push', 'pull', 'legs', 'core'],
};

/**
 * Build the candidate exercise pool that downstream filtering and
 * scoring will consume.
 *
 * Algorithm:
 *   1. If neither user program levels NOR resolved child domains are
 *      known, return `allExercises` (no pre-filter possible).
 *   2. Otherwise, retain exercises whose `targetPrograms` levels are
 *      within ±3 of the user's level **for that program**.  Level
 *      resolution handles three layers of indirection:
 *         a. Direct slug match (`programId === 'push'`).
 *         b. Firestore ID → slug (`'J0fLpmJhG0KDN2tQouxh' → 'push'`).
 *         c. Slug alias (`'pulling' → 'pull'`).
 *      When no mapping exists the function falls back to
 *      `baseUserLevel` (NOT 1) so the comparison stays meaningful.
 *   3. If `resolvedChildDomains` is non-empty AND any domain has 0
 *      exercises after step 2, inject the missing-domain exercises
 *      from the full pool ("domain rescue").
 *   4. If fewer than 4 exercises survive, abandon the level filter
 *      and return the full pool — better an over-broad pool than an
 *      empty workout.
 */
export function resolveExercisePool(
  allExercises: Exercise[],
  userProgramLevels: Map<string, number>,
  resolvedChildDomains: string[],
  idToSlug: Map<string, string>,
  baseUserLevel: number,
): Exercise[] {
  if (userProgramLevels.size === 0 && resolvedChildDomains.length === 0) {
    return allExercises;
  }

  const validProgramIds = new Set([
    ...Array.from(userProgramLevels.keys()),
    ...resolvedChildDomains,
  ]);

  const resolveUserLevelForProgram = (programId: string): number => {
    // 1. Direct slug match
    const direct = userProgramLevels.get(programId);
    if (direct !== undefined) return direct;
    // 2. Firestore ID → slug
    const slug = idToSlug.get(programId);
    if (slug) {
      const slugLevel = userProgramLevels.get(slug);
      if (slugLevel !== undefined) return slugLevel;
      // 2b. The slug itself might be an alias (e.g. 'pulling')
      const aliases = SLUG_ALIAS[slug];
      if (aliases) {
        const aliasLevels = aliases
          .map(a => userProgramLevels.get(a))
          .filter((l): l is number => l !== undefined);
        if (aliasLevels.length > 0) return Math.max(...aliasLevels);
      }
    }
    // 3. Direct slug alias (programId itself is an alias like 'pulling')
    const aliases = SLUG_ALIAS[programId];
    if (aliases) {
      const aliasLevels = aliases
        .map(a => userProgramLevels.get(a))
        .filter((l): l is number => l !== undefined);
      if (aliasLevels.length > 0) return Math.max(...aliasLevels);
    }
    return baseUserLevel;
  };

  const filterByTolerance = (tolerance: number) =>
    allExercises.filter(ex => {
      if (ex.targetPrograms?.length) {
        return ex.targetPrograms.some(tp => {
          const userLevel = resolveUserLevelForProgram(tp.programId);
          return Math.abs(tp.level - userLevel) <= tolerance;
        });
      }
      if (ex.programIds?.length) {
        return ex.programIds.some(pid =>
          validProgramIds.has(pid) || validProgramIds.has(resolveToSlug(pid)),
        );
      }
      return false;
    });

  const domainHasExercises = (pool: Exercise[], domain: string): boolean =>
    pool.some(ex =>
      ex.targetPrograms?.some(tp =>
        tp.programId === domain || resolveToSlug(tp.programId) === domain,
      ) ||
      ex.programIds?.some(pid =>
        pid === domain || resolveToSlug(pid) === domain,
      ),
    );

  const allDomainsHaveExercises = (pool: Exercise[]): boolean =>
    resolvedChildDomains.every(d => domainHasExercises(pool, d));

  // Always use ±3 tolerance so the full relevant level range reaches
  // ContextualEngine and DifficultyFilter — they handle per-difficulty
  // selection from within that range.
  let levelMatched = filterByTolerance(3);

  // If some domains still have 0 exercises at ±3, merge in the full pool
  // for the missing domains while keeping the level-matched pool for the rest.
  if (!allDomainsHaveExercises(levelMatched) && resolvedChildDomains.length > 0) {
    const missingDomains = resolvedChildDomains.filter(d => !domainHasExercises(levelMatched, d));
    const domainRescue = allExercises.filter(ex =>
      missingDomains.some(d =>
        ex.targetPrograms?.some(tp =>
          tp.programId === d || resolveToSlug(tp.programId) === d,
        ) ||
        ex.programIds?.some(pid =>
          pid === d || resolveToSlug(pid) === d,
        ),
      ),
    );
    if (domainRescue.length > 0) {
      console.log(
        `[InputSanitizer] Domain rescue: domains [${missingDomains.join(', ')}] had 0 exercises at ±3. ` +
        `Injecting ${domainRescue.length} exercises from full pool.`,
      );
      levelMatched = [...levelMatched, ...domainRescue];
    }
  }

  return levelMatched.length >= 4 ? levelMatched : allExercises;
}

// ============================================================================
// FUNCTION D — Effective Difficulty Resolution
// ============================================================================

/**
 * Resolve the **effective** difficulty that the deterministic pipeline
 * consumes, applying the three sequential overrides:
 *
 *   1. First-session guard:  isFirstSession=true → D1 (Easy).  The
 *      user has no baseline data yet, so we never start them on
 *      Intense.
 *
 *   2. Detraining lock:       detrainingLock + D3 → D2 (Challenging).
 *      A user returning after a 4–7 day gap should not jump straight
 *      back into the Intense bolt — protect them from CNS overshoot.
 *
 *   3. Periodization overrides:
 *        - Deload week (W5) + D3 → D1 (Easy).  Recovery week is
 *          incompatible with Intense; force it down regardless of
 *          UI selection.
 *        - Peak week (W4) + D1 (and no detraining lock) → D2.  Peak
 *          week is the wrong moment for a low-stimulus workout, so
 *          floor it at Normal.
 *
 * After this returns, `generateWorkout()` never re-derives difficulty;
 * the value is treated as final.
 *
 * Accepts the structural shape of `SessionPolicy` so callers that
 * already have the full policy object (e.g. home-workout.service.ts)
 * can pass it directly.  WorkoutGenerator.ts builds the shape from
 * the flat `WorkoutGenerationContext` fields.
 */
export function resolveEffectiveDifficulty(
  requestedDifficulty: DifficultyLevel | undefined,
  sessionPolicy: Pick<SessionPolicy, 'detrainingLock' | 'periodizationWeek'>,
  isFirstSession: boolean | undefined,
): DifficultyLevel {
  let difficulty: DifficultyLevel = (requestedDifficulty ?? 2) as DifficultyLevel;

  if (isFirstSession) {
    difficulty = 1;
  }

  if (sessionPolicy.detrainingLock && difficulty === 3) {
    difficulty = 2;
    console.log(
      '[InputSanitizer] Detraining lock active — Intense downgraded to Challenging',
    );
  }

  if (sessionPolicy.periodizationWeek === 5 && difficulty === 3) {
    difficulty = 1;
    console.log('[InputSanitizer:Periodization] Deload week (W5): Intense → Easy (forced)');
  }

  if (
    sessionPolicy.periodizationWeek === 4 &&
    difficulty === 1 &&
    !sessionPolicy.detrainingLock
  ) {
    difficulty = 2;
    console.log(
      '[InputSanitizer:Periodization] Peak week (W4): Easy → Normal (minimum threshold)',
    );
  }

  if (sessionPolicy.periodizationWeek != null) {
    const phaseLabel =
      sessionPolicy.periodizationWeek === 5
        ? 'DELOAD'
        : sessionPolicy.periodizationWeek === 4
        ? 'PEAK'
        : `BUILD(W${sessionPolicy.periodizationWeek})`;
    console.log(
      `[InputSanitizer:Periodization] Phase=${phaseLabel} effectiveDifficulty=${difficulty}`,
    );
  }

  return difficulty;
}
