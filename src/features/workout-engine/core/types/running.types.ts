// ==========================================
// 1. Runner Goals & Classification
// ==========================================
export type RunnerGoal =
  | 'couch_to_5k'
  | 'maintain_fitness'
  | 'improve_speed_10k'
  | 'improve_speed_5k'
  | 'improve_endurance';

/**
 * Profile 1: Fast improver (basePace < 360s, i.e. faster than 6:00/km)
 * Profile 2: Slow improver (basePace >= 360s)
 * Profile 3: Beginner / returning runner (couch_to_5k)
 * Profile 4: Maintenance runner (maintain_fitness)
 */
export type RunnerProfileType = 1 | 2 | 3 | 4;

export interface RunningOnboardingData {
  currentAbility: {
    canRunContinuous: boolean;
    continuousTimeMinutes: number;
    referencePace?: string;
    /** Beginner ability tier: 'none' | '5_15' | '15_30' | '30_45' | '45_plus' */
    abilityTier?: 'none' | '5_15' | '15_30' | '30_45' | '45_plus';
  };
  targetDistance: '2k' | '3k' | '5k' | '10k' | 'maintenance';
  /**
   * 2 | 3 | 4, not 1 — see `src/lib/running-frequency-bounds.ts`'s module
   * doc (01.09.2026) for why a single run/week is a different training
   * model, not a low value of this one. `MIN_RUNNING_FREQUENCY` there is
   * the canonical bound; this type mirrors it so a `1` can never even
   * type-check into this field again.
   *
   * Narrowing forward only, same distinction already made for
   * `planBuildFailReason` below (David, 01.09.2026 review): TypeScript
   * doesn't delete data. A document written before this fix can still hold
   * a literal `1` here in Firestore — narrowing the type stops any NEW
   * write from producing one, it does not retroactively fix documents
   * already sitting in the database. Any reader that trusts this union as
   * runtime-exhaustive (rather than defending against an unrecognized
   * value) is making the same mistake this comment exists to prevent.
   */
  weeklyFrequency: 2 | 3 | 4;
  /** How many months the runner has been training consistently. */
  runningHistoryMonths: number;
  /** Whether the runner has current injuries that require safety restrictions. */
  hasInjuries: boolean;
  /** Runner goal path from the decision tree. */
  goalPath?: 'start_running' | 'improve_time' | 'maintain_fitness';
}

// ==========================================
// 2. Pace Zone System
// ==========================================
export type RunZoneType =
  | 'walk'
  | 'jogging'
  | 'recovery'
  | 'easy'
  | 'long_run'
  | 'fartlek_medium'
  | 'tempo'
  | 'fartlek_fast'
  | 'interval_long'
  | 'interval_short'
  | 'sprint';

export const ALL_RUN_ZONES: RunZoneType[] = [
  'walk', 'jogging', 'recovery', 'easy', 'long_run',
  'fartlek_medium', 'tempo', 'fartlek_fast',
  'interval_long', 'interval_short', 'sprint',
];

/** Computed pace boundaries for a single zone, derived at runtime. */
export interface ComputedPaceZone {
  minPace: number;
  maxPace: number;
  label: string;
}

// ── PaceMapConfig (admin-editable global table) ──────────────────────

/**
 * One row in the pace-map percentage table.
 * Walk uses fixed values; all other zones use percentages of basePace.
 */
export interface PaceZoneRule {
  fixedMinSeconds?: number;
  fixedMaxSeconds?: number;
  minPercent?: number;
  maxPercent?: number;
  label: string;
}

export interface PaceMapConfig {
  id: string;
  profileFast:        Record<RunZoneType, PaceZoneRule>;
  profileSlow:        Record<RunZoneType, PaceZoneRule>;
  profileBeginner:    Record<RunZoneType, PaceZoneRule>;
  profileMaintenance: Record<RunZoneType, PaceZoneRule>;
  lastUpdatedBy?: string;
  version: number;
}

/** Helper to pick the right config table for a given profile type. */
export type PaceMapKey = 'profileFast' | 'profileSlow' | 'profileBeginner' | 'profileMaintenance';

// ── PaceProfile (stored in Firestore on the user document) ───────────

export type PerformanceZone = 'below_low' | 'low' | 'mid' | 'high' | 'above_high';

export interface QualityWorkoutRecord {
  workoutId: string;
  date: string;
  qualityExerciseAvgPace: number;
  targetZone: RunZoneType;
  performanceZone: PerformanceZone;
  impactOnBasePaceSeconds: number;
}

export interface PaceProfile {
  basePace: number;
  profileType: RunnerProfileType;
  qualityWorkoutsHistory: QualityWorkoutRecord[];
  qualityWorkoutCount: number;
  lastSelfCorrectionDate: string | null;
}

// ==========================================
// 3. Workout Structure (runtime blocks)
// ==========================================
export interface RunningWorkout {
  id: string;
  name: string;
  description: string;
  isQualityWorkout: boolean;
  structure: {
    warmup: { durationOrDist: number; type: 'time' | 'dist'; zone: RunZoneType };
    mainSet: {
      sets: number;
      exercises: {
        type: 'interval' | 'rest' | 'strength';
        zone?: RunZoneType;
        durationOrDist: number;
        durationType: 'time' | 'dist';
      }[];
    };
    cooldown: { durationOrDist: number; type: 'time' | 'dist'; zone: RunZoneType };
  };
  videoIds?: string[];
}

// ── Workout & Program Templates (admin-authored, Firestore) ──────────

export interface RunBlockTemplate {
  id: string;
  type: import('../../players/running/types/run-block.type').RunBlockType;
  zoneType: RunZoneType;
  isQualityExercise: boolean;
  measureBy: 'time' | 'distance';
  baseValue: number;
  sets: number;
  label: string;
  colorHex: string;
  restBetweenSetsSeconds?: number;
  restType?: 'standing' | 'walk' | 'jog';
  blockMode?: 'pace' | 'effort';
  effortConfig?: {
    effortLevel: 'moderate' | 'hard' | 'max';
    recoveryType?: 'jog_down' | 'walk_down';
    inclinePercent?: number;
  };
}

// ── Smart Warmup/Cooldown Wrapper Config ─────────────────────────────

export interface WarmupCooldownConfig {
  warmupMinutes: number;
  warmupZone: RunZoneType;
  cooldownMinutes: number;
  cooldownZone: RunZoneType;
  includeStrides?: boolean;
  stridesCount?: number;
  stridesDurationSeconds?: number;
}

// ── Workout Category (pool system) ───────────────────────────────────

export type WorkoutCategory =
  | 'short_intervals'
  | 'long_intervals'
  | 'fartlek_easy'
  | 'fartlek_structured'
  | 'tempo'
  | 'hill_long'
  | 'hill_short'
  | 'hill_sprints'
  | 'long_run'
  | 'easy_run'
  | 'strides';

// ── Progression Rules (discriminated union) ──────────────────────────

export interface AddSetsRule {
  type: 'add_sets';
  value: number;
  everyWeeks: number;
  appliesTo: 'all' | string[];
}

export interface IncreaseBaseValueRule {
  type: 'increase_base_value_percent';
  value: number;
  everyWeeks: number;
  appliesTo: 'all' | string[];
}

export interface IncreaseDistanceRule {
  type: 'increase_distance';
  value: number;
  everyWeeks: number;
  appliesTo: 'all' | string[];
}

export interface WalkRunRatioRule {
  type: 'adjust_walk_run_ratio';
  initialRunSeconds: number;
  initialWalkSeconds: number;
  runIncrementSeconds: number;
  walkDecrementSeconds: number;
  everyWeeks: 1 | 2;
  maxContinuousRunSeconds: number;
  minWalkSeconds: number;
}

export interface RestReductionRule {
  type: 'reduce_rest';
  reductionSecondsPerStep: number;
  everyWeeks: number;
  minRestSeconds: number;
  appliesTo: string[];
}

export interface DeloadWeekRule {
  type: 'deload_week';
  everyWeeks: 3 | 4;
  volumeReductionPercent: number;
  intensityReductionPercent: number;
  maintainFrequency: boolean;
  skipQualityWorkouts: boolean;
}

export interface TaperRule {
  type: 'taper';
  weeksBeforeEnd: 1 | 2;
  volumeReductionPercent: number;
  maintainIntensity: boolean;
  maintainFrequency: boolean;
  includeRacePaceWorkout: boolean;
}

export type ProgressionRule =
  | AddSetsRule
  | IncreaseBaseValueRule
  | IncreaseDistanceRule
  | WalkRunRatioRule
  | RestReductionRule
  | DeloadWeekRule
  | TaperRule;

// ── Volume Caps ──────────────────────────────────────────────────────

export interface VolumeCap {
  type: 'cap';
  target: 'weekly_volume' | 'single_run' | 'sets_per_block' | 'total_session' | 'weekly_distance' | 'single_run_distance';
  /** For time-based targets: minutes. For distance targets: meters. For sets: count. */
  maxValue: number;
  maxWeeklyIncreasePercent?: number;
}

// ── Week Slots & Phases ──────────────────────────────────────────────

export interface WeekSlot {
  id: string;
  slotType: 'quality_primary' | 'quality_secondary' | 'long_run' | 'easy_run' | 'recovery';
  required: boolean;
  priority: number;
  allowedCategories: WorkoutCategory[];
}

export interface ProgramPhase {
  name: 'base' | 'build' | 'peak' | 'taper';
  startWeek: number;
  endWeek: number;
  weekSlots: WeekSlot[];
  progressionRules: ProgressionRule[];
  qualityPool: WorkoutCategory[];
  /**
   * Single number = uniform multiplier for every week in the phase.
   * Array = per-week multiplier; index 0 corresponds to startWeek.
   * Values < 1 represent step-back / recovery weeks (e.g. 0.8).
   */
  volumeMultiplier: number | number[];
}

// ── 80/20 Validation ─────────────────────────────────────────────────

export interface WeekIntensityBreakdown {
  weekNumber: number;
  totalMinutes: number;
  easyMinutes: number;
  hardMinutes: number;
  hardPercent: number;
  totalKm: number;
  isValid: boolean;
}

export interface IntensityDistributionConfig {
  targetHardPercent: number;
  tolerancePercent: number;
}

// ── Workout & Program Templates ──────────────────────────────────────

export interface RunWorkoutTemplate {
  id: string;
  name: string;
  isQualityWorkout: boolean;
  targetProfileTypes: RunnerProfileType[];
  blocks: RunBlockTemplate[];
  videoIds?: string[];
  /** Lower = preferred when multiple templates match a pool slot. */
  priority?: number;
  category?: WorkoutCategory;
  /** Semantic tags for filtering — e.g. 'beginner_only', 'speed', 'elite'. */
  tags?: string[];
  /** Progressive intensity rank (1 = easiest variant, higher = harder).
   *  Used by selectWorkoutFromPool to prefer easier variants early in a phase
   *  and harder variants later. */
  intensityRank?: number;
}

export interface RunProgramWeekTemplate {
  weekNumber: number;
  workoutIds: string[];
}

export interface RunProgramTemplate {
  id: string;
  name: string;
  targetDistance: '2k' | '3k' | '5k' | '10k' | 'maintenance';
  targetProfileTypes: RunnerProfileType[];
  canonicalWeeks: number;
  canonicalFrequency: 2 | 3 | 4;
  weekTemplates: RunProgramWeekTemplate[];
  /** Flat rules — legacy; prefer phase-level rules in `phases`. */
  progressionRules: ProgressionRule[];
  phases?: ProgramPhase[];
  volumeCaps?: VolumeCap[];
  /** Hard ceiling on intensityRank for workout selection. Set by PlanGenerator for novice runners. */
  maxIntensityRank?: number;
  /** Categories to exclude from workout selection (e.g. hill_sprints for injured runners). */
  excludeCategories?: WorkoutCategory[];
}

// ==========================================
// 4. Active Running Program (user-specific)
// ==========================================
export interface ActiveRunningProgram {
  programId: string;
  startDate: Date;
  currentWeek: number;
  schedule: {
    week: number;
    day: number;
    workoutId: string;
    status: 'pending' | 'completed' | 'skipped' | 'swapped';
    category?: WorkoutCategory;
    workoutName?: string;
    /**
     * Carried over from RunWorkoutTemplate.isQualityWorkout /
     * RunWorkoutTemplate.priority (05.09.2026) — both already existed on
     * the template and survived into the in-memory generated RunWorkout
     * (materializeWorkout, running-engine.service.ts) but were dropped at
     * the flattenPlanToSchedule step before ever reaching this persisted,
     * per-user document. A future running rules engine reading a user's
     * *saved* schedule (not the template, not the in-memory plan) needs
     * these to know which entries matter more — today it would only see
     * `category`.
     *
     * Both optional and both undefined for every schedule entry written
     * before this change — no migration, no backfill. Any reader of this
     * field MUST treat undefined as "unknown," not as a false/low value —
     * an old document's real quality-workout entries are indistinguishable
     * from its easy ones by this field alone until they're rebuilt.
     */
    isQualityWorkout?: boolean;
    /** See isQualityWorkout's doc comment — same provenance, same
     *  optional/no-migration contract. Lower = more important (mirrors
     *  RunWorkoutTemplate.priority's own convention). */
    priority?: number;
    /**
     * The WeekSlot this workout filled at generation time (06.09.2026) —
     * 'quality_primary'/'quality_secondary'/'long_run'/'easy_run'/
     * 'recovery'. Unlike isQualityWorkout/priority, this did NOT already
     * survive into the in-memory RunWorkout before this change — it was
     * discarded inside generatePlan's own selection loop
     * (running-engine.service.ts), before materializeWorkout ever ran.
     * Fixed at the source (generatePlan now attaches slot.slotType to the
     * selected workout) as well as here at the flatten step — the
     * isQualityWorkout fix only needed the flatten-step half of this.
     *
     * Optional and undefined for every schedule entry written before this
     * change — no migration, no backfill. Same contract as
     * isQualityWorkout: undefined means "unknown," never "easy_run."
     * Also undefined for any entry generated via generatePlan's non-phases
     * weekTemplates branch, which has no WeekSlot concept at all (confirmed
     * dead for anything generateProgramTemplate produces — not a gap to
     * fix, that branch structurally can't have a slot to report).
     *
     * The quality_primary vs quality_secondary distinction is real
     * information, not reconstructible from category+isQualityWorkout
     * alone (both read as "quality") — this is the field that actually
     * carries it, where category/isQualityWorkout cannot.
     */
    slotType?: WeekSlot['slotType'];
    actualPerformance?: {
      avgPace: number;
      completionRate: number;
    };
  }[];
}

// ==========================================
// 5. Running Profile (root on user document)
// ==========================================
export interface RunningProfile {
  isUnlocked: boolean;
  level?: number;
  currentGoal: RunnerGoal;
  paceProfile?: PaceProfile;
  activeProgram?: ActiveRunningProgram;
  generatedProgramTemplate?: Pick<RunProgramTemplate,
    'id' | 'name' | 'targetDistance' | 'canonicalWeeks' | 'canonicalFrequency' |
    'targetProfileTypes' | 'maxIntensityRank' | 'excludeCategories'>;
  weeklyFrequency?: number;
  scheduleDays?: string[];
  /**
   * Was `scheduleDays` set by the system (a smart default the user never
   * touched) or by the user (a real choice)? See `src/lib/running-schedule-source.ts`
   * for the full reasoning — `RunningScheduleSource` there is the canonical
   * type, re-exported here to avoid a duplicate union. Missing on every
   * runner who predates this field (2b+2d round, idempotent-booping-sunrise.md)
   * — `resolveRunningScheduleSource` treats that as `'system-default'`, not
   * an error.
   */
  scheduleDaysSource?: import('@/lib/running-schedule-source').RunningScheduleSource;
  onboardingData?: RunningOnboardingData;
  lastWorkoutDate?: string;
  /**
   * ⚠️ CORRECTED ROLE (01.09.2026, before merge) — diagnostic bookkeeping,
   * NOT what drives UI visibility. An earlier draft treated this field's
   * presence as the signal for whether to show a "rebuild your plan" retry
   * UI — circular: the only writer was the retry button itself
   * (`buildActiveRunningProgram`), so a user who failed at signup and never
   * triggered a retry would never get this field, never see the button,
   * and stay stuck exactly as before this fix. David caught this before
   * merge.
   *
   * The actual detection signal is DERIVED, not stored:
   * `running.isUnlocked === true && !running.activeProgram` — see
   * `running-schedule-write.service.ts`'s `isRunningPlanBuildStuck`
   * (verified atomic: `isUnlocked` and, when it succeeds,
   * `activeProgram` are always written in the same object literal in the
   * same single Firestore call, `onboarding-sync.service.ts:1674-1786,1940`
   * — no transitional window where one is visible without the other having
   * had its chance to land too).
   *
   * This field's actual job: bookkeeping for "since when has this user been
   * stuck, and is this a repeated failure" — set when a build attempt fails
   * (`getRunProgramTemplate`/`getRunWorkoutTemplates`/`generatePlan` — see
   * `fetchAndGenerateActiveRunningProgram`), ISO string (client
   * `new Date().toISOString()`, not `serverTimestamp()` — same reasoning as
   * `lifestyle.personaAnsweredAt`: avoids the null-during-resolution
   * read-back window and this codebase's stripUndefined-before-persist
   * pattern making bare presence unreliable).
   * - Never set for a user missing `paceProfile`/`generatedProgramTemplate`
   *   themselves (`hasRunningRebuildInputs` false) — that's a structurally
   *   different, non-retry-eligible gap; a retry would fail identically
   *   forever, so recording a "stuck since" here would misrepresent it as
   *   the same retry-eligible case.
   * - Cleared (`deleteField()`, not just overwritten) on every successful
   *   `activeProgram` build, from ANY writer.
   * - On a REPEATED failure: the existing timestamp is preserved, never
   *   refreshed to the retry's failure time — "stuck since X" beats "last
   *   attempted at Y" (David, 01.09.2026).
   *
   * Always written/cleared together with `planBuildFailReason` below —
   * never one without the other.
   */
  planBuildFailedAt?: string;
  /**
   * Which `FetchAndGenerateFailureReason` caused the failure recorded by
   * `planBuildFailedAt` above (`'no-workout-templates' |
   * 'generation-threw'` — never `'missing-profile-data'`, which is never
   * retry-eligible and never written here at all).
   *
   * ⚠️ `'program-template-not-found'` REMOVED FROM THE TYPE (01.09.2026,
   * before commit-3 planning) — a real, now-fixed bug used to make this
   * the near-universal outcome: `fetchAndGenerateActiveRunningProgram`'s
   * first draft fetched a `RunProgramTemplate` from Firestore by id, but
   * the live onboarding path never writes a template there at all (see
   * `running-schedule-write.service.ts`'s module doc for the full
   * evidence) — so this reason fired for essentially every real user. The
   * fix regenerates the template instead of fetching it, and nothing left
   * in that pipeline can produce a "not found" outcome. Do not
   * reintroduce this value without a real code path that can produce it.
   *
   * Verified before removing it (David, 01.09.2026 review, explicit ask —
   * "a value written to user documents can already be sitting there,
   * deleting it from the type doesn't delete it from Firestore"): grepped
   * every reader of `running.planBuildFailReason` in the repo — **zero
   * exist**. Only writers (`buildActiveRunningProgram`,
   * `running-schedule-write.service.ts`) and this declaration itself.
   * Removing the value from the TypeScript union is therefore safe today
   * — there is no switch/if-chain anywhere that could hit an
   * unhandled-default gap. But this is a code-level guarantee, not a
   * data-level one: if A1/A2's broken retry button (live on `main`
   * between this field's introduction and this fix) was ever actually
   * clicked — on a real account or a demo/test one — the literal string
   * `'program-template-not-found'` could already be sitting in that
   * user's Firestore document, outside what this narrowed type now
   * describes. **Whenever a reader of this field is eventually built, it
   * must treat an unrecognized string value defensively** (fall back to a
   * generic "build failed" message, don't assume the TS union is
   * runtime-exhaustive) rather than trusting this type as a complete
   * description of what could be in the database.
   *
   * Exists because `'no-workout-templates'` is deliberately overloaded:
   * `fetchAndGenerateActiveRunningProgram`'s `.catch(() => [])` on
   * `getRunWorkoutTemplates()` (matching `onboarding-sync.service.ts:1700`)
   * means it fires for BOTH "the shared template pool is genuinely empty"
   * and "the fetch itself failed" — without this field, a real production
   * incident (the shared `runWorkoutTemplates` collection breaking) would
   * be indistinguishable from ordinary per-user network flakiness: every
   * new runner would silently retry and give up, with zero aggregate
   * signal anywhere that something systemic broke (David, 01.09.2026
   * review — added specifically to close that gap).
   *
   * Same write/clear/freeze semantics as `planBuildFailedAt` — set once at
   * first retry-eligible failure, never refreshed on a later retry (even
   * one that fails for a *different* reason), cleared together on success.
   */
  planBuildFailReason?: 'no-workout-templates' | 'generation-threw';
}