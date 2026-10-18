'use client';

/**
 * Client tools for the AI coach — run on the device when the server ends a stream with
 * {type:'client_tool'}. Each executor validates the input AGAIN (same zod schema as the
 * server), runs the real app code path, keeps anything heavy on the device and returns
 * only a compact outcome for the model.
 *
 * Adding a client tool (e.g. generate_route later): register it in COACH_TOOLS
 * (src/lib/ai/coach/tools.ts) with kind 'client' and add an executor to CLIENT_TOOL_EXECUTORS.
 */
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import type { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';
import type { ExecutionLocation } from '@/features/content/exercises/core/exercise.types';
import { getLocalizedText } from '@/features/content/exercises/core/exercise.types';
import { GenerateWorkoutInput, sanitizeWorkoutEquipment, type ClientToolOutcome } from '@/lib/ai/coach/tools';
import { aiWorkoutTitle } from '@/lib/ai/coach/intent';
import { buildGenerateOptions, compactWorkout, isParkLike, newAiWorkoutId } from './workout-tool.pure';
import { baseDomainOf, shapeAiWorkout } from './workout-shaping.pure';
import { putAiWorkout } from './workout-cache';

export interface ClientToolRun {
  outcome: ClientToolOutcome;
}

type Executor = (input: unknown, profile: UserFullProfile) => Promise<ClientToolRun>;

async function generateWorkoutExecutor(rawInput: unknown, profile: UserFullProfile): Promise<ClientToolRun> {
  const parsed = GenerateWorkoutInput.safeParse(rawInput);
  if (!parsed.success) return { outcome: { ok: false, error: 'invalid_input' } };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { outcome: { ok: false, error: 'offline' } };
  }
  const input = sanitizeWorkoutEquipment(parsed.data, profile.equipment as unknown as Record<string, unknown>);

  try {
    // Same modules, same calls as WorkoutBuilderSheet.handleGenerate (loaded lazily so the
    // chat screen doesn't pull the engine in before it's needed).
    const [{ generateHomeWorkout }, { resolveWorkoutContext }, { useWeeklyVolumeStore }, budgeting, gear, mapping] = await Promise.all([
      import('@/features/workout-engine/services/home-workout.service'),
      import('@/features/workout-engine/services/workout-context-resolver'),
      import('@/features/workout-engine/core/store/useWeeklyVolumeStore'),
      import('@/features/workout-engine/logic/workout-budgeting.utils'),
      import('@/features/workout-engine/shared/utils/gear-mapping.utils'),
      import('@/features/workout-engine/shared/constants/domain-mapping.constants'),
    ]);
    const store = useWeeklyVolumeStore.getState() as unknown as {
      getRemainingBudget?: () => number;
      getBudgetUsagePercent?: () => number;
    };
    const budget = { remaining: store.getRemainingBudget?.(), usagePct: store.getBudgetUsagePercent?.() };
    const parkEquipmentIds = isParkLike(input.location)
      ? (await resolveWorkoutContext(profile, input.location as ExecutionLocation, { allowHomeOverride: false })).availableGear
      : undefined;
    // Gear names for the tool result ("is this for home?"); best effort, ids otherwise.
    await gear.ensureEquipmentCachesLoaded().catch(() => undefined);

    const result = await generateHomeWorkout(buildGenerateOptions(input, profile, budget, parkEquipmentIds));
    const workout: GeneratedWorkout = result.workout;
    if (workout.needsAssessment) {
      return { outcome: { ok: false, error: 'needs_assessment', domains: (workout.assessmentDomains ?? []).slice(0, 8) } };
    }
    if (!workout.exercises?.length) return { outcome: { ok: false, error: 'generation_failed' } };

    const nameOf = (ex: GeneratedWorkout['exercises'][number]) => getLocalizedText(ex.exercise?.name as never) || '';
    // Body-area focus, the short-session minimum and a title from the request (see
    // workout-shaping.pure.ts). Mutates `workout`, so the card opens what Kelly describes.
    const { report } = shapeAiWorkout(workout, {
      durationMin: input.durationMin,
      location: input.location,
      domains: input.domains,
      title: aiWorkoutTitle(input.domains, input.location),
      nameOf,
      estimateMinutes: budgeting.calculateEstimatedDuration,
    });

    const workoutId = newAiWorkoutId();
    putAiWorkout(workoutId, { workout, location: input.location });
    const compact = compactWorkout(workoutId, input.location, workout, nameOf, {
      methodName: (ex) => getLocalizedText(ex.method?.methodName as never) || '',
      gearLabels: (ex) =>
        mapping
          .collectMethodGear(ex.method)
          .map((id) => gear.resolveEquipmentLabel(id))
          .filter((l) => l && l !== 'ציוד לא מזוהה'),
      area: (ex) => baseDomainOf(ex),
      requestedMinutes: input.durationMin,
      domains: input.domains,
      difficulty: input.difficulty,
      shortOfMinimum: report.shortOfMinimum,
    });
    return { outcome: { ok: true, result: compact } };
  } catch (err) {
    console.error('[ai-coach] generate_workout failed', err);
    return { outcome: { ok: false, error: 'generation_failed' } };
  }
}

export const CLIENT_TOOL_EXECUTORS: Record<string, Executor> = {
  generate_workout: generateWorkoutExecutor,
};

export async function runClientTool(name: string, input: unknown, profile: UserFullProfile): Promise<ClientToolRun> {
  const exec = CLIENT_TOOL_EXECUTORS[name];
  if (!exec) return { outcome: { ok: false, error: 'invalid_input' } };
  return exec(input, profile);
}
