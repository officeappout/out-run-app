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
    description: finalBlocks.length > 0
      ? `${finalBlocks.length} blocks`
      : undefined,
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
 * Enforce hard ceilings on volume.
 * Iterates every week/workout/block and clamps values that exceed the caps.
 */
export function enforceVolumeCaps(plan: RunPlan, caps: VolumeCap[]): RunPlan {
  if (!caps.length) return plan;

  const setsPerBlockCap = caps.find((c) => c.target === 'sets_per_block')?.maxValue ?? Infinity;
  const singleRunCapMinutes = caps.find((c) => c.target === 'single_run')?.maxValue ?? Infinity;
  const totalSessionCapMinutes = caps.find((c) => c.target === 'total_session')?.maxValue ?? Infinity;
  const weeklyVolCapMinutes = caps.find((c) => c.target === 'weekly_volume')?.maxValue ?? Infinity;

  const adjustedWeeks = plan.weeks.map((week) => {
    let weekMinutes = 0;
    const adjustedWorkouts = week.workouts.map((workout) => {
      let sessionMinutes = 0;
      const cappedBlocks = workout.blocks.map((b) => {
        let block = { ...b };

        if (block.durationSeconds != null) {
          const blockMin = block.durationSeconds / 60;

          if (blockMin > singleRunCapMinutes && !block._isSynthesizedRest) {
            block = { ...block, durationSeconds: Math.round(singleRunCapMinutes * 60) };
          }

          sessionMinutes += (block.durationSeconds ?? 0) / 60;
        }

        return block;
      });

      if (sessionMinutes > totalSessionCapMinutes) {
        const ratio = totalSessionCapMinutes / sessionMinutes;
        const scaled = cappedBlocks.map((b) =>
          b._isSynthesizedRest ? b : scaleBlockVolume(b, ratio),
        );
        weekMinutes += totalSessionCapMinutes;
        return { ...workout, blocks: scaled };
      }

      weekMinutes += sessionMinutes;
      return { ...workout, blocks: cappedBlocks };
    });

    if (weekMinutes > weeklyVolCapMinutes) {
      const ratio = weeklyVolCapMinutes / weekMinutes;
      const scaledWorkouts = adjustedWorkouts.map((w) => ({
        ...w,
        blocks: w.blocks.map((b) =>
          b._isSynthesizedRest ? b : scaleBlockVolume(b, ratio),
        ),
      }));
      return { ...week, workouts: scaledWorkouts };
    }

    return { ...week, workouts: adjustedWorkouts };
  });

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
  config: IntensityDistributionConfig = { targetHardPercent: 20, tolerancePercent: 5 },
): { valid: boolean; weeks: WeekIntensityBreakdown[] } {
  const weeks: WeekIntensityBreakdown[] = plan.weeks.map((week) => {
    let easyMinutes = 0;
    let hardMinutes = 0;

    for (const workout of week.workouts) {
      for (const block of workout.blocks) {
        const blockMinutes = blockDurationMinutes(block);

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

    return {
      weekNumber: week.weekNumber,
      totalMinutes: Math.round(totalMinutes * 10) / 10,
      easyMinutes: Math.round(easyMinutes * 10) / 10,
      hardMinutes: Math.round(hardMinutes * 10) / 10,
      hardPercent: Math.round(hardPercent * 10) / 10,
      isValid: hardPercent >= lowerBound && hardPercent <= upperBound,
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

/** Phase-default pool mappings. */
export const PHASE_DEFAULT_POOLS: Record<ProgramPhase['name'], WorkoutCategory[]> = {
  base:  ['fartlek_easy', 'hill_long', 'strides', 'easy_run', 'long_run'],
  build: ['fartlek_structured', 'tempo', 'hill_short', 'long_intervals'],
  peak:  ['short_intervals', 'long_intervals', 'tempo'],
  taper: ['short_intervals', 'strides'],
};

/**
 * Pick a workout template for a slot within a phase.
 *
 * 1. Filter: template.category in slot.allowedCategories AND phase.qualityPool
 * 2. Anti-repeat: exclude categories from recentCategoryHistory (last 2 weeks)
 * 3. Rank: sort by template.priority ascending (lower = preferred, undefined = last)
 * 4. Pick: return the first ranked template
 */
export function selectWorkoutFromPool(
  slot: WeekSlot,
  phase: ProgramPhase,
  allTemplates: RunWorkoutTemplate[],
  recentCategoryHistory: WorkoutCategory[],
): RunWorkoutTemplate | null {
  const poolCategories = phase.qualityPool.length > 0
    ? phase.qualityPool
    : PHASE_DEFAULT_POOLS[phase.name] ?? [];

  const candidates = allTemplates.filter((t) => {
    if (!t.category) return false;
    if (!slot.allowedCategories.includes(t.category)) return false;
    if (!poolCategories.includes(t.category)) return false;
    return true;
  });

  const afterAntiRepeat = candidates.filter(
    (t) => !recentCategoryHistory.includes(t.category!),
  );

  const pool = afterAntiRepeat.length > 0 ? afterAntiRepeat : candidates;

  pool.sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity));

  return pool[0] ?? null;
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
 *   7. validateIntensityDistribution() → append warnings
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

      for (const slot of activeSlots) {
        const selected = selectWorkoutFromPool(slot, phase, allWorkoutTemplates, recentCategories);
        if (!selected) {
          warnings.push(`שבוע ${w}, סלוט '${slot.slotType}': לא נמצאה תבנית אימון מתאימה`);
          continue;
        }

        if (selected.category) {
          recentCategories.push(selected.category);
          if (recentCategories.length > template.canonicalFrequency * 2) {
            recentCategories.shift();
          }
        }

        const combinedRules = [...(template.progressionRules ?? []), ...phaseRules];
        const workout = materializeWorkout(selected, w, combinedRules, userProfile, config);
        weekWorkouts.push(workout);
      }

      // Apply per-week volume multiplier (step-back weeks)
      const weekMul = getWeekMultiplier(phase, w);
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

  // Enforce volume caps
  if (template.volumeCaps && template.volumeCaps.length > 0) {
    plan = enforceVolumeCaps(plan, template.volumeCaps);
  }

  // Validate 80/20 intensity distribution
  const validation = validateIntensityDistribution(plan);
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
