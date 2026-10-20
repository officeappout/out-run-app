/**
 * hybrid-completion-sync — the single post-save fan-out for a finished combined
 * workout (route + stops / run|walk + strength / park workout with legs).
 *
 * Counted PER PART (owner, 20.10.2026 — all users, see hybrid-counting.ts):
 *   - dailyActivity: cardio minutes = run + walk legs, strength minutes = the
 *     done stations (skipped-station time is not strength time) — one atomic
 *     write; streak / goal / workoutCount / HealthKit still fire ONCE.
 *   - weekly volume: running km/min ONLY from running legs (a walking leg is a
 *     walk — solo walks don't feed the running tracker either); strength sets,
 *     per-domain sets and exercise ids from the stations — so the generator's
 *     weekly domain balance sees hybrid push/pull/legs/core sets.
 *   - 48 h muscle shield: the stations' trained muscles (from the plan's
 *     exercise docs — no extra reads), like a strength workout.
 * XP is FROZEN: nothing here awards XP or coins (hybrid XP is display-only).
 */
import type { HybridFinalizeResult } from './hybrid-orchestrator';
import type { HybridPlannedSegment } from './compose-hybrid-session.service';
import { splitHybridWorkout, hybridPartMinutes, type HybridParts } from './hybrid-counting';
import type { Exercise, MuscleGroup } from '@/features/content/exercises/core/exercise.types';

export interface HybridCompletionInput {
  result: HybridFinalizeResult;
  plan: HybridPlannedSegment[] | null;
  aerobicKind: 'running' | 'walking';
  calories: { total: number; aerobic: number; strength: number };
}

/** Trained muscles + movement groups of the done station exercises (pure). */
export function stationMuscles(
  plan: ReadonlyArray<HybridPlannedSegment> | null | undefined,
  exerciseIds: ReadonlyArray<string>,
): { muscles: MuscleGroup[]; exercises: Array<Pick<Exercise, 'movementGroup'>> } {
  const wanted = new Set(exerciseIds);
  const muscles = new Set<MuscleGroup>();
  const exercises: Array<Pick<Exercise, 'movementGroup'>> = [];
  const seen = new Set<string>();
  for (const seg of plan ?? []) {
    if (seg.kind !== 'strength') continue;
    for (const we of seg.content?.exercises ?? []) {
      const ex = we.exercise;
      if (!ex?.id || !wanted.has(ex.id) || seen.has(ex.id)) continue;
      seen.add(ex.id);
      exercises.push({ movementGroup: ex.movementGroup });
      if (ex.primaryMuscle) muscles.add(ex.primaryMuscle);
      ex.secondaryMuscles?.forEach((m) => muscles.add(m));
    }
  }
  return { muscles: Array.from(muscles), exercises };
}

/** Category splits for dailyActivity (pure). */
export function hybridCategorySplits(parts: HybridParts, calories: HybridCompletionInput['calories']) {
  const m = hybridPartMinutes(parts);
  return [
    { category: 'cardio' as const, durationMinutes: m.runMinutes + m.walkMinutes, calories: calories.aerobic },
    { category: 'strength' as const, durationMinutes: m.strengthMinutes, calories: calories.strength },
  ];
}

export async function syncHybridCompletion(input: HybridCompletionInput): Promise<HybridParts> {
  const { result, plan, aerobicKind, calories } = input;
  const parts = splitHybridWorkout(result.segments, plan, aerobicKind);
  const minutes = hybridPartMinutes(parts);
  const totalDurationSec = result.segments.reduce((acc, seg) => acc + (seg.actual?.durationSec ?? 0), 0);

  const { syncWorkoutCompletion } = await import('@/features/workout-engine/services/completion-sync.service');
  await syncWorkoutCompletion({
    workoutType: 'hybrid',
    // No per-session name exists for a hybrid (HybridPlan has no title) — same
    // literal HybridSummary's header uses (23.08.2026 fix).
    workoutTitle: 'אימון משולב',
    durationMinutes: Math.max(Math.round(totalDurationSec / 60), 1),
    calories: calories.total,
    activityCategory: 'cardio', // aggregate fallback (unused — categorySplits wins)
    displayIcon: 'activity',
    distanceKm: result.summary.totalActualDistanceKm,
    categorySplits: hybridCategorySplits(parts, calories),
    setsCompleted: parts.strength.setsCompleted,
    hybridParts: minutes,
  });

  // Weekly volume — per part. Kept separate from syncWorkoutCompletion (like the
  // strength-solo path) because sets/domains live on the finalize result.
  try {
    const { useWeeklyVolumeStore } = await import('@/features/workout-engine/core/store/useWeeklyVolumeStore');
    const wv = useWeeklyVolumeStore.getState();
    if (parts.running.legs > 0 && (parts.running.km > 0 || parts.running.sec > 0)) {
      wv.recordRunningSession(parts.running.km, minutes.runMinutes);
    }
    if (parts.strength.setsCompleted > 0) {
      wv.recordStrengthSession(
        parts.strength.setsCompleted,
        Math.max(parts.strength.setsPlanned, parts.strength.setsCompleted),
        2,     // difficulty — neutral (no bolt data on a hybrid station)
        false, // isRecovery
        undefined,
        minutes.strengthMinutes,
        Object.keys(parts.strength.domainSets).length > 0 ? parts.strength.domainSets : undefined,
        parts.strength.exerciseIds.length > 0 ? parts.strength.exerciseIds : undefined,
      );
    }
  } catch (e) {
    console.error('[hybrid-completion] weekly volume record failed', e);
  }

  // 48 h muscle shield — background, never blocks the finish.
  if (parts.strength.setsCompleted > 0) {
    void (async () => {
      try {
        const { muscles, exercises } = stationMuscles(plan, parts.strength.exerciseIds);
        if (muscles.length === 0) return;
        const { auth } = await import('@/lib/firebase');
        const uid = auth.currentUser?.uid;
        if (!uid) return;
        const { trackMuscleUsage } = await import('@/features/workout-engine/services/split-decision');
        const { deriveSessionFocus } = await import('@/features/workout-engine/services/split-decision/session-focus.utils');
        await trackMuscleUsage({
          userId: uid,
          trainedMuscleGroups: muscles,
          sessionDate: new Date().toISOString().split('T')[0],
          sessionFocus: deriveSessionFocus(undefined, exercises, muscles),
        });
      } catch (e) {
        console.warn('[hybrid-completion] trackMuscleUsage failed', e);
      }
    })();
  }

  return parts;
}
