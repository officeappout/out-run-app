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
  };
  targetDistance: 3 | 5 | 10;
  weeklyFrequency: 1 | 2 | 3 | 4;
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
  | 'interval_short';

export const ALL_RUN_ZONES: RunZoneType[] = [
  'walk', 'jogging', 'recovery', 'easy', 'long_run',
  'fartlek_medium', 'tempo', 'fartlek_fast', 'interval_short',
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
  target: 'weekly_volume' | 'single_run' | 'sets_per_block' | 'total_session';
  maxValue: number;
  maxWeeklyIncreasePercent: number;
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
}

export interface RunProgramWeekTemplate {
  weekNumber: number;
  workoutIds: string[];
}

export interface RunProgramTemplate {
  id: string;
  name: string;
  targetDistance: '3k' | '5k' | '10k' | 'maintenance';
  targetProfileTypes: RunnerProfileType[];
  canonicalWeeks: number;
  canonicalFrequency: 2 | 3 | 4;
  weekTemplates: RunProgramWeekTemplate[];
  /** Flat rules — legacy; prefer phase-level rules in `phases`. */
  progressionRules: ProgressionRule[];
  phases?: ProgramPhase[];
  volumeCaps?: VolumeCap[];
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
  currentGoal: RunnerGoal;
  paceProfile?: PaceProfile;
  activeProgram?: ActiveRunningProgram;
}