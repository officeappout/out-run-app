/**
 * The strength level after a combined workout (enable_combo_flow_v1, board PlayerSummaryCoverage
 * "finish": the ring, then LevelUpScreen only if the level moved, then HybridSummary). PURE.
 *
 * The stations' logged sets feed the SAME progression engine a strength workout uses
 * (processWorkoutCompletion: track level / percent only, never XP or coins).
 */
import type { WorkoutExerciseResult } from '@/features/user/core/types/progression.types';
import type { LevelUpOutcome } from '@/features/user/progression/services/levelup-preview';
import type { HybridFinalizeResult } from './hybrid-orchestrator';
import type { HybridPlannedSegment } from './compose-hybrid-session.service';

/** The user's active strength program (same rule as the strength player page). */
export function activeStrengthProgramId(profile: {
  progression?: { activePrograms?: Array<{ id?: string }> };
  currentProgramId?: string;
} | null | undefined): string {
  return profile?.progression?.activePrograms?.[0]?.id || profile?.currentProgramId || 'full_body';
}

/** exerciseId → programIds from the stations' exercise docs (targetPrograms + programIds). */
export function stationProgramLookup(plan: ReadonlyArray<HybridPlannedSegment> | null | undefined): Map<string, string[]> {
  const lookup = new Map<string, string[]>();
  for (const seg of plan ?? []) {
    if (seg.kind !== 'strength') continue;
    for (const we of seg.content?.exercises ?? []) {
      const ex = we.exercise as { id?: string; targetPrograms?: Array<{ programId?: unknown }>; programIds?: unknown[] } | undefined;
      if (!ex?.id) continue;
      const ids = [
        ...(ex.targetPrograms ?? []).map((tp) => tp?.programId),
        ...(ex.programIds ?? []),
      ].filter((id): id is string => typeof id === 'string' && id.length > 0);
      if (ids.length > 0) lookup.set(ex.id, Array.from(new Set(ids)));
    }
  }
  return lookup;
}

/** The progression input: every station exercise with at least one logged set. */
export function stationExerciseResults(
  result: HybridFinalizeResult,
  plan: ReadonlyArray<HybridPlannedSegment> | null | undefined,
): WorkoutExerciseResult[] {
  const lookup = stationProgramLookup(plan);
  const out: WorkoutExerciseResult[] = [];
  for (const rec of result.segments) {
    if (rec.kind !== 'strength' || rec.skipped) continue;
    for (const e of rec.actual?.exerciseLog ?? []) {
      if ((e.confirmedReps?.length ?? 0) === 0) continue;
      const programLevels: Record<string, number> = {};
      for (const pid of lookup.get(e.exerciseId) ?? []) programLevels[pid] = 1;
      out.push({
        exerciseId: e.exerciseId,
        exerciseName: e.exerciseName,
        programLevels,
        setsCompleted: e.confirmedReps.length,
        repsPerSet: e.confirmedReps,
        targetReps: e.targetReps,
        isCompound: false,
        ...(e.confirmedRepsRight && { repsPerSetRight: e.confirmedRepsRight }),
        ...(e.confirmedRepsLeft && { repsPerSetLeft: e.confirmedRepsLeft }),
      });
    }
  }
  return out;
}

/** Board rule: the level screen only when the level or its percent actually moved. */
export function levelMoved(o: LevelUpOutcome | null | undefined): o is LevelUpOutcome {
  if (!o) return false;
  return o.after.level !== o.before.level || o.after.percent - o.before.percent > 0.05;
}
