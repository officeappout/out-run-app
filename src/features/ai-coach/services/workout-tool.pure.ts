/**
 * generate_workout (client tool) — the pure halves: model input → engine options, and the
 * finished GeneratedWorkout → the compact result the server/model sees.
 *
 * The options mirror WorkoutBuilderSheet.handleGenerate exactly (same engine entry point,
 * same knobs): testLocation, availableTime, difficulty + targetDifficulty, blast for short
 * intense sessions, requiredDomains + strictDomains, equipmentOverride, the weekly budget
 * from useWeeklyVolumeStore, parkEquipmentIds from resolveWorkoutContext, isManualOverride.
 * The only builder input with no equivalent here is the program pill (scheduledProgramIds);
 * like a builder session with no pill selected, it is left to the engine.
 */
import type { HomeWorkoutOptions } from '@/features/workout-engine/services/home-workout.types';
import type { GeneratedWorkout, WorkoutExercise } from '@/features/workout-engine/logic/workout-generator.types';
import type { ExecutionLocation } from '@/features/content/exercises/core/exercise.types';
import type { GenerateWorkoutInputT, WorkoutToolResult } from '@/lib/ai/coach/tools';
import type { StrengthBudgetSnapshot } from '@/features/workout-engine/budget-light/policy';

export interface BudgetSnapshot {
  remaining?: number;
  usagePct?: number;
  /** Budget light mode: the week's strength sets (budget-light/snapshot.ts). Ignored while the flag is off. */
  strength?: StrengthBudgetSnapshot | null;
}

export function buildGenerateOptions(
  input: GenerateWorkoutInputT,
  userProfile: HomeWorkoutOptions['userProfile'],
  budget: BudgetSnapshot,
  parkEquipmentIds: string[] | undefined,
): HomeWorkoutOptions {
  const autoBlast = input.difficulty === 3 && input.durationMin <= 20;
  const domains = input.domains.length > 0 ? [...input.domains] : undefined;
  const difficulty = input.difficulty as 1 | 2 | 3;
  return {
    userProfile,
    testLocation: input.location as ExecutionLocation,
    availableTime: input.durationMin,
    difficulty,
    targetDifficulty: difficulty,
    intentMode: autoBlast ? 'blast' : undefined,
    requiredDomains: domains,
    strictDomains: (domains?.length ?? 0) > 0,
    equipmentOverride: input.equipment.length > 0 ? input.equipment : undefined,
    remainingWeeklyBudget: (budget.remaining ?? 0) > 0 ? budget.remaining : undefined,
    weeklyBudgetUsagePercent: (budget.usagePct ?? 0) > 0 ? budget.usagePct : undefined,
    parkEquipmentIds: parkEquipmentIds?.length ? parkEquipmentIds : undefined,
    isManualOverride: true,
    // Budget light mode: Kelly RECOMMENDS this session → lighter (with a "why") when the strength
    // budget is spent. isManualOverride above still keeps the deficit math off, as before.
    budgetEntry: 'recommended',
    ...(budget.strength ? { strengthBudgetSnapshot: budget.strength } : {}),
  };
}

export function isParkLike(location: GenerateWorkoutInputT['location']): boolean {
  return location === 'park' || location === 'street';
}

export function newAiWorkoutId(now = Date.now(), rand = Math.random): string {
  return `ai-${now.toString(36)}-${Math.floor(rand() * 36 ** 6).toString(36).padStart(6, '0')}`;
}

function isMain(ex: WorkoutExercise): boolean {
  return ex.exerciseRole !== 'warmup' && ex.exerciseRole !== 'cooldown';
}

const clampInt = (v: unknown, lo: number, hi: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : lo;
  return Math.min(hi, Math.max(lo, n));
};

export interface CompactDetails {
  methodName: (ex: WorkoutExercise) => string;
  gearLabels: (ex: WorkoutExercise) => string[];
  area: (ex: WorkoutExercise) => string | null;
  requestedMinutes: number;
  domains: string[];
  difficulty: number;
  shortOfMinimum?: boolean;
}

/** The engine clamped the user's level to the content ceiling for this location (#404). */
export function hasLevelCeiling(workout: Pick<GeneratedWorkout, 'decisionRecord'>): boolean {
  const reasons = (workout.decisionRecord as { reasons?: Array<{ code?: string }> } | undefined)?.reasons;
  return Array.isArray(reasons) && reasons.some((r) => r?.code === 'LEVEL_CEILING');
}

function hasVideo(ex: WorkoutExercise): boolean {
  const media = (ex.method as { media?: { mainVideoUrl?: string | null } } | null | undefined)?.media;
  return typeof media?.mainVideoUrl === 'string' && media.mainVideoUrl.length > 0;
}

/**
 * GeneratedWorkout → WorkoutToolResult (main exercises only; names via the caller). With
 * `details`, every exercise also carries its method, where it is done, the gear it needs
 * and whether it has a video, so Kelly can answer "is this for home?" from facts.
 */
export function compactWorkout(
  workoutId: string,
  location: GenerateWorkoutInputT['location'],
  workout: GeneratedWorkout,
  nameOf: (ex: WorkoutExercise) => string,
  details?: CompactDetails,
): WorkoutToolResult {
  const main = workout.exercises.filter(isMain).slice(0, 20);
  const out: WorkoutToolResult = {
    workoutId,
    title: (workout.title || 'אימון מותאם אישית').slice(0, 80),
    minutes: clampInt(workout.estimatedDuration, 1, 180),
    location,
    exercises: main.map((ex) => ({
      name: (nameOf(ex) || 'תרגיל').slice(0, 60),
      sets: clampInt(ex.sets, 0, 20),
      reps: ex.isTimeBased ? null : clampInt(ex.reps, 0, 300),
      seconds: ex.isTimeBased ? clampInt(ex.reps, 0, 900) : null,
      ...(details
        ? {
            method: (details.methodName(ex) || '').slice(0, 80),
            methodLocation: ((ex.method as { location?: string } | null | undefined)?.location ?? null)?.slice(0, 20) ?? null,
            gear: details.gearLabels(ex).map((g) => g.slice(0, 40)).slice(0, 6),
            video: hasVideo(ex),
            area: details.area(ex),
          }
        : {}),
    })),
  };
  if (details) {
    out.requestedMinutes = clampInt(details.requestedMinutes, 1, 180);
    out.domains = details.domains.slice(0, 8);
    out.difficulty = clampInt(details.difficulty, 1, 3);
    out.structure = String(workout.structure ?? 'standard').slice(0, 20);
    out.warmupCount = workout.exercises.filter((e) => e.exerciseRole === 'warmup').length;
    out.cooldownCount = workout.exercises.filter((e) => e.exerciseRole === 'cooldown').length;
    out.levelCeiling = hasLevelCeiling(workout);
    if (details.shortOfMinimum) out.shortOfMinimum = true;
  }
  // Budget light mode: tell Kelly the session was made lighter (she explains why).
  if (workout.budgetLight) out.budgetLight = workout.budgetLight.reasonKey === 'budget_light.daily_spent' ? 'daily_spent' : 'weekly_spent';
  if (workout.decisionRecord) out.decisionRecord = JSON.parse(JSON.stringify(workout.decisionRecord));
  return out;
}
