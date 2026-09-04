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
  type ActiveRunningProgram,
  type RunWorkoutTemplate,
  type PaceMapConfig,
} from '../types/running.types';

import { calibrateBasePace, determineProfileType, generatePlan, type GeneratePlanResult } from './running-engine.service';
import { calculateCurrentWeek } from './workout-completion.service';

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

// ══════════════════════════════════════════════════════════════════════
// Chapter 5: buildRunningPlan — parameterized rebuild, one core for many callers
// ══════════════════════════════════════════════════════════════════════

/**
 * Relocated here from `running-schedule-write.service.ts` (01.09.2026,
 * idempotent-booping-sunrise.md's `buildRunningPlan` commit) — purely a
 * move, byte-identical logic, re-exported from its old location so no
 * existing caller/test needs to change its import path. Moved to avoid a
 * circular import: `buildRunningPlan` below needs this, and
 * `running-schedule-write.service.ts` will (a later commit) call
 * `buildRunningPlan` — importing it the other way around would create a
 * cycle.
 *
 * Flattens a generated plan's week/workout structure into
 * `ActiveRunningProgram.schedule` — verbatim port of the inline logic at
 * `onboarding-sync.service.ts:1748-1786`. `workout.id` encodes its source
 * template id as `${templateId}_w${weekNumber}` (set by `generatePlan`) —
 * stripped via regex to look up category/name from the workout-template
 * pool.
 */
export function flattenPlanToSchedule(
  planResult: GeneratePlanResult,
  workoutTemplates: RunWorkoutTemplate[],
): ActiveRunningProgram['schedule'] {
  const templateCategoryMap = new Map<string, { category?: WorkoutCategory; name: string; priority?: number }>();
  for (const tpl of workoutTemplates) {
    templateCategoryMap.set(tpl.id, { category: tpl.category, name: tpl.name, priority: tpl.priority });
  }

  const schedule: ActiveRunningProgram['schedule'] = [];
  for (const planWeek of planResult.plan.weeks) {
    planWeek.workouts.forEach((workout, dayIdx) => {
      const templateId = workout.id.replace(/_w\d+$/, '');
      const tplMeta = templateCategoryMap.get(templateId);
      schedule.push({
        week: planWeek.weekNumber,
        day: dayIdx + 1,
        workoutId: workout.id,
        status: 'pending',
        category: tplMeta?.category,
        workoutName: tplMeta?.name ?? workout.title,
        // 05.09.2026 — carried into the persisted schedule for the first
        // time (running.types.ts's own doc comment on these two fields has
        // the full reasoning + the "undefined means unknown, not false"
        // contract). isQualityWorkout comes straight off the in-memory
        // generated workout (materializeWorkout already copies it from the
        // template) rather than the template re-lookup above, since it's a
        // required field there — more robust than re-deriving it from a
        // template that could since have been edited/deleted in Firestore.
        // priority has no equivalent on the generated RunWorkout, so it
        // still comes from the template lookup, same as category/name.
        isQualityWorkout: workout.isQualityWorkout,
        priority: tplMeta?.priority,
      });
    });
  }
  return schedule;
}

/**
 * `startDate` resolution for `buildRunningPlan` (David, 01.09.2026 review,
 * second round — the first draft's "always recompute via formula" was
 * wrong; simplified further after a self-authored round-trip test caught
 * a gap in the original three-case version below).
 *
 * Two cases:
 * 1. `existingStartDate` is present AND it already computes to
 *    `preservedWeek` via the REAL `calculateCurrentWeek` (the normal
 *    rebuild case — 1b's `preservedWeek` is almost always just "whatever
 *    week the user is already on") → return `existingStartDate`
 *    UNCHANGED. No formula, no shift, no history fragmenting.
 * 2. Otherwise — no `existingStartDate` at all (first-time build), OR one
 *    is present but diverges from `preservedWeek` (1b explicitly moved the
 *    number, not just carried it forward) — compute:
 *    `asOfDate − (preservedWeek−1)×7 days`.
 *
 * A first draft treated "no existingStartDate" as its own unconditional
 * case, always returning `asOfDate` regardless of `preservedWeek` — which
 * silently ignored `preservedWeek` whenever no existing date was supplied,
 * a latent inconsistency a round-trip test caught immediately (a
 * first-time build with an explicit non-1 `preservedWeek` produced week 1,
 * not the requested week). Folding it into case 2 fixes that for free:
 * with the default `preservedWeek=1`, the formula reduces to exactly
 * `asOfDate − 0×7 = asOfDate`, so every real caller's actual behavior
 * (A1's first-time build, commit 3's normal rebuild) is unchanged —
 * this only changes the answer for an input combination no real caller
 * constructs today (an explicit `preservedWeek > 1` with no
 * `existingStartDate`), making it correct instead of silently wrong.
 *
 * Case 2's formula is applied narrowly, not as a general default: when it
 * DOES fire for an actual rebuild (existingStartDate present but
 * diverging), it places `asOfDate` at the FIRST day of `preservedWeek`,
 * which can be up to 6 days LATER than a user's true original `startDate`
 * if they're mid-week. Runs logged earlier in that same real-calendar
 * week would still be preserved in `schedule[]` (via
 * `mergePreservedHistory`, `running-schedule-change.service.ts`) but would
 * fall outside the `[startDate, today]` range any calendar-date-deriving
 * reader (`resolveRunningEntry` et al.) uses — silently orphaned by date
 * even though the schedule row survives. Case 1 (the default, keep-as-is
 * path for a normal rebuild) has no such risk, since nothing about the
 * date itself changes.
 */
export function resolveBuildStartDate(
  existingStartDate: string | undefined,
  preservedWeek: number,
  asOfDate: Date,
): string {
  if (existingStartDate && calculateCurrentWeek(existingStartDate, asOfDate) === preservedWeek) {
    return existingStartDate;
  }
  const msPerDay = 24 * 60 * 60 * 1000;
  return new Date(asOfDate.getTime() - (preservedWeek - 1) * 7 * msPerDay).toISOString();
}

export interface BuildRunningPlanInput {
  goal: RunnerGoal;
  basePace: number;
  targetDistance: GeneratorTargetDistance;
  frequency: 2 | 3 | 4;
  totalWeeks: number;
  runningHistoryMonths?: number;
  hasInjuries?: boolean;
  workoutTemplates: RunWorkoutTemplate[];
  paceMapConfig: PaceMapConfig;
  /** From `resolveRunningScheduleChange` (1b) for a rebuild; omit for a first-time build (defaults to 1). */
  preservedWeek?: number;
  /** The profile's CURRENT `activeProgram.startDate`, if this is a rebuild. Omit for a first-time build. */
  existingStartDate?: string;
  /** Defaults to `new Date()`. Exposed as a parameter so this stays testable with a fixed date. */
  asOfDate?: Date;
}

export interface BuildRunningPlanResult {
  template: RunProgramTemplate;
  activeProgram: Omit<ActiveRunningProgram, 'startDate'> & { startDate: string };
  /** `generatePlan()`'s own generation-diagnostic warnings only (e.g. no matching
   *  workout template for a given week/slot) — NOT product-facing messaging like
   *  "your weekly load is increasing." That comparison needs the OLD frequency,
   *  which this function is never given (see JSDoc above `buildRunningPlan`) —
   *  it's the caller's responsibility, since the caller is the one who already
   *  holds both the old and new frequency values. */
  warnings: string[];
}

/**
 * One core, parameterized, for every "build/rebuild a running plan" caller
 * — not `rebuildOnDayChange()` or any other single-use-case name (David,
 * 01.09.2026 review). Takes every build input explicitly as a parameter;
 * deliberately does NOT read anything from a user profile or Firestore
 * itself. This is a hard requirement, not a style preference: the planned
 * "adaptive running plan / smart coach" feature (idempotent-booping-
 * sunrise.md, documented not built) will be a THIRD caller, adding a
 * training-load input of its own. If this function read its inputs from
 * the profile internally, adding that caller would mean rewriting this
 * function's internals. Because every input is an explicit parameter,
 * adding that caller only ever means adding a parameter — never a rewrite.
 *
 * Two callers today: (1) `running-schedule-write.service.ts`'s
 * `fetchAndGenerateActiveRunningProgram` (fixing its previously-broken
 * `getRunProgramTemplate(id)` call — that id was never a real Firestore
 * document, see that file's own module doc), first-time build only,
 * `preservedWeek`/`existingStartDate` omitted. (2) commit 3/3f's
 * day-count-change writer (not yet built): `resolveRunningScheduleChange`
 * (1b) → `preservedWeek` → this function → `mergePreservedHistory`
 * (`running-schedule-change.service.ts`) → the actual Firestore write.
 *
 * Purely in-memory — `generateProgramTemplate()` (this file) →
 * `generatePlan()` (`running-engine.service.ts`) →
 * `flattenPlanToSchedule()` (above). Zero Firestore reads/writes; callers
 * own all I/O.
 *
 * Plan LENGTH (`totalWeeks`) is always exactly what the caller passes —
 * this function never recomputes it. (David, 01.09.2026: for a day-count
 * change, the user asked for different days, not a different-length
 * program — `totalWeeks` must be carried forward unchanged by the caller,
 * not re-derived here or anywhere else. This also eliminates
 * `currentWeek > totalWeeks` as a possible outcome of a rebuild.)
 */
export function buildRunningPlan(input: BuildRunningPlanInput): BuildRunningPlanResult {
  const template = generateProgramTemplate({
    goal: input.goal,
    basePace: input.basePace,
    targetDistance: input.targetDistance,
    frequency: input.frequency,
    totalWeeks: input.totalWeeks,
    runningHistoryMonths: input.runningHistoryMonths,
    hasInjuries: input.hasInjuries,
  });

  const paceProfileForGeneration: PaceProfile = {
    basePace: input.basePace,
    profileType: template.targetProfileTypes[0] ?? 2,
    qualityWorkoutsHistory: [],
    qualityWorkoutCount: 0,
    lastSelfCorrectionDate: null,
  };

  const planResult = generatePlan(template, paceProfileForGeneration, input.paceMapConfig, input.workoutTemplates);
  const schedule = flattenPlanToSchedule(planResult, input.workoutTemplates);

  const preservedWeek = input.preservedWeek ?? 1;
  const asOfDate = input.asOfDate ?? new Date();
  const startDate = resolveBuildStartDate(input.existingStartDate, preservedWeek, asOfDate);

  return {
    template,
    activeProgram: {
      programId: template.id,
      startDate,
      currentWeek: preservedWeek,
      schedule,
    },
    warnings: planResult.warnings,
  };
}
