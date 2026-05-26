/**
 * ProtocolInjector — Stateless Protocol Dispatch Module
 *
 * Responsible for a single, well-defined transformation:
 *
 *   WorkoutExercise[]  →  ProtocolInjectorResult
 *     (protocol selected → exercises stamped → physiologically sorted)
 *
 * Migrated from WorkoutGenerator.ts Steps 5 / 5b / 5f and the private
 * `selectProtocol()` + module-level `selectPyramidTargets()` helpers.
 *
 * Pipeline position (enforced in this module, not negotiable):
 *   1. selectProtocol()        — Firestore-driven + native single-domain guard
 *   2. applyPhysiologicalSort() — first pass (pre-processor order)
 *   3. processor.process()     — pyramid surgical stamp or full-list mutator
 *   4. processor.mutateStructure() — optional structure override
 *   5. deduplicateExercises()  — remove processor-introduced duplicates
 *   6. applyPhysiologicalSort() — second pass (anchors guarantee-injected slots)
 *   7. applyDomainPrioritySort() — ABSOLUTE LAST structural operation
 *
 * NEVER move applyDomainPrioritySort() earlier — VolumeGuard pruning and
 * antagonist-pair re-application must have already happened before this call
 * so legs are not incorrectly promoted above push/pull.
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs.
 */

import type {
  DifficultyLevel,
  WorkoutExercise,
  WorkoutGenerationContext,
  WorkoutStructure,
} from '../../logic/workout-generator.types';
import {
  applyPhysiologicalSort,
  applyDomainPrioritySort,
  deduplicateExercises,
} from '../../logic/workout-sorting.utils';
import { findProcessor } from '../../logic/protocols/protocol-processor.registry';
import type { ProtocolHints } from './pipeline.types';

// ============================================================================
// PYRAMID TARGET SELECTION
// ============================================================================

/**
 * Movement groups that count as dominant upper-body compound / skill work
 * — the natural home for a pyramid stamp.  Anything outside this set is
 * eligible only as a fallback when no upper compound is present in the
 * workout (e.g. pure legs day or core-only sessions).
 */
const PYRAMID_UPPER_COMPOUND_MGS = new Set<string>([
  'vertical_push',  'horizontal_push',
  'vertical_pull',  'horizontal_pull',
  'muscle_up',
  'handstand_pushup',
  'planche',
]);

/**
 * Pick 1–2 exercises to receive the pyramid protocol stamp.
 *
 * Algorithm (mirrors WorkoutGenerator.ts — do NOT diverge):
 *   1. Collect main exercises whose movement group is in PYRAMID_UPPER_COMPOUND_MGS
 *      AND whose priority is 'compound' | 'skill'.
 *   2. If found → sort by score desc, take 1 or 2 (random 50/50, capped by pool).
 *   3. If NOT found → fall back to the highest-scored main exercise regardless
 *      of movement group (legs/core can host a pyramid when they are the
 *      standalone focus, but are never pulled in alongside an upper compound).
 *
 * Returns the same WorkoutExercise references so processor mutations
 * propagate back into the caller's array automatically.
 */
function selectPyramidTargets(exercises: WorkoutExercise[]): WorkoutExercise[] {
  const mainEx = exercises.filter((e) => (e.exerciseRole ?? 'main') === 'main');
  if (mainEx.length === 0) return [];

  const upperCompounds = mainEx.filter((e) => {
    const mg = e.exercise.movementGroup ?? '';
    if (!PYRAMID_UPPER_COMPOUND_MGS.has(mg)) return false;
    return e.priority === 'compound' || e.priority === 'skill';
  });

  const pool = upperCompounds.length > 0 ? upperCompounds : mainEx;

  const ranked = pool.slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const desired = Math.random() < 0.5 ? 1 : 2;
  const take = Math.min(desired, ranked.length);
  return ranked.slice(0, take);
}

// ============================================================================
// RESULT TYPE
// ============================================================================

export interface ProtocolInjectorResult {
  exercises: WorkoutExercise[];
  /** Resolved workout structure (overridden by processor if applicable) */
  structure: WorkoutStructure;
  /**
   * The protocol that was actually applied (undefined = straight sets).
   * Propagated to GeneratedWorkout.appliedProtocol in PipelineOrchestrator.
   */
  appliedProtocol: string | undefined;
  /** True when the single-domain intense pyramid floor override fired */
  singleDomainPyramidOverride: boolean;
  /** Diagnostic log entries for the workout pipeline log */
  log: string[];
}

// ============================================================================
// PROTOCOL INJECTOR
// ============================================================================

export class ProtocolInjector {
  /**
   * Full protocol injection + sorting sequence.
   *
   * @param exercises       WorkoutExercise[] from BudgetDistributor (sets/reps stamped)
   * @param context         Full generation context (preferredProtocols, gender, etc.)
   * @param difficulty      1 | 2 | 3
   * @param hints           Distilled protocol configuration from StructureDirector
   * @param isSingleDomain  True when requiredDomains.length === 1
   */
  inject(
    exercises: WorkoutExercise[],
    context: WorkoutGenerationContext,
    difficulty: DifficultyLevel,
    hints: ProtocolHints,
    isSingleDomain: boolean,
  ): ProtocolInjectorResult {
    const log: string[] = [];

    // ── Step 1: Select protocol ──────────────────────────────────────────────
    const { structure, setType, singleDomainPyramidOverride } =
      this._selectProtocol(difficulty, context, hints, isSingleDomain, log);

    // ── Step 2: First physiological sort (pre-processor) ─────────────────────
    // Female full_body users get legs first (Tier 0) — more approachable ordering
    const isFemaleFullBody =
      context.gender === 'female' &&
      (context.activeProgramId === 'full_body' ||
        context.splitType?.startsWith('full_body'));
    let sorted = applyPhysiologicalSort(exercises, { femaleFullBody: isFemaleFullBody });

    // ── Step 3: Protocol processor dispatch ─────────────────────────────────
    let resolvedSetType = setType;
    let resolvedStructure: WorkoutStructure = structure;

    const processor = findProcessor(resolvedSetType);
    if (processor) {
      if (resolvedSetType === 'pyramid') {
        // Pyramid is SURGICAL: stamp only 1-2 dominant upper-body exercises,
        // not the entire list. Other exercises keep standard straight sets.
        const pyramidTargets = selectPyramidTargets(sorted);
        if (pyramidTargets.length === 0) {
          log.push('pyramid: no main exercises available — reverting to straight sets');
          console.log('[ProtocolInjector] Pyramid rolled but no main exercises to target — reverting to straight sets');
          resolvedSetType = 'straight';
        } else {
          const targetNames = pyramidTargets
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((t) => (t.exercise.name as any)?.he ?? t.exercise.id)
            .join(', ');
          const mainCount = sorted.filter((e) => (e.exerciseRole ?? 'main') === 'main').length;
          console.log(
            `[ProtocolInjector] Pyramid applied to ${pyramidTargets.length}/${mainCount} ` +
            `main exercise(s): ${targetNames}`,
          );
          log.push(`pyramid: stamped ${pyramidTargets.length}/${mainCount} exercise(s) (${targetNames})`);
          processor.process(pyramidTargets, context);
        }
      } else {
        sorted = processor.process(sorted, context);
        log.push(`protocol_applied: ${resolvedSetType}`);
      }

      // Optional: processor can override workout structure (e.g. emom → 'emom')
      if (processor.mutateStructure) {
        resolvedStructure = processor.mutateStructure(resolvedStructure);
        if (resolvedStructure !== structure) {
          log.push(`structure_override: ${structure} → ${resolvedStructure}`);
        }
      }
    } else if (resolvedSetType !== 'straight') {
      log.push(`protocol_not_found: "${resolvedSetType}" — no processor registered`);
    }

    // ── Step 4: Deduplicate ──────────────────────────────────────────────────
    sorted = deduplicateExercises(sorted);

    // ── Step 5: Second physiological sort ────────────────────────────────────
    // Re-anchors any guarantee-injected exercises into the correct tier after
    // processor mutations may have changed pairing/ordering.
    sorted = applyPhysiologicalSort(sorted, { femaleFullBody: isFemaleFullBody });
    log.push('physiological_sort: second pass complete');

    // ── Step 6: Domain priority sort — ABSOLUTE LAST OPERATION ───────────────
    // Must run AFTER VolumeGuard pruning and antagonist-pair re-application
    // (which live in home-workout.service.ts).
    // ProtocolInjector is the last structural gate in this pipeline module.
    sorted = applyDomainPrioritySort(sorted);
    log.push('domain_priority_sort: complete');

    return {
      exercises: sorted,
      structure: resolvedStructure,
      appliedProtocol: resolvedSetType !== 'straight' ? resolvedSetType : undefined,
      singleDomainPyramidOverride,
      log,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Resolves the active protocol name and workout structure.
   *
   * Decision tree (mirrors WorkoutGenerator.selectProtocol — do NOT diverge):
   *   1. difficulty === 1  → always straight sets (Bolt guard)
   *   2. no protocols list → straight sets
   *   3. probability === 0 → straight sets (deload / multiplier killed it)
   *   4. random roll > probability → straight sets (probabilistic gate)
   *   5. otherwise → pick a protocol from the list at random
   *
   * Native override (new in ProtocolInjector):
   *   If `hints.forcePyramidOnSingleDomainIntense` is true (set by
   *   StructureDirector when difficulty === 3 && isSingleDomain),
   *   the effective probability floor is raised to 0.6 and 'pyramid' is
   *   guaranteed to be in the candidate list so peak pyramids fire reliably
   *   even when Firestore probability is low or unset.
   */
  private _selectProtocol(
    difficulty: DifficultyLevel,
    context: WorkoutGenerationContext,
    hints: ProtocolHints,
    isSingleDomain: boolean,
    log: string[],
  ): { structure: WorkoutStructure; setType: string; singleDomainPyramidOverride: boolean } {
    // Diagnostic
    console.log(
      `[ProtocolInjector][selectProtocol] difficulty=${difficulty} | ` +
      `adminProtocols=${JSON.stringify(context.preferredProtocols ?? null)} | ` +
      `adminProbability=${context.protocolProbability ?? 'undefined'} | ` +
      `periodizationWeek=${context.periodizationWeek ?? 'n/a'} | ` +
      `isSingleDomain=${isSingleDomain}`,
    );

    const straight = { structure: 'standard' as WorkoutStructure, setType: 'straight', singleDomainPyramidOverride: false };

    // ── Bolt 1: Easy sessions always use straight sets ───────────────────────
    if (difficulty === 1) {
      log.push('select_protocol: difficulty=1 → straight sets (Bolt guard)');
      console.log('[ProtocolInjector][selectProtocol] Bolt 1 → always straight sets');
      return straight;
    }

    // ── Firestore configuration ───────────────────────────────────────────────
    let adminProtocols = context.preferredProtocols ? [...context.preferredProtocols] : undefined;
    let adminProbability = context.protocolProbability;

    // ── Native single-domain intense override ────────────────────────────────
    // When StructureDirector flags forcePyramidOnSingleDomainIntense (difficulty=3
    // + isSingleDomain), raise the probability floor to 0.6 and ensure 'pyramid'
    // is in the candidate list.  This guarantees peak-session pyramids even when
    // Firestore configuration is missing or probability is set very low.
    let singleDomainPyramidOverride = false;
    if (hints.forcePyramidOnSingleDomainIntense && isSingleDomain && difficulty === 3) {
      const SINGLE_DOMAIN_PYRAMID_FLOOR = 0.6;
      // Raise probability if below the floor
      if ((adminProbability ?? 0) < SINGLE_DOMAIN_PYRAMID_FLOOR) {
        log.push(
          `single_domain_pyramid_override: probability ${adminProbability ?? 0} → ${SINGLE_DOMAIN_PYRAMID_FLOOR}`,
        );
        adminProbability = SINGLE_DOMAIN_PYRAMID_FLOOR;
      }
      // Inject 'pyramid' into the protocols list if not already present
      if (!adminProtocols?.includes('pyramid')) {
        adminProtocols = [...(adminProtocols ?? []), 'pyramid'];
        log.push(`single_domain_pyramid_override: injected 'pyramid' into protocol list`);
      }
      singleDomainPyramidOverride = true;
      console.log(
        `[ProtocolInjector][selectProtocol] 🔺 Single-domain D3 override: ` +
        `p=${adminProbability}, protocols=[${adminProtocols.join(', ')}]`,
      );
    }

    // ── No protocols list ────────────────────────────────────────────────────
    if (!adminProtocols?.length) {
      if (adminProbability != null && adminProbability > 0) {
        console.log('[ProtocolInjector][selectProtocol] ⚠️  Probability set but no protocols list — check Firestore');
        log.push('select_protocol: probability set but no protocols list');
      } else {
        console.log('[ProtocolInjector][selectProtocol] No protocols configured — straight sets');
        log.push('select_protocol: no protocols configured → straight sets');
      }
      return straight;
    }

    const probability = adminProbability ?? 0;

    // ── Probability gate: 0 ──────────────────────────────────────────────────
    if (probability <= 0) {
      console.log(
        '[ProtocolInjector][selectProtocol] ⛔ Protocol probability = 0 ' +
        '(Deload/Rebuild week or protocolMultiplier killed it) — straight sets',
      );
      log.push('select_protocol: probability=0 → straight sets');
      return straight;
    }

    // ── Probabilistic roll ───────────────────────────────────────────────────
    const roll = Math.random();
    if (roll > probability) {
      console.log(
        `[ProtocolInjector][selectProtocol] Random roll ${roll.toFixed(3)} > p=${probability} — ` +
        `protocol did NOT fire this session (expected ~${Math.round((1 - probability) * 100)}% of the time)`,
      );
      log.push(`select_protocol: roll=${roll.toFixed(3)} > p=${probability} → straight sets`);
      return { ...straight, singleDomainPyramidOverride };
    }

    // ── Protocol selected ────────────────────────────────────────────────────
    const selected = adminProtocols[Math.floor(Math.random() * adminProtocols.length)];
    console.log(
      `[ProtocolInjector][selectProtocol] ✅ Protocol injected: "${selected}" ` +
      `(roll=${roll.toFixed(3)} ≤ p=${probability}, options=[${adminProtocols.join(', ')}])`,
    );
    log.push(`select_protocol: "${selected}" selected (roll=${roll.toFixed(3)}, p=${probability})`);

    // EMOM overrides the workout structure but keeps straight set stamping
    if (selected === 'emom') {
      return { structure: 'emom', setType: 'straight', singleDomainPyramidOverride };
    }

    return { structure: 'standard', setType: selected, singleDomainPyramidOverride };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Returns a fresh ProtocolInjector instance.
 * The stateless factory pattern ensures each call site (PipelineOrchestrator)
 * gets an isolated instance with no cross-option state contamination.
 */
export function createProtocolInjector(): ProtocolInjector {
  return new ProtocolInjector();
}
