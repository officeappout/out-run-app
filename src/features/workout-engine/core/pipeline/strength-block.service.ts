/**
 * strength-block.service — time-budgeted strength BLOCK generation
 * (HYBRID_ENGINE_DESIGN.md §5 build item 2).
 *
 * ⚠️ SHARED building block: consumed by BOTH the hybrid station composer
 * (composeHybridSession) and the "צור אימון" block-builder. Behavior changes
 * here affect both — that is the point (single source of truth).
 *
 * COMPOSITION-LAYER LAW: zero engine surgery. A block is the EXISTING
 * pipeline driven through existing knobs:
 *   • availableTime = blockMinutes  → DURATION_SCALING ≤10-min tier
 *     (2-3 exercises, no accessories) — the tier table already knows blocks.
 *   • protocolProbability = 0 + preferredProtocols = [] → selectProtocol
 *     provably returns straight sets (WorkoutGenerator.selectProtocol guard).
 *   • requiredDomains + strictDomains + domainBudgets → station domain focus.
 *   • Warmup/cooldown are NOT appended — they live in home-workout.service
 *     (prependWarmupExercises / appendCooldownExercises), not in the pure
 *     pipeline. A block's warm-up is the surrounding aerobic leg (hybrid)
 *     or the builder's own choice ("צור אימון").
 *
 * The ONLY logic that lives here is the rest post-pass (decision 5,
 * 08.07.2026): consumer-selected rest multiplier with a skill/isometric
 * exemption — implemented once so both consumers behave identically.
 *
 * ISOMORPHIC: pure TypeScript. No hooks, no Firebase, no browser APIs.
 */

import type { ScoredExercise } from '../../logic/contextual-engine.types';
import type {
  GeneratedWorkout,
  WorkoutExercise,
  WorkoutGenerationContext,
} from '../../logic/workout-generator.types';
import { createPipelineOrchestrator } from './PipelineOrchestrator';

export type BlockDomainFocus = 'push' | 'pull' | 'legs_core';

/** Maps the station focus to the engine's domain vocabulary. */
const FOCUS_TO_DOMAINS: Record<BlockDomainFocus, string[]> = {
  push: ['push'],
  pull: ['pull'],
  legs_core: ['legs', 'core'],
};

export interface StrengthBlockRequest {
  /** Time budget for the block, minutes. Hybrid stations pass 8-12. */
  blockMinutes: number;
  /**
   * Level-aware, location/equipment-filtered pool — the SAME pool the caller
   * would hand the full pipeline (ContextualEngine output). The block service
   * never builds pools itself.
   */
  scoredPool: ScoredExercise[];
  /**
   * Base generation context from the caller (levels, equipment, persona,
   * injuries already resolved upstream). The service clones it — the caller's
   * object is never mutated.
   */
  context: WorkoutGenerationContext;
  /** Optional station focus. Omit for a mixed block. */
  domainFocus?: BlockDomainFocus;
  /**
   * Rest post-pass (decision 5). Hybrid stations pass
   * `{ multiplier: 0.5, exemptSkillAndIsometric: true }` — the run to the
   * next station is the recovery. "צור אימון" typically omits (full rests).
   */
  rest?: {
    /** Applied to every non-exempt exercise's restSeconds. Clamped ≥ 0.25. */
    multiplier: number;
    /**
     * When true, skill-priority and isometric straight-arm work
     * (planche / front-lever / handstand families) keep FULL tier rest —
     * CNS-heavy holds are not recoverable on a jog (decision 5).
     */
    exemptSkillAndIsometric?: boolean;
  };
}

export interface StrengthBlockResult {
  exercises: WorkoutExercise[];
  /** From the engine's own time model (3 s/rep, ×2 unilateral, transitions). */
  estimatedDurationSec: number;
  totalPlannedSets: number;
  domainFocus?: BlockDomainFocus;
  /** True when the pipeline's empty-pool fallback fired — caller must skip the station. */
  isEmpty: boolean;
  /** Pipeline diagnostic log (merged: orchestrator + block post-pass). */
  log: string[];
}

/** Rest-exemption rule (decision 5) — one implementation for all consumers. */
function isRestExempt(ex: WorkoutExercise): boolean {
  if (ex.priority === 'skill') return true;
  // Isometric straight-arm holds: time-based + straight_arm mechanics.
  if (ex.isTimeBased && ex.mechanicalType === 'straight_arm') return true;
  return false;
}

const MIN_REST_MULTIPLIER = 0.25;

/**
 * Generate one time-budgeted strength block through the existing pipeline.
 * Pure and stateless — safe for concurrent multi-station composition.
 */
export function generateStrengthBlock(request: StrengthBlockRequest): StrengthBlockResult {
  const { blockMinutes, scoredPool, domainFocus } = request;
  const log: string[] = [`block: budget=${blockMinutes}min focus=${domainFocus ?? 'mixed'}`];

  // Clone — never mutate the caller's context.
  const blockContext: WorkoutGenerationContext = {
    ...request.context,
    availableTime: blockMinutes,
    // Straight sets only: probability 0 + empty list each independently force
    // selectProtocol's straight-sets path (belt and suspenders).
    protocolProbability: 0,
    preferredProtocols: [],
    ...(domainFocus
      ? {
          requiredDomains: FOCUS_TO_DOMAINS[domainFocus],
          strictDomains: true,
          // Narrow existing domainBudgets to the focus domains (if provided
          // upstream) so set-distribution math stays budget-aware.
          domainBudgets: request.context.domainBudgets?.filter((b) =>
            FOCUS_TO_DOMAINS[domainFocus].includes(b.domain),
          ),
        }
      : {}),
  };

  const orchestrator = createPipelineOrchestrator();
  const result = orchestrator.run(scoredPool, blockContext);
  const workout: GeneratedWorkout = result.workout;
  log.push(...result.log);

  if (result.usedEmptyPoolFallback || workout.exercises.length === 0) {
    log.push('block: empty pool — station must be skipped by caller');
    return {
      exercises: [],
      estimatedDurationSec: 0,
      totalPlannedSets: 0,
      domainFocus,
      isEmpty: true,
      log,
    };
  }

  // ── Rest post-pass (decision 5) ──────────────────────────────────────────
  let exercises = workout.exercises;
  let restSecondsSaved = 0;
  if (request.rest && request.rest.multiplier !== 1) {
    const multiplier = Math.max(MIN_REST_MULTIPLIER, request.rest.multiplier);
    exercises = exercises.map((ex) => {
      if (request.rest!.exemptSkillAndIsometric && isRestExempt(ex)) return ex;
      const newRest = Math.round(ex.restSeconds * multiplier);
      restSecondsSaved += (ex.restSeconds - newRest) * ex.sets;
      return { ...ex, restSeconds: newRest };
    });
    log.push(`block: rest×${multiplier} applied (saved ~${restSecondsSaved}s across sets)`);
  }

  // Duration: reuse the engine's own estimate, corrected for the rest cut —
  // no second time model (composition law).
  const estimatedDurationSec = Math.max(
    0,
    Math.round((workout.estimatedDuration ?? blockMinutes) * 60) - restSecondsSaved,
  );

  return {
    exercises,
    estimatedDurationSec,
    totalPlannedSets: exercises.reduce((acc, ex) => acc + ex.sets, 0),
    domainFocus,
    isEmpty: false,
    log,
  };
}
