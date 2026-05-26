/**
 * Tokenized Block Engine — Canonical Data Contracts
 *
 * These interfaces define the typed data that flows between every module in the
 * stateless pipeline:
 *
 *   StructureDirector  →  WorkoutBlueprint
 *   PoolFactory        →  CandidatePool
 *   BudgetDistributor  →  WorkoutExercise[]
 *   ProtocolInjector   →  { exercises, appliedProtocol }
 *   PipelineOrchestrator → GeneratedWorkout
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs.
 */

import type { ScoredExercise, FilterStageCounts } from '../../logic/contextual-engine.types';
import type {
  ExercisePriority,
  WorkoutGenerationContext,
} from '../../logic/workout-generator.types';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { ContextualFilterContext } from '../../logic/ContextualEngine';

// ============================================================================
// SESSION STRATEGY
// ============================================================================

/**
 * High-level topology of the session, resolved by StructureDirector from
 * `context.requiredDomains`.
 *
 *   full_body        – 3+ domains (push + pull + legs [+ core])
 *   single_domain    – exactly 1 domain (Pull-only, Push-only, Legs-only)
 *   antagonist_split – exactly 2 domains that are push + pull (upper-body split,
 *                      no legs)
 */
export type SessionStrategy = 'full_body' | 'single_domain' | 'antagonist_split';

// ============================================================================
// BLOCK TOKEN
// ============================================================================

/**
 * A typed placeholder representing a single exercise slot in the session
 * blueprint. Produced by StructureDirector, consumed by PoolFactory when
 * building ranked candidate lists.
 *
 * Each token is uniquely identified by `id` so CandidatePool can map
 * blockId → ScoredExercise[] in a flat Map.
 */
export interface BlockToken {
  /** Unique slot identifier, e.g. "main_0_vertical_pull" */
  id: string;
  /** Section role for downstream sorting and warmup/cooldown injection */
  role: 'main' | 'warmup' | 'cooldown';
  /** Logical domain this slot belongs to: 'pull' | 'push' | 'legs' | 'core' */
  domain?: string;
  /**
   * Primary movement group constraint for candidate filtering.
   * e.g. 'vertical_pull' | 'horizontal_pull' | 'squat'
   */
  movementGroup?: string;
  /**
   * When set, PoolFactory restricts candidates to exercises whose
   * classifyPriority() matches this value.
   */
  requiredPriority?: ExercisePriority;
  /**
   * True when this slot represents a horizontal balance complement (rows for
   * a Pull session, push-up rows for a Push session). PoolFactory resolves
   * these slots using findLevelAppropriateSubstitute (progressive ±2→±4→±6
   * radius) rather than plain score-ranking.
   */
  isHorizontalBalance?: boolean;
  /** True when this is an optional accessory / isolation slot */
  isAccessorySlot?: boolean;
  /**
   * Optional tempo modifier to be stamped by ProtocolInjector.
   * Reserved for future adaptive-tempo feature (eccentric holds, park mode).
   */
  tempoModifier?: TempoModifier;
}

// ============================================================================
// TEMPO MODIFIER (future)
// ============================================================================

/**
 * Instructs ProtocolInjector to stamp eccentric or concentric tempo
 * constraints on specific exercises when environmental or user conditions
 * are met (e.g. no gear at park → force slow eccentrics for stimulus).
 *
 * Fields are read by the active workout runner; UI rendering requires no
 * changes beyond reading the existing exercise card props.
 */
export interface TempoModifier {
  triggerCondition: 'no_equipment' | 'advanced_user' | 'park_location';
  /** Eccentric phase hold in seconds (e.g. 5 for a 5-second lowering phase) */
  eccentricHoldSeconds?: number;
  /** Concentric pause at lockout in seconds */
  concentricPauseSeconds?: number;
  /** Restricts which movement groups this modifier applies to */
  targetMovementGroups?: string[];
}

// ============================================================================
// PROTOCOL HINTS
// ============================================================================

/**
 * Protocol configuration surfaced by StructureDirector from both the
 * Firestore program settings (`context.preferredProtocols`,
 * `context.protocolProbability`) and native code-level guards.
 *
 * ProtocolInjector reads this struct; it never reads WorkoutGenerationContext
 * protocol fields directly.
 */
export interface ProtocolHints {
  /** Firestore-configured protocol list (e.g. ['pyramid', 'antagonist_pair']) */
  preferredProtocols?: string[];
  /** Firestore-configured probability scalar (0–1) */
  protocolProbability?: number;
  /**
   * Native guard: when true, ProtocolInjector raises the effective pyramid
   * probability floor to 0.6 for D3 single-domain sessions so peak pyramids
   * fire reliably even when Firestore probability is low or unset.
   */
  forcePyramidOnSingleDomainIntense?: boolean;
  /** Tempo modifiers to apply after protocol stamping */
  tempoModifiers?: TempoModifier[];
}

// ============================================================================
// BUDGET CONSTRAINTS
// ============================================================================

/**
 * Distilled budget parameters passed from StructureDirector → BudgetDistributor.
 * All math in BudgetDistributor reads from this struct rather than directly
 * from WorkoutGenerationContext, keeping the distributor's math isolated.
 */
export interface BudgetConstraints {
  /** Authoritative per-session set ceiling from SplitDecisionService */
  dailySetBudget?: number;
  /** Hard absolute set cap from context.maxSets */
  maxSets?: number;
  /** Remaining weekly sets budget (from progression store) */
  remainingWeeklyBudget?: number;
  /**
   * True when requiredDomains.length === 1.
   * Drives two changes in BudgetDistributor:
   *   1. setsPerSlot pre-ceiling: dailySetBudget / exerciseCount
   *   2. capDenominator: uses actual exercise count instead of domain count
   *      (domain count = 1 would make applySmartSetCap denominator = 1,
   *      yielding Infinity and silently disabling the cap)
   */
  isSingleDomain: boolean;
  /**
   * Number of main exercise slots in the blueprint (= blocks.filter role=main).
   * Used as the denominator floor when computing setsPerSlot.
   */
  exerciseSlotCount: number;
}

// ============================================================================
// WORKOUT BLUEPRINT
// ============================================================================

/**
 * The complete session topology produced by StructureDirector.
 * Carries:
 *   - the ordered list of BlockTokens (exercise slot declarations)
 *   - protocol configuration for ProtocolInjector
 *   - budget parameters for BudgetDistributor
 */
export interface WorkoutBlueprint {
  strategy: SessionStrategy;
  /** Ordered slot declarations — main blocks first, warmup/cooldown excluded
   *  (those are added by warmup.service / cooldown.service post-pipeline) */
  blocks: BlockToken[];
  protocolHints: ProtocolHints;
  budgetConstraints: BudgetConstraints;
}

// ============================================================================
// CANDIDATE POOL
// ============================================================================

/**
 * Candidate pool output — carries both the scored exercises and metadata
 * flags needed by the orchestrator and upstream pipeline consumers.
 *
 * NOTE: `excludedCount` is intentionally surfaced here so callers that build
 * result metadata (e.g. _buildSharedPipeline) can read it without recomputing.
 */
export interface CandidatePool {
  /** blockId → score-ranked candidate list */
  candidates: Map<string, ScoredExercise[]>;
  /** Per-stage filter counts from ContextualEngine (for pipeline log) */
  filterCounts: FilterStageCounts;
  /**
   * True when the pool-rescue retry fired (levelTolerance expanded ±3 → ±5).
   * Logged in pipelineLog; no behavioral change downstream.
   */
  toleranceExpanded: boolean;
  /**
   * True when ALL userProgramLevels values are ≤ 1.
   * Indicates the profile may be mid-write from the onboarding background sync
   * (recalculateAncestorMasters is non-awaited before router.replace('/home')).
   * PipelineOrchestrator logs a warning and can surface a "Calculating profile"
   * UI hint; generation proceeds normally with L1 defaults.
   */
  profileStale: boolean;
  /**
   * Total candidate count across all slots (sum of candidate list lengths).
   * Used by PipelineOrchestrator for the empty-pool short-circuit guard:
   * if totalCandidates === 0, bypass BudgetDistributor and return
   * buildEmptyPoolFallback().
   */
  totalCandidates: number;
  /** Number of exercises excluded by the filter pass (pool_start - totalCandidates) */
  excludedCount: number;
}

// ============================================================================
// ORCHESTRATOR INPUT
// ============================================================================

/**
 * Single input struct for PipelineOrchestrator.run().
 * Encapsulates all data the pipeline needs so the call site (home-workout.service)
 * does not need to know about internal module boundaries.
 */
export interface OrchestratorInput {
  /** Full exercise database (pre-fetched by home-workout.service) */
  exercises: Exercise[];
  /** Pre-built contextual filter context (location, gear, injuries, etc.) */
  filterContext: ContextualFilterContext;
  /** Full generation context (user levels, budget, difficulty, etc.) */
  context: WorkoutGenerationContext;
  /**
   * Optional caller-supplied readiness hint.
   * Pass `false` to suppress the stale-profile warning when the caller knows
   * the profile write is still in-flight (e.g. immediately after onboarding).
   * Defaults to true (warnings enabled).
   */
  profileReady?: boolean;
}
