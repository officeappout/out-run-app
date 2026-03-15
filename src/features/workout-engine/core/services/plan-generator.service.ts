/**
 * PlanGeneratorService — dynamic RunProgramTemplate factory.
 *
 * Converts runner onboarding inputs into a fully-formed RunProgramTemplate,
 * which is then passed directly to the existing generatePlan() engine.
 * This service does NOT replace the engine — it feeds it.
 *
 * Chapter 1: Profile Mapping
 * Chapter 2: Periodization Engine  (phase distribution math)
 * Chapter 3: Slot Architect        (per-phase week slots + quality pools)
 * Chapter 4: Safety & Progression  (volume caps + progression rules)
 */

import {
  type RunnerGoal,
  type RunnerProfileType,
  type RunProgramTemplate,
  type ProgramPhase,
  type WeekSlot,
  type WorkoutCategory,
  type ProgressionRule,
  type VolumeCap,
  type PaceProfile,
  type TaperRule,
} from '../types/running.types';

import { calibrateBasePace, determineProfileType } from './running-engine.service';

// ══════════════════════════════════════════════════════════════════════
// Public types
// ══════════════════════════════════════════════════════════════════════

export type GeneratorTargetDistance = '2k' | '3k' | '5k' | '10k' | 'maintenance';

export interface PlanGeneratorInput {
  goal: RunnerGoal;
  /** Already-calibrated basePace in seconds/km (use calibrateBasePace() first). */
  basePace: number;
  targetDistance: GeneratorTargetDistance;
  frequency: 2 | 3 | 4;
  totalWeeks: number;
  /** Months of consistent running history. If < 12, extra safety guardrails apply. */
  runningHistoryMonths?: number;
  /** Runner has current injuries → exclude hills, cap intensityRank at 2.0, deload every 3 weeks. */
  hasInjuries?: boolean;
}

export interface PhaseLayout {
  base:  { startWeek: number; endWeek: number; weeks: number };
  build: { startWeek: number; endWeek: number; weeks: number };
  peak:  { startWeek: number; endWeek: number; weeks: number };
  taper: { startWeek: number; endWeek: number; weeks: number };
}

// ══════════════════════════════════════════════════════════════════════
// Chapter 1: Profile Mapping
// ══════════════════════════════════════════════════════════════════════

/**
 * Derive basePace and profileType from raw onboarding data and build a
 * bare PaceProfile ready for generatePlan().
 *
 * For 2K input distances, we proxy through 3K for calibration purposes
 * since calibrateBasePace() has no 2K model.
 */
export function mapProfile(
  goal: RunnerGoal,
  referenceTimeSeconds: number,
  referenceDistanceKm: 2 | 3 | 5 | 10,
  targetDistanceKm: 2 | 3 | 5 | 10,
): { basePace: number; profileType: RunnerProfileType; paceProfile: PaceProfile } {
  const refDist: 3 | 5 | 10 = referenceDistanceKm <= 3 ? 3 : referenceDistanceKm === 5 ? 5 : 10;
  const tgtDist: 3 | 5 | 10 = targetDistanceKm <= 3 ? 3 : targetDistanceKm === 5 ? 5 : 10;

  const basePace = calibrateBasePace(referenceTimeSeconds, refDist, tgtDist);
  const profileType = determineProfileType(goal, basePace);

  const paceProfile: PaceProfile = {
    basePace,
    profileType,
    qualityWorkoutsHistory: [],
    qualityWorkoutCount: 0,
    lastSelfCorrectionDate: null,
  };

  return { basePace, profileType, paceProfile };
}

// ══════════════════════════════════════════════════════════════════════
// Chapter 2: Periodization Engine
// ══════════════════════════════════════════════════════════════════════

/**
 * Distribute totalWeeks into the 4 canonical phases.
 *
 * Formula:
 *   taperWeeks = 1 (always — race week)
 *   peakWeeks  = totalWeeks >= 12 ? 2 : 1
 *   remaining  = totalWeeks - taperWeeks - peakWeeks
 *   buildWeeks = round(remaining × 0.55)
 *   baseWeeks  = remaining - buildWeeks
 *
 * Examples:
 *   7 weeks  → Base[1-2]  Build[3-5]  Peak[6]   Taper[7]
 *   8 weeks  → Base[1-3]  Build[4-6]  Peak[7]   Taper[8]
 *   11 weeks → Base[1-4]  Build[5-9]  Peak[10]  Taper[11]
 *   12 weeks → Base[1-4]  Build[5-9]  Peak[10-11] Taper[12]
 */
export function distributePhases(totalWeeks: number): PhaseLayout {
  const taperWeeks = 1;
  const peakWeeks  = totalWeeks >= 12 ? 2 : 1;
  const remaining  = totalWeeks - taperWeeks - peakWeeks;
  const buildWeeks = Math.round(remaining * 0.55);
  const baseWeeks  = remaining - buildWeeks;

  const baseStart  = 1;
  const baseEnd    = baseWeeks;
  const buildStart = baseEnd + 1;
  const buildEnd   = buildStart + buildWeeks - 1;
  const peakStart  = buildEnd + 1;
  const peakEnd    = peakStart + peakWeeks - 1;
  const taperStart = peakEnd + 1;

  return {
    base:  { startWeek: baseStart,  endWeek: baseEnd,    weeks: baseWeeks  },
    build: { startWeek: buildStart, endWeek: buildEnd,   weeks: buildWeeks },
    peak:  { startWeek: peakStart,  endWeek: peakEnd,    weeks: peakWeeks  },
    taper: { startWeek: taperStart, endWeek: totalWeeks, weeks: taperWeeks },
  };
}

/**
 * Build the volumeMultiplier array (or scalar) for a given phase.
 *
 * Base:  gentle ramp [1.0, 1.1, 1.2, ...]; last week steps back to 1.0
 *        if ≥4 weeks to create a soft reset before the build phase.
 * Build: 3-week progressive cycle [1.0, 1.1, 1.2]; if ≥4 weeks,
 *        inserts a deload week (0.8) at index 3, then resumes [1.1, 1.2...].
 * Peak:  1.1 for 1 week, [1.0, 1.1] for 2 weeks.
 * Taper: always 0.6.
 */
export function buildVolumeMultipliers(
  phaseName: 'base' | 'build' | 'peak' | 'taper',
  weeks: number,
  isNovice: boolean = false,
): number | number[] {
  if (phaseName === 'taper') return 0.6;

  if (phaseName === 'peak') {
    return weeks === 1 ? 1.1 : [1.0, 1.1];
  }

  const deloadEvery = isNovice ? NOVICE_DELOAD_FREQUENCY : 4;

  if (phaseName === 'base') {
    const ramp = Array.from({ length: weeks }, (_, i) => {
      if (i === weeks - 1 && weeks >= deloadEvery) return 1.0;
      return ([1.0, 1.1, 1.2] as number[])[Math.min(i, 2)] ?? 1.2;
    });
    return ramp.length === 1 ? ramp[0] : ramp;
  }

  // Build: progressive ramp with deload inserted at deloadEvery - 1
  const PRE_DELOAD  = isNovice ? [1.0, 1.1] : [1.0, 1.1, 1.2];
  const POST_DELOAD = [1.1, 1.2];
  const result: number[] = [];
  for (let i = 0; i < weeks; i++) {
    if (i < PRE_DELOAD.length)                      result.push(PRE_DELOAD[i]);
    else if (i === PRE_DELOAD.length)               result.push(0.8);
    else                                             result.push(POST_DELOAD[(i - PRE_DELOAD.length - 1) % 2] ?? 1.1);
  }
  return result.length === 1 ? result[0] : result;
}

// ══════════════════════════════════════════════════════════════════════
// Chapter 3: Slot Architect
// ══════════════════════════════════════════════════════════════════════

interface PhaseSlotConfig {
  qualityPool: WorkoutCategory[];
  primaryAllowed: WorkoutCategory[];
  secondaryAllowed: WorkoutCategory[];
}

/**
 * Per-distance, per-phase pool and slot configuration.
 *
 * Rules for correctness:
 *   - primaryAllowed must be a subset of qualityPool
 *   - secondaryAllowed must be a subset of qualityPool
 *   (Engine filters quality slots through BOTH allowedCategories AND qualityPool)
 *
 * Distance-specific intent:
 *   2K/3K — speed-dominant: hill_sprints, short_intervals, strides
 *   5K    — balanced: intervals, tempo, fartlek
 *   10K   — endurance-dominant: long_intervals, tempo, fartlek
 */
const DISTANCE_PHASE_CONFIG: Record<string, Partial<Record<string, PhaseSlotConfig>>> = {
  '2k': {
    base:  {
      qualityPool:     ['hill_sprints', 'short_intervals', 'fartlek_easy'],
      primaryAllowed:  ['hill_sprints', 'fartlek_easy'],
      secondaryAllowed:['fartlek_easy', 'short_intervals'],
    },
    build: {
      qualityPool:     ['short_intervals', 'long_intervals', 'fartlek_structured', 'hill_short', 'tempo'],
      primaryAllowed:  ['short_intervals', 'long_intervals'],
      secondaryAllowed:['tempo', 'fartlek_structured'],
    },
    peak: {
      qualityPool:     ['short_intervals', 'fartlek_structured'],
      primaryAllowed:  ['short_intervals'],
      secondaryAllowed:['short_intervals', 'fartlek_structured'],
    },
    taper: {
      qualityPool:     ['short_intervals'],
      primaryAllowed:  ['short_intervals'],
      secondaryAllowed:['short_intervals'],
    },
  },

  '3k': {
    base:  {
      qualityPool:     ['hill_sprints', 'short_intervals', 'fartlek_easy'],
      primaryAllowed:  ['hill_sprints', 'fartlek_easy'],
      secondaryAllowed:['fartlek_easy', 'short_intervals'],
    },
    build: {
      qualityPool:     ['short_intervals', 'long_intervals', 'fartlek_structured', 'hill_short', 'tempo'],
      primaryAllowed:  ['short_intervals', 'long_intervals'],
      secondaryAllowed:['tempo', 'fartlek_structured'],
    },
    peak: {
      qualityPool:     ['short_intervals', 'fartlek_structured'],
      primaryAllowed:  ['short_intervals'],
      secondaryAllowed:['short_intervals', 'fartlek_structured'],
    },
    taper: {
      qualityPool:     ['short_intervals'],
      primaryAllowed:  ['short_intervals'],
      secondaryAllowed:['short_intervals'],
    },
  },

  '5k': {
    base:  {
      qualityPool:     ['fartlek_structured', 'fartlek_easy', 'hill_short', 'strides'],
      primaryAllowed:  ['fartlek_structured', 'fartlek_easy'],
      secondaryAllowed:['hill_short', 'strides'],
    },
    build: {
      qualityPool:     ['long_intervals', 'short_intervals', 'tempo', 'fartlek_structured'],
      primaryAllowed:  ['long_intervals', 'short_intervals'],
      secondaryAllowed:['tempo', 'fartlek_structured'],
    },
    peak: {
      qualityPool:     ['short_intervals', 'long_intervals', 'tempo', 'strides'],
      primaryAllowed:  ['short_intervals'],
      secondaryAllowed:['tempo', 'strides'],
    },
    taper: {
      qualityPool:     ['short_intervals', 'strides'],
      primaryAllowed:  ['short_intervals', 'strides'],
      secondaryAllowed:['strides'],
    },
  },

  '10k': {
    base:  {
      qualityPool:     ['fartlek_structured', 'fartlek_easy', 'hill_long', 'strides'],
      primaryAllowed:  ['fartlek_structured', 'fartlek_easy'],
      secondaryAllowed:['hill_long', 'strides'],
    },
    build: {
      qualityPool:     ['long_intervals', 'short_intervals', 'tempo', 'fartlek_structured'],
      primaryAllowed:  ['long_intervals', 'short_intervals'],
      secondaryAllowed:['tempo', 'fartlek_structured'],
    },
    peak: {
      qualityPool:     ['short_intervals', 'long_intervals', 'tempo'],
      primaryAllowed:  ['short_intervals', 'long_intervals'],
      secondaryAllowed:['tempo'],
    },
    taper: {
      qualityPool:     ['short_intervals', 'strides'],
      primaryAllowed:  ['short_intervals', 'strides'],
      secondaryAllowed:['strides'],
    },
  },

  maintenance: {
    base:  {
      qualityPool:     ['fartlek_easy', 'strides'],
      primaryAllowed:  ['fartlek_easy', 'strides'],
      secondaryAllowed:['strides'],
    },
    build: {
      qualityPool:     ['fartlek_easy', 'strides'],
      primaryAllowed:  ['fartlek_easy', 'strides'],
      secondaryAllowed:['strides'],
    },
    peak: {
      qualityPool:     ['fartlek_easy', 'strides'],
      primaryAllowed:  ['fartlek_easy'],
      secondaryAllowed:['strides'],
    },
    taper: {
      qualityPool:     ['strides', 'easy_run'],
      primaryAllowed:  ['strides'],
      secondaryAllowed:['strides'],
    },
  },
};

/** Slot-ID prefix for each phase (used to generate stable, unique slot IDs). */
const PHASE_PREFIX: Record<string, string> = {
  base: 'ba', build: 'bu', peak: 'pk', taper: 'tp',
};

/** Profile 3 (beginner improver) gentle quality override — applied to all non-taper phases. */
const BEGINNER_QUALITY: WorkoutCategory[] = ['fartlek_easy', 'strides', 'hill_short'];

function resolvePhaseSlotConfig(
  phaseName: string,
  profileType: RunnerProfileType,
  targetDistance: GeneratorTargetDistance,
): PhaseSlotConfig {
  const distKey = profileType === 4 ? 'maintenance' : targetDistance;
  const cfg = DISTANCE_PHASE_CONFIG[distKey]?.[phaseName];

  if (profileType === 3 && phaseName !== 'taper') {
    return {
      qualityPool:     BEGINNER_QUALITY,
      primaryAllowed:  BEGINNER_QUALITY,
      secondaryAllowed:['strides'],
    };
  }

  return cfg ?? {
    qualityPool:     ['fartlek_easy', 'strides'],
    primaryAllowed:  ['fartlek_easy'],
    secondaryAllowed:['strides'],
  };
}

/**
 * Build the WeekSlot[] for one phase.
 *
 * Always defines 4 slots; resolveActiveSlots() in the engine trims
 * to canonicalFrequency by priority, dropping required:false first.
 *
 * Slot priorities:
 *   1. quality_primary  (required)
 *   2. long_run         (required; taper uses easy_run here instead)
 *   3. quality_secondary (optional)
 *   4. easy_run         (optional)
 */
function buildWeekSlots(
  phaseName: 'base' | 'build' | 'peak' | 'taper',
  profileType: RunnerProfileType,
  targetDistance: GeneratorTargetDistance,
): WeekSlot[] {
  const px = PHASE_PREFIX[phaseName] ?? phaseName.slice(0, 2);
  const cfg = resolvePhaseSlotConfig(phaseName, profileType, targetDistance);

  if (phaseName === 'taper') {
    return [
      { id: `${px}_q1`, slotType: 'quality_primary',   required: true,  priority: 1, allowedCategories: cfg.primaryAllowed },
      { id: `${px}_e1`, slotType: 'easy_run',           required: true,  priority: 2, allowedCategories: ['easy_run'] },
      { id: `${px}_e2`, slotType: 'easy_run',           required: false, priority: 3, allowedCategories: ['easy_run'] },
      { id: `${px}_e3`, slotType: 'easy_run',           required: false, priority: 4, allowedCategories: ['easy_run'] },
    ];
  }

  return [
    { id: `${px}_q1`, slotType: 'quality_primary',   required: true,  priority: 1, allowedCategories: cfg.primaryAllowed  },
    { id: `${px}_lr`, slotType: 'long_run',           required: true,  priority: 2, allowedCategories: ['long_run']       },
    { id: `${px}_q2`, slotType: 'quality_secondary',  required: false, priority: 3, allowedCategories: cfg.secondaryAllowed },
    { id: `${px}_er`, slotType: 'easy_run',           required: false, priority: 4, allowedCategories: ['easy_run']       },
  ];
}

// ══════════════════════════════════════════════════════════════════════
// Chapter 4: Safety & Progression
// ══════════════════════════════════════════════════════════════════════

/**
 * Volume caps by target distance.
 * All caps carry maxWeeklyIncreasePercent: 10 (the 10% rule).
 *
 * 3K caps are raised from the old 15k/5k defaults to reflect that
 * a runner improving their 3K already runs 20-25km/week.
 */
const VOLUME_CAPS_CONFIG: Record<string, { weekly: number; singleRun: number }> = {
  '2k':          { weekly: 20_000, singleRun:  5_000 },
  '3k':          { weekly: 25_000, singleRun:  6_000 },
  '5k':          { weekly: 40_000, singleRun: 12_000 },
  '10k':         { weekly: 50_000, singleRun: 15_000 },
  'maintenance': { weekly: 30_000, singleRun: 10_000 },
};

function buildVolumeCaps(targetDistance: GeneratorTargetDistance): VolumeCap[] {
  const caps = VOLUME_CAPS_CONFIG[targetDistance];
  if (!caps) return [];
  return [
    { type: 'cap', target: 'weekly_distance',     maxValue: caps.weekly,    maxWeeklyIncreasePercent: 10 },
    { type: 'cap', target: 'single_run_distance', maxValue: caps.singleRun },
  ];
}

/**
 * Progression rules per phase.
 *
 * Build-phase deloads are handled entirely by the volumeMultiplier array
 * (cleaner, avoids conflict with applyDeload's week-number math).
 * Taper gets a TaperRule so applyTaper() preserves quality blocks while
 * cutting easy/warmup volume.
 */
function buildProgressionRules(
  phaseName: 'base' | 'build' | 'peak' | 'taper',
): ProgressionRule[] {
  if (phaseName === 'taper') {
    const rule: TaperRule = {
      type: 'taper',
      weeksBeforeEnd: 1,
      volumeReductionPercent: 40,
      maintainIntensity: true,
      maintainFrequency: true,
      includeRacePaceWorkout: true,
    };
    return [rule];
  }
  return [];
}

// ══════════════════════════════════════════════════════════════════════
// Orchestrator
// ══════════════════════════════════════════════════════════════════════

function buildPlanName(targetDistance: GeneratorTargetDistance, totalWeeks: number): string {
  const label: Record<GeneratorTargetDistance, string> = {
    '2k': '2 ק״מ', '3k': '3 ק״מ', '5k': '5 ק״מ', '10k': '10 ק״מ', maintenance: 'תחזוקה',
  };
  return `תוכנית ${label[targetDistance]} — ${totalWeeks} שבועות`;
}

/**
 * Generate a complete RunProgramTemplate from onboarding inputs.
 *
 * The returned template is immediately compatible with generatePlan():
 *   const template = generateProgramTemplate(input);
 *   const result   = generatePlan(template, paceProfile, config, allWorkoutTemplates);
 *
 * @param input.goal           Runner's declared goal (used for profile type mapping)
 * @param input.basePace       Calibrated pace in seconds/km
 * @param input.targetDistance Race distance the runner is training for
 * @param input.frequency      Workouts per week (2 | 3 | 4)
 * @param input.totalWeeks     Plan duration
 */
/**
 * Experience-based safety thresholds.
 * Runners with < 12 months of consistent training get:
 *   - More frequent deloads (every 3 weeks instead of 4)
 *   - A hard ceiling on template intensity rank
 */
const NOVICE_THRESHOLD_MONTHS = 12;
const NOVICE_DELOAD_FREQUENCY = 3;
const NOVICE_MAX_INTENSITY_RANK = 3.0;

const INJURY_MAX_INTENSITY_RANK = 2.0;
const INJURY_EXCLUDED_CATEGORIES: WorkoutCategory[] = ['hill_sprints', 'hill_short', 'hill_long'];

export function generateProgramTemplate(input: PlanGeneratorInput): RunProgramTemplate {
  const { goal, basePace, targetDistance, frequency, totalWeeks, runningHistoryMonths, hasInjuries } = input;

  const isNovice = (runningHistoryMonths ?? 24) < NOVICE_THRESHOLD_MONTHS;
  const forceConservative = isNovice || (hasInjuries === true);

  const profileType = determineProfileType(goal, basePace);

  const targetProfileTypes: RunnerProfileType[] =
    profileType === 3 ? [3]
    : profileType === 4 ? [4]
    : [1, 2];

  const layout = distributePhases(totalWeeks);

  const phases: ProgramPhase[] = (['base', 'build', 'peak', 'taper'] as const).map((phaseName) => {
    const phaseLayout = layout[phaseName];
    const cfg = resolvePhaseSlotConfig(phaseName, profileType, targetDistance);

    return {
      name:             phaseName,
      startWeek:        phaseLayout.startWeek,
      endWeek:          phaseLayout.endWeek,
      weekSlots:        buildWeekSlots(phaseName, profileType, targetDistance),
      qualityPool:      cfg.qualityPool,
      volumeMultiplier: buildVolumeMultipliers(phaseName, phaseLayout.weeks, forceConservative),
      progressionRules: buildProgressionRules(phaseName),
    };
  });

  return {
    id:                 `gen_${targetDistance}_${totalWeeks}w_${frequency}x_${Date.now()}`,
    name:               buildPlanName(targetDistance, totalWeeks),
    targetDistance:     targetDistance as RunProgramTemplate['targetDistance'],
    targetProfileTypes,
    canonicalWeeks:     totalWeeks,
    canonicalFrequency: frequency,
    weekTemplates:      [],
    progressionRules:   [],
    phases,
    volumeCaps:         buildVolumeCaps(targetDistance),
    maxIntensityRank:   hasInjuries
                          ? INJURY_MAX_INTENSITY_RANK
                          : isNovice ? NOVICE_MAX_INTENSITY_RANK : undefined,
    excludeCategories:  hasInjuries ? INJURY_EXCLUDED_CATEGORIES : undefined,
  };
}

/**
 * Convenience default: number of weeks recommended per target distance.
 * Callers may override freely.
 */
export const DEFAULT_PLAN_WEEKS: Record<GeneratorTargetDistance, number> = {
  '2k':          6,
  '3k':          8,
  '5k':          8,
  '10k':        12,
  'maintenance': 8,
};
