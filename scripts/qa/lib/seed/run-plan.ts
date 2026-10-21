/**
 * The running program of a seeded tester — the SAME pipeline the onboarding runs on COMPLETED
 * (onboarding-sync.service.ts "RUNNING IMPROVEMENT BRIDGE"): bridgeRunningOnboarding → PaceProfile
 * → generatePlan → flattenPlanToSchedule. Pure: the workout templates + pace map are passed in
 * (register-testers.ts reads them read-only with the Admin SDK). Without templates the profile
 * still gets the bridge's onboardingData / generatedProgramTemplate, like the app does when the
 * template read fails.
 */
import { bridgeRunningOnboarding } from '@/features/user/onboarding/services/running-onboarding-bridge.service';
import { generatePlan } from '@/features/workout-engine/core/services/running-engine.service';
import { flattenPlanToSchedule } from '@/features/workout-engine/core/services/plan-generator.service';
import { DEFAULT_PACE_MAP_CONFIG } from '@/features/workout-engine/core/config/pace-map-config';
import type { PaceMapConfig, PaceProfile, RunWorkoutTemplate } from '@/features/workout-engine/core/types/running.types';

export interface RunAssets {
  templates: RunWorkoutTemplate[];
  paceMap: PaceMapConfig | null;
}

export interface RunPlanInput {
  /** From the engine-v2 scenario (week.running). */
  targetDistance: string;
  goalPath: string;
  weeklyFrequency: number;
  /** Day letters of the run days (after the week rotation). */
  scheduleDays: string[];
}

/** Questionnaire answers of an experienced runner (what the tester "answered"). */
export function runAnswersFor(i: RunPlanInput): Record<string, unknown> {
  const dist = ['2k', '3k', '5k', '10k', 'maintenance'].includes(i.targetDistance) ? i.targetDistance : '10k';
  const goalPath = ['start_running', 'improve_time', 'maintain_fitness'].includes(i.goalPath) ? i.goalPath : 'improve_time';
  const improving = goalPath === 'improve_time';
  return {
    goalPath,
    targetDistance: dist,
    abilityTier: improving ? 'runner' : '30_45',
    canRunContinuous: true,
    continuousTimeMinutes: 40,
    // 10k in 50:00 / 5k in 24:00 — a solid recreational runner.
    ...(improving ? { paceInputSeconds: dist === '5k' ? 24 * 60 : 50 * 60 } : {}),
    hasInjuries: false,
    runningHistoryMonths: 24,
    weeklyFrequency: i.weeklyFrequency,
  };
}

/**
 * The `running` block of the users doc (the shape onboarding-sync writes) + the generated
 * program id (for lifestyle.recurringTemplate on run days, like the onboarding bridge). The id
 * carries a timestamp, so it is taken from this ONE bridge call.
 */
export function runningProfileFor(i: RunPlanInput, assets: RunAssets | null, now: Date): { running: Record<string, unknown>; programId: string } {
  const bridge = bridgeRunningOnboarding(runAnswersFor(i));
  const paceProfile: PaceProfile = {
    basePace: bridge.basePace,
    profileType: bridge.programTemplate.targetProfileTypes[0] ?? 2,
    qualityWorkoutsHistory: [],
    qualityWorkoutCount: 0,
    lastSelfCorrectionDate: null,
  };
  const t = bridge.programTemplate;
  const running: Record<string, unknown> = {
    isUnlocked: true,
    currentGoal: bridge.runnerGoal,
    paceProfile,
    onboardingData: bridge.runningOnboardingData,
    scheduleDays: i.scheduleDays,
    scheduleDaysSource: 'user-chosen',
    generatedProgramTemplate: {
      id: t.id,
      name: t.name,
      targetDistance: t.targetDistance,
      canonicalWeeks: t.canonicalWeeks,
      canonicalFrequency: t.canonicalFrequency,
      targetProfileTypes: t.targetProfileTypes,
      maxIntensityRank: t.maxIntensityRank,
      ...(t.excludeCategories ? { excludeCategories: t.excludeCategories } : {}),
    },
  };
  if (assets && assets.templates.length > 0) {
    const plan = generatePlan(t, paceProfile, assets.paceMap ?? DEFAULT_PACE_MAP_CONFIG, assets.templates);
    running.activeProgram = {
      programId: t.id,
      startDate: now.toISOString(),
      currentWeek: 1,
      schedule: flattenPlanToSchedule(plan, assets.templates),
    };
  }
  return { running, programId: t.id };
}
