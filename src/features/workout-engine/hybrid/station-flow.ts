/**
 * station-flow — pure helpers behind the hybrid station's end-of-station screen and the
 * in-station exercise swap (G2.4 field-test fixes). Plain .ts (no React, no I/O) so the
 * node-only vitest covers it; useHybridRun / HybridStationLayer only apply the results.
 */
import type { HybridPlannedSegment } from './compose-hybrid-session.service';
import type { StrengthBlockResult } from '../core/pipeline/strength-block.service';
import type { WorkoutPlan } from '@/features/parks/core/types/route.types';

export interface StationContext {
  /** No strength station after this one → the existing finish/summary path, no completion screen. */
  isFinalStation: boolean;
  /** Name of the next station's park (from the composed stations list), or null if unknown. */
  nextStationName: string | null;
  /** Planned walking/running seconds to reach the next station, or null if no next station. */
  nextWalkSec: number | null;
  /** Activity of the leg right after this station (copy: "דק׳ הליכה" vs "דק׳ ריצה"). */
  nextLegKind: 'walking' | 'running';
  /** This station's park (for the swap modal's park-equipment preference), or null. */
  parkId: string | null;
  /** This station's park name (welcome screen), or null if unknown. */
  parkName: string | null;
  /** 1-based position of this station among the session's stations ("תחנה N מתוך M"). */
  stationNumber: number;
  /** Total stations in the session. */
  stationTotal: number;
  /** Planned station duration in whole minutes (≥1), or null when the plan has none. */
  estimatedMin: number | null;
}

/** Context for the station at `cursor` (the one currently running). */
export function computeStationContext(
  plan: readonly HybridPlannedSegment[],
  cursor: number,
  stationNames: Readonly<Record<string, string>> = {},
): StationContext {
  const current = plan[cursor];
  const parkId = current?.parkId ?? null;
  const strengthIdx = plan.map((seg, i) => (seg.kind === 'strength' ? i : -1)).filter((i) => i >= 0);
  const base = {
    parkId,
    parkName: (parkId && stationNames[parkId]) || null,
    stationNumber: Math.max(1, strengthIdx.indexOf(cursor) + 1),
    stationTotal: Math.max(1, strengthIdx.length),
    estimatedMin: current?.durationSec ? Math.max(1, Math.round(current.durationSec / 60)) : null,
  };
  const nextLeg = plan.slice(cursor + 1).find((seg) => seg.kind === 'aerobic');
  const nextLegKind: 'walking' | 'running' = nextLeg?.aerobicType === 'running' ? 'running' : 'walking';
  let walkSec = 0;
  for (let i = cursor + 1; i < plan.length; i++) {
    const seg = plan[i];
    if (seg.kind === 'strength') {
      return {
        ...base,
        isFinalStation: false,
        nextStationName: (seg.parkId && stationNames[seg.parkId]) || null,
        nextWalkSec: walkSec,
        nextLegKind,
      };
    }
    walkSec += seg.durationSec ?? 0;
  }
  return { ...base, isFinalStation: true, nextStationName: null, nextWalkSec: null, nextLegKind };
}

/** Exercises actually worked at the station (distinct ids with ≥1 logged set). */
export function countStationExercises(
  log: ReadonlyArray<{ exerciseId: string; confirmedReps?: readonly unknown[] }>,
): number {
  const ids = new Set<string>();
  for (const e of log) if ((e.confirmedReps?.length ?? 0) > 0) ids.add(e.exerciseId);
  return ids.size;
}

/** Whole minutes spent at the station (≥1 once any time passed). */
export function stationMinutes(startedAtMs: number | null, completedAtMs: number): number {
  if (startedAtMs == null || !Number.isFinite(startedAtMs) || completedAtMs <= startedAtMs) return 0;
  return Math.max(1, Math.round((completedAtMs - startedAtMs) / 60000));
}

/**
 * Map a position in the RENDERED station plan (segment, exercise) to its index in the block
 * content. The block keys exercises by content id: the k-th occurrence of that id in the plan
 * maps to the k-th occurrence in the block. -1 when it can't be mapped.
 */
export function locateStationContentIndex(
  content: StrengthBlockResult,
  stationPlan: WorkoutPlan,
  segIdx: number,
  exIdx: number,
): number {
  const target = stationPlan.segments[segIdx]?.exercises?.[exIdx];
  if (!target?.id) return -1;
  let occurrence = 0;
  outer: for (let s = 0; s < stationPlan.segments.length; s++) {
    const exs = stationPlan.segments[s].exercises ?? [];
    for (let e = 0; e < exs.length; e++) {
      if (s === segIdx && e === exIdx) break outer;
      if (exs[e]?.id === target.id) occurrence++;
    }
  }
  let seen = 0;
  return content.exercises.findIndex((we) => {
    if ((we.exercise as { id?: string })?.id !== target.id) return false;
    if (seen === occurrence) return true;
    seen++;
    return false;
  });
}

/**
 * Write a swap into the station's block content (located via locateStationContentIndex).
 * The prescription (sets/reps/rest/time-based) is kept — same rule as the overview swap.
 * Returns null when the position can't be mapped (caller leaves the plan unchanged).
 */
export function swapExerciseInStationContent(
  content: StrengthBlockResult,
  stationPlan: WorkoutPlan,
  segIdx: number,
  exIdx: number,
  newExercise: unknown,
  method: unknown,
): StrengthBlockResult | null {
  const idx = locateStationContentIndex(content, stationPlan, segIdx, exIdx);
  if (idx === -1) return null;
  const exercises = content.exercises.slice();
  exercises[idx] = { ...exercises[idx], exercise: newExercise as never, method: method as never, wasSwapped: true };
  return { ...content, exercises };
}
