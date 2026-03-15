/**
 * Running Onboarding Bridge Service
 *
 * Translates dynamic questionnaire answers (Firestore-driven) into
 * a RunningOnboardingData object + PlanGeneratorInput, then calls
 * generateProgramTemplate() to produce a ready-to-use RunProgramTemplate.
 *
 * The 7 key parameters aggregated from the tree:
 *   1. Goal (goalPath)
 *   2. Target Distance
 *   3. Pace (reference time input)
 *   4. Experience (months)
 *   5. Frequency (workouts/week)
 *   6. Weeks (computed from WEEKS_LOOKUP)
 *   7. Injuries (boolean)
 *
 * Called from onboarding-sync.service.ts on COMPLETED when a running
 * improvement branch was answered.
 */

import type { RunningOnboardingData, RunnerGoal } from '@/features/workout-engine/core/types/running.types';
import {
  generateProgramTemplate,
  DEFAULT_PLAN_WEEKS,
  type GeneratorTargetDistance,
  type PlanGeneratorInput,
} from '@/features/workout-engine/core/services/plan-generator.service';
import { calibrateBasePace } from '@/features/workout-engine/core/services/running-engine.service';
import { WEEKS_LOOKUP } from '../data/running-improvement-branch.draft';

// ══════════════════════════════════════════════════════════════════════
// Types — flat metadata collected from answer nodes
// ══════════════════════════════════════════════════════════════════════

type GoalPath = 'start_running' | 'improve_time' | 'maintain_fitness';
type AbilityTier = 'none' | '5_15' | '15_30' | '30_45' | '45_plus' | 'runner';
type TargetDistanceStr = '2k' | '3k' | '5k' | '10k' | 'maintenance';

interface AggregatedRunningAnswers {
  goalPath: GoalPath;
  targetDistance: TargetDistanceStr;
  abilityTier: AbilityTier;
  canRunContinuous: boolean;
  continuousTimeMinutes: number;
  paceInputSeconds?: number;
  hasInjuries: boolean;
  runningHistoryMonths: number;
  weeklyFrequency: 1 | 2 | 3 | 4;
}

// ══════════════════════════════════════════════════════════════════════
// Detection
// ══════════════════════════════════════════════════════════════════════

/**
 * Check if the questionnaire answers contain a completed running branch.
 * weeklyFrequency is no longer required here -- it comes from
 * RunningScheduleStep and is merged in at bridge call time.
 */
export function isRunningBranchCompleted(answers: Record<string, unknown>): boolean {
  return (
    typeof answers.goalPath === 'string' &&
    typeof answers.targetDistance === 'string'
  );
}

// ══════════════════════════════════════════════════════════════════════
// Aggregation — flat metadata → structured RunningOnboardingData
// ══════════════════════════════════════════════════════════════════════

function parseAnswers(raw: Record<string, unknown>): AggregatedRunningAnswers {
  const goalPath = (raw.goalPath as GoalPath) ?? 'start_running';
  const targetDistance = (raw.targetDistance as TargetDistanceStr) ?? '5k';
  const abilityTier = (raw.abilityTier as AbilityTier) ?? (goalPath === 'improve_time' ? 'runner' : 'none');
  const canRunContinuous = raw.canRunContinuous === true || abilityTier !== 'none';
  const continuousTimeMinutes = typeof raw.continuousTimeMinutes === 'number' ? raw.continuousTimeMinutes : 0;
  const paceInputSeconds = typeof raw.paceInputSeconds === 'number' ? raw.paceInputSeconds : undefined;
  const hasInjuries = raw.hasInjuries === true;
  const runningHistoryMonths = typeof raw.runningHistoryMonths === 'number' ? raw.runningHistoryMonths : 0;
  const freq = typeof raw.weeklyFrequency === 'number' ? raw.weeklyFrequency : 3;
  const weeklyFrequency = (Math.min(Math.max(freq, 1), 4)) as 1 | 2 | 3 | 4;

  return {
    goalPath,
    targetDistance,
    abilityTier,
    canRunContinuous,
    continuousTimeMinutes,
    paceInputSeconds,
    hasInjuries,
    runningHistoryMonths,
    weeklyFrequency,
  };
}

function toOnboardingData(a: AggregatedRunningAnswers): RunningOnboardingData {
  return {
    targetDistance: a.targetDistance,
    weeklyFrequency: a.weeklyFrequency,
    runningHistoryMonths: a.runningHistoryMonths,
    hasInjuries: a.hasInjuries,
    goalPath: a.goalPath,
    currentAbility: {
      canRunContinuous: a.canRunContinuous,
      continuousTimeMinutes: a.continuousTimeMinutes,
      referencePace: a.paceInputSeconds
        ? formatPace(a.paceInputSeconds, distToKm(a.targetDistance))
        : null,
      abilityTier: a.abilityTier === 'runner' ? 'runner' : (a.abilityTier || 'none'),
    },
  };
}

// ══════════════════════════════════════════════════════════════════════
// Weeks resolution — PDF lookup table with fallback
// ══════════════════════════════════════════════════════════════════════

function resolveWeeks(a: AggregatedRunningAnswers): number {
  const key = `${a.goalPath}|${a.targetDistance}|${a.abilityTier}|${a.weeklyFrequency}`;
  const fromTable = WEEKS_LOOKUP[key];
  if (fromTable) return fromTable;

  return DEFAULT_PLAN_WEEKS[a.targetDistance as GeneratorTargetDistance] ?? 8;
}

// ══════════════════════════════════════════════════════════════════════
// Goal mapping
// ══════════════════════════════════════════════════════════════════════

function mapGoal(goalPath: GoalPath, targetDistance: TargetDistanceStr): RunnerGoal {
  if (goalPath === 'maintain_fitness') return 'maintain_fitness';
  if (goalPath === 'start_running') return 'couch_to_5k';
  if (targetDistance === '10k') return 'improve_speed_10k';
  return 'improve_speed_5k';
}

// ══════════════════════════════════════════════════════════════════════
// Pace computation
// ══════════════════════════════════════════════════════════════════════

function distToKm(d: TargetDistanceStr): number {
  const map: Record<string, number> = { '2k': 2, '3k': 3, '5k': 5, '10k': 10, maintenance: 5 };
  return map[d] ?? 5;
}

function formatPace(totalSeconds: number, distKm: number): string {
  const pacePerKm = totalSeconds / distKm;
  const min = Math.floor(pacePerKm / 60);
  const sec = Math.round(pacePerKm % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

/**
 * For beginners who can't provide a pace, estimate basePace from
 * their continuous running time.
 */
function estimateBeginnerBasePace(continuousMinutes: number): number {
  if (continuousMinutes <= 0) return 480; // 8:00/km — can't run at all
  if (continuousMinutes <= 10) return 450; // 7:30/km
  if (continuousMinutes <= 20) return 420; // 7:00/km
  if (continuousMinutes <= 30) return 390; // 6:30/km
  return 360; // 6:00/km
}

function deriveBasePace(a: AggregatedRunningAnswers): number {
  if (a.paceInputSeconds && a.paceInputSeconds > 0) {
    const km = distToKm(a.targetDistance);
    const refDist: 3 | 5 | 10 = km <= 3 ? 3 : km === 5 ? 5 : 10;
    return calibrateBasePace(a.paceInputSeconds, refDist, refDist);
  }
  return estimateBeginnerBasePace(a.continuousTimeMinutes);
}

// ══════════════════════════════════════════════════════════════════════
// Bridge: answers → PlanGeneratorInput → RunProgramTemplate
// ══════════════════════════════════════════════════════════════════════

/**
 * Full bridge: takes raw questionnaire metadata, builds RunningOnboardingData,
 * resolves weeks from the PDF table, derives pace and goal, then produces
 * a RunProgramTemplate via PlanGeneratorService.
 *
 * Returns both the generated template and the structured onboarding data
 * so the caller can persist both on the user document.
 */
export function bridgeRunningOnboarding(rawAnswers: Record<string, unknown>) {
  const a = parseAnswers(rawAnswers);
  const data = toOnboardingData(a);

  const goal = mapGoal(a.goalPath, a.targetDistance);
  const basePace = deriveBasePace(a);

  // User-selected plan length (from PlanLengthStep) overrides the auto-computed value
  let totalWeeks = resolveWeeks(a);
  if (typeof rawAnswers.runningPlanWeeks === 'number' && rawAnswers.runningPlanWeeks >= 4) {
    totalWeeks = rawAnswers.runningPlanWeeks;
  }

  const genDist = a.targetDistance as GeneratorTargetDistance;
  const freq = Math.min(Math.max(a.weeklyFrequency, 2), 4) as 2 | 3 | 4;

  const input: PlanGeneratorInput = {
    goal,
    basePace,
    targetDistance: genDist,
    frequency: freq,
    totalWeeks,
    runningHistoryMonths: a.runningHistoryMonths,
    hasInjuries: a.hasInjuries,
  };

  const programTemplate = generateProgramTemplate(input);

  console.log(
    '[RunningBridge] Generated program:',
    programTemplate.name,
    `| ${programTemplate.canonicalWeeks}w × ${programTemplate.canonicalFrequency}x`,
    `| maxIntensityRank=${programTemplate.maxIntensityRank ?? '∞'}`,
    `| excludeCategories=[${programTemplate.excludeCategories?.join(',') ?? ''}]`,
    `| profile=[${programTemplate.targetProfileTypes}]`,
    `| injuries=${a.hasInjuries}`,
    `| novice=${(a.runningHistoryMonths ?? 0) < 12}`,
  );

  return {
    runningOnboardingData: data,
    runnerGoal: goal,
    basePace,
    totalWeeks,
    programTemplate,
    planGeneratorInput: input,
  };
}
