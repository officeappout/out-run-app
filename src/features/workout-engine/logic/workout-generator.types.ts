/**
 * Workout Generator Types
 *
 * All type definitions, interfaces, and enums used across the workout
 * generation pipeline. Extracted from WorkoutGenerator.ts for modularity.
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs
 */

import { Exercise, MechanicalType, ExecutionLocation, InjuryShieldArea } from '@/features/content/exercises/core/exercise.types';
import { ScoredExercise, IntentMode, LifestylePersona, FilterStageCounts } from './ContextualEngine';
import type { TabataProtocolConfig } from '@/features/workout-engine/core/types/protocol.types';

// ============================================================================
// CORE TYPES
// ============================================================================

export type DifficultyLevel = 1 | 2 | 3;

export type WorkoutStructure = 'standard' | 'emom' | 'amrap' | 'circuit';

export type ExercisePriority = 'skill' | 'foundation' | 'compound' | 'accessory' | 'isolation';

// ============================================================================
// TIER ENGINE
// ============================================================================

export type TierName = 'elite' | 'hard' | 'match' | 'easy' | 'flow';

export interface TierConfig {
  reps:  { min: number; max: number };
  hold:  { min: number; max: number };
  rest:  { min: number; max: number };
  sets:  { min: number; max: number };
}

// ── Rest Staircase ───────────────────────────────────────────────────────────
//
// Rest times are now strictly tier-proportional, matching the physiological
// demand of each exercise relative to the user's current level:
//
//   elite  (Δ ≥ +2):  180–240s  — maximum CNS recovery for above-ceiling work
//   hard   (Δ = +1):  150–180s  — near-max effort, needs full recovery
//   match  (Δ =  0):  120–150s  — working at current level, adequate recovery
//   easy   (Δ −1/−2): 90–120s   — sub-maximal, shorter rest supports density
//   flow   (Δ ≤ −3):  60–90s    — active recovery pace, minimal rest
//
// These values are used as the REAL rest times in both assignVolume and
// calculateEstimatedDuration (the old 90s estimator cap has been removed so
// the duration table accurately reflects actual 180s rest for hard/elite work).
export const TIER_TABLE: Record<TierName, TierConfig> = {
  elite: { reps: { min: 1,  max: 3  }, hold: { min: 3,  max: 6  }, rest: { min: 180, max: 240 }, sets: { min: 4, max: 5 } },
  hard:  { reps: { min: 1,  max: 3  }, hold: { min: 5,  max: 10 }, rest: { min: 150, max: 180 }, sets: { min: 4, max: 5 } },
  match: { reps: { min: 3,  max: 6  }, hold: { min: 10, max: 15 }, rest: { min: 120, max: 150 }, sets: { min: 3, max: 4 } },
  easy:  { reps: { min: 10, max: 15 }, hold: { min: 15, max: 25 }, rest: { min: 90,  max: 120 }, sets: { min: 3, max: 3 } },
  flow:  { reps: { min: 10, max: 15 }, hold: { min: 25, max: 45 }, rest: { min: 60,  max: 90  }, sets: { min: 3, max: 3 } },
};

/** Horizontal movements at match tier use a wider hypertrophy-friendly rep range */
export const MATCH_HORIZONTAL_REPS = { min: 6, max: 12 };

export const VERTICAL_MOVEMENT_GROUPS = new Set(['vertical_push', 'vertical_pull']);
export const HORIZONTAL_MOVEMENT_GROUPS = new Set(['horizontal_push', 'horizontal_pull']);

export function resolveTier(levelDelta: number): TierName {
  if (levelDelta >= 2) return 'elite';
  if (levelDelta === 1) return 'hard';
  if (levelDelta === 0) return 'match';
  if (levelDelta >= -2) return 'easy';
  return 'flow';
}

export function restSafetyFloor(tier: TierConfig): number {
  return Math.round(tier.rest.min * 0.7);
}

// ============================================================================
// WORKOUT EXERCISE
// ============================================================================

export interface WorkoutExercise {
  exercise: Exercise;
  method: ScoredExercise['method'];
  mechanicalType: MechanicalType;
  sets: number;
  reps: number;
  repsRange?: { min: number; max: number };
  isTimeBased: boolean;
  restSeconds: number;
  priority: ExercisePriority;
  score: number;
  reasoning: string[];
  programLevel?: number;
  isOverLevel?: boolean;
  tier?: TierName;
  levelDelta?: number;
  isGoalExercise?: boolean;
  rampedTarget?: number;
  exerciseRole?: 'warmup' | 'main' | 'cooldown';
  /**
   * True ONLY for the Stage-1 general mobility warmup (Part A of
   * `prependWarmupExercises`).  The final `applyDomainPrioritySort` pass reads
   * this flag to pin the general warmup at the top of the warmup block, ahead
   * of the pattern/ladder potentiation slots — otherwise the domain-priority
   * sort buries it below the real push/pull/legs ladder exercises (which carry
   * lower domain weights) because a mobility drill scores as accessory/weight-3.
   * Undefined for ladder slots, main, and cooldown exercises.
   */
  isGeneralWarmup?: boolean;
  pairedWith?: string;
  /**
   * Distinguishes superset variants when `pairedWith` is set:
   *   - 'staggered'  = antagonist pair (push+pull, quad+hamstring) — micro-rest A→B
   *   - 'compound'   = same-muscle pair — zero rest A→B, extended rest B→A
   * Undefined when the exercise is not part of a superset.
   */
  supersetType?: 'staggered' | 'compound';
  /**
   * Per-set rep sequence for pyramid / drop-set protocols.
   * Example: [12, 10, 8, 6] — overrides the static `reps` value when the
   * runner advances through sets.  Undefined for standard sets.
   */
  repsSequence?: number[];
  /**
   * Mechanical Pyramid: per-set exercise variants (different progression
   * for each set).  When populated, the runner reads the current set's
   * entry to swap the displayed exercise name/video/target on each set.
   * Undefined for standard sets and for rep-only pyramids.
   */
  pyramidSequence?: PyramidStep[];
  /**
   * Block-scoped protocol membership (Stage 3.1): set by the generator when
   * this exercise belongs to a tabata block. Members are priced as one fixed
   * (work+rest)×rounds block by calculateEstimatedDuration and are exempt
   * from volume-guard removal — the block's duration is set-count-independent.
   * Identify membership via THIS marker (structural), never via string
   * comparison on appliedProtocol (BudgetDistributor convention).
   */
  protocolBlock?: 'tabata';
  /**
   * Set by GuaranteePassRunner.runFullBodyDomainGuarantee (early, inside the
   * generator) or GuaranteePassRunner.validateCorePromise (late, the post-
   * cut validator — see `validatePromisesPostCut`) when either injects this
   * exercise to satisfy the core domain for a full-body session (docs/
   * workout-engine/09-CORE-TABATA.md §3/§4 and its 05.09.2026 follow-up).
   *
   * Corrected 05.09.2026: this used to also gate `enforceVolumeCap`'s Phase
   * A removal directly (`if (ex.isGuaranteedCore) return false`) — replaced
   * by a duration-aware trim-order rank (core trims last at ≥20min, first
   * below it, David's explicit decision) that protects EVERY core exercise
   * at ≥20min, not just guarantee-injected ones, and correctly leaves core
   * trimmable below 20min even if it WAS guarantee-injected (short sessions
   * keep core optional by design). This field is now informational/tracing
   * only — it marks provenance for `promise_validation` logging and for the
   * post-cut validator to tell "satisfied" from "injected" — it no longer
   * changes trim behavior by itself.
   */
  isGuaranteedCore?: boolean;
  wasSwapped?: boolean;
  /**
   * swap-all "keep + mark": set when a bulk/single dimension swap (e.g. location
   * park→home) found NO qualifying method AND no same-level alternative for this
   * exercise, so it is kept as-is and flagged. Rendered as a "דורש מתקן" badge.
   * Cleared on any subsequent successful swap. `dimension`/`value` name the axis
   * (kept loosely typed to avoid a dep on method-dimension.utils' SwapDimension).
   */
  dimensionUnavailable?: { dimension: string; value: string };
  /**
   * UI-ready rep / hold range string, pre-computed by the
   * `PresentationFormatter.annotateRepRanges()` pass at the end of the
   * generation pipeline.
   *
   * Examples:
   *   "8-12 חזרות"     — standard rep range
   *   "12 חזרות"        — single rep value
   *   "חזרה אחת"         — Hebrew singular grammar (n === 1)
   *   "15-30 שניות"     — time-based range
   *   "30 שניות"         — time-based single value
   *
   * React cards (StatsOverview, StrengthExerciseCard, WorkoutPreviewDrawer,
   * etc.) should prefer this pre-computed string over re-formatting from
   * `reps` / `repsRange` on every render.  The formatter is Hebrew-only;
   * runtime suffixes like " (לכל צד)" or "3×" are appended by the card.
   *
   * Optional because non-engine surfaces (e.g. Firestore-restored sessions)
   * may carry a `WorkoutExercise` shape that pre-dates Phase 4.
   */
  formattedRepRange?: string;
}

// ============================================================================
// PYRAMID PROTOCOL
// ============================================================================

/**
 * One step (= one set) of a Mechanical Pyramid.  The Active Workout Runner
 * reads `pyramidSequence[currentSetIndex]` and overrides the active
 * exercise's name / target / video accordingly, so each set can target a
 * different progression in the same movement group (e.g. Tuck Front Lever
 * → Adv Tuck → Straddle → Full).
 *
 * Per calisthenics methodology, a pyramid is ALWAYS mechanical — every
 * step MUST mutate the lever / variant.  A "pyramid" with a static
 * exercise does not exist; the processor will refuse to stamp the
 * pyramid in that case and revert the exercise to straight sets.
 */
export interface PyramidStep {
  setIndex: number;
  exerciseId: string;
  name: string;
  targetReps?: number;
  targetHold?: number;
  videoSrc?: string;
  /** Pre-resolved thumbnail for the variant — populated by the processor */
  imageUrl?: string;
  /** Variant's resolved level in the active domain (for display / debug) */
  level?: number;
  /**
   * Per-step swap highlight.  Flipped to `true` only on the specific
   * pyramid step(s) that were just replaced (incl. twin-synced
   * partners).  The UI reads this flag instead of the parent
   * exercise's `wasSwapped` so the cyan accent localises to the
   * altered steps and not the whole pyramid.
   */
  isSwapped?: boolean;
}

// ============================================================================
// GENERATED WORKOUT
// ============================================================================

export interface WorkoutStats {
  calories: number;
  coins: number;
  totalReps: number;
  totalHoldTime: number;
  difficultyMultiplier: number;
}

/**
 * Light, scalar-only snapshot of the fields `resolveWorkoutMetadata` needs, persisted
 * on the generated workout so a location/dimension swap can re-run the title/
 * description with the NEW location WITHOUT rebuilding the full pipeline context.
 * Deliberately tiny — it rides the sessionStorage plan snapshot exposed to WKWebView
 * eviction (axioms §19); never store heavy objects here. `location` + `durationMinutes`
 * are re-injected at swap time, not stored.
 */
export interface WorkoutMetadataSnapshot {
  persona: string | null;
  timeOfDay: string;
  gender?: 'male' | 'female';
  category?: string;
  categoryLabel?: string;
  difficulty?: number | string;
  dominantMuscle?: string;
  experienceLevel?: string;
  sportType?: string;
  motivationStyle?: string;
  currentProgram?: string;
}

export interface GeneratedWorkout {
  title: string;
  description: string;
  aiCue?: string;
  /** Per-variant coaching explanation shown on the Overview page */
  logicCue?: string;
  exercises: WorkoutExercise[];
  estimatedDuration: number;
  structure: WorkoutStructure;
  difficulty: DifficultyLevel;
  /** User-facing note explaining a SAFETY-motivated difficulty override
   *  (first session / returning-after-a-break / deload week) — set only
   *  when resolveEffectiveDifficulty actually overrode the requested
   *  difficulty. Undefined otherwise. See docs/workout-engine/03-CHANGES.md
   *  Addendum 17/20, F2 — an explicit user choice that gets overridden must
   *  never look like a silent bug. */
  difficultyOverrideNote?: string;
  volumeAdjustment?: VolumeAdjustment;
  blastMode?: BlastModeDetails;
  mechanicalBalance: MechanicalBalanceSummary;
  stats: WorkoutStats;
  isRecovery: boolean;
  totalPlannedSets: number;
  /**
   * absent=absent (⑨) safety-net flag (BUG 1 rework): set when NONE of the
   * domains relevant to the request have ever been assessed — the caller
   * asked for a workout, but the intersection of {requested domains} ∩
   * {assessed domains} was empty. `exercises` is intentionally `[]`; the UI
   * should route the user to the mini-assessment questionnaire for
   * `assessmentDomains` rather than treating this as a normal (broken) plan.
   * Mirrors the existing `isRecovery` convention (a distinguishing flag +
   * empty/placeholder content, not a thrown error) — see `generateRecoveryWorkout`'s
   * "rest day" fallback for the precedent this follows.
   */
  needsAssessment?: boolean;
  /** Domains that need assessment (only set when `needsAssessment` is true). */
  assessmentDomains?: string[];
  /**
   * Protocol selected by the engine for this workout ('antagonist_pair', 'emom', etc.).
   * Used by the service to re-apply pairing AFTER warmup/cooldown/post-processors are
   * added, so pairedWith is always present on the final exercise list.
   */
  appliedProtocol?: string;
  /**
   * Tabata block emitted by the protocol lottery (Stage 3.1). The mapper
   * (home/page.tsx) splits these exercises into their own segment with
   * protocol='tabata' + protocolConfig — plan-level fields alone never
   * reach the player (proven: appliedProtocol/blastMode have no consumers).
   * Config is the fixed classic 20/10/8 (David's decision, 12.07.2026).
   */
  tabataBlock?: TabataBlockSpec;
  /** Why Logger: end-to-end pipeline summary for debugging/auditing */
  pipelineLog?: string[];
  /**
   * Light metadata-recompute snapshot (see WorkoutMetadataSnapshot). Set at
   * generation; read by swap-all to refresh title/description for the new location.
   * Optional — absent on Firestore-restored/legacy plans, in which case swap-all
   * rebuilds the context from the user profile + workout fields.
   */
  metadataCtx?: WorkoutMetadataSnapshot;
  /**
   * Execution location this plan currently reflects. Undefined on fresh
   * generation (callers fall back to their own context); STAMPED by a swap-all
   * location swap so the "איפה מתאמנים?" switcher badge and the swap no-op guard
   * both read the live location off the content — one source of truth that
   * travels with the workout, not ambient UI state.
   */
  executionLocation?: ExecutionLocation;
}

export interface TabataBlockSpec {
  config: TabataProtocolConfig;
  /** exercise.id of each block member — the mapper partitions by these. */
  exerciseIds: string[];
  /** Which mechanism produced this block — 'core' = Step 6c's core-form
   *  tabata (core-block.ts, corePool-filtered, hasExplicitCoreLevel-only
   *  members); 'conditioning' = Step 6b's general finisher
   *  (WorkoutGenerator.ts, unfiltered context.tabataPool — currently frozen
   *  behind GENERAL_FINISHER_TABATA_ENABLED). Added 08.09.2026 — before this,
   *  a TabataBlockSpec carried no origin marker, so a "mixed" block (core +
   *  conditioning exercises) couldn't be traced back to which path produced
   *  it (docs/workout-engine/03-CHANGES.md, Round 1). Optional: legacy/
   *  Firestore-restored specs and unit tests that construct one directly
   *  won't have it. */
  kind?: 'core' | 'conditioning';
}

export interface VolumeAdjustment {
  reason: 'inactivity' | 'beginner' | 'injury_recovery' | 'detraining' | 'weekly_budget' | 'peak' | 'deload';
  reductionPercent: number;
  originalSets: number;
  adjustedSets: number;
  badge: string;
}

export interface BlastModeDetails {
  type: 'emom' | 'amrap';
  durationMinutes: number;
  rounds?: number;
  workSeconds?: number;
  restSeconds?: number;
}

export interface MechanicalBalanceSummary {
  straightArm: number;
  bentArm: number;
  hybrid: number;
  ratio: string;
  isBalanced: boolean;
}

// ============================================================================
// GENERATION CONTEXT
// ============================================================================

export interface WorkoutGenerationContext {
  availableTime: number;
  userLevel: number;
  /** Set by InputSanitizerMiddleware.resolveExercisePool when its level-tolerance
   *  fallback fired (±5 widen and/or parent-domain fallback) — e.g. ['level'] or
   *  ['level', 'domain_parent_fallback']. Observability only, not consumed by
   *  any downstream selection logic. */
  relaxedConstraints?: string[];
  /** Diagnostic lines from resolveExercisePool's fallback, seeded into
   *  GeneratedWorkout.pipelineLog by WorkoutGenerator so a relaxed pool is
   *  visible on the workout itself. */
  earlyPipelineNotes?: string[];
  daysInactive: number;
  intentMode: IntentMode;
  persona: LifestylePersona | null;
  location: string;
  injuryCount: number;
  energyLevel?: 'low' | 'medium' | 'high';
  difficulty?: DifficultyLevel;
  userWeight?: number;
  sessionCount?: number;
  isFirstSessionInProgram?: boolean;
  remainingWeeklyBudget?: number;
  weeklyBudgetUsagePercent?: number;
  isRecoveryDay?: boolean;
  detrainingLock?: boolean;
  volumeReductionOverride?: number;
  /** Current week in the 5-week periodization cycle (1=Build, 4=Peak, 5=Deload).
   *  Undefined = no active program / no cycle anchor. */
  periodizationWeek?: number;
  protocolProbability?: number;
  preferredProtocols?: ('emom' | 'pyramid' | 'antagonist_pair' | 'superset' | 'tabata')[];
  /** Dedicated conditioning pool for tabata blocks — ALL `hiit_friendly`-tagged
   *  exercises (incl. program-less gems like burpees/crawls that never enter the
   *  scored strength pool). Passed as data so the generator stays pure; buildTabataBlock
   *  selects the finisher members from here (≤level, level-less defaults IN). */
  tabataPool?: Exercise[];
  /**
   * exerciseRole==='reinforcement' catalog items (the "טבטה" follow-along
   * ladder, core L4/L8/L12/L16) — a separate pool from tabataPool above,
   * since these are not hiit_friendly-tagged. Used by the core block's form C
   * (docs/workout-engine/09-CORE-TABATA.md §1.6/§2).
   */
  reinforcementPool?: Exercise[];
  /** Tabata finisher probability, resolved on a SEPARATE union track (any enrolled
   *  program that enables tabata) and already scaled by the periodization multiplier.
   *  Independent of `protocolProbability` (the main winner-takes-all lottery). The
   *  generator rolls it separately: fire ⇔ p>0 ∧ difficulty≥2 ∧ userLevel≥4 ∧ rand≤p. */
  tabataProbability?: number;
  /**
   * User's active injury exclusions — same values ContextualEngine's
   * injuryShield filter already checks (logic/ContextualEngine.ts:442-451),
   * threaded this far downstream so the core block (docs/workout-engine/
   * 09-CORE-TABATA.md §2) can gate its tabata/follow-along paths the same
   * way. Previously absent from this context entirely — tabataPool is drawn
   * from allExercises directly (home-workout.service.ts), bypassing
   * ContextualEngine, so neither tabata path could check injuries before.
   */
  injuryShield?: InjuryShieldArea[];
  /**
   * Core-block form history for the anti-repetition rule (never the same
   * form 3 times in a row) — see core-block.ts's ANTI-REPETITION SCOPE NOTE.
   * This pass has no real cross-session source for it (documented scoping
   * decision); an in-trio-only tracker is used instead and this field stays
   * an unpopulated extension point for whenever one exists.
   */
  recentCoreForms?: ('single' | 'tabata' | 'follow_along')[];
  /**
   * SAME array reference passed into each of the 3 sequential generateWorkout()
   * calls in one generateHomeWorkoutTrio trio loop (home-workout.service.ts) —
   * each bolt's core-block Step 6c appends its chosen form here, so the NEXT
   * bolt's anti-repetition check sees what earlier bolts in this SAME trio
   * chose. This is the in-trio half of anti-repetition; recentCoreForms above
   * is the (currently unpopulated) cross-session half.
   */
  coreFormsChosenThisTrio?: ('single' | 'tabata' | 'follow_along')[];
  /**
   * True for a Custom-Builder-generated workout (home-workout.types.ts's
   * isManualOverride, previously consumed only by SplitDecisionService's
   * deficit-clamping — verified zero other consumers, docs/workout-engine/
   * 09-CORE-TABATA.md §3/§4). The explicit gate David asked for: core's
   * duration/goal-based entry rules (StructureDirector.ts) skip entirely
   * when true — a manual build's explicit domain chips are respected as-is,
   * never second-guessed by an auto-inclusion/exclusion rule.
   */
  isManualOverride?: boolean;
  /**
   * User's stated main goal (user.types.ts's UserFullProfile.core.mainGoal).
   * Used by the "15min + strength goal → core doesn't enter unless time
   * remains" rule. No enum value literally says "strength" — this pass
   * treats 'performance_boost' as the closest match (documented
   * interpretation, docs/workout-engine/09-CORE-TABATA.md §3 — flagged
   * there as needing David's confirmation).
   */
  mainGoal?: 'healthy_lifestyle' | 'performance_boost' | 'weight_loss' | 'skill_mastery';
  straightArmRatio?: number;
  weeklySASets?: number;
  weeklySACap?: number;
  maxSets?: number;
  /** @deprecated */
  levelDefaultRestSeconds?: number;
  /** @deprecated */
  restMultiplier?: number;
  goalExerciseIds?: Set<string>;
  goalTargets?: Map<string, { targetValue: number; unit: 'reps' | 'seconds' }>;
  levelProgressPercent?: number;
  workoutsCompletedInLevel?: number;
  splitType?: string;
  dominanceRatio?: { p1: number; p2: number; p3?: number };
  priority1SkillIds?: string[];
  priority2SkillIds?: string[];
  priority3SkillIds?: string[];
  dailySetBudget?: number;
  requiredDomains?: string[];
  /** Mirror of HomeWorkoutOptions.strictDomains — disables VerticalFoundation, HorizontalGuarantee, and domain overflow. */
  strictDomains?: boolean;
  globalExercisePool?: Exercise[];
  userProgramLevels?: Map<string, number>;
  userId?: string;
  selectedDate?: string;
  /** Per-domain daily set budgets from resolveAggregateFullBodyBudget (Master Programs). */
  domainBudgets?: Array<{ domain: string; level: number; weekly: number; daily: number }>;
  /** Phase 4B: Exercise IDs used in last 2 sessions (for Variety Guard anti-boredom penalty). */
  recentExerciseIds?: Set<string>;
  /** Why Logger: per-filter pool counts from ContextualEngine (passed through for pipeline log). */
  filterCounts?: FilterStageCounts;
  /** User's biological gender — used for exercise ordering (e.g. legs-first for female full_body). */
  gender?: 'male' | 'female';
  /** Active program template ID (e.g. 'full_body', 'push') — used for gender-aware sort. */
  activeProgramId?: string;
  /**
   * Resolved available equipment for the current session (canonical IDs).
   * Passed to the domain-quota rescue path so isLocationCompatible checks
   * the real park inventory instead of the hardcoded ESSENTIAL_PARK_GEAR set.
   */
  availableEquipment?: string[];
  /**
   * Per-exercise history map: exerciseId → confirmed reps[] from the most
   * recent session. Used by `assignVolume` as a "history floor" so the engine
   * never assigns fewer reps than the user actually performed last time.
   * Empty/undefined when offline or when the user has no prior history.
   */
  exerciseHistoryMap?: Record<string, number[]>;
  /**
   * @deprecated  Phase 3 — the modular pipeline is now the only path.
   *
   * Historically toggled the legacy inline budget caps (Steps 4b/4c/4c-prime),
   * set rebalance (Step 5g) and skill cluster cap (Step 5h) inside
   * WorkoutGenerator.generateWorkout().  All those responsibilities are now
   * owned by `BudgetDistributor.distribute()` (Phase 3a), and the legacy
   * code paths have been deleted.  The field is retained for backward
   * compatibility with external callers; its value is ignored.
   */
  useModularPipeline?: boolean;
}
