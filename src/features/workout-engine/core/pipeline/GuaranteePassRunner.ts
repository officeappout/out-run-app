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

/** Per-domain candidate movement groups for the Full-Body domain guarantee. */
const DOMAIN_MG_CANDIDATES: Record<string, string[]> = {
  push: ['vertical_push', 'horizontal_push'],
  pull: ['vertical_pull', 'horizontal_pull'],
  legs: ['squat', 'hinge', 'lunge'],
};

const PRIMARY_DOMAINS = new Set(['push', 'pull', 'legs']);

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
    const domainLevel = domain
      ? (userLevelsMap?.get(domain) ?? context.userLevel)
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
      const otherDomainEx = mainEx
        .filter(e => {
          const eMg = e.exercise.movementGroup ?? '';
          const eDomain = MG_TO_DOMAIN[eMg];
          return eDomain !== domain && !HORIZONTAL_MOVEMENT_GROUPS.has(eMg);
        })
        .sort((a, b) => a.score - b.score);

      const victim = otherDomainEx[0];
      if (victim) {
        const idx = workoutExercises.findIndex(e => e.exercise.id === victim.exercise.id);
        if (idx >= 0) {
          const victimName = getLocalizedText(victim.exercise.name);
          const victimMg   = victim.exercise.movementGroup ?? '?';

          workoutExercises[idx] = {
            ...workoutExercises[idx],
            ...substituteExercise(workoutExercises[idx], substitute.exercise, resolveSubstituteMethod(substitute.exercise, context)),
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

    const anyNonHorizontal = mainEx
      .filter(e => !HORIZONTAL_MOVEMENT_GROUPS.has(e.exercise.movementGroup ?? ''))
      .sort((a, b) => a.score - b.score);

    const victim = sameDomainVertical[0] ?? sameDomainAny[0] ?? anyNonHorizontal[0];
    if (!victim) return;
    const idx = workoutExercises.findIndex(e => e.exercise.id === victim.exercise.id);
    if (idx < 0) return;

    const victimName = getLocalizedText(victim.exercise.name);
    const victimMg   = victim.exercise.movementGroup ?? '?';

    workoutExercises[idx] = {
      ...workoutExercises[idx],
      ...substituteExercise(workoutExercises[idx], substitute.exercise, resolveSubstituteMethod(substitute.exercise, context)),
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
    const domainLevel = targetDomain
      ? (userLevelsVFG?.get(targetDomain) ?? context.userLevel)
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

    const lowestNonFoundation = workoutExercises
      .filter(e => {
        if (e.exerciseRole !== 'main') return false;
        if (classifyPriority(e.exercise) === 'foundation') return false;
        return true;
      })
      .sort((a, b) => a.score - b.score)[0];

    const victim = skillInSlot ?? anySkill ?? lowestNonFoundation;
    if (!victim) continue;

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
      ...substituteExercise(workoutExercises[idx], sub.exercise, resolveSubstituteMethod(sub.exercise, context)),
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

    let injected = false;
    const domainLevel = userLevelsMapFB?.get(domain) ?? context.userLevel;
    // For D1, anchor at the centroid of the Bolt-1 recovery window so
    // FullBodyDomainGuarantee injections stay inside the same admissible
    // pool the main filter (`isWithinBolt1Window`) defines.
    const effectiveDomainLevelFB = difficulty === 1
      ? getBolt1WindowAnchor(domainLevel)
      : domainLevel;

    for (const mg of mgList) {
      const sub = findLevelAppropriateSubstitute(poolFB, mg, effectiveDomainLevelFB, usedIdsFB, userLevelsMapFB, domain, difficulty);
      if (!sub) continue;

      // Replace the lowest-scored exercise that is not the sole member of another primary domain
      const domainCounts = new Map<string, number>();
      for (const e of mainExFB) {
        const d = MG_TO_DOMAIN[e.exercise.movementGroup ?? ''];
        if (d) domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
      }

      const victim = workoutExercises
        .filter(e => {
          if (e.exerciseRole !== 'main') return false;
          // Never replace a foundation exercise (Pull-ups, Dips, etc.)
          if (classifyPriority(e.exercise) === 'foundation') return false;
          const eMg   = e.exercise.movementGroup ?? '';
          const eDomain = MG_TO_DOMAIN[eMg];
          // Never steal the last exercise of another required domain
          if (PRIMARY_DOMAINS.has(eDomain ?? '') && (domainCounts.get(eDomain!) ?? 0) <= 1) return false;
          return true;
        })
        .sort((a, b) => a.score - b.score)[0];

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
        ...substituteExercise(workoutExercises[idx], sub.exercise, resolveSubstituteMethod(sub.exercise, context)),
        programLevel:  injectedLevel,
        isOverLevel:   injectedLevel > domainLevel,
        levelDelta:    injectedLevel - domainLevel,
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
