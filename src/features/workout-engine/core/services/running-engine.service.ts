/**
 * RunningEngineService — pure-function core of the generative running engine.
 *
 * All functions are stateless and side-effect-free.  They receive data in,
 * return data out, and never touch Firestore or stores directly.
 */

import type {
  RunnerGoal,
  RunnerProfileType,
  RunZoneType,
  ComputedPaceZone,
  PaceMapConfig,
  PaceMapKey,
  PaceZoneRule,
  PerformanceZone,
  QualityWorkoutRecord,
  PaceProfile,
  RunBlockTemplate,
  RunWorkoutTemplate,
  RunProgramTemplate,
  ProgressionRule,
  WalkRunRatioRule,
  RestReductionRule,
  DeloadWeekRule,
  TaperRule,
  VolumeCap,
  WorkoutCategory,
  WeekSlot,
  ProgramPhase,
  WeekIntensityBreakdown,
  IntensityDistributionConfig,
  WarmupCooldownConfig,
} from '../types/running.types';

import { WARMUP_COOLDOWN_BY_CATEGORY } from '../config/warmup-cooldown-config';

import type { RunBlock, RunBlockType } from '../../players/running/types/run-block.type';
import type { RunWorkout } from '../../players/running/types/run-workout.type';
import type { RunPlan, RunPlanWeek } from '../../players/running/types/run-plan.type';

import { ALL_RUN_ZONES } from '../types/running.types';

// ── Constants ────────────────────────────────────────────────────────

const SELF_CORRECTION_DELTA = 0.015;        // 1.5 %
const QUALITY_WINDOW_SIZE = 3;              // re-evaluate every 3 quality workouts
const FAST_SLOW_BOUNDARY_SECONDS = 360;     // 6:00 min/km = Profile 1 vs 2 threshold

// ── Utility ──────────────────────────────────────────────────────────

/** Round to nearest 5 seconds (coaching convention). */
export function round5(n: number): number {
  return Math.round(n / 5) * 5;
}

/** Format seconds-per-km into "M:SS" (e.g. 330 → "5:30"). */
export function formatPaceSeconds(seconds: number): string {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (s === 60) return `${m + 1}:00`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ══════════════════════════════════════════════════════════════════════
// 1. calibrateBasePace
// ══════════════════════════════════════════════════════════════════════

/**
 * Derive a 5 km-equivalent basePace from the user's reference race result.
 *
 * Per PDF notes (p. 7–8):
 *   - 3 km reference  → subtract 5 s   (shorter race ⇒ faster zone target)
 *   - 10 km reference → add 10 s       (longer race  ⇒ forgiving zone target)
 *   - 5 km reference  → use as-is
 *
 * @param referenceTimeSeconds  Total time the user reported (e.g. 1750 for 29:10)
 * @param referenceDistanceKm   Distance of the reported effort (3, 5, or 10)
 * @param targetDistanceKm      The distance the user is training for
 * @returns basePace in seconds per km, rounded to 5.
 */
export function calibrateBasePace(
  referenceTimeSeconds: number,
  referenceDistanceKm: number,
  targetDistanceKm: 3 | 5 | 10,
): number {
  const refPacePerKm = referenceTimeSeconds / referenceDistanceKm;

  let basePace = refPacePerKm;
  if (targetDistanceKm === 3)  basePace -= 5;
  if (targetDistanceKm === 10) basePace += 10;

  return round5(basePace);
}

// ══════════════════════════════════════════════════════════════════════
// 2. determineProfileType
// ══════════════════════════════════════════════════════════════════════

/**
 * Map (goal + basePace) → RunnerProfileType 1–4.
 *
 *  1 = Fast improver   (basePace < 6:00 & wants to improve)
 *  2 = Slow improver   (basePace ≥ 6:00 & wants to improve)
 *  3 = Beginner         (couch_to_5k / returning runner)
 *  4 = Maintenance      (wants to keep current fitness)
 */
export function determineProfileType(
  goal: RunnerGoal,
  basePace: number,
): RunnerProfileType {
  if (goal === 'couch_to_5k')       return 3;
  if (goal === 'maintain_fitness')  return 4;
  return basePace < FAST_SLOW_BOUNDARY_SECONDS ? 1 : 2;
}

// ══════════════════════════════════════════════════════════════════════
// 3. computeZones
// ══════════════════════════════════════════════════════════════════════

/** Pick the right sub-table from PaceMapConfig for a profile type. */
export function paceMapKeyForProfile(profileType: RunnerProfileType): PaceMapKey {
  switch (profileType) {
    case 1: return 'profileFast';
    case 2: return 'profileSlow';
    case 3: return 'profileBeginner';
    case 4: return 'profileMaintenance';
  }
}

/**
 * Compute concrete pace zones (seconds/km) from basePace + config table.
 * Walk zone uses fixed values; all others derive from percentages.
 */
export function computeZones(
  basePace: number,
  profileType: RunnerProfileType,
  config: PaceMapConfig,
): Record<RunZoneType, ComputedPaceZone> {
  const tableKey = paceMapKeyForProfile(profileType);
  const table = config[tableKey];

  const zones = {} as Record<RunZoneType, ComputedPaceZone>;

  for (const zone of ALL_RUN_ZONES) {
    const rule: PaceZoneRule = table[zone];
    let minPace: number;
    let maxPace: number;

    if (rule.fixedMinSeconds != null && rule.fixedMaxSeconds != null) {
      minPace = rule.fixedMinSeconds;
      maxPace = rule.fixedMaxSeconds;
    } else {
      minPace = round5(basePace * (rule.minPercent ?? 100) / 100);
      maxPace = round5(basePace * (rule.maxPercent ?? 100) / 100);
    }

    zones[zone] = {
      minPace,
      maxPace,
      label: `${formatPaceSeconds(minPace)}–${formatPaceSeconds(maxPace)}`,
    };
  }

  return zones;
}

// ══════════════════════════════════════════════════════════════════════
// 4. classifyPerformance
// ══════════════════════════════════════════════════════════════════════

/**
 * Determine where the runner's average pace falls relative to the target zone.
 *
 * "position" is normalised 0 → 1 across the zone width:
 *   0.0 = fastest boundary (minPace)
 *   1.0 = slowest boundary (maxPace)
 *
 * Remember: lower seconds = faster.
 *
 * @returns PerformanceZone — one of 'above_high' | 'high' | 'mid' | 'low' | 'below_low'
 */
export function classifyPerformance(
  avgPace: number,
  minPace: number,
  maxPace: number,
): PerformanceZone {
  if (avgPace < minPace) return 'above_high';   // ran faster than zone
  if (avgPace > maxPace) return 'below_low';     // ran slower than zone

  const zoneWidth = maxPace - minPace;
  if (zoneWidth <= 0) return 'mid';

  const position = (avgPace - minPace) / zoneWidth;

  if (position < 0.2)  return 'high';   // top 20 % (fast end)
  if (position <= 0.8) return 'mid';    // middle 60 %
  return 'low';                          // bottom 20 % (slow end)
}

// ══════════════════════════════════════════════════════════════════════
// 5. processSelfCorrection
// ══════════════════════════════════════════════════════════════════════

export interface SelfCorrectionResult {
  newBasePace: number;
  impactSeconds: number;
  aggregatePerformanceZone: PerformanceZone;
  shouldUpdateProfile: boolean;
}

/**
 * Self-correction algorithm (PDF p. 8–9).
 *
 * Called after every quality workout.  When `qualityWorkoutCount % 3 === 0`
 * the last 3 records are averaged and compared to their target zone.
 *
 * Outcome table:
 *   above_high (faster than zone)  → basePace = avgPace × 0.985 (improve)
 *   high       (top 20 %)         → basePace × 0.985             (improve)
 *   mid        (middle 60 %)      → no change
 *   low        (bottom 20 %)      → basePace × 1.015             (slow)
 *   below_low  (slower than zone) → basePace = avgPace × 1.015   (slow)
 */
export function processSelfCorrection(
  recentRecords: QualityWorkoutRecord[],
  currentBasePace: number,
  config: PaceMapConfig,
  profileType: RunnerProfileType,
): SelfCorrectionResult {
  if (recentRecords.length < QUALITY_WINDOW_SIZE) {
    return {
      newBasePace: currentBasePace,
      impactSeconds: 0,
      aggregatePerformanceZone: 'mid',
      shouldUpdateProfile: false,
    };
  }

  const window = recentRecords.slice(-QUALITY_WINDOW_SIZE);

  // Average pace across the quality exercises in the 3-workout window
  const avgPace =
    window.reduce((sum, r) => sum + r.qualityExerciseAvgPace, 0) / window.length;

  // Resolve the target zone boundaries for the dominant zone in the window.
  // If workouts target different zones, use the most recent one.
  const targetZone = window[window.length - 1].targetZone;
  const zones = computeZones(currentBasePace, profileType, config);
  const { minPace, maxPace } = zones[targetZone];

  const performanceZone = classifyPerformance(avgPace, minPace, maxPace);

  let newBasePace: number;

  switch (performanceZone) {
    case 'above_high':
      // Ran faster than the zone → snap to avg, then reward 1.5 %
      newBasePace = round5(avgPace * (1 - SELF_CORRECTION_DELTA));
      break;

    case 'high':
      newBasePace = round5(currentBasePace * (1 - SELF_CORRECTION_DELTA));
      break;

    case 'mid':
      newBasePace = currentBasePace;
      break;

    case 'low':
      newBasePace = round5(currentBasePace * (1 + SELF_CORRECTION_DELTA));
      break;

    case 'below_low':
      // Ran slower than the zone → snap to avg, then penalise 1.5 %
      newBasePace = round5(avgPace * (1 + SELF_CORRECTION_DELTA));
      break;
  }

  return {
    newBasePace,
    impactSeconds: newBasePace - currentBasePace,
    aggregatePerformanceZone: performanceZone,
    shouldUpdateProfile: newBasePace !== currentBasePace,
  };
}

// ══════════════════════════════════════════════════════════════════════
// 6. recordQualityWorkout  (orchestration helper)
// ══════════════════════════════════════════════════════════════════════

export interface RecordQualityResult {
  updatedProfile: PaceProfile;
  selfCorrection: SelfCorrectionResult | null;
}

/**
 * Record a quality workout and return the updated PaceProfile.
 * If this is the 3rd workout in the window, self-correction runs automatically.
 */
export function recordQualityWorkout(
  currentProfile: PaceProfile,
  workoutId: string,
  qualityExerciseAvgPace: number,
  targetZone: RunZoneType,
  config: PaceMapConfig,
): RecordQualityResult {
  const zones = computeZones(currentProfile.basePace, currentProfile.profileType, config);
  const { minPace, maxPace } = zones[targetZone];

  const performanceZone = classifyPerformance(qualityExerciseAvgPace, minPace, maxPace);

  const record: QualityWorkoutRecord = {
    workoutId,
    date: new Date().toISOString(),
    qualityExerciseAvgPace,
    targetZone,
    performanceZone,
    impactOnBasePaceSeconds: 0, // will be filled after self-correction
  };

  const newCount = currentProfile.qualityWorkoutCount + 1;
  const newHistory = [...currentProfile.qualityWorkoutsHistory, record];

  let selfCorrection: SelfCorrectionResult | null = null;
  let newBasePace = currentProfile.basePace;
  let newProfileType = currentProfile.profileType;

  if (newCount % QUALITY_WINDOW_SIZE === 0) {
    selfCorrection = processSelfCorrection(
      newHistory,
      currentProfile.basePace,
      config,
      currentProfile.profileType,
    );

    if (selfCorrection.shouldUpdateProfile) {
      newBasePace = selfCorrection.newBasePace;
      // Profile type may shift if pace crosses the 6:00 boundary
      newProfileType = determineProfileType(
        goalFromProfileType(currentProfile.profileType),
        newBasePace,
      );

      // Stamp the impact on the last 3 records
      const impactPerRecord = selfCorrection.impactSeconds / QUALITY_WINDOW_SIZE;
      for (let i = newHistory.length - QUALITY_WINDOW_SIZE; i < newHistory.length; i++) {
        newHistory[i] = { ...newHistory[i], impactOnBasePaceSeconds: impactPerRecord };
      }
    }
  }

  const updatedProfile: PaceProfile = {
    basePace: newBasePace,
    profileType: newProfileType,
    qualityWorkoutsHistory: newHistory,
    qualityWorkoutCount: newCount,
    lastSelfCorrectionDate:
      selfCorrection?.shouldUpdateProfile
        ? new Date().toISOString()
        : currentProfile.lastSelfCorrectionDate,
  };

  return { updatedProfile, selfCorrection };
}

// ── Internal helper ──────────────────────────────────────────────────

/**
 * Reverse-map a profileType back to its original RunnerGoal.
 * Used when re-evaluating profileType after a basePace change.
 * Profiles 1 & 2 both map to a generic "improve" goal — the exact
 * distance variant doesn't matter for the profile-type calculation.
 */
function goalFromProfileType(pt: RunnerProfileType): RunnerGoal {
  switch (pt) {
    case 3:  return 'couch_to_5k';
    case 4:  return 'maintain_fitness';
    default: return 'improve_speed_5k';
  }
}

// ══════════════════════════════════════════════════════════════════════
// 7. computeWalkRunForWeek
// ══════════════════════════════════════════════════════════════════════

export interface WalkRunResult {
  runSeconds: number;
  walkSeconds: number;
  repetitions: number;
}

/**
 * Compute walk/run intervals for a beginner program at the given week.
 *
 * Progression: each `everyWeeks` increment increases run duration and
 * decreases walk duration until the runner can sustain continuous running.
 *
 * When walkSeconds falls below minWalkSeconds, the runner graduates to
 * a single continuous run block (walkSeconds = 0, repetitions = 1).
 */
export function computeWalkRunForWeek(
  rule: WalkRunRatioRule,
  weekNumber: number,
): WalkRunResult {
  const steps = Math.floor((weekNumber - 1) / rule.everyWeeks);

  let runSeconds = rule.initialRunSeconds + steps * rule.runIncrementSeconds;
  let walkSeconds = rule.initialWalkSeconds - steps * rule.walkDecrementSeconds;

  runSeconds = Math.min(runSeconds, rule.maxContinuousRunSeconds);
  walkSeconds = Math.max(walkSeconds, 0);

  if (walkSeconds <= rule.minWalkSeconds) {
    return { runSeconds: rule.maxContinuousRunSeconds, walkSeconds: 0, repetitions: 1 };
  }

  const totalSessionSeconds = 30 * 60;
  const cycleSeconds = runSeconds + walkSeconds;
  const repetitions = Math.max(1, Math.floor(totalSessionSeconds / cycleSeconds));

  return { runSeconds, walkSeconds, repetitions };
}

// ══════════════════════════════════════════════════════════════════════
// 8. applyProgressionToBlock
// ══════════════════════════════════════════════════════════════════════

/**
 * Apply all matching progression rules to a block template for the given week.
 * Returns a new template with adjusted `baseValue`, `sets`, and
 * `restBetweenSetsSeconds`. The original object is not mutated.
 */
export function applyProgressionToBlock(
  block: RunBlockTemplate,
  weekNumber: number,
  rules: ProgressionRule[],
): RunBlockTemplate {
  let result = { ...block };

  for (const rule of rules) {
    if (!ruleAppliesToBlock(rule, block.id)) continue;

    const steps = Math.floor((weekNumber - 1) / rule.everyWeeks);
    if (steps <= 0) continue;

    switch (rule.type) {
      case 'add_sets':
        result = { ...result, sets: result.sets + rule.value * steps };
        break;

      case 'increase_base_value_percent': {
        const multiplier = 1 + (rule.value / 100) * steps;
        result = { ...result, baseValue: Math.round(result.baseValue * multiplier) };
        break;
      }

      case 'increase_distance': {
        const addedDistance = rule.value * steps;
        result = { ...result, baseValue: result.baseValue + addedDistance };
        break;
      }

      case 'reduce_rest': {
        if (result.restBetweenSetsSeconds != null) {
          const reduced = result.restBetweenSetsSeconds - rule.reductionSecondsPerStep * steps;
          result = {
            ...result,
            restBetweenSetsSeconds: Math.max(reduced, rule.minRestSeconds),
          };
        }
        break;
      }

      default:
        break;
    }
  }

  return result;
}

/** Check if a progression rule targets this block (by id or 'all'). */
function ruleAppliesToBlock(
  rule: ProgressionRule,
  blockId: string,
): boolean {
  if (!('appliesTo' in rule)) return false;
  if (rule.appliesTo === 'all') return true;
  return Array.isArray(rule.appliesTo) && rule.appliesTo.includes(blockId);
}

// ══════════════════════════════════════════════════════════════════════
// 9. materializeWorkout
// ══════════════════════════════════════════════════════════════════════

let _blockIdCounter = 0;
function nextBlockId(): string {
  return `blk_${Date.now()}_${++_blockIdCounter}`;
}

const REST_COLOR_HEX = '#9CA3AF';
const WARMUP_COLOR_HEX = '#60A5FA';   // blue-400
const COOLDOWN_COLOR_HEX = '#818CF8'; // indigo-400
const STRIDES_COLOR_HEX = '#F59E0B';  // amber-500
const STRIDES_REST_SECONDS = 45;

/**
 * Build dynamic warmup/cooldown/strides blocks from a WarmupCooldownConfig.
 * All generated blocks are flagged with `_isDynamicWrapper: true`.
 */
function buildWrapperBlocks(
  wrapConfig: WarmupCooldownConfig,
  userProfile: PaceProfile,
  config: PaceMapConfig,
): { warmupBlocks: RunBlock[]; cooldownBlocks: RunBlock[] } {
  const warmupBlocks: RunBlock[] = [];
  const cooldownBlocks: RunBlock[] = [];

  // ── Warmup ──
  if (wrapConfig.warmupMinutes > 0) {
    const zones = userProfile.basePace > 0
      ? computeZones(userProfile.basePace, userProfile.profileType, config)
      : null;
    const zone = zones?.[wrapConfig.warmupZone];

    const warmup: RunBlock = {
      id: nextBlockId(),
      type: 'warmup',
      label: 'חימום',
      durationSeconds: wrapConfig.warmupMinutes * 60,
      colorHex: WARMUP_COLOR_HEX,
      isQualityExercise: false,
      blockMode: 'pace',
      zoneType: wrapConfig.warmupZone,
      _isDynamicWrapper: true,
    };
    if (zone) {
      warmup.targetPacePercentage = { min: zone.minPace, max: zone.maxPace };
    }
    warmupBlocks.push(warmup);
  }

  // ── Strides (appended at end of warmup, before core set) ──
  if (wrapConfig.includeStrides) {
    const count = wrapConfig.stridesCount ?? 4;
    const dur = wrapConfig.stridesDurationSeconds ?? 20;

    for (let i = 0; i < count; i++) {
      warmupBlocks.push({
        id: nextBlockId(),
        type: 'run',
        label: `סטריידס (${i + 1}/${count})`,
        durationSeconds: dur,
        colorHex: STRIDES_COLOR_HEX,
        isQualityExercise: true,
        blockMode: 'effort',
        effortConfig: { effortLevel: 'hard' },
        _isDynamicWrapper: true,
      });

      if (i < count - 1) {
        warmupBlocks.push({
          id: nextBlockId(),
          type: 'walk',
          label: 'הליכת התאוששות',
          durationSeconds: STRIDES_REST_SECONDS,
          colorHex: REST_COLOR_HEX,
          isQualityExercise: false,
          blockMode: 'pace',
          _isSynthesizedRest: true,
          _isDynamicWrapper: true,
        });
      }
    }
  }

  // ── Cooldown ──
  if (wrapConfig.cooldownMinutes > 0) {
    const zones = userProfile.basePace > 0
      ? computeZones(userProfile.basePace, userProfile.profileType, config)
      : null;
    const zone = zones?.[wrapConfig.cooldownZone];

    const cooldown: RunBlock = {
      id: nextBlockId(),
      type: 'cooldown',
      label: 'שחרור',
      durationSeconds: wrapConfig.cooldownMinutes * 60,
      colorHex: COOLDOWN_COLOR_HEX,
      isQualityExercise: false,
      blockMode: 'pace',
      zoneType: wrapConfig.cooldownZone,
      _isDynamicWrapper: true,
    };
    if (zone) {
      cooldown.targetPacePercentage = { min: zone.minPace, max: zone.maxPace };
    }
    cooldownBlocks.push(cooldown);
  }

  return { warmupBlocks, cooldownBlocks };
}

/**
 * Convert a RunWorkoutTemplate into a playable RunWorkout by:
 *   1. Applying progression rules for the given week
 *   2. Expanding sets into individual rep blocks with synthesized rest blocks between them
 *   3. Handling Profile 3 (beginner) walk/run ratio overrides
 *   4. Resolving blockMode=effort (no zone computation)
 *   5. Dynamically injecting warmup/cooldown wrappers when the template has none
 */
export function materializeWorkout(
  template: RunWorkoutTemplate,
  weekNumber: number,
  rules: ProgressionRule[],
  userProfile: PaceProfile,
  config: PaceMapConfig,
): RunWorkout {
  const walkRunRule = rules.find(
    (r): r is WalkRunRatioRule => r.type === 'adjust_walk_run_ratio',
  );

  if (userProfile.profileType === 3 && walkRunRule) {
    return materializeBeginnerWorkout(template, weekNumber, walkRunRule, rules);
  }

  const coreBlocks: RunBlock[] = [];

  for (const blockTpl of template.blocks) {
    const progressed = applyProgressionToBlock(blockTpl, weekNumber, rules);
    const repBlocks = expandBlockWithRests(progressed, userProfile, config);
    coreBlocks.push(...repBlocks);
  }

  // Dynamic wrapper injection:
  // Only inject if the template has NO manual warmup/cooldown AND has a known category.
  const hasManualWarmup = template.blocks.some((b) => b.type === 'warmup');
  const hasManualCooldown = template.blocks.some((b) => b.type === 'cooldown');
  const shouldInject = !hasManualWarmup && !hasManualCooldown && template.category;

  let finalBlocks: RunBlock[];

  if (shouldInject) {
    const wrapConfig = WARMUP_COOLDOWN_BY_CATEGORY[template.category!];
    if (wrapConfig && (wrapConfig.warmupMinutes > 0 || wrapConfig.cooldownMinutes > 0 || wrapConfig.includeStrides)) {
      const { warmupBlocks, cooldownBlocks } = buildWrapperBlocks(wrapConfig, userProfile, config);
      finalBlocks = [...warmupBlocks, ...coreBlocks, ...cooldownBlocks];
    } else {
      finalBlocks = coreBlocks;
    }
  } else {
    finalBlocks = coreBlocks;
  }

  return {
    id: `${template.id}_w${weekNumber}`,
    title: template.name,
    description: (template as any).description as string | undefined,
    isQualityWorkout: template.isQualityWorkout,
    blocks: finalBlocks,
  };
}

/**
 * Expand a single block template into 1..N RunBlocks.
 * When sets > 1, interleaves synthesized rest blocks between reps.
 */
function expandBlockWithRests(
  block: RunBlockTemplate,
  userProfile: PaceProfile,
  config: PaceMapConfig,
): RunBlock[] {
  const baseBlock = templateToRunBlock(block, userProfile, config);

  if (block.sets <= 1) return [baseBlock];

  const result: RunBlock[] = [];
  const restDuration = block.restBetweenSetsSeconds ?? 0;
  const restType = block.restType ?? 'standing';

  for (let rep = 0; rep < block.sets; rep++) {
    result.push({
      ...baseBlock,
      id: nextBlockId(),
      label: block.sets > 1
        ? `${block.label} (${rep + 1}/${block.sets})`
        : block.label,
    });

    const isLastRep = rep === block.sets - 1;
    if (!isLastRep && restDuration > 0) {
      result.push(makeSynthesizedRestBlock(restDuration, restType));
    }
  }

  return result;
}

/** Convert a RunBlockTemplate to a single playable RunBlock. */
function templateToRunBlock(
  tpl: RunBlockTemplate,
  userProfile: PaceProfile,
  config: PaceMapConfig,
): RunBlock {
  const block: RunBlock = {
    id: nextBlockId(),
    type: tpl.type as RunBlockType,
    label: tpl.label,
    colorHex: tpl.colorHex,
    isQualityExercise: tpl.isQualityExercise,
    blockMode: tpl.blockMode ?? 'pace',
  };

  if (tpl.measureBy === 'time') {
    block.durationSeconds = tpl.baseValue;
  } else {
    block.distanceMeters = tpl.baseValue;
  }

  if (tpl.blockMode === 'effort') {
    block.effortConfig = tpl.effortConfig;
  } else {
    block.zoneType = tpl.zoneType;
    if (userProfile.basePace > 0) {
      const zones = computeZones(userProfile.basePace, userProfile.profileType, config);
      const zone = zones[tpl.zoneType];
      if (zone) {
        block.targetPacePercentage = { min: zone.minPace, max: zone.maxPace };
        if (tpl.measureBy === 'time' && zone.minPace > 0 && zone.maxPace > 0) {
          const avgPaceSecPerKm = (zone.minPace + zone.maxPace) / 2;
          block.distanceMeters = Math.round((tpl.baseValue / avgPaceSecPerKm) * 1000);
        }
      }
    }
  }

  return block;
}

/** Create a rest block injected between interval sets. */
function makeSynthesizedRestBlock(durationSeconds: number, restType: 'standing' | 'walk' | 'jog'): RunBlock {
  const typeMap: Record<string, RunBlockType> = {
    standing: 'recovery',
    walk: 'walk',
    jog: 'recovery',
  };
  const labelMap: Record<string, string> = {
    standing: 'מנוחה',
    walk: 'הליכה',
    jog: 'ריצת התאוששות',
  };

  return {
    id: nextBlockId(),
    type: typeMap[restType] ?? 'recovery',
    label: labelMap[restType] ?? 'מנוחה',
    durationSeconds,
    colorHex: REST_COLOR_HEX,
    isQualityExercise: false,
    blockMode: 'pace',
    _isSynthesizedRest: true,
  };
}

/**
 * Build a beginner workout with walk/run interval blocks.
 * When walkSeconds === 0 (runner graduated), produces a single continuous run block.
 */
function materializeBeginnerWorkout(
  template: RunWorkoutTemplate,
  weekNumber: number,
  walkRunRule: WalkRunRatioRule,
  rules: ProgressionRule[],
): RunWorkout {
  const { runSeconds, walkSeconds, repetitions } = computeWalkRunForWeek(walkRunRule, weekNumber);
  const blocks: RunBlock[] = [];

  const warmupTpl = template.blocks.find((b) => b.type === 'warmup');
  if (warmupTpl) {
    const progressed = applyProgressionToBlock(warmupTpl, weekNumber, rules);
    blocks.push({
      id: nextBlockId(),
      type: 'warmup',
      label: progressed.label,
      durationSeconds: progressed.baseValue,
      colorHex: progressed.colorHex,
      isQualityExercise: false,
      blockMode: 'effort',
      effortConfig: { effortLevel: 'moderate' },
    });
  }

  if (walkSeconds === 0) {
    blocks.push({
      id: nextBlockId(),
      type: 'run',
      label: 'ריצה רציפה',
      durationSeconds: runSeconds,
      colorHex: '#10B981',
      isQualityExercise: false,
      blockMode: 'effort',
      effortConfig: { effortLevel: 'moderate' },
    });
  } else {
    for (let i = 0; i < repetitions; i++) {
      blocks.push({
        id: nextBlockId(),
        type: 'run',
        label: `ריצה (${i + 1}/${repetitions})`,
        durationSeconds: runSeconds,
        colorHex: '#10B981',
        isQualityExercise: false,
        blockMode: 'effort',
        effortConfig: { effortLevel: 'moderate' },
      });

      if (i < repetitions - 1) {
        blocks.push({
          id: nextBlockId(),
          type: 'walk',
          label: `הליכה (${i + 1}/${repetitions - 1})`,
          durationSeconds: walkSeconds,
          colorHex: REST_COLOR_HEX,
          isQualityExercise: false,
          blockMode: 'effort',
          effortConfig: { effortLevel: 'moderate' },
          _isSynthesizedRest: true,
        });
      }
    }
  }

  const cooldownTpl = template.blocks.find((b) => b.type === 'cooldown');
  if (cooldownTpl) {
    const progressed = applyProgressionToBlock(cooldownTpl, weekNumber, rules);
    blocks.push({
      id: nextBlockId(),
      type: 'cooldown',
      label: progressed.label,
      durationSeconds: progressed.baseValue,
      colorHex: progressed.colorHex,
      isQualityExercise: false,
      blockMode: 'effort',
      effortConfig: { effortLevel: 'moderate' },
    });
  }

  return {
    id: `${template.id}_w${weekNumber}_beginner`,
    title: template.name,
    description: walkSeconds === 0
      ? `ריצה רציפה ${Math.round(runSeconds / 60)} דקות`
      : `${repetitions}× ריצה ${runSeconds}שׁ / הליכה ${walkSeconds}שׁ`,
    isQualityWorkout: false,
    blocks,
  };
}

// ══════════════════════════════════════════════════════════════════════
// 10. applyDeload
// ══════════════════════════════════════════════════════════════════════

/**
 * Apply deload rule: reduce volume on every Nth week.
 * Returns a new RunPlan (does not mutate the input).
 */
export function applyDeload(plan: RunPlan, rule: DeloadWeekRule): RunPlan {
  const volumeMultiplier = 1 - rule.volumeReductionPercent / 100;

  const adjustedWeeks = plan.weeks.map((week) => {
    const isDeloadWeek = week.weekNumber > 0 && week.weekNumber % rule.everyWeeks === 0;
    if (!isDeloadWeek) return week;

    const adjustedWorkouts = week.workouts.map((workout) => {
      if (rule.skipQualityWorkouts && workout.isQualityWorkout) {
        return {
          ...workout,
          isQualityWorkout: false,
          blocks: workout.blocks
            .filter((b) => !b.isQualityExercise)
            .map((b) => scaleBlockVolume(b, volumeMultiplier)),
        };
      }

      return {
        ...workout,
        blocks: workout.blocks.map((b) =>
          b._isSynthesizedRest ? b : scaleBlockVolume(b, volumeMultiplier),
        ),
      };
    });

    return { ...week, workouts: adjustedWorkouts };
  });

  return { ...plan, weeks: adjustedWeeks };
}

/**
 * Resolve the volume multiplier for a specific week within a phase.
 * - Single number → returned as-is for every week.
 * - Array → index 0 maps to phase.startWeek; out-of-bounds returns 1.0.
 */
function getWeekMultiplier(phase: ProgramPhase, weekNumber: number): number {
  const vm = phase.volumeMultiplier;
  if (typeof vm === 'number') return vm;
  if (!Array.isArray(vm) || vm.length === 0) return 1;
  const idx = weekNumber - phase.startWeek;
  if (idx < 0 || idx >= vm.length) return 1;
  return vm[idx];
}

/** Scale a single block's duration or distance by a multiplier. */
function scaleBlockVolume(block: RunBlock, multiplier: number): RunBlock {
  const scaled = { ...block };
  if (scaled.durationSeconds != null) {
    scaled.durationSeconds = Math.round(scaled.durationSeconds * multiplier);
  }
  if (scaled.distanceMeters != null) {
    scaled.distanceMeters = Math.round(scaled.distanceMeters * multiplier);
  }
  return scaled;
}

// ══════════════════════════════════════════════════════════════════════
// 11. applyTaper
// ══════════════════════════════════════════════════════════════════════

/**
 * Reduce volume in the final 1–2 weeks while keeping intensity and frequency.
 * Quality workout hard blocks keep their pace/duration if maintainIntensity is true;
 * only warmup/cooldown/easy blocks get scaled down.
 */
export function applyTaper(plan: RunPlan, rule: TaperRule): RunPlan {
  const totalWeeks = plan.weeks.length;
  const taperStartWeek = totalWeeks - rule.weeksBeforeEnd + 1;
  const volumeMultiplier = 1 - rule.volumeReductionPercent / 100;

  const adjustedWeeks = plan.weeks.map((week) => {
    if (week.weekNumber < taperStartWeek) return week;

    const adjustedWorkouts = week.workouts.map((workout) => ({
      ...workout,
      blocks: workout.blocks.map((b) => {
        if (b._isSynthesizedRest) return b;
        if (rule.maintainIntensity && b.isQualityExercise) return b;
        return scaleBlockVolume(b, volumeMultiplier);
      }),
    }));

    return { ...week, workouts: adjustedWorkouts };
  });

  return { ...plan, weeks: adjustedWeeks };
}

// ══════════════════════════════════════════════════════════════════════
// 12. enforceVolumeCaps
// ══════════════════════════════════════════════════════════════════════

/**
 * Enforce hard ceilings on volume (time and distance).
 * For weekly caps, scales easy_run workouts first before touching quality workouts.
 */
export function enforceVolumeCaps(plan: RunPlan, caps: VolumeCap[]): RunPlan {
  if (!caps.length) return plan;

  const setsPerBlockCap = caps.find((c) => c.target === 'sets_per_block')?.maxValue ?? Infinity;
  const singleRunCapMinutes = caps.find((c) => c.target === 'single_run')?.maxValue ?? Infinity;
  const singleRunDistCapM = caps.find((c) => c.target === 'single_run_distance')?.maxValue ?? Infinity;
  const totalSessionCapMinutes = caps.find((c) => c.target === 'total_session')?.maxValue ?? Infinity;
  const weeklyVolCapMinutes = caps.find((c) => c.target === 'weekly_volume')?.maxValue ?? Infinity;
  const weeklyDistCapMeters = caps.find((c) => c.target === 'weekly_distance')?.maxValue ?? Infinity;

  const adjustedWeeks = plan.weeks.map((week) => {
    let weekMinutes = 0;
    let weekMeters = 0;

    const adjustedWorkouts = week.workouts.map((workout) => {
      let sessionMinutes = 0;
      let sessionMeters = 0;

      const cappedBlocks = workout.blocks.map((b) => {
        let block = { ...b };

        // Per-block time cap
        if (block.durationSeconds != null && !block._isSynthesizedRest) {
          const blockMin = block.durationSeconds / 60;
          if (blockMin > singleRunCapMinutes) {
            block = { ...block, durationSeconds: Math.round(singleRunCapMinutes * 60) };
          }
        }

        // Per-block distance cap
        if (block.distanceMeters != null && !block._isSynthesizedRest) {
          if (block.distanceMeters > singleRunDistCapM) {
            block = { ...block, distanceMeters: Math.round(singleRunDistCapM) };
          }
        }

        sessionMinutes += blockDurationMinutes(block);
        sessionMeters += blockDistanceMeters(block);

        return block;
      });

      // Session time cap
      if (sessionMinutes > totalSessionCapMinutes) {
        const ratio = totalSessionCapMinutes / sessionMinutes;
        const scaled = cappedBlocks.map((b) =>
          b._isSynthesizedRest ? b : scaleBlockVolume(b, ratio),
        );
        weekMinutes += totalSessionCapMinutes;
        weekMeters += sessionMeters * ratio;
        return { ...workout, blocks: scaled };
      }

      weekMinutes += sessionMinutes;
      weekMeters += sessionMeters;
      return { ...workout, blocks: cappedBlocks };
    });

    // Weekly time cap — scale easy workouts first
    let finalWorkouts = adjustedWorkouts;
    if (weekMinutes > weeklyVolCapMinutes) {
      finalWorkouts = scaleWeekSmartly(finalWorkouts, weekMinutes, weeklyVolCapMinutes, 'time');
    }

    // Weekly distance cap — scale easy workouts first
    if (weekMeters > weeklyDistCapMeters) {
      finalWorkouts = scaleWeekSmartly(finalWorkouts, weekMeters, weeklyDistCapMeters, 'distance');
    }

    return { ...week, workouts: finalWorkouts };
  });

  return { ...plan, weeks: adjustedWeeks };
}

/**
 * Scale down a week's workouts to fit within a cap.
 * Reduces non-quality (easy) workout blocks first; only touches quality if still over.
 */
function scaleWeekSmartly(
  workouts: RunWorkout[],
  currentTotal: number,
  cap: number,
  mode: 'time' | 'distance',
): RunWorkout[] {
  const excess = currentTotal - cap;
  if (excess <= 0) return workouts;

  const measureBlock = (b: RunBlock) =>
    mode === 'time' ? blockDurationMinutes(b) : blockDistanceMeters(b);

  // Phase 1: scale easy workouts first
  let easyTotal = 0;
  for (const w of workouts) {
    if (w.isQualityWorkout) continue;
    for (const b of w.blocks) {
      if (!b._isSynthesizedRest) easyTotal += measureBlock(b);
    }
  }

  if (easyTotal > 0) {
    const reductionNeeded = Math.min(excess, easyTotal * 0.5);
    const easyRatio = 1 - reductionNeeded / easyTotal;
    const afterEasy = workouts.map((w) => {
      if (w.isQualityWorkout) return w;
      return {
        ...w,
        blocks: w.blocks.map((b) =>
          b._isSynthesizedRest ? b : scaleBlockVolume(b, Math.max(0.5, easyRatio)),
        ),
      };
    });

    // Recalculate
    let newTotal = 0;
    for (const w of afterEasy) {
      for (const b of w.blocks) newTotal += measureBlock(b);
    }

    if (newTotal <= cap) return afterEasy;

    // Phase 2: uniform scale on everything remaining
    const uniformRatio = cap / newTotal;
    return afterEasy.map((w) => ({
      ...w,
      blocks: w.blocks.map((b) =>
        b._isSynthesizedRest ? b : scaleBlockVolume(b, uniformRatio),
      ),
    }));
  }

  // No easy workouts — uniform scale
  const ratio = cap / currentTotal;
  return workouts.map((w) => ({
    ...w,
    blocks: w.blocks.map((b) =>
      b._isSynthesizedRest ? b : scaleBlockVolume(b, ratio),
    ),
  }));
}

// ══════════════════════════════════════════════════════════════════════
// 12b. enforceWeeklyProgressionCap (The 10% Rule)
// ══════════════════════════════════════════════════════════════════════

/**
 * Prevents week-over-week volume jumps larger than the allowed percentage.
 * Compares each week's total KM to the *actual* previous week total KM
 * (after any prior scaling), and uses scaleWeekSmartly to bring it down
 * to exactly the 110% limit (easy workouts scaled first).
 */
export function enforceWeeklyProgressionCap(
  plan: RunPlan,
  maxIncreasePercent: number = 10,
): RunPlan {
  if (plan.weeks.length < 2) return plan;

  const adjustedWeeks = [...plan.weeks];

  const weekDistanceMeters = (week: RunPlanWeek): number => {
    let total = 0;
    for (const wo of week.workouts) {
      for (const b of wo.blocks) total += blockDistanceMeters(b);
    }
    return total;
  };

  for (let i = 1; i < adjustedWeeks.length; i++) {
    const prevMeters = weekDistanceMeters(adjustedWeeks[i - 1]);
    const currMeters = weekDistanceMeters(adjustedWeeks[i]);
    const weekKm = Math.round((currMeters / 1000) * 10) / 10;
    console.log('[Progression Cap] Week ' + (i + 1) + ' KM: ' + weekKm);

    if (prevMeters <= 0 || currMeters <= 0) continue;

    const maxAllowedMeters = prevMeters * (1 + maxIncreasePercent / 100);
    if (currMeters > maxAllowedMeters) {
      const scaledWorkouts = scaleWeekSmartly(
        adjustedWeeks[i].workouts,
        currMeters,
        maxAllowedMeters,
        'distance',
      );
      adjustedWeeks[i] = { ...adjustedWeeks[i], workouts: scaledWorkouts };
      const newKm = Math.round((weekDistanceMeters(adjustedWeeks[i]) / 1000) * 10) / 10;
      console.log('[Progression Cap] Week ' + (i + 1) + ' CAPPED: ' + weekKm + ' → ' + newKm + ' (max allowed: ' + Math.round((maxAllowedMeters / 1000) * 10) / 10 + ')');
    }
  }

  return { ...plan, weeks: adjustedWeeks };
}

// ══════════════════════════════════════════════════════════════════════
// 13. validateIntensityDistribution (80/20 Rule)
// ══════════════════════════════════════════════════════════════════════

/**
 * Classification rule (priority order):
 *   1. _isSynthesizedRest === true → easy
 *   2. isQualityExercise === true  → hard (fast reps only)
 *   3. everything else             → easy
 */
export function validateIntensityDistribution(
  plan: RunPlan,
  config: IntensityDistributionConfig = { targetHardPercent: 20, tolerancePercent: 10 },
  exemptWeeks: Set<number> = new Set(),
): { valid: boolean; weeks: WeekIntensityBreakdown[] } {
  const weeks: WeekIntensityBreakdown[] = plan.weeks.map((week) => {
    let easyMinutes = 0;
    let hardMinutes = 0;
    let totalMeters = 0;

    for (const workout of week.workouts) {
      for (const block of workout.blocks) {
        const blockMinutes = blockDurationMinutes(block);
        totalMeters += blockDistanceMeters(block);

        if (block._isSynthesizedRest) {
          easyMinutes += blockMinutes;
        } else if (block.isQualityExercise) {
          hardMinutes += blockMinutes;
        } else {
          easyMinutes += blockMinutes;
        }
      }
    }

    const totalMinutes = easyMinutes + hardMinutes;
    const hardPercent = totalMinutes > 0 ? (hardMinutes / totalMinutes) * 100 : 0;
    const lowerBound = config.targetHardPercent - config.tolerancePercent;
    const upperBound = config.targetHardPercent + config.tolerancePercent;
    const isExempt = exemptWeeks.has(week.weekNumber);

    return {
      weekNumber: week.weekNumber,
      totalMinutes: Math.round(totalMinutes * 10) / 10,
      easyMinutes: Math.round(easyMinutes * 10) / 10,
      hardMinutes: Math.round(hardMinutes * 10) / 10,
      hardPercent: Math.round(hardPercent * 10) / 10,
      totalKm: Math.round((totalMeters / 1000) * 10) / 10,
      isValid: isExempt || (hardPercent >= lowerBound && hardPercent <= upperBound),
    };
  });

  return {
    valid: weeks.every((w) => w.isValid),
    weeks,
  };
}

/** Estimate block duration in minutes from either durationSeconds or distanceMeters. */
function blockDurationMinutes(block: RunBlock): number {
  if (block.durationSeconds != null && block.durationSeconds > 0) {
    return block.durationSeconds / 60;
  }
  if (block.distanceMeters != null && block.distanceMeters > 0) {
    return (block.distanceMeters / 1000) * 6;
  }
  return 0;
}

// ══════════════════════════════════════════════════════════════════════
// 14. selectWorkoutFromPool
// ══════════════════════════════════════════════════════════════════════

/** Phase-default pool mappings (quality rotation only). */
export const PHASE_DEFAULT_POOLS: Record<ProgramPhase['name'], WorkoutCategory[]> = {
  base:  ['fartlek_structured', 'fartlek_easy', 'hill_long', 'strides', 'easy_run', 'long_run'],
  build: ['fartlek_structured', 'tempo', 'hill_short', 'long_intervals', 'short_intervals'],
  peak:  ['fartlek_structured', 'short_intervals', 'long_intervals', 'tempo'],
  taper: ['short_intervals', 'strides'],
};

/** Category families for diversity scoring — picking from different families within a week. */
const CATEGORY_FAMILY: Record<string, string> = {
  short_intervals: 'interval',
  long_intervals: 'interval',
  fartlek_easy: 'fartlek',
  fartlek_structured: 'fartlek',
  tempo: 'tempo',
  hill_long: 'hill',
  hill_short: 'hill',
  hill_sprints: 'hill',
  strides: 'strides',
};

/** Slot types whose templates are selected purely by allowedCategories — not gated by qualityPool. */
const NON_QUALITY_SLOT_TYPES = new Set(['long_run', 'easy_run', 'recovery']);

/** Keywords that indicate a beginner/walking workout — always excluded for Profiles 1 & 2. */
const BEGINNER_NAME_KEYWORDS = ['הליכה', 'הליכ', 'מתחילים', 'walk', 'beginner', 'walking'];

/** Max long_run distance (km) per program targetDistance — absolute ceiling. */
const LONG_RUN_MAX_KM: Record<string, number> = {
  '2k': 5,
  '3k': 5,
  '5k': 12,
  '10k': 15,
  'maintenance': Infinity,
};

/**
 * Phase-based scaling of the long_run distance cap.
 * Multiplied by LONG_RUN_MAX_KM to get the effective cap for each phase.
 * Base → conservative start, Build → ramp up, Peak → full cap, Taper → reduced.
 */
const PHASE_LONG_RUN_SCALE: Record<string, number> = {
  base:  0.75,  // 10k → 11.25km, 5k → 9km
  build: 0.90,  // 10k → 13.5km,  5k → 10.8km
  peak:  1.00,  // 10k → 15km,    5k → 12km
  taper: 0.65,  // 10k → 9.75km,  5k → 7.8km
};

/** Numeric race distance for scoring proportionality. */
const DISTANCE_KM: Record<string, number> = {
  '2k': 2,
  '3k': 3,
  '5k': 5,
  '10k': 10,
  'maintenance': 10,
};

/** Max easy_run distance (km) per targetDistance — prevents oversized easy runs. */
const EASY_RUN_MAX_KM: Record<string, number> = {
  '2k': 6,
  '3k': 8,
  '5k': 12,
  '10k': 15,
  'maintenance': Infinity,
};

/** Max total weekly distance (meters) per program targetDistance. */
const WEEKLY_DISTANCE_CAP_METERS: Record<string, number> = {
  '2k': 20_000,
  '3k': 25_000,
  '5k': 40_000,
  '10k': 50_000,
  'maintenance': Infinity,
};

/** Tag applied by the Beginner Firewall tagging script. */
const BEGINNER_ONLY_TAG = 'beginner_only';

/**
 * Pick a workout template for a slot within a phase.
 *
 * Filtering pipeline (applied in order):
 *   1. Category match: template.category ∈ slot.allowedCategories
 *      (quality slots additionally require category ∈ qualityPool)
 *   2. Beginner Firewall: for Profile 1/2 programs, any template tagged
 *      'beginner_only' or whose name contains walking/beginner keywords
 *      is unconditionally rejected.
 *   3. Profile match (strict): template.targetProfileTypes must overlap
 *      with programProfileTypes. NO fallback.
 *   4. Template diversity: exclude IDs already used (usedTemplateIds).
 *      If this empties the pool, allow re-use.
 *   5. Anti-repeat: exclude categories from recentCategoryHistory.
 *   6. Rank by priority ascending, then deterministic shuffle within same
 *      priority tier to avoid always picking the same template.
 */
/** Long run distance increment per week (km) by target distance. */
const LONG_RUN_INCREMENT_KM: Record<string, number> = {
  '2k': 0.5,
  '3k': 0.5,
  '5k': 1.0,
  '10k': 1.5,
  'maintenance': 1.0,
};

export function selectWorkoutFromPool(
  slot: WeekSlot,
  phase: ProgramPhase,
  allTemplates: RunWorkoutTemplate[],
  recentCategoryHistory: WorkoutCategory[],
  programProfileTypes: RunnerProfileType[] = [],
  usedTemplateIds: Set<string> = new Set(),
  targetDistance?: '2k' | '3k' | '5k' | '10k' | 'maintenance',
  weekCategoriesSoFar: WorkoutCategory[] = [],
  weekNumber: number = 1,
  prevLongRunDistanceKm: number = 0,
  isDeloadWeek: boolean = false,
  prevHillWorkUnits: number = 0,
  maxIntensityRank: number = Infinity,
  excludeCategories: WorkoutCategory[] = [],
): RunWorkoutTemplate | null {
  const isStructuralSlot = NON_QUALITY_SLOT_TYPES.has(slot.slotType);
  const isAdvancedProgram = programProfileTypes.length > 0
    && programProfileTypes.every((p) => p === 1 || p === 2);

  // Step 1: Category filter
  let candidates: RunWorkoutTemplate[];

  if (isStructuralSlot) {
    candidates = allTemplates.filter((t) => {
      if (!t.category) return false;
      return slot.allowedCategories.includes(t.category);
    });
  } else {
    const poolCategories = phase.qualityPool.length > 0
      ? phase.qualityPool
      : PHASE_DEFAULT_POOLS[phase.name] ?? [];

    candidates = allTemplates.filter((t) => {
      if (!t.category) return false;
      if (!slot.allowedCategories.includes(t.category)) return false;
      if (!poolCategories.includes(t.category)) return false;
      return true;
    });
  }

  const devLog = process.env.NODE_ENV === 'development';
  if (devLog) {
    console.log(
      `🧪 [Matchmaker] slot=${slot.slotType} phase=${phase.name} w${weekNumber} | ` +
      `allowedCats=[${slot.allowedCategories}] profiles=[${programProfileTypes}] maxRank=${maxIntensityRank} | ` +
      `Step 1 category: ${candidates.length}/${allTemplates.length} templates`,
    );
  }

  // Step 2: Beginner Firewall — for advanced programs, reject templates
  // that are tagged 'beginner_only', contain walking/beginner keywords,
  // or have walking blocks. This is unconditional — even if it leaves 0
  // candidates (better to skip the slot than inject a walking workout
  // into a 10K race plan).
  // Exception: hill_sprints templates are allowed to have walk blocks
  // because walking downhill is standard recovery, not a beginner trait.
  if (isAdvancedProgram) {
    candidates = candidates.filter((t) => {
      if (Array.isArray(t.tags) && t.tags.includes(BEGINNER_ONLY_TAG)) return false;
      const name = t.name?.toLowerCase() ?? '';
      if (BEGINNER_NAME_KEYWORDS.some((kw) => name.includes(kw))) return false;
      const isHillSprints = t.category === 'hill_sprints';
      if (!isHillSprints && templateHasWalkingBlocks(t)) return false;
      return true;
    });
  }

  if (devLog && isAdvancedProgram) {
    console.log(`[Candidate Search] slot=${slot.slotType} | Step 2 firewall: ${candidates.length} after beginner filter`);
  }

  // Step 2b: Progressive distance cap — for long_run slots, the cap
  // scales with the training phase (Base < Build < Peak).
  if (slot.slotType === 'long_run' && targetDistance) {
    const absoluteMax = LONG_RUN_MAX_KM[targetDistance] ?? Infinity;
    const phaseScale = PHASE_LONG_RUN_SCALE[phase.name] ?? 1;
    const effectiveMaxKm = absoluteMax * phaseScale;
    if (effectiveMaxKm < Infinity) {
      candidates = candidates.filter((t) => estimateTemplateDistanceKm(t) <= effectiveMaxKm);
    }
  }

  // Step 2d: Taper intensity ceiling — hard block any template above Rank 2.0.
  if (phase.name === 'taper') {
    candidates = candidates.filter((t) => (t.intensityRank ?? 1) <= 2.0);
    if (devLog) {
      console.log(`[Candidate Search] slot=${slot.slotType} | Step 2d taper ceiling: ${candidates.length} after rank<=2.0 filter`);
    }
  }

  // Step 2e: Global intensity rank ceiling (experience-based safety).
  if (maxIntensityRank < Infinity) {
    candidates = candidates.filter((t) => (t.intensityRank ?? 1) <= maxIntensityRank);
  }

  // Step 2f: Excluded categories (injury-based safety — no hills for injured runners).
  if (excludeCategories.length > 0) {
    const excluded = new Set(excludeCategories);
    candidates = candidates.filter((t) => !t.category || !excluded.has(t.category));
    if (devLog) {
      console.log(`[Candidate Search] slot=${slot.slotType} | Step 2f excludeCategories: ${candidates.length} after excluding [${excludeCategories}]`);
    }
  }

  // Step 2c: Easy run distance cap — prevents oversized easy runs for short distances.
  if (slot.slotType === 'easy_run' && targetDistance) {
    const easyMaxKm = EASY_RUN_MAX_KM[targetDistance] ?? Infinity;
    if (easyMaxKm < Infinity) {
      candidates = candidates.filter((t) => estimateTemplateDistanceKm(t) <= easyMaxKm);
    }
  }

  // Step 3: Profile match (strict — no fallback to mismatched profiles)
  if (programProfileTypes.length > 0) {
    const beforeProfile = candidates.length;
    candidates = candidates.filter((t) => {
      if (!t.targetProfileTypes || t.targetProfileTypes.length === 0) return true;
      return t.targetProfileTypes.some((p) => programProfileTypes.includes(p));
    });
    if (devLog) {
      console.log(`[Candidate Search] slot=${slot.slotType} | Step 3 profile [${programProfileTypes}]: ${candidates.length}/${beforeProfile}`);
    }
  }

  const log = devLog;
  if (log && candidates.length === 0) {
    const catMatches = allTemplates.filter((t) => t.category && slot.allowedCategories.includes(t.category));
    const profileMatches = catMatches.filter((t) => {
      if (!t.targetProfileTypes || t.targetProfileTypes.length === 0) return true;
      return t.targetProfileTypes.some((p) => programProfileTypes.includes(p));
    });
    console.log(
      `🚨 [Matchmaker] slot=${slot.slotType} phase=${phase.name} | EMPTY AFTER ALL FILTERS | ` +
      `category matches: ${catMatches.length}, after profile filter: ${profileMatches.length} | ` +
      `DB profiles for this category: [${catMatches.map((t) => JSON.stringify(t.targetProfileTypes)).join(', ')}]`,
    );
  }

  if (candidates.length === 0) return null;

  // Step 4: Template diversity — prefer templates not yet used in this plan.
  // If ALL candidates were already used, allow re-use.
  let diverse = candidates.filter((t) => !usedTemplateIds.has(t.id));
  if (log) {
    const reused = diverse.length === 0;
    console.log(`[Candidate Search] slot=${slot.slotType} | Step 4 diversity: ${diverse.length}/${candidates.length} new${reused ? ' → allowing re-use' : ''}`);
  }
  if (diverse.length === 0) diverse = candidates;

  // Step 5: Anti-repeat (category level)
  const afterAntiRepeat = diverse.filter(
    (t) => !recentCategoryHistory.includes(t.category!),
  );
  const pool = afterAntiRepeat.length > 0 ? afterAntiRepeat : diverse;
  if (log) {
    console.log(`[Candidate Search] slot=${slot.slotType} | Step 5 anti-repeat: ${afterAntiRepeat.length}/${diverse.length} (recent: [${recentCategoryHistory.slice(-3).join(',')}])`);
  }

  // Step 6: Multi-factor scoring
  //   a) Base priority (lower = better)
  //   b) Week diversity: different family than what's already in this week → bonus
  //   c) Fartlek boost: in Build/Peak, if recent history has intervals, fartlek gets a big bonus
  //   d) Intensity progression: prefer intensityRank matching the phase progress
  //   e) Long Run Distance-Step Rule: massive bonus for template closest to prev + increment

  const weekFamilies = new Set(
    weekCategoriesSoFar.map((c) => CATEGORY_FAMILY[c]).filter(Boolean),
  );

  const recentHasInterval = recentCategoryHistory.some(
    (c) => CATEGORY_FAMILY[c] === 'interval',
  );
  const isBuildOrPeak = phase.name === 'build' || phase.name === 'peak';

  const phaseDuration = phase.endWeek - phase.startWeek + 1;
  const phaseProgress = phaseDuration > 1
    ? (weekNumber - phase.startWeek) / (phaseDuration - 1)
    : 0.5;

  const isLongRunSlot = slot.slotType === 'long_run';
  const longRunIncrement = LONG_RUN_INCREMENT_KM[targetDistance ?? '5k'] ?? 1.0;
  const targetLongRunKm = isLongRunSlot && prevLongRunDistanceKm > 0
    ? (isDeloadWeek
        ? prevLongRunDistanceKm * 0.7
        : prevLongRunDistanceKm + longRunIncrement)
    : 0;

  const scoreTemplate = (t: RunWorkoutTemplate): number => {
    let score = t.priority ?? 5;

    // (b) Week-level family diversity: bonus for different family, penalty for same.
    const fam = CATEGORY_FAMILY[t.category ?? ''];
    if (fam && !weekFamilies.has(fam)) score -= 1;
    if (fam && weekFamilies.has(fam)) score += 3;

    // (c) Fartlek boost in Build/Peak when recent week had intervals
    if (isBuildOrPeak && recentHasInterval && fam === 'fartlek') {
      score -= 1;
    }

    // (d) Intensity rank progression: heavy penalty for rank mismatch.
    if (t.intensityRank != null && !isLongRunSlot) {
      if (weekNumber === phase.startWeek && t.intensityRank > 1) {
        score += 10;
      } else {
        const maxRank = pool.reduce((mx, p) => Math.max(mx, p.intensityRank ?? 1), 1);
        const idealRank = 1 + phaseProgress * (maxRank - 1);
        const rankDiff = Math.abs(t.intensityRank - idealRank);
        score += rankDiff * 2.0;
      }
    }

    // (e) Long Run Distance-Step Rule: pick the template whose distance
    // is closest to the target (prevDistance + increment). This dominates
    // all other scoring factors for long_run slots.
    if (isLongRunSlot && targetLongRunKm > 0) {
      const tplKm = estimateTemplateDistanceKm(t);
      const distDiff = Math.abs(tplKm - targetLongRunKm);
      score += distDiff * 5.0;
    }

    // (f) Distance-proportionality penalty: penalize quality templates
    // whose total volume is disproportionately long for the target race.
    // E.g. a 15-min fartlek is too long for a 2K/3K plan.
    if (!isLongRunSlot && slot.slotType !== 'easy_run' && targetDistance) {
      const targetKm = DISTANCE_KM[targetDistance] ?? 5;
      const tplKm = estimateTemplateDistanceKm(t);
      if (tplKm > targetKm * 2) {
        score += (tplKm - targetKm * 2) * 2.0;
      }
    }

    // (h) Taper intensity penalty: strongly penalize high-intensity templates during taper.
    if (phase.name === 'taper' && (t.intensityRank ?? 1) > 2) {
      score += 20;
    }

    // (g) Hill rep-volume progression: penalize hill templates whose
    // work units exceed 120% of the previous week's hill workout.
    if (prevHillWorkUnits > 0 && t.category && HILL_CATEGORIES.has(t.category)) {
      const tplUnits = estimateHillWorkUnits(t);
      const maxAllowed = prevHillWorkUnits * 1.2;
      if (tplUnits > maxAllowed) {
        const overshootRatio = (tplUnits - maxAllowed) / prevHillWorkUnits;
        score += overshootRatio * 4.0;
      }
    }

    return score;
  };

  pool.sort((a, b) => {
    const sa = scoreTemplate(a);
    const sb = scoreTemplate(b);
    if (sa !== sb) return sa - sb;
    return hashStr(a.id) - hashStr(b.id);
  });

  if (process.env.NODE_ENV === 'development') {
    const top = pool[0];
    const familiesStr = [...weekFamilies].join(',') || 'none';
    const topScore = top ? scoreTemplate(top).toFixed(1) : '?';
    const longRunInfo = isLongRunSlot && targetLongRunKm > 0
      ? ` targetLR=${targetLongRunKm.toFixed(1)}km prev=${prevLongRunDistanceKm.toFixed(1)}km`
      : '';
    console.log(
      `[Pool] slot=${slot.slotType} phase=${phase.name} w${weekNumber} | pool=${pool.length} | weekFam=[${familiesStr}] recentInterval=${recentHasInterval} progress=${phaseProgress.toFixed(2)}${longRunInfo} | picked="${top?.name}" (${top?.category}) score=${topScore}`,
    );
  }

  return pool[0] ?? null;
}

/** Rough pace used for time→distance estimation (6 min/km). */
const ROUGH_PACE_MIN_PER_KM = 6;

/**
 * Estimate total "hill work units" for a template (meters-equivalent of quality effort).
 * Time blocks are converted at ~100m per 15s (rough sprint-on-hill pace).
 * Only counts quality (isQualityExercise) blocks.
 */
function estimateHillWorkUnits(t: RunWorkoutTemplate): number {
  let meters = 0;
  for (const b of t.blocks) {
    if (!b.isQualityExercise) continue;
    if (b.measureBy === 'distance') {
      meters += b.baseValue * b.sets;
    } else if (b.measureBy === 'time') {
      meters += (b.baseValue / 15) * 100 * b.sets;
    }
  }
  return meters;
}

const HILL_CATEGORIES: Set<string> = new Set(['hill_sprints', 'hill_short']);

/** Estimate total distance of a template in km. Handles both distance- and time-based blocks. */
function estimateTemplateDistanceKm(t: RunWorkoutTemplate): number {
  let meters = 0;
  for (const b of t.blocks) {
    if (b.measureBy === 'distance') {
      meters += b.baseValue * b.sets;
    } else if (b.measureBy === 'time') {
      const minutes = (b.baseValue * b.sets) / 60;
      meters += (minutes / ROUGH_PACE_MIN_PER_KM) * 1000;
    }
  }
  return meters / 1000;
}

/** Estimate distance of a single RunBlock in meters. */
function blockDistanceMeters(block: RunBlock): number {
  if (block.distanceMeters != null && block.distanceMeters > 0) {
    return block.distanceMeters;
  }
  if (block.durationSeconds != null && block.durationSeconds > 0) {
    const minutes = block.durationSeconds / 60;
    return (minutes / ROUGH_PACE_MIN_PER_KM) * 1000;
  }
  return 0;
}

/** Check if a template contains walking blocks (label, type, or rest style). */
function templateHasWalkingBlocks(t: RunWorkoutTemplate): boolean {
  return t.blocks.some((b) => {
    if (b.type === 'walk') return true;
    if (b.restType === 'walk') return true;
    const label = (b.label ?? '').toLowerCase();
    return label.includes('הליכ') || label.includes('walk');
  });
}

/** Simple deterministic hash for stable-but-varied ordering within a priority tier. */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

// ══════════════════════════════════════════════════════════════════════
// 14b. Race Day & Predicted Race Pace
// ══════════════════════════════════════════════════════════════════════

const TARGET_DISTANCE_METERS: Record<string, number> = {
  '3k': 3000,
  '5k': 5000,
  '10k': 10_000,
};

/** Seconds per KM faster than easy pace, per target distance. */
const RACE_PACE_OFFSET: Record<string, number> = {
  '3k': 25,
  '5k': 20,
  '10k': 15,
};

/**
 * Compute predicted race pace in seconds/km.
 * Uses the user's basePace (which represents their easy-run pace per km)
 * and subtracts a distance-dependent offset to approximate race effort.
 * For tempo-level athletes the race pace is close to their tempo zone.
 */
export function computePredictedRacePace(
  basePace: number,
  targetDistance: '3k' | '5k' | '10k' | 'maintenance',
): number {
  const offset = RACE_PACE_OFFSET[targetDistance] ?? 15;
  return Math.max(basePace - offset, Math.round(basePace * 0.8));
}

/**
 * Build a synthetic Race Day workout for the final week.
 * Single block: run the full target distance at predicted race pace.
 */
function buildRaceDayWorkout(
  targetDistance: '3k' | '5k' | '10k' | 'maintenance',
  userProfile: PaceProfile,
  config: PaceMapConfig,
  weekNumber: number,
): RunWorkout | null {
  const distMeters = TARGET_DISTANCE_METERS[targetDistance];
  if (!distMeters) return null;

  const racePace = computePredictedRacePace(userProfile.basePace, targetDistance);
  const racePaceLabel = `${Math.floor(racePace / 60)}:${String(racePace % 60).padStart(2, '0')} /ק״מ`;

  const raceBlock: RunBlock = {
    id: `race_main_w${weekNumber}`,
    type: 'run',
    label: `קצב תחרות חזוי — ${racePaceLabel}`,
    distanceMeters: distMeters,
    zoneType: 'tempo',
    isQualityExercise: true,
    colorHex: '#F59E0B',
    blockMode: 'pace',
    targetPacePercentage: { min: racePace, max: racePace + 5 },
  };

  const warmupBlock: RunBlock = {
    id: `race_warmup_w${weekNumber}`,
    type: 'warmup',
    label: 'חימום לפני תחרות',
    durationSeconds: 600,
    isQualityExercise: false,
    colorHex: '#86EFAC',
    blockMode: 'pace',
    _isDynamicWrapper: true,
  };

  const cooldownBlock: RunBlock = {
    id: `race_cooldown_w${weekNumber}`,
    type: 'cooldown',
    label: 'שחרור אחרי תחרות',
    durationSeconds: 300,
    isQualityExercise: false,
    colorHex: '#93C5FD',
    blockMode: 'pace',
    _isDynamicWrapper: true,
  };

  const distLabel = targetDistance === '3k' ? '3 ק״מ' : targetDistance === '5k' ? '5 ק״מ' : '10 ק״מ';

  return {
    id: `race_day_w${weekNumber}`,
    title: `יום תחרות — ${distLabel}`,
    description: `ריצת ${distLabel} בקצב תחרות חזוי: ${racePaceLabel}`,
    isQualityWorkout: true,
    blocks: [warmupBlock, raceBlock, cooldownBlock],
  };
}

// ══════════════════════════════════════════════════════════════════════
// 15. generatePlan — the orchestrator
// ══════════════════════════════════════════════════════════════════════

export interface GeneratePlanResult {
  plan: RunPlan;
  warnings: string[];
  intensityBreakdown: WeekIntensityBreakdown[];
}

/**
 * End-to-end plan generation pipeline:
 *   1. Resolve phases (or fall back to flat weekTemplates)
 *   2. For each week: determine active phase → select workouts from pool
 *   3. materializeWorkout() for each selected template
 *   4. applyDeload()
 *   5. applyTaper()
 *   6. enforceVolumeCaps()
 *   7. 80/20 Safety Valve: swap quality → easy if hard% > 30%
 *   8. validateIntensityDistribution() → append warnings
 */
export function generatePlan(
  template: RunProgramTemplate,
  userProfile: PaceProfile,
  config: PaceMapConfig,
  allWorkoutTemplates: RunWorkoutTemplate[],
): GeneratePlanResult {
  const warnings: string[] = [];
  const weeks: RunPlanWeek[] = [];
  const recentCategories: WorkoutCategory[] = [];
  const usedTemplateIds = new Set<string>();
  let lastHeavyLongRunKm = 0;
  let lastHillWorkUnits = 0;

  const hasPhases = template.phases && template.phases.length > 0;

  for (let w = 1; w <= template.canonicalWeeks; w++) {
    const weekWorkouts: RunWorkout[] = [];

    if (hasPhases) {
      const phase = template.phases!.find((p) => w >= p.startWeek && w <= p.endWeek);
      if (!phase) {
        warnings.push(`שבוע ${w}: לא נמצאה פאזה מתאימה`);
        weeks.push({ weekNumber: w, workouts: [] });
        continue;
      }

      const activeSlots = resolveActiveSlots(phase.weekSlots, template.canonicalFrequency);
      const phaseRules = phase.progressionRules;
      let weekHasLongRun = false;
      const weekCategoriesSoFar: WorkoutCategory[] = [];

      const weekMul = getWeekMultiplier(phase, w);
      const weekIsDeload = weekMul < 1.0;

      for (const slot of activeSlots) {
        if (slot.slotType === 'long_run' && weekHasLongRun) {
          warnings.push(`שבוע ${w}: סלוט '${slot.slotType}' נדלג — כבר קיימת ריצה ארוכה השבוע`);
          continue;
        }

        const selected = selectWorkoutFromPool(
          slot, phase, allWorkoutTemplates, recentCategories,
          template.targetProfileTypes, usedTemplateIds, template.targetDistance,
          weekCategoriesSoFar, w,
          lastHeavyLongRunKm, weekIsDeload,
          lastHillWorkUnits,
          template.maxIntensityRank ?? Infinity,
          template.excludeCategories ?? [],
        );
        if (!selected) {
          warnings.push(`שבוע ${w}, סלוט '${slot.slotType}': לא נמצאה תבנית אימון מתאימה`);
          continue;
        }

        if (selected.category === 'long_run') {
          weekHasLongRun = true;
          const selectedKm = estimateTemplateDistanceKm(selected);
          if (!weekIsDeload) {
            lastHeavyLongRunKm = selectedKm;
          }
        }

        if (selected.category && HILL_CATEGORIES.has(selected.category)) {
          lastHillWorkUnits = estimateHillWorkUnits(selected);
        }

        usedTemplateIds.add(selected.id);

        if (selected.category) {
          weekCategoriesSoFar.push(selected.category);
          recentCategories.push(selected.category);
          const maxMemory = Math.max(10, template.canonicalFrequency * 3);
          if (recentCategories.length > maxMemory) {
            recentCategories.shift();
          }
        }

        const combinedRules = [...(template.progressionRules ?? []), ...phaseRules];
        const workout = materializeWorkout(selected, w, combinedRules, userProfile, config);
        weekWorkouts.push(workout);
      }

      if (weekMul !== 1) {
        for (const wo of weekWorkouts) {
          wo.blocks = wo.blocks.map((b) =>
            b._isSynthesizedRest ? b : scaleBlockVolume(b, weekMul),
          );
        }
      }
    } else {
      const weekTpl = template.weekTemplates.find((wt) => wt.weekNumber === w);
      if (!weekTpl) {
        weeks.push({ weekNumber: w, workouts: [] });
        continue;
      }

      for (const workoutId of weekTpl.workoutIds) {
        const workoutTpl = allWorkoutTemplates.find((t) => t.id === workoutId);
        if (!workoutTpl) {
          warnings.push(`שבוע ${w}: תבנית אימון '${workoutId}' לא נמצאה`);
          continue;
        }

        const workout = materializeWorkout(
          workoutTpl, w, template.progressionRules, userProfile, config,
        );
        weekWorkouts.push(workout);
      }
    }

    weeks.push({ weekNumber: w, workouts: weekWorkouts });
  }

  let plan: RunPlan = {
    id: `plan_${template.id}_${Date.now()}`,
    name: template.name,
    targetDistance: template.targetDistance,
    durationWeeks: template.canonicalWeeks,
    weeks,
  };

  // Apply deload
  const deloadRule = findRule<DeloadWeekRule>(template, 'deload_week');
  if (deloadRule) {
    plan = applyDeload(plan, deloadRule);
  }

  // Apply taper
  const taperRule = findRule<TaperRule>(template, 'taper');
  if (taperRule) {
    plan = applyTaper(plan, taperRule);
  }

  // Enforce volume caps (merge explicit caps with automatic distance caps)
  const autoCaps: VolumeCap[] = [];
  const maxRunMeters = (LONG_RUN_MAX_KM[template.targetDistance] ?? Infinity) * 1000;
  const weeklyDistCap = WEEKLY_DISTANCE_CAP_METERS[template.targetDistance] ?? Infinity;
  if (maxRunMeters < Infinity) {
    autoCaps.push({ type: 'cap', target: 'single_run_distance', maxValue: maxRunMeters, maxWeeklyIncreasePercent: 10 });
  }
  if (weeklyDistCap < Infinity) {
    autoCaps.push({ type: 'cap', target: 'weekly_distance', maxValue: weeklyDistCap, maxWeeklyIncreasePercent: 10 });
  }
  const allCaps = [...(template.volumeCaps ?? []), ...autoCaps];
  if (allCaps.length > 0) {
    plan = enforceVolumeCaps(plan, allCaps);
  }

  // 80/20 Safety Valve — swap the heaviest quality workout for an easy run
  // if any week exceeds 30% hard minutes
  const HARD_PERCENT_CEILING = 30;
  plan = applyIntensitySafetyValve(
    plan, HARD_PERCENT_CEILING, allWorkoutTemplates,
    template.targetProfileTypes, userProfile, config, warnings,
  );

  // Enforce the 10% week-over-week progression cap (runs last so it sees
  // the final volume after caps + safety valve adjustments)
  const weeklyIncreasePct = allCaps
    .filter((c) => c.target === 'weekly_distance' || c.target === 'weekly_volume')
    .map((c) => c.maxWeeklyIncreasePercent)
    .find((v) => v != null) ?? 10;
  plan = enforceWeeklyProgressionCap(plan, weeklyIncreasePct);

  // Inject Race Day workout as the very last step — overrides whatever
  // is in the last slot of the last week so no subsequent pass can remove it.
  if (template.targetDistance !== 'maintenance') {
    const lastWeek = plan.weeks[plan.weeks.length - 1];
    if (lastWeek) {
      const raceDay = buildRaceDayWorkout(
        template.targetDistance, userProfile, config, lastWeek.weekNumber,
      );
      if (raceDay) {
        const updatedWorkouts = [...lastWeek.workouts];
        if (updatedWorkouts.length > 0) {
          updatedWorkouts[updatedWorkouts.length - 1] = raceDay;
        } else {
          updatedWorkouts.push(raceDay);
        }
        plan = {
          ...plan,
          weeks: plan.weeks.map((w) =>
            w.weekNumber === lastWeek.weekNumber
              ? { ...w, workouts: updatedWorkouts }
              : w,
          ),
        };
        warnings.push(`שבוע ${lastWeek.weekNumber}: יום תחרות הוזרק כאימון אחרון`);
      }
    }
  }

  // Build set of weeks exempt from 80/20 validation (taper + final race week)
  const exemptWeeks = new Set<number>();
  if (hasPhases) {
    for (const p of template.phases!) {
      if (p.name === 'taper') {
        for (let wk = p.startWeek; wk <= p.endWeek; wk++) exemptWeeks.add(wk);
      }
    }
  }
  exemptWeeks.add(template.canonicalWeeks);

  const validation = validateIntensityDistribution(plan, undefined, exemptWeeks);
  if (!validation.valid) {
    const violatingWeeks = validation.weeks
      .filter((w) => !w.isValid)
      .map((w) => `שבוע ${w.weekNumber} (${w.hardPercent}% קשה)`)
      .join(', ');
    warnings.push(`חריגה מיחס 80/20: ${violatingWeeks}`);
  }

  return { plan, warnings, intensityBreakdown: validation.weeks };
}

/**
 * 80/20 Safety Valve: for each week where hard% exceeds the ceiling,
 * find the quality workout contributing the most hard minutes and
 * replace it with an easy_run template (if one exists in the DB).
 * Only performs ONE swap per week to avoid over-correcting.
 */
function applyIntensitySafetyValve(
  plan: RunPlan,
  hardPercentCeiling: number,
  allTemplates: RunWorkoutTemplate[],
  profileTypes: RunnerProfileType[],
  userProfile: PaceProfile,
  config: PaceMapConfig,
  warnings: string[],
): RunPlan {
  const isAdvanced = profileTypes.length > 0 && profileTypes.every((p) => p === 1 || p === 2);

  const easyTemplate = allTemplates.find((t) => {
    if (t.category !== 'easy_run') return false;
    if (isAdvanced) {
      if (Array.isArray(t.tags) && t.tags.includes(BEGINNER_ONLY_TAG)) return false;
      const name = t.name?.toLowerCase() ?? '';
      if (BEGINNER_NAME_KEYWORDS.some((kw) => name.includes(kw))) return false;
      if (templateHasWalkingBlocks(t)) return false;
    }
    if (profileTypes.length > 0 && t.targetProfileTypes?.length) {
      if (!t.targetProfileTypes.some((p) => profileTypes.includes(p))) return false;
    }
    return true;
  });

  if (!easyTemplate) return plan;

  return {
    ...plan,
    weeks: plan.weeks.map((week) => {
      let easyMin = 0;
      let hardMin = 0;
      for (const wo of week.workouts) {
        for (const b of wo.blocks) {
          const mins = blockDurationMinutes(b);
          if (b._isSynthesizedRest || !b.isQualityExercise) easyMin += mins;
          else hardMin += mins;
        }
      }
      const total = easyMin + hardMin;
      if (total === 0) return week;
      const hardPct = (hardMin / total) * 100;
      if (hardPct <= hardPercentCeiling) return week;

      // Find the quality workout with the most hard minutes
      let worstIdx = -1;
      let worstHard = 0;
      for (let i = 0; i < week.workouts.length; i++) {
        const wo = week.workouts[i];
        let h = 0;
        for (const b of wo.blocks) {
          if (b.isQualityExercise && !b._isSynthesizedRest) h += blockDurationMinutes(b);
        }
        if (h > worstHard) { worstHard = h; worstIdx = i; }
      }

      if (worstIdx === -1) return week;

      const replacedTitle = week.workouts[worstIdx].title ?? week.workouts[worstIdx].id ?? 'אימון לא ידוע';
      const easyWorkout = materializeWorkout(
        easyTemplate, week.weekNumber, [], userProfile, config,
      );
      const newWorkouts = [...week.workouts];
      newWorkouts[worstIdx] = easyWorkout;

      const easyName = easyTemplate.name ?? 'ריצה קלה';
      warnings.push(
        `שבוע ${week.weekNumber}: מנגנון בטיחות 80/20 — "${replacedTitle}" הוחלף ב-"${easyName}" (${Math.round(hardPct)}% קשה → מופחת)`,
      );

      return { ...week, workouts: newWorkouts };
    }),
  };
}

/**
 * Drop lowest-priority (highest number) slots when canonical frequency exceeds slot count.
 * Returns slots sorted by priority (lowest number = most important = kept first).
 */
function resolveActiveSlots(slots: WeekSlot[], userFrequency: number): WeekSlot[] {
  const sorted = [...slots].sort((a, b) => a.priority - b.priority);
  const requiredSlots = sorted.filter((s) => s.required);
  const optionalSlots = sorted.filter((s) => !s.required);

  const slotsToFill = Math.min(userFrequency, sorted.length);
  const result = [...requiredSlots];

  for (const slot of optionalSlots) {
    if (result.length >= slotsToFill) break;
    result.push(slot);
  }

  return result;
}

/** Find a specific rule type across all phases or flat progressionRules. */
function findRule<T extends ProgressionRule>(
  template: RunProgramTemplate,
  type: T['type'],
): T | undefined {
  if (template.phases) {
    for (const phase of template.phases) {
      const found = phase.progressionRules.find((r) => r.type === type);
      if (found) return found as T;
    }
  }
  return template.progressionRules.find((r) => r.type === type) as T | undefined;
}
