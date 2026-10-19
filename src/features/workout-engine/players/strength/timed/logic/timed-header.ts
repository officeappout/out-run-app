/**
 * timed-header — the story bars over the timed player (pure). One bar per
 * segment of the workout; the timed block is the wide current bar that fills
 * with the block's time (boards A-2b, A-5b: "the finisher is one wide bar").
 */
import type { WorkoutPlan } from '@/features/parks/core/types/route.types';
import { STRIP_COLORS } from '@/features/workout-engine/engines/strip-item';

export interface SegmentBars {
  segments: Array<{ key: string; color: string; doneColor: string }>;
  currentIndex: number;
}

/** Fill of the current (live) bar. */
export const LIVE_BAR_COLOR = '#0284c7';

export function segmentBars(workout: Pick<WorkoutPlan, 'segments'>, segmentIndex: number): SegmentBars {
  const segments: SegmentBars['segments'] = [];
  let currentIndex = 0;
  workout.segments.forEach((s, i) => {
    if (!(s.exercises && s.exercises.length > 0)) return;
    if (i === segmentIndex) currentIndex = segments.length;
    segments.push({ key: s.id || `seg-${i}`, color: LIVE_BAR_COLOR, doneColor: STRIP_COLORS.strength });
  });
  return { segments, currentIndex };
}

/** 0–1 progress of the block from the view's clock. */
export function blockProgress(activeMs: number, totalMs: number): number {
  if (!(totalMs > 0)) return 0;
  return Math.max(0, Math.min(1, activeMs / totalMs));
}

export interface MixedBar {
  isActive: boolean;
  isCurrent: boolean;
  /** Width weight when not current (a timed block is one wide bar). */
  weight?: number;
}

/** Width of a timed block's single bar in the classic header (board A-5b). */
export const TIMED_BAR_WEIGHT = 4;

/**
 * Story bars of the CLASSIC header in a workout that also has timed blocks
 * (board A-5b): one bar per set of a classic segment, ONE wide bar per timed
 * block. Positional per segment (earlier = done, later = upcoming; inside the
 * current classic segment the logged sets are done), so a block's many
 * per-round values never push the classic bars forward.
 */
export function mixedStoryBars(
  workout: Pick<WorkoutPlan, 'segments'>,
  opts: {
    currentSegmentIndex: number;
    isTimed: (segmentIndex: number) => boolean;
    setsOf: (segmentIndex: number) => number;
    loggedSetsOf: (segmentIndex: number) => number;
  },
): MixedBar[] {
  const bars: MixedBar[] = [];
  workout.segments.forEach((s, i) => {
    if (!(s.exercises && s.exercises.length > 0)) return;
    const past = i < opts.currentSegmentIndex;
    const cur = i === opts.currentSegmentIndex;
    if (opts.isTimed(i)) {
      bars.push({ isActive: past, isCurrent: cur, weight: TIMED_BAR_WEIGHT });
      return;
    }
    const n = Math.max(0, opts.setsOf(i));
    const done = past ? n : cur ? Math.min(n, Math.max(0, opts.loggedSetsOf(i))) : 0;
    for (let k = 0; k < n; k++) bars.push({ isActive: k < done, isCurrent: cur && k === done });
  });
  return bars;
}
