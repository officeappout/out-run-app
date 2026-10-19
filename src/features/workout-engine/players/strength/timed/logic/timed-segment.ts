/**
 * timed-segment — which segments of a strength workout the timed engine runs
 * (enable_home_v2), and how its result goes back into the player's log. Pure.
 *
 * Mixed workouts (board A-5) need nothing special: each segment is looked at
 * on its own. A valid AMRAP / EMOM / Tabata segment → the timed engine; every
 * other segment (straight / superset / pyramid, or a block with bad config)
 * stays with the regular strength flow. Flag off → always null → today's
 * player exactly.
 */
import type { WorkoutPlan, WorkoutSegment } from '@/features/parks/core/types/route.types';
import { timedSpecFromSegment } from '@/features/workout-engine/engines/timed/timed-spec';
import type { TimedBlockSpec } from '@/features/workout-engine/engines/timed/timed.types';
import type { TimedBlockResult } from '@/features/workout-engine/engines/timed/timed-result';
import { logStampFromPlanExercise } from '@/features/workout-engine/adaptation/exercise-log-stamp';
import type { ExerciseResultLog } from '../../hooks/useWorkoutStateMachine';

export interface TimedSegmentGate {
  /** enable_home_v2 */
  enabled: boolean;
  /** Inside a hybrid station (HybridStationLayer) — that flow is owned elsewhere. */
  embedded?: boolean;
}

/** The engine spec of a segment, or null when the regular strength flow runs it. */
export function resolveTimedSegment(segment: WorkoutSegment | null | undefined, gate: TimedSegmentGate): TimedBlockSpec | null {
  if (!gate.enabled || gate.embedded) return null;
  return timedSpecFromSegment(segment);
}

/**
 * A stable identity for a segment's timed content. The engine restarts its
 * block whenever the spec object changes, so the spec is memoised on this
 * key — a parent re-render that rebuilds the plan object never resets a
 * running block.
 */
export function timedSegmentKey(segment: WorkoutSegment | null | undefined): string {
  if (!segment?.protocol) return '';
  const ids = (segment.exercises ?? []).map((e) => `${e.id}:${e.reps ?? ''}:${e.duration ?? ''}`).join(',');
  return `${segment.id}|${segment.protocol}|${JSON.stringify(segment.protocolConfig ?? null)}|${ids}`;
}

/** The log key the strength player uses for a segment. */
export function segmentLogId(workout: Pick<WorkoutPlan, 'segments'>, segmentIndex: number): string {
  return workout.segments[segmentIndex]?.id || String(segmentIndex);
}

/**
 * Engine result → the player's ExerciseResultLog rows (one row per item,
 * one value per round / minute / interval), stamped with the plan context
 * the regular flow stamps, so summaries / adaptation read them unchanged.
 */
export function timedResultToLog(
  result: TimedBlockResult,
  segment: WorkoutSegment | null | undefined,
  segmentId: string,
): ExerciseResultLog[] {
  const plan = segment?.exercises ?? [];
  return result.exerciseLog.map((d) => {
    const planEx = plan.find((e) => e.id === d.exerciseId);
    return { ...logStampFromPlanExercise(planEx), ...d, segmentId };
  });
}

/** Replace a segment's rows in the log (the timed block owns the whole segment). */
export function mergeSegmentLog(
  log: readonly ExerciseResultLog[],
  segmentId: string,
  entries: readonly ExerciseResultLog[],
): ExerciseResultLog[] {
  return [...log.filter((e) => e.segmentId !== segmentId), ...entries];
}

/** True for a warm-up / cool-down segment (same title / id test the summaries use). */
export function isBookendSegment(segment: WorkoutSegment | undefined): boolean {
  if (!segment) return false;
  const t = segment.title ?? '';
  return (
    segment.id.includes('warmup') ||
    segment.id.includes('cooldown') ||
    t.includes('חימום') ||
    t.includes('שחרור') ||
    t.includes('קירור') ||
    t.includes('מתיחות')
  );
}

/**
 * "פינישר" when a classic (non-timed) main segment comes before this block
 * (board A-5c: "פינישר · סבב 2 …", "פינישר · נותרו"). Null otherwise.
 */
export function timedBlockPrefix(workout: Pick<WorkoutPlan, 'segments'>, segmentIndex: number): string | null {
  for (let i = 0; i < segmentIndex; i++) {
    const s = workout.segments[i];
    if (!s || isBookendSegment(s) || !(s.exercises && s.exercises.length > 0)) continue;
    if (!timedSpecFromSegment(s)) return 'פינישר';
  }
  return null;
}
