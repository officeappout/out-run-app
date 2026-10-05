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
 *                                      DEFAULT_PARK_GEAR catastrophic
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
import { DEFAULT_PARK_GEAR, ASSUMED_HOME_GEAR } from '../../shared/utils/gear-mapping.utils';
import { ASSUMED_HOME_GEAR_ENABLED } from '@/config/feature-flags';
import type { ShadowMatrix } from '../../services/shadow-level.utils';
import { resolveEquipment } from '../../services/user-profile.utils';
import {
  resolveChildDomainsForParent,
  resolveToSlug,
} from '../../services/program-hierarchy.utils';
import type { SessionPolicy } from '../../services/periodization.service';
import type { DifficultyLevel } from '../../logic/workout-generator.types';
import { DOMAIN_RESOLUTION_SKILL_PARENT_MAP } from '../../logic/workout-selection.utils';

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
 *        b. DEFAULT_PARK_GEAR catastrophic fallback when no park
 *           inventory was resolved (canonical place this fires;
 *           ESSENTIAL_PARK_GEAR's narrower set is still used as-is by
 *           every other caller, e.g. park-gating's CLIFF rescue).
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
  // Decision F (park-hero-fix) — see resolveEquipment's own doc comment for the full
  // rationale. Computed here (not inside resolveEquipment) since DOMAIN_RESOLUTION_SKILL_
  // PARENT_MAP is already imported in this file.
  const hasActiveSkillProgram = (profile.progression?.activePrograms ?? []).some(
    (p) => DOMAIN_RESOLUTION_SKILL_PARENT_MAP[p.templateId] !== undefined,
  );

  let availableEquipment = [
    ...resolveEquipment(profile, location, equipmentOverride, hasActiveSkillProgram),
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
      // Catastrophic fallback — no park resolved. Uses DEFAULT_PARK_GEAR (park-hero-fix,
      // Decision D), a richer substitute than the narrow ESSENTIAL_PARK_GEAR baseline —
      // ESSENTIAL_PARK_GEAR itself is untouched and still used as-is by every other caller.
      const fallback = Array.from(DEFAULT_PARK_GEAR);
      availableEquipment = [
        ...availableEquipment,
        ...fallback,
        'park_bench',
        'park_step',
      ];
      console.warn(
        '[InputSanitizer] ⚠️ No park inventory resolved — DEFAULT_PARK_GEAR fallback active',
      );
    }
  }

  // Indoor baseline: assume placed-existing fixtures (door/chair/wall/floor/towel)
  // so improvised home methods aren't blocked for sparse-profile users. Additive;
  // no over-grant risk indoors (unlike gym/park catalog injection). Flag-gated.
  if (ASSUMED_HOME_GEAR_ENABLED && (location === 'home' || location === 'office' || location === 'school')) {
    availableEquipment = [...availableEquipment, ...Array.from(ASSUMED_HOME_GEAR)];
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
// ── Skill-track ↔ baseline-domain maps (module scope — single source of
// truth shared by buildActiveProgramFilters below AND resolveExercisePool's
// CLIFF fallback further down this file; see 01-MAP.md §8 / §7 on the
// pre-existing risk of these maps diverging when declared more than once). ──
//
// Derived from the canonical DOMAIN_RESOLUTION_SKILL_PARENT_MAP
// (workout-selection.utils.ts) rather than hand-maintained (skill↔foundation
// unification, 2026-10-01) — was one of (what was) at least 6 live copies of
// the same skill→parent content; see parking-lot.md's "חמישה מבנים, אותה
// שאלה" entry. Content is unchanged (already byte-identical to the
// canonical map for these 7 keys) — this removes a duplicate, not a behavior.
//
// Lazily computed (NOT a module-top-level const) — workout-selection.utils.ts
// imports `resolveUserLevelForProgram` FROM this file, so a top-level read of
// DOMAIN_RESOLUTION_SKILL_PARENT_MAP here hits that circular import mid-load
// and throws "Cannot access ... before initialization" (verified: crashes at
// runtime the moment this file is required, even though tsc sees no error —
// a TDZ issue, not a type issue). Deferring the read into a function body
// means it only ever runs after both modules have finished loading.
let _skillSiblings: Record<string, string[]> | undefined;
function getSkillSiblings(): Record<string, string[]> {
  if (!_skillSiblings) {
    _skillSiblings = {};
    for (const [skill, parent] of Object.entries(DOMAIN_RESOLUTION_SKILL_PARENT_MAP)) {
      (_skillSiblings[parent] ??= []).push(skill);
    }
  }
  return _skillSiblings;
}

// Multi-parent variant of DOMAIN_RESOLUTION_SKILL_PARENT_MAP, for
// resolveExercisePool's Step-B fallback below — mechanically derived from the
// SAME getSkillSiblings() above, so it can never drift from it. `human_flag`
// is NOT a skill-siblings entry (that map only covers `pull`/`push`;
// human_flag is absent from it entirely — a pre-existing gap, not introduced
// here) so it's added explicitly: a human_flag exercise legitimately carries
// both push and pull levels in the live catalog (e.g. "דגל אנושי" has
// pull=L21, push=L21). Also lazy, same TDZ reason as getSkillSiblings above.
let _skillToBaselineParents: Record<string, string[]> | undefined;
function getSkillToBaselineParents(): Record<string, string[]> {
  if (!_skillToBaselineParents) {
    _skillToBaselineParents = {};
    for (const [parent, children] of Object.entries(getSkillSiblings())) {
      for (const child of children) {
        (_skillToBaselineParents[child] ??= []).push(parent);
      }
    }
    _skillToBaselineParents.human_flag = ['push', 'pull'];
  }
  return _skillToBaselineParents;
}

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
    const activePrograms = effectiveProfile.progression?.activePrograms ?? [];
    const ap = activePrograms[0];
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
      // Fix #2 (generator-leveling audit): mirrors the identical fix in
      // home-workout.service.ts's own resolvedChildDomains derivation.
      // resolveChildDomainsForParent's model is one-parent-to-children —
      // correct for a single master, but activePrograms can legitimately
      // hold >1 CO-EQUAL, non-master entries (a multi-domain Custom Builder
      // / scheduled session, e.g. push+pull). Reading only [0] here silently
      // dropped every sibling after it, so baseDomainCount below undercounted
      // the real number of active domains — the exact trigger for the
      // single-domain skill-sibling forward-expansion misfiring on a
      // genuinely multi-domain session.
      const isAnyMaster = activePrograms.some((p) => {
        const id = p.templateId ?? p.id;
        if (!id) return false;
        const slug = resolveToSlug(id);
        return programs.some((prog) => prog.isMaster && (prog.id === id || prog.slug === id || prog.slug === slug));
      });
      const resolvedDomains = (activePrograms.length > 1 && !isAnyMaster)
        ? Array.from(new Set(
            activePrograms.flatMap((p) => resolveChildDomainsForParent(p.templateId ?? p.id, originalProfile)),
          ))
        : resolveChildDomainsForParent(parentId, originalProfile);
      if (resolvedDomains.length > 0) {
        activeProgramFilters.push(...resolvedDomains);
      } else {
        // absent=absent (⑨): only domains the user has ACTUALLY assessed (level > 0) join the active
        // filter set — a level-0 / unassessed key must NOT become a strict program filter.
        const readLvl = (v: any) => (v == null ? 0 : typeof v === 'number' ? v : (v.currentLevel ?? v.level ?? 0));
        const assessedDomainKeys = Object.keys(originalProfile.progression?.domains ?? {})
          .filter(k => readLvl((originalProfile.progression?.domains as any)?.[k]) > 0
                    || readLvl((originalProfile.progression?.tracks as any)?.[k]) > 0);
        const derived = Array.from(new Set<string>([
          ...assessedDomainKeys,
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
  // SKILL_SIBLINGS is declared at module scope above (shared with
  // resolveExercisePool's CLIFF fallback); the parent lookup below reads
  // DOMAIN_RESOLUTION_SKILL_PARENT_MAP directly.

  // baseDomainCount is captured BEFORE either expansion so downstream
  // callers can still determine the user's original intended domain count.
  const baseDomainCount = activeProgramFilters.length;

  // ── Forward expansion: baseline → include skill siblings ─────────────
  if (baseDomainCount === 1) {
    const siblings = getSkillSiblings()[activeProgramFilters[0]];
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
    const parent = DOMAIN_RESOLUTION_SKILL_PARENT_MAP[filter];
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
 *   4. If fewer than 4 exercises survive at ±3, a graduated, LOGGED fallback
 *      runs (never a silent return of the full catalog — see 02-CATALOG-AUDIT.md,
 *      which found 146 such CLIFF cells, every one of them inside a skill-track
 *      program; zero in push/pull/legs/full_body/upper_body):
 *        a. Widen tolerance to ±5 and retry.
 *        b. Still <4, and the domain is a skill track (human_flag, handstand,
 *           handstand_pushup, planche, front_lever, muscle_up, one_arm_pullup)?
 *           Fall back to its baseline parent domain(s) (push/pull/legs), whose
 *           catalog is healthy (SKILL_TO_BASELINE_PARENTS above).
 *        c. Still <4 — return what exists as-is. Mark `relaxedConstraints`
 *           on the result and log a diagnostic; never widen to `allExercises`.
 */
export interface ExercisePoolResult {
  exercises: Exercise[];
  /** Set when any fallback tier above fired — surfaced on the generation
   *  context for observability (QA tooling, simulator, future analytics). */
  relaxedConstraints?: string[];
  /** Human-readable log lines, prepended into GeneratedWorkout.pipelineLog
   *  by WorkoutGenerator (via context.earlyPipelineNotes) so a relaxed pool
   *  is visible on the workout itself, not just in a console log. */
  diagnostics?: string[];
}

/**
 * Resolve the user's level for one specific program (by Firestore id or
 * slug) — the exact per-domain lookup `resolveExercisePool`'s ±3/±5
 * tolerance filter already uses, correctly, to measure an exercise's own
 * level against the user's level FOR THAT SAME PROGRAM. Extracted here
 * (2026-09-08, David) so `ContextualEngine.filterAndScore`'s
 * level_tolerance gate can call the exact same resolver instead of a
 * seventh reimplementation — see that gate's own comment for the bug this
 * closes (comparing an exercise's skill-domain level against the user's
 * FOUNDATIONAL-domain level, two different domains in one comparison).
 *
 * `resolveExercisePool` keeps its own bound wrapper
 * (`resolveUserLevelForProgramBound`) so its behavior is byte-identical —
 * this function is the shared core both callers now delegate to.
 */
export function resolveUserLevelForProgram(
  programId: string,
  userProgramLevels: Map<string, number>,
  resolveSlug: (programId: string) => string | undefined,
  baseUserLevel: number,
): number {
  // 1. Direct slug match
  const direct = userProgramLevels.get(programId);
  if (direct !== undefined) return direct;
  // 2. Firestore ID → slug
  const slug = resolveSlug(programId);
  if (slug) {
    const slugLevel = userProgramLevels.get(slug);
    if (slugLevel !== undefined) return slugLevel;
    // 2b. The slug itself might be an alias (e.g. 'pulling')
    const slugAliases = SLUG_ALIAS[slug];
    if (slugAliases) {
      const aliasLevels = slugAliases
        .map(a => userProgramLevels.get(a))
        .filter((l): l is number => l !== undefined);
      if (aliasLevels.length > 0) return Math.max(...aliasLevels);
    }
  }
  // 3. Direct slug alias (programId itself is an alias like 'pulling')
  const directAliases = SLUG_ALIAS[programId];
  if (directAliases) {
    const aliasLevels = directAliases
      .map(a => userProgramLevels.get(a))
      .filter((l): l is number => l !== undefined);
    if (aliasLevels.length > 0) return Math.max(...aliasLevels);
  }
  return baseUserLevel;
}

/**
 * Fix #1 (generator-leveling audit, STRICT HIDE — owner decision): a skill
 * exercise (planche, front_lever, muscle_up, etc. — any tag that's a key in
 * DOMAIN_RESOLUTION_SKILL_PARENT_MAP) must never surface unless the user has
 * a DIRECT assessed level for that exact skill. No inverse skill↔foundation
 * scale conversion — a plain exclusion, not a re-score.
 *
 * userProgramLevels is absent=absent by construction (buildUserProgramLevels)
 * — `.has(slug)` here means "a real tracks/domains entry exists for this
 * slug," never a derived/fallback value. This is deliberately independent of
 * the forward skill-sibling expansion above (which stays unconditional, by
 * design, for tag-eligibility) — this function gates whether an exercise
 * actually reaches the candidate pool at all, the step the expansion itself
 * was never meant to answer.
 *
 * An exercise with at least one non-skill (foundational) tag, or at least
 * one skill tag the user HAS directly reached, stays eligible via that tag
 * — this only removes an exercise whose EVERY tag is an unreached skill.
 *
 * FIXED 2026-10-05 (Item 4, skill-gate cold-cache leak): used to call the
 * standalone `resolveToSlug(raw)` — which reads the SHARED, module-level,
 * concurrently-mutable `_idToSlugMap` (program-hierarchy.utils.ts) — instead
 * of the `idToSlug` map `resolveExercisePool` already receives as a
 * request-scoped parameter (and already uses safely elsewhere in that same
 * function). Reproduced live: a real exercise tagged
 * `targetPrograms:[{programId:"<muscle_up's Firestore hash>", level:2}]`
 * leaked to a user with no muscle_up assessment, with `skill_gate: 0`
 * exclusions logged for that call — `resolveToSlug` had returned the raw,
 * unresolved hash unchanged (its own documented cold-cache fallback,
 * `console.error`-only, never thrown), so the lookup against
 * DOMAIN_RESOLUTION_SKILL_PARENT_MAP (keyed by slug) missed and the tag read
 * as foundational. Now takes `idToSlug` directly — request-scoped, so it
 * can't be affected by a concurrent request's cache rebuild — and, as
 * defense in depth, treats a hash-SHAPED tag that still doesn't resolve
 * (not in `idToSlug`, not a known slug) as UNPROVEN rather than safe: fails
 * CLOSED (excludes, same as an unreached skill) instead of failing open.
 *
 * EXPORTED (2026-10-05, Item 4 follow-up): `resolveExercisePool` is NOT the
 * only consumer of the full, unfiltered catalog — `prependWarmupExercises`/
 * `appendCooldownExercises` (home-workout.service.ts's trio loop) both
 * receive `pipeline.allExercises` directly, bypassing this gate entirely,
 * by design ("warmup.service.ts has its own independent filter stack" —
 * see that call site's own comment). That stack never included a skill
 * check. Confirmed live: the exact `pull L5 30min D3 @park` leak this
 * module's own Fix #1 was built to close still reproduced (10/15 attempts)
 * AFTER this file's own idToSlug fix — root cause was a muscle_up-tagged
 * exercise selected as a warmup "pull activation" slot, never passing
 * through this function at all. Exported so warmup/cooldown can apply the
 * identical, single-source-of-truth gate instead of a second
 * reimplementation that could drift out of sync.
 */
export function isExerciseSkillEligible(
  exercise: Exercise,
  userProgramLevels: Map<string, number>,
  idToSlug: Map<string, string>,
): boolean {
  const tags: string[] = [
    ...(exercise.targetPrograms ?? []).map((tp) => tp.programId),
    ...(exercise.programIds ?? []),
  ];
  if (tags.length === 0) return true; // nothing to gate on — unaffected by this fix

  for (const raw of tags) {
    const resolved = idToSlug.get(raw);
    const slug = resolved ?? resolveToSlug(raw);
    const isSkill =
      DOMAIN_RESOLUTION_SKILL_PARENT_MAP[slug] !== undefined ||
      DOMAIN_RESOLUTION_SKILL_PARENT_MAP[raw] !== undefined;

    // Defense in depth: a hash-shaped tag (long, no underscore — same
    // heuristic resolveToSlug's own diagnostic uses) that resolved to
    // NOTHING in the request-scoped map and isn't itself a known slug or a
    // known skill key cannot be proven foundational. Fail closed rather
    // than silently trusting an unresolved identifier — no "directly
    // assessed" escape hatch here on purpose: userProgramLevels is always
    // slug-keyed (buildUserProgramLevels' absent=absent contract), so
    // checking it against the raw, unresolved hash could never match
    // anyway (axioms.md §29 — don't keep a check that can't fire). The
    // asymmetry is intentional: a genuinely assessed user only loses this
    // one exercise for one request, until idToSlug is warm again (every
    // real request, since resolveExercisePool's caller builds it
    // synchronously beforehand) — a content-gating leak does not
    // self-correct the same way.
    if (resolved === undefined && raw.length > 15 && !raw.includes('_') && !isSkill) return false;

    if (!isSkill) return true; // a foundational tag always keeps the exercise eligible
    if (userProgramLevels.has(slug) || userProgramLevels.has(raw)) return true; // directly assessed
  }
  return false; // every tag was a skill, none directly reached
}

export function resolveExercisePool(
  allExercises: Exercise[],
  userProgramLevels: Map<string, number>,
  resolvedChildDomains: string[],
  idToSlug: Map<string, string>,
  baseUserLevel: number,
  /**
   * Temporary HSPU freeze — RE-SCOPED 2026-10-05 (David's explicit request).
   * The original approach (a per-exercise denylist, `isHspuFrozen`, removed)
   * was over-broad: it keyed on whether an EXERCISE carried an hspu/
   * handstand_pushup tag anywhere, not on whether THIS REQUEST was actually
   * hspu-targeted — so a genuinely multi-tagged exercise (e.g. tagged BOTH
   * push@L20 and handstand_pushup@L11 — confirmed live:
   * "שכיבות סמיכה בעמידת ידיים חזה לקיר", W61ECyiZmD9APomgxAfz) would have
   * been stripped from a plain PUSH session too, not just an hspu one, the
   * moment the (separate, still-open) 'hspu' vs 'handstand_pushup' slug-
   * mismatch that made the old filter a no-op against real data ever got
   * closed.
   *
   * Caller (home-workout.service.ts) computes this from
   * activePrograms[0].templateId — the session's actual primary target —
   * BEFORE any domain-resolution collapsing, and passes it down already
   * flag-gated. When true, this function returns an EMPTY pool for THIS
   * CALL only; no exercise's catalog membership is touched, so the exact
   * same multi-tagged exercise still resolves normally via its OTHER tag
   * for a non-hspu request.
   */
  isHspuTargetedRequest: boolean = false,
): ExercisePoolResult {
  // Fix #1 (see isExerciseSkillEligible above) — runs before any
  // tolerance/rescue logic below, against the raw catalog, so a thin pool
  // can never "rescue" an unreached skill back in via the CLIFF fallbacks
  // further down this function.
  // Combines both fixes: request-scoped idToSlug (closes the cold-cache
  // skill leak) + the request-level HSPU short-circuit (replaces the
  // removed isHspuFrozen per-exercise denylist, PR #142).
  allExercises = allExercises.filter((ex) => isExerciseSkillEligible(ex, userProgramLevels, idToSlug));

  // Temporary HSPU freeze — see this parameter's own doc comment above.
  // Short-circuits BEFORE any tolerance/rescue logic, for the same reason
  // Fix #1 does: a thin pool must never "rescue" this back in.
  if (isHspuTargetedRequest) {
    return { exercises: [] };
  }

  if (userProgramLevels.size === 0 && resolvedChildDomains.length === 0) {
    return { exercises: allExercises };
  }

  const validProgramIds = new Set([
    ...Array.from(userProgramLevels.keys()),
    ...resolvedChildDomains,
  ]);

  const resolveUserLevelForProgramBound = (programId: string): number =>
    resolveUserLevelForProgram(programId, userProgramLevels, (id) => idToSlug.get(id), baseUserLevel);

  const filterByTolerance = (tolerance: number) =>
    allExercises.filter(ex => {
      if (ex.targetPrograms?.length) {
        return ex.targetPrograms.some(tp => {
          const userLevel = resolveUserLevelForProgramBound(tp.programId);
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

  if (levelMatched.length >= 4) {
    return { exercises: levelMatched };
  }

  // ── Graduated fallback (never silently return the full catalog) ──────────
  // 02-CATALOG-AUDIT.md found 146 CLIFF cells (< 4 exercises within ±3 levels)
  // — every one of them inside a skill-track program (human_flag, handstand,
  // handstand_pushup, core@L18 edge). Zero CLIFF cells in push/pull/legs/
  // full_body/upper_body. Silently returning `allExercises` here used to make
  // EVERY exercise in the entire catalog a candidate the moment a skill
  // session's pool got thin — the mechanism behind "user gets a random
  // advanced exercise they're nowhere near ready for."

  // Step A — widen tolerance to ±5 and retry.
  const widened = filterByTolerance(5);
  if (widened.length >= 4) {
    console.warn(
      `[InputSanitizer] Level filter widened ±3→±5 (had ${levelMatched.length}, ` +
      `now ${widened.length}) for domains [${resolvedChildDomains.join(', ')}]`,
    );
    return {
      exercises: widened,
      relaxedConstraints: ['level'],
      diagnostics: [`level_tolerance_widened: ±3→±5 (${levelMatched.length}→${widened.length} exercises)`],
    };
  }

  // Step B — still thin at ±5. If any active domain is a skill track, fall
  // back to its healthy baseline parent domain(s) instead of the whole catalog.
  const parentDomains = new Set<string>();
  for (const domain of resolvedChildDomains) {
    for (const parent of getSkillToBaselineParents()[domain] ?? []) {
      parentDomains.add(parent);
    }
  }
  if (parentDomains.size > 0) {
    const parentDomainsArr = Array.from(parentDomains);
    const parentPool = allExercises.filter(ex =>
      parentDomainsArr.some(domain =>
        ex.targetPrograms?.some(tp => tp.programId === domain || resolveToSlug(tp.programId) === domain) ||
        ex.programIds?.some(pid => pid === domain || resolveToSlug(pid) === domain),
      ),
    );
    if (parentPool.length >= 4) {
      console.warn(
        `[InputSanitizer] Skill catalog too thin for [${resolvedChildDomains.join(', ')}] ` +
        `(${widened.length} at ±5) — falling back to parent domain(s) ` +
        `[${parentDomainsArr.join(', ')}] (${parentPool.length} exercises)`,
      );
      return {
        exercises: parentPool,
        relaxedConstraints: ['level', 'domain_parent_fallback'],
        diagnostics: [
          `level_tolerance_widened: ±3→±5 (${levelMatched.length}→${widened.length} exercises)`,
          `skill_catalog_thin: [${resolvedChildDomains.join(', ')}] → parent fallback [${parentDomainsArr.join(', ')}] (${parentPool.length} exercises)`,
        ],
      };
    }
  }

  // Step C — still <4 even after every rescue. Return what exists (never the
  // full catalog) and mark the result so downstream code / QA tooling can see
  // this session ran on a genuinely starved pool.
  console.warn(
    `[InputSanitizer] Level filter exhausted all rescues for [${resolvedChildDomains.join(', ')}] ` +
    `— returning ${widened.length} exercise(s) as-is. This session's pool is genuinely thin; ` +
    `it is NOT being padded with the full unrelated catalog.`,
  );
  return {
    exercises: widened,
    relaxedConstraints: ['level'],
    diagnostics: [
      `level_tolerance_widened: ±3→±5 (${levelMatched.length}→${widened.length} exercises)`,
      `level_filter_exhausted: [${resolvedChildDomains.join(', ')}] — returning ${widened.length} exercise(s), no further rescue available`,
    ],
  };
}

// ============================================================================
// FUNCTION D — Effective Difficulty Resolution
// ============================================================================

/** User-facing explanation for a safety-motivated difficulty override — shown
 *  as a note on the workout so an explicit-choice override never looks like
 *  a silent bug (docs/workout-engine/03-CHANGES.md Addendum 17/20, F2). */
export interface EffectiveDifficultyResult {
  difficulty: DifficultyLevel;
  /** Set only when an override actually fired — undefined otherwise. */
  overrideNote?: string;
}

/**
 * Resolve the **effective** difficulty that the deterministic pipeline
 * consumes.
 *
 * Updated 06.09.2026 (David's F2 decision, docs/workout-engine/03-CHANGES.md
 * Addendum 17/20; 00-PLAN.md §16): the 3 SAFETY-motivated overrides below
 * stay — they protect the user from themselves, which the meta-rule's own
 * text allows for ("מותר להוסיף הערה או אזהרה") — but each now returns a
 * user-facing `overrideNote` explaining why, so an explicit pick that got
 * overridden never looks like a silent bug. The 4th, OPTIMIZATION-motivated
 * override (peak week floor: D1→D2, "don't waste a high-readiness week on a
 * low-stimulus session") was REMOVED — it wasn't protecting the user from
 * anything, it was the engine second-guessing an explicit "easy" pick with a
 * training-optimization opinion. If the user picked easy, they get easy.
 *
 *   1. First-session guard:  isFirstSession=true → D1 (Easy).  The
 *      user has no baseline data yet, so we never start them on
 *      Intense.
 *
 *   2. Detraining lock:       detrainingLock + D3 → D2 (Challenging).
 *      A user returning after a 4–7 day gap should not jump straight
 *      back into the Intense bolt — protect them from CNS overshoot.
 *
 *   3. Deload week (W5) + D3 → D1 (Easy).  Recovery week is
 *      incompatible with Intense; force it down regardless of
 *      UI selection.
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
): EffectiveDifficultyResult {
  let difficulty: DifficultyLevel = (requestedDifficulty ?? 2) as DifficultyLevel;
  let overrideNote: string | undefined;

  if (isFirstSession) {
    difficulty = 1;
    overrideNote = 'זה האימון הראשון שלך — התחלנו בקלות כדי להכיר את הגוף.';
  }

  if (sessionPolicy.detrainingLock && difficulty === 3) {
    difficulty = 2;
    overrideNote = 'חזרת אחרי הפסקה — התחלנו בעדינות.';
    console.log(
      '[InputSanitizer] Detraining lock active — Intense downgraded to Challenging',
    );
  }

  if (sessionPolicy.periodizationWeek === 5 && difficulty === 3) {
    difficulty = 1;
    overrideNote = 'השבוע שבוע התאוששות — הורדנו עצימות כדי לאפשר להתאושש כמו שצריך.';
    console.log('[InputSanitizer:Periodization] Deload week (W5): Intense → Easy (forced)');
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

  return { difficulty, overrideNote };
}
