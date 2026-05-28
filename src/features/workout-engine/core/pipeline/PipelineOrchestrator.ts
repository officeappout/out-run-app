/**
 * PipelineOrchestrator — Master Pipeline Coordinator
 *
 * Responsible for the end-to-end workout generation pipeline:
 *
 *   ScoredExercise[]  →  GeneratedWorkout
 *
 * This is the primary entry point for the Tokenized Block Engine.
 * It orchestrates StructureDirector, PoolFactory, BudgetDistributor,
 * and ProtocolInjector in a clean, stateless sequence.
 *
 * Safety Contracts
 * ────────────────
 * 1. Empty-pool short-circuit — if totalCandidates === 0 after all rescue
 *    attempts, immediately return buildRestDayFallback() to prevent an
 *    empty workout UI crash.
 * 2. profileStale detection — if all userProgramLevels are ≤ 1, log a
 *    structured warning and proceed with L1 defaults (generation continues;
 *    caller is responsible for showing a "Calculating profile" hint).
 * 3. Stateless factory pattern — createPipelineOrchestrator() returns a
 *    fresh instance each time, ensuring no mutable instance state
 *    contaminates concurrent trio-option generation.
 *
 * Architecture note (Phase 6 thin-shim):
 * The orchestrator currently delegates the core exercise selection, guarantee
 * passes, and stats calculation to WorkoutGenerator.generateWorkout() which
 * is now blueprint-aware (Phase 4). BudgetDistributor and ProtocolInjector
 * are wired and available; they will progressively replace the corresponding
 * WorkoutGenerator steps in future phases as the migration matures.
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs.
 */

import type { ScoredExercise } from '../../logic/contextual-engine.types';
import type {
  DifficultyLevel,
  GeneratedWorkout,
  WorkoutExercise,
  WorkoutGenerationContext,
} from '../../logic/workout-generator.types';
import { createWorkoutGenerator } from '../../logic/WorkoutGenerator';
import { createBudgetDistributor } from './BudgetDistributor';
import { createStructureDirector } from './StructureDirector';
import { filterForDomain, PoolFactory } from './PoolFactory';
import { resolveToSlug } from '../../services/program-hierarchy.utils';

// ============================================================================
// REST-DAY FALLBACK
// ============================================================================

/**
 * Builds a valid rest-day GeneratedWorkout payload for the empty-pool
 * short-circuit guard.  The output is structurally identical to the recovery
 * workout produced by home-workout.service.ts::generateRecoveryWorkout so
 * the UI never receives an undefined or structurally incomplete workout.
 */
export function buildRestDayFallback(context: WorkoutGenerationContext): GeneratedWorkout {
  return {
    title: 'יום מנוחה',
    description: 'לא נמצאו תרגילים מתאימים — מומלץ לנוח היום.',
    exercises: [] as WorkoutExercise[],
    estimatedDuration: 0,
    structure: 'standard' as const,
    difficulty: (context.difficulty ?? 1) as DifficultyLevel,
    mechanicalBalance: {
      straightArm: 0,
      bentArm: 0,
      hybrid: 0,
      ratio: '0:0',
      isBalanced: true,
    },
    stats: {
      calories: 0,
      coins: 0,
      totalReps: 0,
      totalHoldTime: 0,
      difficultyMultiplier: 1,
    },
    isRecovery: true,
    totalPlannedSets: 0,
    pipelineLog: ['orchestrator: empty_pool_fallback — no exercises survived filter'],
  };
}

// ============================================================================
// ORCHESTRATOR RESULT
// ============================================================================

export interface OrchestratorResult {
  workout: GeneratedWorkout;
  /** True when the empty-pool fallback fired */
  usedEmptyPoolFallback: boolean;
  /** True when profileStale was detected */
  profileStale: boolean;
  /** Diagnostic log entries merged into workout.pipelineLog */
  log: string[];
}

// ============================================================================
// PIPELINE ORCHESTRATOR
// ============================================================================

export class PipelineOrchestrator {
  /**
   * Run the full generation pipeline for a single workout option.
   *
   * Accepts the pre-scored exercise pool from the shared pipeline
   * (_buildSharedPipeline) so ContextualEngine is NOT re-run here —
   * the shared filter pass is already done and its cost is amortized
   * across all 3 trio options.
   *
   * @param scoredExercises  Score-ranked pool from _buildSharedPipeline
   * @param context          Per-option generation context (difficulty, budget, etc.)
   * @param profileReady     Optional readiness hint — pass false immediately after
   *                         onboarding to suppress the stale-profile warning
   */
  run(
    scoredExercises: ScoredExercise[],
    context: WorkoutGenerationContext,
    profileReady = true,
  ): OrchestratorResult {
    const log: string[] = [];
    const difficulty = (context.difficulty ?? 2) as DifficultyLevel;

    // ── Step 1: Empty-pool short-circuit guard ────────────────────────────────
    if (scoredExercises.length === 0) {
      log.push('orchestrator: empty_pool — returning rest-day fallback');
      console.warn(
        '[PipelineOrchestrator] ⚠️ Empty pool — no exercises survived the filter pass. ' +
        'Returning rest-day fallback to prevent UI crash.',
      );
      return {
        workout: buildRestDayFallback(context),
        usedEmptyPoolFallback: true,
        profileStale: false,
        log,
      };
    }

    // ── Step 2: Session blueprint (StructureDirector) ────────────────────────
    const blueprint = createStructureDirector().plan(context, difficulty);
    log.push(`blueprint: strategy=${blueprint.strategy}, blocks=${blueprint.blocks.length}`);

    // ── Step 2b: Domain-strict pool filter (Item 1 — context gating fix) ─────
    //
    // Problem: ContextualEngine's shared filterAndScore() evaluates each
    // exercise against the FIRST program entry that resolves to any active
    // domain via getUserLevelForExercise().  For a multi-keyed exercise with
    //   {programId:'full_body', level:14}  AND  {programId:'pull', level:2}
    // the engine may score it against the user's full_body level (L16, gap=2)
    // even though its pull-domain level (L2) is 14 levels behind the user's
    // pull level (L16).  This "context-blind" pass allows beginner exercises
    // (e.g. passive hangs) to leak into elite single-domain tracks.
    //
    // Fix: for single_domain sessions, apply a post-filter that evaluates each
    // exercise ONLY against its level entry for the session's primary domain.
    // Exercises that are multi-keyed but have no entry for the active domain
    // (or whose domain-specific level is outside tolerance) are excluded here,
    // BEFORE WorkoutGenerator makes its selection.
    //
    // calisthenics_upper master bypass:
    // For hybrid multi-skill sessions (planche + front_lever), requiredDomains
    // contains two SKILL slugs ('planche', 'front_lever') which are NOT the
    // foundational 'push'/'pull' pair.  StructureDirector._detectStrategy()
    // therefore falls back to 'single_domain' (the push+pull antagonist check
    // fails), and the domain-strict gate below evaluates ALL exercises against
    // only the first skill (e.g. 'front_lever L5 ±3'), wiping out the entire
    // planche/push pool.
    //
    // The ContextualEngine shared pass already filtered and scored the pool
    // using the full activeProgramFilters (['front_lever','planche','pull','push']),
    // so every exercise that survived is already appropriate for the session.
    // Applying a second single-domain gate here is both incorrect and destructive
    // for master sessions — we bypass it entirely.

    // Skill-track slugs that belong to each foundational domain.
    const PUSH_SKILL_SLUGS = ['planche', 'handstand', 'handstand_pushup'];
    const PULL_SKILL_SLUGS = ['front_lever', 'muscle_up', 'back_lever'];

    // Master-program bypass set:
    //   • calisthenics_upper — dynamic skill-track hybrid (planche/front_lever/…)
    //   • upper_body        — static push + pull wrapper
    //   • full_body         — static push + pull + legs + core wrapper
    //
    // These programs have no exercises directly tagged with their own slug.
    // All their exercises are keyed to child domains (push, pull, legs, core).
    // The ContextualEngine shared pass already filtered the pool via the
    // expanded child-domain set, so a second single-domain gate here would
    // evaluate every exercise against a master slug that no exercise carries,
    // purging the entire pool and producing a cooldown-only fallback.
    const MASTER_PROGRAM_SLUGS = new Set(['calisthenics_upper', 'upper_body', 'full_body']);
    const resolvedActiveProgramSlug = resolveToSlug(context.activeProgramId ?? '');
    const isMasterProgram =
      MASTER_PROGRAM_SLUGS.has(resolvedActiveProgramSlug) ||
      MASTER_PROGRAM_SLUGS.has(context.activeProgramId ?? '');

    let filteredPool = scoredExercises;
    if (blueprint.strategy === 'single_domain' && !isMasterProgram) {
      const primaryBlock = blueprint.blocks.find(b => b.domain);
      const domain = primaryBlock?.domain;
      const userDomainLevel = domain
        ? (context.userProgramLevels?.get(domain) ?? context.userLevel)
        : null;

      if (domain && userDomainLevel != null) {
        // Use standard tolerance (3).  If the shared pool was rescue-expanded
        // to ±5, exercises at gap 4–5 are intentionally tightened here —
        // better a smaller pool of correctly-levelled exercises than a larger
        // pool contaminated by foreign-domain level evaluations.
        const STRICT_TOLERANCE = 3;

        // ── Multi-skill hybrid: collect active skill slugs for this domain ──
        // For programs other than calisthenics_upper where additionalSlugs
        // may still be needed (e.g. a future single-domain skill variant).
        let additionalSlugs: string[] | undefined;
        const focusIds = [
          ...(context.priority1SkillIds ?? []),
          ...(context.priority2SkillIds ?? []),
        ];
        const domainVector = domain === 'push' ? PUSH_SKILL_SLUGS
          : domain === 'pull' ? PULL_SKILL_SLUGS
          : [];
        const matched = focusIds.filter(id => domainVector.includes(id));
        if (matched.length > 0) {
          additionalSlugs = matched;
          console.log(
            `[PipelineOrchestrator] 🔓 Multi-skill: domain=${domain} ` +
            `additionalSlugs=[${matched.join(', ')}]`,
          );
        }

        const before = filteredPool.length;
        filteredPool = filterForDomain(
          filteredPool,
          domain,
          userDomainLevel,
          STRICT_TOLERANCE,
          additionalSlugs,
          context.userProgramLevels,
        );
        const removed = before - filteredPool.length;
        if (removed > 0) {
          log.push(
            `domain_filter: removed ${removed} context-blind candidates ` +
            `(domain=${domain} L${userDomainLevel} ±${STRICT_TOLERANCE}` +
            `${additionalSlugs ? ` +skills=[${additionalSlugs.join(',')}]` : ''})`,
          );
          console.log(
            `[PipelineOrchestrator] 🔒 Domain-strict filter: removed ${removed}/${before} ` +
            `exercises that failed ${domain} L${userDomainLevel} ±${STRICT_TOLERANCE} check`,
          );
        }
      }
    } else if (isMasterProgram) {
      console.log(
        `[PipelineOrchestrator] 🔓 Master-program bypass (${resolvedActiveProgramSlug}): ` +
        `skipping single-domain tolerance gate — ContextualEngine shared pass already scoped ` +
        `pool to all child domains. Pool size preserved: ${scoredExercises.length} exercises.`,
      );
      log.push(
        `domain_filter: bypassed for master program "${resolvedActiveProgramSlug}" ` +
        `(pool=${scoredExercises.length} exercises preserved from shared filter pass)`,
      );
    }

    // ── Step 3: Onboarding stale-profile guard ────────────────────────────────
    const profileStale = profileReady
      ? PoolFactory.detectProfileStale(context.userProgramLevels)
      : false;

    if (profileStale) {
      console.warn(
        '[PipelineOrchestrator] ⚠️ profileStale: userProgramLevels all ≤ L1 — ' +
        'onboarding background sync may still be in flight. ' +
        'Generation proceeds with L1 defaults.',
      );
      log.push('orchestrator: profileStale=true (all levels ≤ 1)');
    }

    // ── Step 4: Delegate to WorkoutGenerator (blueprint-aware thin shim) ─────
    //
    // WorkoutGenerator.generateWorkout() is now blueprint-aware via Phase 4:
    //   • isSingleDomain = blueprint.strategy === 'single_domain'
    //   • isFullBodySession = blueprint.strategy === 'full_body'
    //   • isFemaleFullBody = context.gender === 'female' && strategy === 'full_body'
    //
    // Steps 4b–4d (budget caps, David Rule) and Step 5g (set rebalancing)
    // inside WorkoutGenerator are guarded by context.useModularPipeline.
    // BudgetDistributor.reapplyCaps() (Step 4b below) is the authoritative
    // final enforcement pass in the modular path.
    const generator = createWorkoutGenerator();
    const workout = generator.generateWorkout(filteredPool, context);

    log.push(`generator: ${workout.exercises.length} exercises, ${workout.totalPlannedSets} sets`);
    if (workout.appliedProtocol) {
      log.push(`protocol: ${workout.appliedProtocol}`);
    }

    // ── Step 4b: BudgetDistributor post-correction pass (Item 2) ─────────────
    //
    // Even when context.useModularPipeline is false (legacy path), this pass
    // acts as a safety net: it re-applies the modular BudgetConstraints from
    // the StructureDirector blueprint to catch any cap violations that the
    // WorkoutGenerator's legacy Steps 4b–4d may have missed or calculated
    // with a different denominator.
    //
    // For context.useModularPipeline === true, this IS the authoritative
    // set-cap enforcement replacing WorkoutGenerator's bypassed loops.
    const budgetDistributor = createBudgetDistributor();
    const mainExercises = workout.exercises.filter(e => e.exerciseRole === 'main');
    const supportExercises = workout.exercises.filter(e => e.exerciseRole !== 'main');
    const correctedMain = budgetDistributor.reapplyCaps(mainExercises, blueprint.budgetConstraints);

    if (correctedMain !== mainExercises) {
      workout.exercises = [...correctedMain, ...supportExercises];
      const correctedTotal = workout.exercises.reduce((s, e) => s + e.sets, 0);
      if (correctedTotal !== workout.totalPlannedSets) {
        log.push(`budget_correction: ${workout.totalPlannedSets} → ${correctedTotal} sets`);
        workout.totalPlannedSets = correctedTotal;
      }
    }

    // Merge orchestrator log into the workout's pipeline log
    const mergedLog = [...(workout.pipelineLog ?? []), ...log];
    workout.pipelineLog = mergedLog;

    return { workout, usedEmptyPoolFallback: false, profileStale, log };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Returns a fresh PipelineOrchestrator instance.
 *
 * The stateless factory pattern ensures each call site (generateHomeWorkoutTrio
 * trio loop) gets an isolated instance with no mutable cross-option state
 * contamination — critical for stable array identities across the 3 options.
 */
export function createPipelineOrchestrator(): PipelineOrchestrator {
  return new PipelineOrchestrator();
}
