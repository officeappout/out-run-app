/**
 * summary-mapping — pure log→summary projection
 * (protocol-blocks Stage S, 11.07.2026).
 *
 * Extracted from workouts/[id]/active/page.tsx. Two structural fixes over
 * the old inline version:
 *
 * 1. CATEGORY comes from segment.protocol (Stage 1c stamping), falling back
 *    to the per-exercise pairedWith marker for legacy plans. The old
 *    "exercises.length >= 2 ⇒ superset" heuristic is BURIED — it mislabeled
 *    every multi-exercise segment (and would have mislabeled tabata blocks).
 * 2. KEYING is `${segmentId}:${exerciseId}` end-to-end, so the same exercise
 *    appearing in two segments (warmup + main, or two protocol blocks) no
 *    longer collides in the log/plan maps or in the summary list ids.
 *
 * Log-driven architecture preserved: primary pass iterates the live log (so
 * swapped-in exercises appear with real reps), secondary pass appends plan
 * exercises that were never logged (skipped) with empty sets.
 */
import type { WorkoutPlan, WorkoutSegment } from '@/features/parks';
import type { ExerciseResultLog } from '../hooks/useWorkoutStateMachine';
import type { CompletedExercise } from '@/features/workout-engine/components/strength/utils/summary.utils';

const compositeKey = (segmentId: string, exerciseId: string) => `${segmentId}:${exerciseId}`;

/** Warmup/stretch detection — unchanged from the legacy inline version. */
function segmentBaseCategory(segment: WorkoutSegment): 'warmup' | 'stretch' | null {
  const isWarmup =
    segment.id.includes('warmup') || !!segment.title?.includes('חימום');
  const isCooldown =
    segment.id.includes('cooldown') ||
    !!segment.title?.includes('קירור') ||
    !!segment.title?.includes('מתיחות');
  return isWarmup ? 'warmup' : isCooldown ? 'stretch' : null;
}

/**
 * Per-exercise category:
 * explicit segment.protocol → its class ('superset' or 'main'; block
 * protocols group as 'main' until the summary UI grows block sections);
 * legacy plans (no protocol) → the exercise's own pairedWith marker.
 * NEVER "2+ exercises in a segment".
 */
function exerciseCategory(
  segment: WorkoutSegment,
  ex: { pairedWith?: string | null },
): CompletedExercise['category'] {
  const base = segmentBaseCategory(segment);
  if (base) return base;
  if (segment.protocol) return segment.protocol === 'superset' ? 'superset' : 'main';
  return ex.pairedWith ? 'superset' : 'main';
}

export function mapToCompletedExercises(
  workoutPlan: WorkoutPlan,
  exerciseLog?: ExerciseResultLog[],
): CompletedExercise[] {
  // ── 1. Log map — composite-keyed for the secondary (unlogged) pass ────────
  const logMap = new Map<string, ExerciseResultLog>();
  for (const entry of exerciseLog ?? []) {
    logMap.set(compositeKey(entry.segmentId, entry.exerciseId), entry);
  }

  // ── 2. Plan map — name + category per (segment, exercise) ────────────────
  const planMap = new Map<string, { name: string; category: CompletedExercise['category'] }>();
  for (const segment of workoutPlan.segments) {
    if (!segment.exercises) continue;
    for (const ex of segment.exercises) {
      planMap.set(compositeKey(segment.id, ex.id), {
        name: ex.name,
        category: exerciseCategory(segment, ex as { pairedWith?: string | null }),
      });
    }
  }

  const completedExercises: CompletedExercise[] = [];

  // ── 3. Primary pass — the actual performed log ────────────────────────────
  for (const entry of exerciseLog ?? []) {
    const key = compositeKey(entry.segmentId, entry.exerciseId);
    const planInfo = planMap.get(key);
    completedExercises.push({
      id: key,
      name: entry.exerciseName,
      category: planInfo?.category ?? 'main',
      sets: entry.confirmedReps,
      totalReps: entry.confirmedReps.reduce((a, b) => a + b, 0),
      isPersonalRecord: false,
    });
  }

  // ── 4. Secondary pass — unlogged plan exercises with empty sets ───────────
  for (const [key, info] of planMap) {
    if (!logMap.has(key)) {
      completedExercises.push({
        id: key,
        name: info.name,
        category: info.category,
        sets: [],
        totalReps: 0,
        isPersonalRecord: false,
      });
    }
  }

  return completedExercises;
}
