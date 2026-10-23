/**
 * finalize-swap — the APPLY half of a bulk location swap, shared by the legacy swap-all loop and the
 * enable_location_gate_v1 plan: duration + stats cascade, title/description/aiCue refresh for the new
 * location, ONE onGeneratedWorkoutUpdate, then the fire-and-forget system-swap log.
 * Extracted verbatim from useSwapAll (no behaviour change).
 */
import type { Exercise, ExecutionLocation } from '@/features/content/exercises';
import { getLocalizedText } from '@/features/content/shared/localized-text.types';
import type { GeneratedWorkout, WorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import { logExerciseSwap } from '@/features/workout-engine/adaptation/log-exercise-swap';
import { adaptationStampForPlan } from '@/features/workout-engine/adaptation/exercise-log-stamp';
import {
  calculateEstimatedDuration,
  calculateWorkoutStats,
} from '@/features/workout-engine/logic/workout-budgeting.utils';
import {
  resolveWorkoutMetadata,
  type WorkoutMetadataContext,
  type TimeOfDay,
} from '@/features/workout-engine/services/workout-metadata.service';
import type { LifestylePersona } from '@/features/workout-engine/logic/ContextualEngine';

export interface FinalizeSwapInput {
  generatedWorkout: GeneratedWorkout;
  /** Entries after the superset heal. */
  healed: WorkoutExercise[];
  newLocation: ExecutionLocation;
  /** Exercise-level replacements made by this bulk swap, logged as SYSTEM swaps (userInitiated:false). */
  systemSwaps: Array<{
    from: WorkoutExercise;
    to: Exercise;
    direction?: 'lower' | 'same' | 'higher';
    toLevel?: number;
  }>;
  onGeneratedWorkoutUpdate?: (gw: GeneratedWorkout) => void;
}

export async function finalizeSwap({
  generatedWorkout,
  healed,
  newLocation,
  systemSwaps,
  onGeneratedWorkoutUpdate,
}: FinalizeSwapInput): Promise<void> {
  // ── Cascade: duration + stats (pure; volume-preserving swaps leave these unchanged) ──
  const estimatedDuration = calculateEstimatedDuration(healed);
  // userWeight omitted: a location swap must not silently change the calorie basis;
  // the engine's default is used, matching a volume-preserving swap.
  const stats = calculateWorkoutStats(healed, generatedWorkout.difficulty, estimatedDuration);

  // ── Cascade: title/description/aiCue for the new location (defensive) ──
  let title = generatedWorkout.title;
  let description = generatedWorkout.description;
  let aiCue = generatedWorkout.aiCue;
  const snap = generatedWorkout.metadataCtx;
  if (snap) {
    try {
      const ctx: WorkoutMetadataContext = {
        persona: (snap.persona ?? null) as LifestylePersona | null,
        timeOfDay: (snap.timeOfDay as TimeOfDay) ?? 'evening',
        gender: snap.gender,
        category: snap.category,
        categoryLabel: snap.categoryLabel,
        difficulty: snap.difficulty,
        dominantMuscle: snap.dominantMuscle,
        experienceLevel: snap.experienceLevel,
        sportType: snap.sportType,
        motivationStyle: snap.motivationStyle,
        currentProgram: snap.currentProgram,
        situation: snap.situation,
        location: newLocation,
        durationMinutes: estimatedDuration,
      };
      const md = await resolveWorkoutMetadata(ctx);
      if (md.title) title = md.title;
      if (md.description) description = md.description;
      if (md.aiCue) aiCue = md.aiCue;
    } catch (err) {
      console.warn('[swapAll] metadata recompute failed — keeping existing title', err);
    }
  }

  const updated: GeneratedWorkout = {
    ...generatedWorkout,
    exercises: healed,
    estimatedDuration,
    stats,
    title,
    description,
    aiCue,
    // Stamp the live location on the content so the switcher badge + the
    // no-op guard read it back from here (not the static prop).
    executionLocation: newLocation,
  };
  onGeneratedWorkoutUpdate?.(updated);
  // Phase 0 swap log — system-initiated (a location change, not a
  // judgement about the exercise). Fire-and-forget; never blocks.
  for (const sw of systemSwaps) {
    const stamp = adaptationStampForPlan(sw.from);
    logExerciseSwap({
      fromExerciseId: sw.from.exercise.id,
      fromName: getLocalizedText(sw.from.exercise.name, 'he'),
      toExerciseId: sw.to.id,
      toName: getLocalizedText(sw.to.name, 'he'),
      domain: stamp.domain,
      fromLevel: stamp.exerciseLevel,
      toLevel: sw.toLevel,
      userDomainLevel: stamp.userDomainLevel,
      direction: sw.direction,
      source: 'swap_all_location',
      flow: 'preview',
      userInitiated: false,
      location: newLocation,
      segmentRole: sw.from.exerciseRole,
    });
  }
}
