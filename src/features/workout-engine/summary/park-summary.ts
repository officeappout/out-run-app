/**
 * park-summary — pure helpers for the live park workout's summary (enable_park_live_v2, boards
 * Park 11-12, pilot N1 / N2): a walk session's ring says "הליכה" (not "ריצה"), and the weekly
 * ring screen's numbers. Plain .ts so the node-only vitest covers it.
 */
import type { MetricRing } from '@/components/ui/v2/MetricRings';
import type { HybridFinalizeResult } from '@/features/workout-engine/hybrid/hybrid-orchestrator';

type Segments = HybridFinalizeResult['segments'];

/** Every aerobic part was a walk (at least one aerobic part). */
export function isWalkSession(segments: Segments): boolean {
  const aerobic = segments.filter((s) => s.kind === 'aerobic');
  return aerobic.length > 0 && aerobic.every((s) => s.aerobicType === 'walking');
}

/** N2: the distance ring of a walk session carries the walking label. Other rings unchanged. */
export function relabelWalkRing(rings: MetricRing[], walking: boolean, walkLabel: string): MetricRing[] {
  if (!walking) return rings;
  return rings.map((r) => (r.key === 'distance' ? { ...r, label: walkLabel } : r));
}

export interface WeekRingView {
  aerobicMin: number;
  strengthMin: number;
  totalMin: number;
  goalMin: number;
  /** 0-1 of the weekly goal per part, capped so the two arcs never pass a full ring together. */
  aerobicFrac: number;
  strengthFrac: number;
}

/**
 * N1: this week's active minutes against the weekly goal. The week's totals may not include this
 * workout yet (the activity store refreshes after the save), so each part is at least this workout's.
 */
export function weekRingView(
  week: { strength?: number; cardio?: number } | null | undefined,
  thisWorkout: { aerobicSec: number; strengthSec: number },
  goalMin: number,
): WeekRingView {
  const aerobicMin = Math.max(Math.round(week?.cardio ?? 0), Math.round(thisWorkout.aerobicSec / 60));
  const strengthMin = Math.max(Math.round(week?.strength ?? 0), Math.round(thisWorkout.strengthSec / 60));
  const goal = goalMin > 0 ? goalMin : 150;
  const aerobicFrac = Math.min(1, aerobicMin / goal);
  const strengthFrac = Math.min(1 - aerobicFrac, strengthMin / goal);
  return { aerobicMin, strengthMin, totalMin: aerobicMin + strengthMin, goalMin: goal, aerobicFrac, strengthFrac };
}
