/**
 * station-log — per-set reps at a strength station → the persisted
 * SegmentExerciseDetail[] (the shape ExerciseSetsTable already renders via
 * stationRows). Pure. Targets come from the station's planned block content
 * when the event does not carry one.
 */
import type { SegmentExerciseDetail } from '../../core/services/storage.service';
import type { HybridPlannedSegment } from '../../hybrid/compose-hybrid-session.service';

export interface StationSetInput {
  exerciseId: string;
  exerciseName?: string;
  reps: number;
  targetReps?: number;
  side?: 'right' | 'left';
  /** True when the user changed the prefilled value. */
  edited?: boolean;
}

interface PlannedTarget {
  reps: number;
  range?: { min: number; max: number };
}

/** Planned reps / range for an exercise of this station (structural read of the block content). */
export function plannedTarget(seg: HybridPlannedSegment | undefined, exerciseId: string): PlannedTarget | null {
  const list = (seg?.content?.exercises ?? []) as unknown as Array<{
    exercise?: { id?: string };
    reps?: number;
    repsRange?: { min: number; max: number };
  }>;
  const we = list.find((x) => x?.exercise?.id === exerciseId);
  if (!we || typeof we.reps !== 'number') return null;
  return { reps: we.reps, ...(we.repsRange ? { range: we.repsRange } : {}) };
}

/** Fold one finished set into the station log (a new row on the first set of an exercise). */
export function addStationSet(
  log: readonly SegmentExerciseDetail[],
  set: StationSetInput,
  seg: HybridPlannedSegment | undefined,
): SegmentExerciseDetail[] {
  const reps = Math.max(0, Math.round(Number.isFinite(set.reps) ? set.reps : 0));
  const out = log.map((e) => ({ ...e }));
  let row = out.find((e) => e.exerciseId === set.exerciseId);
  if (!row) {
    const planned = plannedTarget(seg, set.exerciseId);
    row = {
      exerciseId: set.exerciseId,
      exerciseName: set.exerciseName ?? set.exerciseId,
      confirmedReps: [],
      targetReps: set.targetReps ?? planned?.reps ?? 0,
      repsSource: [],
      ...(planned?.range ? { prescribedRange: planned.range } : {}),
    };
    out.push(row);
  }
  if (set.side === 'right') {
    // Right side waits for its left: the set closes on the left side.
    row.confirmedRepsRight = [...(row.confirmedRepsRight ?? []), reps];
    return out;
  }
  if (set.side === 'left') {
    const rights = row.confirmedRepsRight ?? [];
    const lefts = [...(row.confirmedRepsLeft ?? []), reps];
    row.confirmedRepsLeft = lefts;
    const right = rights[lefts.length - 1] ?? reps;
    row.confirmedReps = [...row.confirmedReps, Math.min(right, reps)];
  } else {
    row.confirmedReps = [...row.confirmedReps, reps];
  }
  row.repsSource = [...(row.repsSource ?? []), set.edited ? 'edited' : 'default'];
  return out;
}

/** Sets with reps > 0 across the log. */
export function countDoneSets(log: readonly SegmentExerciseDetail[]): number {
  return log.reduce((a, e) => a + e.confirmedReps.filter((v) => v > 0).length, 0);
}
