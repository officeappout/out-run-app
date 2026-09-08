/**
 * GuaranteePassRunner — Coverage Guarantee Pipeline Module
 *
 * Responsible for the 3 deterministic "coverage guarantee" passes that make
 * sure every workout meets the engine's minimum balance requirements:
 *
 *   1. runHorizontalGuarantee       — at least 1 horizontal_push + 1 horizontal_pull
 *                                     in any full_body session
 *   2. runVerticalFoundationGuarantee — at least 1 foundation exercise in each
 *                                       vertical_pull + vertical_push slot
 *   3. runFullBodyDomainGuarantee   — at least 1 exercise from each primary
 *                                     domain (push / pull / legs) in a full_body
 *                                     session
 *
 * Each transform is pure-ish — it accepts the current `WorkoutExercise[]` and
 * returns a new array reference (the previous WorkoutGenerator code mutated in
 * place; the runner preserves that behaviour to avoid downstream identity
 * changes for unaffected entries, but always returns a NEW outer array so
 * callers can detect "ran/no-op" via reference equality if they want).
 *
 * Migrated verbatim from WorkoutGenerator.ts Steps 5d, 5d-prime, 5e (lines
 * 864–1241 pre-Phase-3).  No behavioural changes — only re-housed.
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs.
 */

import { getLocalizedText } from '@/features/content/exercises/core/exercise.types';
import type {
  DifficultyLevel,
  WorkoutExercise,
  WorkoutGenerationContext,
} from '../../logic/workout-generator.types';
import { HORIZONTAL_MOVEMENT_GROUPS } from '../../logic/workout-generator.types';
import {
  classifyPriority,
  resolveExerciseLevelForDomains,
} from '../../logic/workout-selection.utils';
import {
  resolveInjectedLevel,
  substituteExercise,
  resolveSubstituteMethod,
} from '../../logic/WorkoutGenerator';
import { findLevelAppropriateSubstitute } from './PoolFactory';
import {
  MG_TO_DOMAIN,
  getBolt1WindowAnchor,
} from '../../shared/constants/domain-mapping.constants';
import type { WorkoutBlueprint } from './pipeline.types';

// ============================================================================
// SHARED CONFIG
// ============================================================================

/** Movement groups treated as "vertical foundation" — must always have a
 * `priority: foundation` exercise present. */
const VERTICAL_FOUNDATION_GROUPS = ['vertical_pull', 'vertical_push'] as const;

/** Per-domain candidate movement groups for the Full-Body domain guarantee.
 *  'core' added docs/workout-engine/09-CORE-TABATA.md §3/§4 (David's
 *  decision) — a full-body session now guarantees core exactly like push/
 *  pull/legs, closing the 58.3%-zero-core gap measured in 08-CORE.md §3 Q3. */
const DOMAIN_MG_CANDIDATES: Record<string, string[]> = {
  push: ['vertical_push', 'horizontal_push'],
  pull: ['vertical_pull', 'horizontal_pull'],
  legs: ['squat', 'hinge', 'lunge'],
  // Matches MG_TO_DOMAIN's 'core' domain exactly (shared/constants/domain-
  // mapping.constants.ts:49) — 'core' alone missed a large share of the real
  // catalog (anti_extension/anti_rotation-tagged core exercises), which is
  // why the first pass of this fix measured almost no improvement in the
  // full-body zero-core rate (live-traced, not guessed).
  core: ['core', 'anti_extension', 'anti_rotation'],
};

const PRIMARY_DOMAINS = new Set(['push', 'pull', 'legs', 'core']);

// ============================================================================
// SHARED VICTIM-PROTECTION RULE
// ============================================================================
//
// David's decision, 05.09.2026 — found via a live trace where a full-body
// workout came out push+pull ONLY: HorizontalGuarantee's "domain has rich
// budget → ADD an extra horizontal exercise by replacing the lowest-scored
// exercise from ANY other domain" path sacrificed the session's ONLY legs
// exercise to add a redundant second push exercise. Confirmed firing in
// 22.2% of a live sample. This was never "a core bug" — core was the
// symptom; any primary domain (push/pull/legs/core) could be — and was —
// the victim.
//
// The rule, applied everywhere a guarantee pass chooses what to replace:
// NEVER remove the sole remaining representative of a PRIMARY_DOMAINS
// domain. `runFullBodyDomainGuarantee` already had an equivalent inline
// check (it's the reason core-domain protection worked at all this
// session); `runHorizontalGuarantee` and `runVerticalFoundationGuarantee`
// did not — both are fixed onto this same shared predicate below instead
// of three independent, divergence-prone copies. `pickLowestPriorityVictim`
// (the post-cut promise validator's own victim picker, further below) also
// builds on the same predicate.
//
// When no safe victim exists, per David's explicit rule: DO NOT inject —
// log why and move on. A missing domain is a known, visible gap; a broken
// OTHER domain sacrificed to fix it is a worse, silent one.

/**
 * Exported (06.09.2026) — trio-modifiers.service.ts's `applyEssentialGearFilter`
 * is a 4th site with the exact same bug class (found live-tracing pull loss
 * through `applyFlowRegression`): a domain-blind filter that can drop the sole
 * remaining representative of a primary domain with no protection at all.
 * Shared here instead of a copy, per David's explicit instruction.
 */
export function computeDomainCounts(mainExercises: WorkoutExercise[]): Map<string, number> {
  const domainCounts = new Map<string, number>();
  for (const e of mainExercises) {
    const d = MG_TO_DOMAIN[e.exercise.movementGroup ?? ''];
    if (d) domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
  }
  return domainCounts;
}

/** True if replacing `exercise` would NOT leave any PRIMARY_DOMAINS domain empty. */
export function isSafeDomainVictim(
  exercise: WorkoutExercise,
  domainCounts: Map<string, number>,
): boolean {
  const eDomain = MG_TO_DOMAIN[exercise.exercise.movementGroup ?? ''];
  if (PRIMARY_DOMAINS.has(eDomain ?? '') && (domainCounts.get(eDomain!) ?? 0) <= 1) return false;
  return true;
}

/**
 * True if `exercise`'s domain is one the user has an assessed level for —
 * the SAME `has()`-guarded absent=absent contract used everywhere else this
 * session (`workout-selection.utils.ts`'s domain-quota selection,
 * `buildUserProgramLevels`). Exported (06.09.2026, David — docs/workout-
 * engine/03-CHANGES.md Addendum 26) so every domain-BLIND candidate search
 * (backfills, replacement passes — anything that reaches into the raw
 * catalog instead of the already-gated domain-quota pool) can share one
 * predicate instead of re-discovering this gap independently. This is the
 * 5th site this exact bug class was found in (609/637, Part B Tier 1, the
 * 3 guarantee passes, applyEssentialGearFilter's naked-filter, and now its
 * own backfill/replacement passes) — a shared, exported gate instead of
 * another local patch.
 *
 * Exercises with no resolvable domain at all (movementGroup missing from
 * MG_TO_DOMAIN — no known program) pass through unchanged; this predicate
 * only gates exercises whose domain IS known but the user has no level in.
 * When `userProgramLevels` is undefined or empty — no domain context at
 * all, not "the user has zero domains" — the gate is a no-op (pass), the
 * same fallback semantics `levelInfoFor` in trio-modifiers.service.ts
 * already uses when no program-level context is available.
 */
export function isDomainRegistered(
  exercise: { movementGroup?: string | null },
  userProgramLevels: Map<string, number> | undefined,
): boolean {
  if (!userProgramLevels || userProgramLevels.size === 0) return true;
  const domain = MG_TO_DOMAIN[exercise.movementGroup ?? ''];
  if (!domain) return true;
  return userProgramLevels.has(domain);
}

/**
 * Pick the lowest-scored exercise from `candidates` that is safe to remove
 * (see `isSafeDomainVictim`). `allMainExercises` — NOT `candidates` — is
 * used to compute domain counts, since a candidate list pre-filtered to
 * "other domain only" would undercount the very domain being protected.
 */
function pickVictimProtectingDomains(
  candidates: WorkoutExercise[],
  allMainExercises: WorkoutExercise[],
): WorkoutExercise | undefined {
  const domainCounts = computeDomainCounts(allMainExercises);
  return candidates
    .filter(e => isSafeDomainVictim(e, domainCounts))
    .sort((a, b) => a.score - b.score)[0];
}

// ============================================================================
// PASS 1 — HORIZONTAL GUARANTEE
// ============================================================================

/**
 * Step 5d: Level-Aware Horizontal Guarantee (full_body workouts only).
 *
 * Ensures at least one horizontal_push and one horizontal_pull among the main
 * exercises.  Uses findLevelAppropriateSubstitute (progressive ±2→±4→±6
 * radius) for replacement selection.
 *
 * Skipped when:
 *   • blueprint.strategy !== 'full_body'
 *   • context.strictDomains is true AND the user's requiredDomains do not
 *     include 'push' or 'pull'  (respects user-selected domain filter)
 */
export function runHorizontalGuarantee(
  exercises: WorkoutExercise[],
  context: WorkoutGenerationContext,
  blueprint: WorkoutBlueprint,
  difficulty: DifficultyLevel,
  pipelineLog: string[],
): WorkoutExercise[] {
  const allowed =
    !context.strictDomains || context.requiredDomains?.some(d => d === 'push' || d === 'pull');
  if (!allowed || blueprint.strategy !== 'full_body') {
    return exercises;
  }

  let workoutExercises = exercises;
  const mainEx = workoutExercises.filter(e => e.exerciseRole === 'main');
  const usedIds = new Set(workoutExercises.map(we => we.exercise.id));
  const userLevelsMap = context.userProgramLevels;
  const pool = context.globalExercisePool ?? [];

  const tryLevelAwareSwap = (targetGroup: string): void => {
    const domain = MG_TO_DOMAIN[targetGroup];
    // absent=absent (⑨): don't swap in a domain the user hasn't assessed. has()-guarded — no
    // `?? context.userLevel` back-door.
    if (domain && !userLevelsMap?.has(domain)) return;
    const domainLevel = domain
      ? userLevelsMap!.get(domain)!
      : context.userLevel;
    // For D1 (recovery/flow), anchor the search at the centroid of the
    // Bolt-1 recovery window (`getBolt1WindowAnchor` = domainLevel − 2)
    // so guarantee-injected exercises radiate from the same physiological
    // zone the main pool filter (`isWithinBolt1Window`) admits.
    const effectiveDomainLevel = difficulty === 1
      ? getBolt1WindowAnchor(domainLevel)
      : domainLevel;

    const substitute = findLevelAppropriateSubstitute(
      pool, targetGroup, effectiveDomainLevel, usedIds, userLevelsMap, domain, difficulty,
    );

    if (!substitute) {
      console.log(`[HorizontalGuarantee] skipped ${targetGroup} — no candidate within ±6 of L${domainLevel}`);
      pipelineLog.push(`horizontal_guarantee: SKIPPED ${targetGroup} (no candidate ≤ gap 6, L${domainLevel})`);
      return;
    }

    const repName  = getLocalizedText(substitute.exercise.name);
    // Always derive the program level from the injected exercise's OWN domain
    // (horizontal_push → push), not from the search result which could inherit
    // the wrong domain level (e.g., L19 full_body instead of L12 push).
    const repLevel = Math.min(
      resolveInjectedLevel(substitute.exercise, targetGroup, domainLevel),
      domainLevel + 6,
    );
    const gap      = Math.abs(repLevel - domainLevel);

    // Check domain budget: if the domain already has enough sets (>3),
    // ADD the horizontal exercise instead of replacing the vertical one.
    // David (L19) needs BOTH pull-ups AND back levers in the same session.
    const domainSets = mainEx
      .filter(e => domain && MG_TO_DOMAIN[e.exercise.movementGroup ?? ''] === domain)
      .reduce((s, e) => s + (e.sets ?? 3), 0);

    const verticalCounterpart = targetGroup === 'horizontal_pull' ? 'vertical_pull'
      : targetGroup === 'horizontal_push' ? 'vertical_push'
      : null;

    const hasVertical = verticalCounterpart
      && mainEx.some(e => e.exercise.movementGroup === verticalCounterpart);

    if (domainSets > 3 && hasVertical) {
      // Domain has rich budget AND a vertical exercise → ADD the horizontal
      // by replacing the lowest-scoring NON-domain exercise (accessory/core/legs)
      // — but NEVER the sole remaining representative of another primary
      // domain (see the shared victim-protection rule above; this is the
      // exact path a live trace caught sacrificing a session's only legs
      // exercise to add a redundant second push exercise).
      const otherDomainEx = mainEx.filter(e => {
        const eMg = e.exercise.movementGroup ?? '';
        const eDomain = MG_TO_DOMAIN[eMg];
        return eDomain !== domain && !HORIZONTAL_MOVEMENT_GROUPS.has(eMg);
      });

      const victim = pickVictimProtectingDomains(otherDomainEx, mainEx);
      if (!victim) {
        pipelineLog.push(`horizontal_guarantee: SKIPPED add-path for ${targetGroup} — no safe victim outside domain=${domain} (would empty another primary domain)`);
        console.log(`[HorizontalGuarantee] ⏭️  Skipped rich-budget ADD for ${targetGroup} — every other-domain candidate is a sole representative`);
      }
      if (victim) {
        const idx = workoutExercises.findIndex(e => e.exercise.id === victim.exercise.id);
        if (idx >= 0) {
          const victimName = getLocalizedText(victim.exercise.name);
          const victimMg   = victim.exercise.movementGroup ?? '?';

          workoutExercises[idx] = {
            ...workoutExercises[idx],
            ...substituteExercise(
              workoutExercises[idx], substitute.exercise, resolveSubstituteMethod(substitute.exercise, context),
              repLevel - domainLevel, difficulty, context.levelProgressPercent, context.intentMode,
            ),
            programLevel: repLevel,
            isOverLevel: repLevel > domainLevel,
            levelDelta: repLevel - domainLevel,
            reasoning: [
              ...workoutExercises[idx].reasoning,
              `horizontal_guarantee:added(L${repLevel},gap=${gap},mg=${targetGroup},replaced_accessory=${victimMg})`,
            ],
          };

          usedIds.add(substitute.exercise.id);
          pipelineLog.push(`horizontal_guarantee: ADDED "${repName}"(L${repLevel}) replacing accessory "${victimName}"(${victimMg}) — preserved vertical [${targetGroup}]`);
          console.log(`[HorizontalGuarantee] ✅ ADDED "${repName}"(L${repLevel}) replacing accessory "${victimName}"(${victimMg}) — preserved ${verticalCounterpart} [domain=${domain} L${domainLevel}, budget=${domainSets} sets]`);
          return;
        }
      }
    }

    // Standard path: replace lowest-scored same-domain exercise
    const sameDomainVertical = mainEx
      .filter(e => verticalCounterpart && e.exercise.movementGroup === verticalCounterpart)
      .sort((a, b) => a.score - b.score);

    const sameDomainAny = mainEx
      .filter(e => {
        const eMg = e.exercise.movementGroup ?? '';
        if (HORIZONTAL_MOVEMENT_GROUPS.has(eMg)) return false;
        return domain && MG_TO_DOMAIN[eMg] === domain;
      })
      .sort((a, b) => a.score - b.score);

    // sameDomainVertical/sameDomainAny stay unprotected — they replace WITHIN
    // the same domain being enriched, so the domain's own count never drops.
    // Only the final fallback reaches into OTHER domains and needs protection.
    const anyNonHorizontal = mainEx.filter(e => !HORIZONTAL_MOVEMENT_GROUPS.has(e.exercise.movementGroup ?? ''));

    const victim = sameDomainVertical[0] ?? sameDomainAny[0] ?? pickVictimProtectingDomains(anyNonHorizontal, mainEx);
    if (!victim) {
      pipelineLog.push(`horizontal_guarantee: SKIPPED ${targetGroup} — no safe victim to replace (would empty another primary domain)`);
      console.log(`[HorizontalGuarantee] ⚠️ Could not guarantee ${targetGroup} — no safe victim`);
      return;
    }
    const idx = workoutExercises.findIndex(e => e.exercise.id === victim.exercise.id);
    if (idx < 0) return;

    const victimName = getLocalizedText(victim.exercise.name);
    const victimMg   = victim.exercise.movementGroup ?? '?';

    workoutExercises[idx] = {
      ...workoutExercises[idx],
      ...substituteExercise(
        workoutExercises[idx], substitute.exercise, resolveSubstituteMethod(substitute.exercise, context),
        repLevel - domainLevel, difficulty, context.levelProgressPercent, context.intentMode,
      ),
      programLevel: repLevel,
      isOverLevel: repLevel > domainLevel,
      levelDelta: repLevel - domainLevel,
      reasoning: [
        ...workoutExercises[idx].reasoning,
        `horizontal_guarantee:swapped(L${repLevel},gap=${gap},mg=${targetGroup},replaced=${victimMg})`,
      ],
    };

    usedIds.add(substitute.exercise.id);
    pipelineLog.push(`horizontal_guarantee: "${victimName}"(${victimMg}) → "${repName}" (L${repLevel}, gap=${gap}) [${targetGroup}]`);
    console.log(`[HorizontalGuarantee] ✅ "${victimName}"(${victimMg}) → "${repName}" (L${repLevel}, domain=${domain} L${domainLevel}, gap=${gap}) [${targetGroup}]`);
  };

  const hasHPush = mainEx.some(e => e.exercise.movementGroup === 'horizontal_push');
  const hasHPull = mainEx.some(e => e.exercise.movementGroup === 'horizontal_pull');
  if (!hasHPush) tryLevelAwareSwap('horizontal_push');
  if (!hasHPull) tryLevelAwareSwap('horizontal_pull');

  return workoutExercises;
}

// ============================================================================
// PASS 2 — VERTICAL FOUNDATION GUARANTEE
// ============================================================================

/**
 * Step 5d-prime: Vertical Foundation Guarantee.
 *
 * A workout MUST include at least one 'foundation' exercise from
 * vertical_pull (Pull-ups) and one from vertical_push (Dips).
 * If the MG slot was claimed by a skill exercise, inject a foundation
 * exercise by replacing the lowest-scored non-foundation exercise.
 *
 * Stand-down conditions (in order):
 *   • blueprint.strategy === 'single_domain' — track-specialized cycles
 *     (e.g. push-only Planche, pull-only Front Lever) are intentionally
 *     one-sided.  Forcing a vertical_pull foundation into a push-only
 *     session would drag opposing-domain work into a contractually
 *     specialized block and break the track focus.
 *   • context.strictDomains — user-selected domains are respected.
 *   • Empty global pool — nothing to inject from.
 */
export function runVerticalFoundationGuarantee(
  exercises: WorkoutExercise[],
  context: WorkoutGenerationContext,
  blueprint: WorkoutBlueprint,
  difficulty: DifficultyLevel,
  pipelineLog: string[],
): WorkoutExercise[] {
  if (blueprint.strategy === 'single_domain') {
    pipelineLog.push('vertical_foundation: SKIPPED (single_domain strategy)');
    console.log(
      '[VerticalFoundation] ⏭️  Skipped — single_domain strategy ' +
      '(track-specialized session, no antagonist injection)',
    );
    return exercises;
  }
  if (context.strictDomains || !context.globalExercisePool?.length) {
    return exercises;
  }

  let workoutExercises = exercises;
  const mainVFG = workoutExercises.filter(e => e.exerciseRole === 'main');
  const usedIdsVFG = new Set(workoutExercises.map(we => we.exercise.id));
  const poolVFG = context.globalExercisePool;
  const userLevelsVFG = context.userProgramLevels;

  for (const targetMg of VERTICAL_FOUNDATION_GROUPS) {
    const hasFoundationInMg = mainVFG.some(
      e => e.exercise.movementGroup === targetMg && classifyPriority(e.exercise) === 'foundation',
    );
    if (hasFoundationInMg) continue;

    const targetDomain = MG_TO_DOMAIN[targetMg];
    // absent=absent (⑨): don't inject a foundation for a domain the user hasn't assessed.
    if (targetDomain && !userLevelsVFG?.has(targetDomain)) continue;
    const domainLevel = targetDomain
      ? userLevelsVFG!.get(targetDomain)!
      : context.userLevel;

    // D1 anchor: centroid of the Bolt-1 recovery window
    // (`getBolt1WindowAnchor` = domainLevel − 2) so VFG injections stay
    // inside the same admissible window the main pool filter applies.
    // D3 shifts +1 into the challenge zone.
    const vfgTargetLevel =
      difficulty === 1
        ? getBolt1WindowAnchor(domainLevel)
        : domainLevel + (difficulty === 3 ? 1 : 0);

    const foundationCandidates = poolVFG
      .filter(ex => {
        if (usedIdsVFG.has(ex.id)) return false;
        if (ex.movementGroup !== targetMg) return false;
        if (classifyPriority(ex) !== 'foundation') return false;
        const lvl = resolveExerciseLevelForDomains(
          ex,
          targetDomain ? [targetDomain] : [],
          context.activeProgramId,
        ).level;
        return Math.abs(lvl - vfgTargetLevel) <= 6;
      })
      .map(ex => {
        const lvl = resolveExerciseLevelForDomains(
          ex,
          targetDomain ? [targetDomain] : [],
          context.activeProgramId,
        ).level;
        return { exercise: ex, level: lvl, gap: Math.abs(lvl - vfgTargetLevel) };
      })
      .sort((a, b) => a.gap - b.gap);

    const sub = foundationCandidates[0];
    if (!sub) {
      console.warn(`[VerticalFoundation] ⚠️ No foundation candidate for ${targetMg} within ±6 of L${domainLevel}`);
      pipelineLog.push(`vertical_foundation: SKIPPED ${targetMg} — no foundation within ±6`);
      continue;
    }

    // Find victim — priority order:
    // 1. A skill exercise occupying the SAME MG slot (ideal swap)
    // 2. Any skill exercise in the workout (skills are optional accessories)
    // 3. Lowest-scored non-foundation exercise from a non-sole domain
    const skillInSlot = workoutExercises.find(
      e => e.exerciseRole === 'main' &&
           e.exercise.movementGroup === targetMg &&
           classifyPriority(e.exercise) === 'skill',
    );

    const anySkill = !skillInSlot
      ? workoutExercises
          .filter(e => e.exerciseRole === 'main' && classifyPriority(e.exercise) === 'skill')
          .sort((a, b) => a.score - b.score)[0]
      : undefined;

    // Protected: unlike skillInSlot/anySkill (skill moves aren't primary-
    // domain exercises to begin with), this fallback can reach any main
    // exercise — including the sole remaining member of another domain.
    const lowestNonFoundation = pickVictimProtectingDomains(
      workoutExercises.filter(e => e.exerciseRole === 'main' && classifyPriority(e.exercise) !== 'foundation'),
      mainVFG,
    );

    const victim = skillInSlot ?? anySkill ?? lowestNonFoundation;
    if (!victim) {
      pipelineLog.push(`vertical_foundation: SKIPPED ${targetMg} — no safe victim to replace (would empty another primary domain)`);
      console.log(`[VerticalFoundation] ⚠️ Could not guarantee ${targetMg} foundation — no safe victim`);
      continue;
    }

    const idx = workoutExercises.findIndex(e => e.exercise.id === victim.exercise.id);
    if (idx < 0) continue;

    const repName = getLocalizedText(sub.exercise.name);
    const victimName = getLocalizedText(victim.exercise.name);
    const repLevel = Math.min(
      resolveInjectedLevel(sub.exercise, targetMg, domainLevel),
      domainLevel + 6,
    );

    workoutExercises[idx] = {
      ...workoutExercises[idx],
      ...substituteExercise(
        workoutExercises[idx], sub.exercise, resolveSubstituteMethod(sub.exercise, context),
        repLevel - domainLevel, difficulty, context.levelProgressPercent, context.intentMode,
      ),
      programLevel: repLevel,
      isOverLevel: repLevel > domainLevel,
      levelDelta: repLevel - domainLevel,
      reasoning: [
        ...workoutExercises[idx].reasoning,
        `vertical_foundation:injected(L${repLevel},gap=${sub.gap},mg=${targetMg},replaced=${victim.exercise.movementGroup ?? '?'})`,
      ],
    };

    usedIdsVFG.add(sub.exercise.id);
    pipelineLog.push(`vertical_foundation: "${victimName}" → "${repName}" (L${repLevel}) [${targetMg}]`);
    console.log(`[VerticalFoundation] ✅ "${victimName}"(${classifyPriority(victim.exercise)}) → "${repName}"(foundation, L${repLevel}) [${targetMg}, domain=${targetDomain} L${domainLevel}]`);
  }

  return workoutExercises;
}

// ============================================================================
// PASS 3 — FULL-BODY DOMAIN GUARANTEE
// ============================================================================

/**
 * Step 5e: Strict Full-Body Domain Guarantee.
 *
 * Every full_body workout MUST contain at least one exercise from each
 * primary domain: [push, pull, legs].  Fires after Step 5d so the
 * Horizontal Guarantee has already run and we won't double-inject.
 *
 * Strategy: for each missing domain, iterate through its representative
 * movement groups and use findLevelAppropriateSubstitute (progressive ±2→±6)
 * to find a level-appropriate exercise.  The lowest-scored exercise that is
 * NOT the sole representative of another primary domain is replaced.
 */
export function runFullBodyDomainGuarantee(
  exercises: WorkoutExercise[],
  context: WorkoutGenerationContext,
  blueprint: WorkoutBlueprint,
  difficulty: DifficultyLevel,
  pipelineLog: string[],
): WorkoutExercise[] {
  if (blueprint.strategy !== 'full_body' || !context.globalExercisePool?.length) {
    return exercises;
  }

  let workoutExercises = exercises;
  const mainExFB = workoutExercises.filter(e => e.exerciseRole === 'main');
  const usedIdsFB = new Set(workoutExercises.map(we => we.exercise.id));
  const userLevelsMapFB = context.userProgramLevels;
  const poolFB = context.globalExercisePool;

  for (const [domain, mgList] of Object.entries(DOMAIN_MG_CANDIDATES)) {
    const hasDomain = mainExFB.some(e => MG_TO_DOMAIN[e.exercise.movementGroup ?? ''] === domain);
    if (hasDomain) continue;

    // absent=absent (⑨): NEVER guarantee/inject a domain the user has not assessed. has()-guarded —
    // no `?? context.userLevel` back-door (that resurrected the ghost as a global-level injection).
    if (!userLevelsMapFB || !userLevelsMapFB.has(domain)) {
      pipelineLog.push(`full_body_guarantee: '${domain}' absent (unassessed) — skipped, not injected`);
      continue;
    }

    let injected = false;
    const domainLevel = userLevelsMapFB.get(domain)!;
    // For D1, anchor at the centroid of the Bolt-1 recovery window so
    // FullBodyDomainGuarantee injections stay inside the same admissible
    // pool the main filter (`isWithinBolt1Window`) defines.
    const effectiveDomainLevelFB = difficulty === 1
      ? getBolt1WindowAnchor(domainLevel)
      : domainLevel;

    for (const mg of mgList) {
      // strictDomainMatch=true for core ONLY: findLevelAppropriateSubstitute's
      // domain-match filtering (PoolFactory.ts:234-258) already IS the
      // equivalent of hasExplicitCoreLevel/the §12.3 core-slot gate when
      // strict — a candidate without a real targetPrograms['core'] entry is
      // excluded outright rather than falling through to evaluate some OTHER
      // program entry (which would reopen the exact cross-scale bug §12.3
      // closed: a movementGroup='core' exercise like a human_flag skill move
      // getting guarantee-injected via its unrelated flag-program level).
      // push/pull/legs keep the pre-existing non-strict default — unchanged.
      const sub = findLevelAppropriateSubstitute(
        poolFB, mg, effectiveDomainLevelFB, usedIdsFB, userLevelsMapFB, domain, difficulty,
        domain === 'core',
      );
      if (!sub) continue;

      // Replace the lowest-scored exercise that is not the sole member of
      // another primary domain — shared rule, see pickVictimProtectingDomains.
      const victim = pickVictimProtectingDomains(
        workoutExercises.filter(e => e.exerciseRole === 'main' && classifyPriority(e.exercise) !== 'foundation'),
        mainExFB,
      );

      if (!victim) {
        pipelineLog.push(`full_body_guarantee: ${domain} missing but no safe victim to replace`);
        break;
      }

      const idx = workoutExercises.findIndex(e => e.exercise.id === victim.exercise.id);
      if (idx < 0) break;

      const repName    = getLocalizedText(sub.exercise.name);
      const victimName = getLocalizedText(victim.exercise.name);
      // Resolve level from the injected exercise's OWN movement domain,
      // not from the search result (which could pick a full_body level instead).
      // Clamp to domainLevel+6 so no guarantee pass ever displays a level that
      // exceeds the ±6 tolerance applied during candidate selection.
      const injectedLevel = Math.min(
        resolveInjectedLevel(sub.exercise, mg, domainLevel),
        domainLevel + 6,
      );

      workoutExercises[idx] = {
        ...workoutExercises[idx],
        ...substituteExercise(
          workoutExercises[idx], sub.exercise, resolveSubstituteMethod(sub.exercise, context),
          injectedLevel - domainLevel, difficulty, context.levelProgressPercent, context.intentMode,
        ),
        programLevel:  injectedLevel,
        isOverLevel:   injectedLevel > domainLevel,
        levelDelta:    injectedLevel - domainLevel,
        // Protects this exercise from enforceVolumeCap's "core trims first"
        // Phase A removal — see the field's own doc comment
        // (workout-generator.types.ts) for why this is necessary, not
        // cosmetic: a live measurement caught injection succeeding here and
        // the exercise still missing from the final duration-trimmed output.
        isGuaranteedCore: domain === 'core' ? true : workoutExercises[idx].isGuaranteedCore,
        reasoning: [
          ...workoutExercises[idx].reasoning,
          `full_body_guarantee:${domain}(L${injectedLevel},gap=${sub.gap},mg=${mg},replaced=${victim.exercise.movementGroup ?? '?'})`,
        ],
      };

      usedIdsFB.add(sub.exercise.id);
      // Refresh mainExFB counts for next domain iteration
      mainExFB.splice(0, mainExFB.length, ...workoutExercises.filter(e => e.exerciseRole === 'main'));

      pipelineLog.push(`full_body_guarantee: "${victimName}" → "${repName}" (L${injectedLevel}) [domain=${domain}, mg=${mg}]`);
      console.log(`[FullBodyGuarantee] ✅ ${domain} missing → "${repName}"(L${injectedLevel}) replacing "${victimName}" [mg=${mg}, gap=${sub.gap}]`);
      injected = true;
      break;
    }

    if (!injected) {
      console.warn(`[FullBodyGuarantee] ⚠️ Could not guarantee ${domain} domain — no candidate within ±6 of L${domainLevel}`);
      pipelineLog.push(`full_body_guarantee: SKIPPED ${domain} — no candidate within ±6 of L${domainLevel}`);
    }
  }

  return workoutExercises;
}

// ============================================================================
// PASS 4 — POST-CUT PROMISE VALIDATION
// ============================================================================

/**
 * One outcome per checked promise. Logged to `pipelineLog` as
 * `promise_validation:<domain>:outcome=<...>:mechanism=<...>:reason=<...>`
 * (parsed by `scripts/audit/build-snapshot.ts` into the `workouts.
 * core_promise_outcome` column — David, 05.09.2026: "אני רוצה שנמדוד את
 * זה בשאילתה במקום לרדוף אחרי traces").
 *
 *   satisfied — the domain was present, and not because this pass or the
 *               early guarantees had to do anything (ordinary selection).
 *   injected  — present because an EARLIER pass (runFullBodyDomainGuarantee,
 *               inside the generator) injected it and it survived every cut
 *               since. Distinguished from 'satisfied' via `isGuaranteedCore`.
 *   replaced  — THIS pass had to inject it (by replacement) because
 *               whatever was there before this point in the pipeline is
 *               gone now — the exact "guarantee ran, injected successfully,
 *               then enforceVolumeCap/gear-filter/Desk-Workout silently
 *               undid it" failure mode this whole investigation started
 *               from (docs/workout-engine/09-CORE-TABATA.md's follow-up).
 *   failed    — still missing after this pass tried (or couldn't try —
 *               unassessed domain, no candidate, no safe victim).
 */
export interface PromiseCheckResult {
  domain: string;
  mechanism: 'full_body_core' | 'horizontal' | 'vertical_foundation';
  outcome: 'satisfied' | 'injected' | 'replaced' | 'failed';
  reason?: string;
}

/**
 * Duration threshold for the core promise's protection level (David's
 * decision, 05.09.2026): a full-body session ≥20min treats core as
 * PROTECTED — cut only after isolation/accessory exercises are exhausted
 * (see PresentationFormatter.ts's `enforceVolumeCap` duration-aware trim
 * order), and this pass will REPLACE a lower-priority exercise to restore
 * core if it's still missing here. Below 20min, core stays OPTIONAL — it
 * may legitimately trim away for a short, focused session, and this pass
 * only logs the gap rather than forcing a replacement.
 */
const CORE_PROTECTED_DURATION_MIN = 20;

/**
 * Pick the exercise this pass is allowed to replace to make room for a
 * missing promise: the LOWEST-PRIORITY exercise still in the session — not
 * "add a slot" (David: "מאוזן בתקציב מהגדרתו — לא יכול ליצור לולאה",
 * balanced by construction, since nothing is added, only swapped).
 * Isolation/accessory exercises rank first (most replaceable); foundation
 * exercises are never candidates (matches runFullBodyDomainGuarantee's own
 * victim filter); the last remaining exercise of another PRIMARY_DOMAINS
 * domain is protected so fixing core can never silently break push/pull/
 * legs presence.
 */
function pickLowestPriorityVictim(
  mainExercises: WorkoutExercise[],
): WorkoutExercise | undefined {
  const domainCounts = computeDomainCounts(mainExercises);

  const priorityRank = (e: WorkoutExercise): number => {
    if (e.priority === 'isolation' || e.priority === 'accessory') return 0;
    return 1;
  };

  return mainExercises
    .filter(e => classifyPriority(e.exercise) !== 'foundation' && isSafeDomainVictim(e, domainCounts))
    .sort((a, b) => {
      const rankDiff = priorityRank(a) - priorityRank(b);
      if (rankDiff !== 0) return rankDiff;
      return a.score - b.score; // lowest score within the same rank first
    })[0];
}

/**
 * The one ENFORCED promise this pass: full-body sessions have a core
 * exercise. Runs AFTER every other mutation in the per-bolt pipeline
 * (home-workout.service.ts — after the Desk Workout filter, before
 * `sortAndPair`), catching whatever slipped through `enforceVolumeCap`,
 * `applyFlowRegression`'s gear-filter, or the early guarantee's own
 * one-time `hasDomain` check silently being satisfied by an exercise that
 * didn't survive.
 */
function validateCorePromise(
  exercises: WorkoutExercise[],
  context: WorkoutGenerationContext,
  difficulty: DifficultyLevel,
  pipelineLog: string[],
  results: PromiseCheckResult[],
): WorkoutExercise[] {
  const mechanism = 'full_body_core' as const;
  const mainEx = exercises.filter(e => e.exerciseRole === 'main');
  const satisfying = mainEx.find(
    e => MG_TO_DOMAIN[e.exercise.movementGroup ?? ''] === 'core',
  );

  if (satisfying) {
    const outcome = satisfying.isGuaranteedCore ? 'injected' : 'satisfied';
    results.push({ domain: 'core', mechanism, outcome });
    pipelineLog.push(`promise_validation:core:outcome=${outcome}:mechanism=${mechanism}`);
    return exercises;
  }

  const availableTime = context.availableTime ?? 0;
  if (availableTime < CORE_PROTECTED_DURATION_MIN) {
    // Optional at short durations (David's decision) — log the gap, don't force it.
    results.push({ domain: 'core', mechanism, outcome: 'failed', reason: 'optional_below_20min' });
    pipelineLog.push(`promise_validation:core:outcome=failed:mechanism=${mechanism}:reason=optional_below_20min`);
    return exercises;
  }

  const userLevelsMap = context.userProgramLevels;
  if (!userLevelsMap || !userLevelsMap.has('core')) {
    results.push({ domain: 'core', mechanism, outcome: 'failed', reason: 'unassessed' });
    pipelineLog.push(`promise_validation:core:outcome=failed:mechanism=${mechanism}:reason=unassessed`);
    return exercises;
  }

  const pool = context.globalExercisePool ?? [];
  if (!pool.length) {
    results.push({ domain: 'core', mechanism, outcome: 'failed', reason: 'empty_pool' });
    pipelineLog.push(`promise_validation:core:outcome=failed:mechanism=${mechanism}:reason=empty_pool`);
    return exercises;
  }

  const domainLevel = userLevelsMap.get('core')!;
  const usedIds = new Set(exercises.map(e => e.exercise.id));

  let sub: ReturnType<typeof findLevelAppropriateSubstitute> = null;
  let mgUsed = '';
  for (const mg of DOMAIN_MG_CANDIDATES.core) {
    sub = findLevelAppropriateSubstitute(pool, mg, domainLevel, usedIds, userLevelsMap, 'core', difficulty, true);
    if (sub) { mgUsed = mg; break; }
  }

  if (!sub) {
    results.push({ domain: 'core', mechanism, outcome: 'failed', reason: 'no_candidate_within_band' });
    pipelineLog.push(`promise_validation:core:outcome=failed:mechanism=${mechanism}:reason=no_candidate_within_band`);
    console.warn(`[PromiseValidation] ⚠️ core still missing post-cut, no candidate within ±6 of L${domainLevel}`);
    return exercises;
  }

  const victim = pickLowestPriorityVictim(mainEx);
  if (!victim) {
    results.push({ domain: 'core', mechanism, outcome: 'failed', reason: 'no_safe_victim' });
    pipelineLog.push(`promise_validation:core:outcome=failed:mechanism=${mechanism}:reason=no_safe_victim`);
    console.warn('[PromiseValidation] ⚠️ core still missing post-cut, found a candidate but no safe exercise to replace');
    return exercises;
  }

  const idx = exercises.findIndex(e => e.exercise.id === victim.exercise.id);
  if (idx < 0) {
    results.push({ domain: 'core', mechanism, outcome: 'failed', reason: 'victim_not_found' });
    pipelineLog.push(`promise_validation:core:outcome=failed:mechanism=${mechanism}:reason=victim_not_found`);
    return exercises;
  }

  const repName = getLocalizedText(sub.exercise.name);
  const victimName = getLocalizedText(victim.exercise.name);
  const injectedLevel = Math.min(resolveInjectedLevel(sub.exercise, mgUsed, domainLevel), domainLevel + 6);

  const next = [...exercises];
  next[idx] = {
    ...next[idx],
    ...substituteExercise(
      next[idx], sub.exercise, resolveSubstituteMethod(sub.exercise, context),
      injectedLevel - domainLevel, difficulty, context.levelProgressPercent, context.intentMode,
    ),
    programLevel: injectedLevel,
    isOverLevel: injectedLevel > domainLevel,
    levelDelta: injectedLevel - domainLevel,
    isGuaranteedCore: true,
    reasoning: [
      ...next[idx].reasoning,
      `promise_validation:core:replaced_post_cut(L${injectedLevel},gap=${sub.gap},mg=${mgUsed},replaced=${victim.exercise.movementGroup ?? '?'})`,
    ],
  };

  results.push({ domain: 'core', mechanism, outcome: 'replaced', reason: `replaced "${victimName}"` });
  pipelineLog.push(`promise_validation:core:outcome=replaced:mechanism=${mechanism}:replaced="${victimName}"→"${repName}"`);
  console.log(`[PromiseValidation] ✅ core restored post-cut: "${repName}"(L${injectedLevel}) replacing "${victimName}"`);
  return next;
}

/**
 * Horizontal push/pull and Vertical Foundation checks — LOG ONLY this pass
 * (David's explicit scope decision, 05.09.2026): the traced failure data
 * only showed core actually failing in practice; changing horizontal/
 * vertical's established behavior here risks altering real pull-up/dip
 * sessions for a promise that isn't measured to be breaking. If the log
 * data collected this way later shows real failures, enforcement can be
 * turned on for them the same way core's is, in a separate pass.
 */
function logHorizontalAndVerticalPromises(
  exercises: WorkoutExercise[],
  pipelineLog: string[],
  results: PromiseCheckResult[],
): void {
  const mainEx = exercises.filter(e => e.exerciseRole === 'main');

  for (const mg of ['horizontal_push', 'horizontal_pull'] as const) {
    const satisfying = mainEx.find(e => e.exercise.movementGroup === mg);
    const outcome = satisfying ? 'satisfied' : 'failed';
    results.push({ domain: mg, mechanism: 'horizontal', outcome });
    pipelineLog.push(`promise_validation:${mg}:outcome=${outcome}:mechanism=horizontal:enforced=false`);
  }

  for (const mg of VERTICAL_FOUNDATION_GROUPS) {
    const satisfying = mainEx.some(
      e => e.exercise.movementGroup === mg && classifyPriority(e.exercise) === 'foundation',
    );
    const outcome = satisfying ? 'satisfied' : 'failed';
    results.push({ domain: mg, mechanism: 'vertical_foundation', outcome });
    pipelineLog.push(`promise_validation:${mg}:outcome=${outcome}:mechanism=vertical_foundation:enforced=false`);
  }
}

/**
 * Entry point for the post-cut validation pass. Placement (David-approved,
 * verified via the full mutation-sequence map): home-workout.service.ts,
 * after the Desk Workout Constraint filter, before `sortAndPair` — the
 * true last point every per-bolt mutation (warmup/cooldown, intense/flow-
 * regression + its gear-filter, enforceVolumeCap, desk-workout) has already
 * run, and before the final sort locks exercise order.
 */
export function validatePromisesPostCut(
  exercises: WorkoutExercise[],
  context: WorkoutGenerationContext,
  blueprint: WorkoutBlueprint,
  difficulty: DifficultyLevel,
  pipelineLog: string[],
): { exercises: WorkoutExercise[]; results: PromiseCheckResult[] } {
  const results: PromiseCheckResult[] = [];
  if (blueprint.strategy !== 'full_body') {
    return { exercises, results };
  }

  const afterCore = validateCorePromise(exercises, context, difficulty, pipelineLog, results);
  logHorizontalAndVerticalPromises(afterCore, pipelineLog, results);

  return { exercises: afterCore, results };
}

// ============================================================================
// UNIFIED ENTRY POINT
// ============================================================================

/**
 * Run all 3 coverage guarantee passes in their canonical order:
 *
 *   1. Horizontal Guarantee
 *   2. Vertical Foundation Guarantee  — skipped for single_domain strategy
 *   3. Full-Body Domain Guarantee
 *
 * Single-domain stand-down (defense in depth):
 *   When `blueprint.strategy === 'single_domain'`, the Vertical Foundation
 *   Guarantee is bypassed at this orchestration layer in addition to the
 *   early-return inside the function itself.  Track-specialized cycles
 *   (push-only Planche, pull-only Front Lever) are intentionally
 *   one-sided and must not be force-balanced with antagonist work.  The
 *   Horizontal and Full-Body guarantees still run because they own
 *   independent contracts (presence, not antagonist balance).
 *
 * The returned list is the result of the chained transforms.
 */
export function runAllGuarantees(
  exercises: WorkoutExercise[],
  context: WorkoutGenerationContext,
  blueprint: WorkoutBlueprint,
  difficulty: DifficultyLevel,
  pipelineLog: string[],
): WorkoutExercise[] {
  let next = runHorizontalGuarantee(exercises, context, blueprint, difficulty, pipelineLog);

  if (blueprint.strategy !== 'single_domain') {
    next = runVerticalFoundationGuarantee(next, context, blueprint, difficulty, pipelineLog);
  } else {
    pipelineLog.push(
      'vertical_foundation: SKIPPED at runAllGuarantees (single_domain strategy)',
    );
    console.log(
      '[GuaranteePassRunner] ⏭️  Bypassing VerticalFoundationGuarantee — ' +
      'single_domain strategy (track-specialized session)',
    );
  }

  next = runFullBodyDomainGuarantee(next, context, blueprint, difficulty, pipelineLog);
  return next;
}
