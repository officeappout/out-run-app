import type { WorkoutHistoryEntry } from '../core/services/storage.service';
import type { HybridFinalizeResult, HybridRunSummary } from './hybrid-orchestrator';

/**
 * Rebuilds a HybridFinalizeResult from a saved WorkoutHistoryEntry, so the
 * history view can render the real HybridSummary instead of a strength
 * fallback. `segments` is a byte-compatible passthrough — same
 * SessionSegmentRecord[] type finalizeHybridRun writes. `summary` isn't
 * persisted as its own field, so it's recomputed here the same way
 * finalizeHybridRun does; completion is read off `endedAtMs` (the persisted
 * proxy for the live actual.completed flag, which SegmentMetrics never
 * stores), matching what HybridSummary's own buildRailItems already assumes.
 */
export function workoutHistoryEntryToHybridFinalizeResult(
  entry: WorkoutHistoryEntry,
): HybridFinalizeResult {
  const segments = entry.segments ?? [];

  const summary: HybridRunSummary = {
    segmentCount: segments.length,
    completedAerobicSegments: 0,
    completedStrengthSegments: 0,
    totalActualAerobicSec: 0,
    totalActualDistanceKm: 0,
    totalStrengthSets: 0,
    bothHalvesCompleted: false,
  };

  for (const seg of segments) {
    // endedAtMs stands in for the live actual.completed boolean, which
    // SegmentMetrics never persists. The two are equivalent today because
    // every completion call site in useHybridRun.ts passes atMs alongside
    // completed:true — if that ever decouples, this would silently
    // undercount a segment marked complete without an endedAtMs.
    if (!seg.endedAtMs) continue;
    if (seg.kind === 'aerobic') {
      summary.completedAerobicSegments += 1;
      summary.totalActualAerobicSec += seg.actual?.durationSec ?? 0;
      summary.totalActualDistanceKm += seg.actual?.distanceKm ?? 0;
    } else {
      summary.completedStrengthSegments += 1;
      summary.totalStrengthSets += seg.actual?.sets ?? 0;
    }
  }
  summary.totalActualDistanceKm = Number(summary.totalActualDistanceKm.toFixed(3));
  summary.bothHalvesCompleted =
    summary.completedAerobicSegments > 0 && summary.completedStrengthSegments > 0;

  return { segments, summary };
}
