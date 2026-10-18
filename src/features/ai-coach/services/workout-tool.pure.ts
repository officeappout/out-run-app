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

export interface BudgetSnapshot {
  remaining?: number;
  usagePct?: number;
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

/** GeneratedWorkout → WorkoutToolResult (main exercises only; names via the caller). */
export function compactWorkout(
  workoutId: string,
  location: GenerateWorkoutInputT['location'],
  workout: GeneratedWorkout,
  nameOf: (ex: WorkoutExercise) => string,
): WorkoutToolResult {
  const main = workout.exercises.filter(isMain).slice(0, 20);
  return {
    workoutId,
    title: (workout.title || 'אימון מותאם אישית').slice(0, 80),
    minutes: clampInt(workout.estimatedDuration, 1, 180),
    location,
    exercises: main.map((ex) => ({
      name: (nameOf(ex) || 'תרגיל').slice(0, 60),
      sets: clampInt(ex.sets, 0, 20),
      reps: ex.isTimeBased ? null : clampInt(ex.reps, 0, 300),
      seconds: ex.isTimeBased ? clampInt(ex.reps, 0, 900) : null,
    })),
    ...(workout.decisionRecord ? { decisionRecord: JSON.parse(JSON.stringify(workout.decisionRecord)) } : {}),
  };
}
