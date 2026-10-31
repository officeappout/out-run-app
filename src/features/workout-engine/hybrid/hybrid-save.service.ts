/**
 * hybrid-save.service — build + persist the single hybrid workout doc (Phase 3b).
 *
 * `buildHybridWorkoutEntry` is PURE (unit-tested). `saveHybridWorkout` reuses the
 * existing `saveWorkout` writer — passing `activityType:'hybrid'` makes it derive
 * `{ workoutType:'hybrid', category:'hybrid', displayIcon:'activity' }`
 * (storage.service getWorkoutMetadata). The 3 finalize records are written to
 * `segments[]`; root distance/duration/calories stay session-wide aggregates so
 * existing history/league filters keep working (storage.service header contract).
 *
 * LIVE (doc-hygiene fix, 19.08.2026): called unconditionally from
 * useHybridRun.finishHybrid() whenever a uid exists. useRunningPlayer's own
 * auto-save is suppressed via hybridMode + runnerShouldSelfSave() (see
 * hybrid-finish-policy.ts) so this is the single write for a hybrid session,
 * not a double-write. (This comment previously said "NOT wired into any live
 * path yet" — that was stale; confirmed live during F1's investigation.)
 * XP/coins: display-only (design §8). earnedCoins:0; no awardWorkoutXP call here.
 */

import type { WorkoutHistoryEntry } from '../core/services/storage.service';
import type { Lap } from '../core/types/session.types';
import type { HybridFinalizeResult } from './hybrid-orchestrator';

export interface HybridSaveMeta {
  userId: string;
  aerobicKind: 'running' | 'walking';
  /** Session-wide estimated calories (aerobic + strength), display units. */
  totalCalories: number;
  routePath?: WorkoutHistoryEntry['routePath'];
  parkId?: string;
  parkName?: string;
  /** Display-only XP (design §8 — coins/awardWorkoutXP deferred). */
  displayXp?: number;
  /** The aerobic legs' laps (board PlayerSummaryCoverage): the same `laps` field run docs carry. */
  laps?: readonly Lap[];
}

/** Finished laps as plain Firestore-safe records (no aliases, no undefined, never the live lap). */
export function savedLaps(laps: readonly Lap[] | undefined): Lap[] {
  return (laps ?? [])
    .filter((l) => !l.isActive && Number.isFinite(l.distanceMeters) && l.distanceMeters > 0 && Number.isFinite(l.durationSeconds) && l.durationSeconds > 0)
    .map((l) => ({
      id: String(l.id),
      lapNumber: l.lapNumber,
      distanceMeters: Math.round(l.distanceMeters),
      durationSeconds: Math.round(l.durationSeconds),
      splitPace: Number.isFinite(l.splitPace) ? l.splitPace : 0,
      isActive: false,
    }));
}

export type HybridWorkoutDoc = Omit<
  WorkoutHistoryEntry,
  'id' | 'date' | 'workoutType' | 'category' | 'displayIcon'
>;

/**
 * Build the hybrid workout doc from a finalize result. Pure — no I/O.
 * Root aggregates: distance = total actual aerobic km, duration = total actual
 * seconds across ALL segments, pace = aerobic avg min/km.
 */
export function buildHybridWorkoutEntry(
  result: HybridFinalizeResult,
  meta: HybridSaveMeta,
): HybridWorkoutDoc {
  const { summary, segments } = result;
  const totalDurationSec = segments.reduce((acc, s) => acc + (s.actual?.durationSec ?? 0), 0);
  const distanceKm = summary.totalActualDistanceKm;
  const pace = distanceKm > 0
    ? Number(((summary.totalActualAerobicSec / 60) / distanceKm).toFixed(2))
    : 0;

  const entry: HybridWorkoutDoc = {
    userId: meta.userId,
    activityType: 'hybrid',
    distance: Number(distanceKm.toFixed(3)),
    duration: totalDurationSec,
    calories: meta.totalCalories,
    pace,
    earnedCoins: 0, // §8 — coins deferred until David signs off with the XP wiring
    segments,       // 3 records: legA / station / legB
    setsCompleted: summary.totalStrengthSets,
  };
  if (meta.displayXp != null) entry.xpEarned = meta.displayXp;
  if (meta.routePath) entry.routePath = meta.routePath;
  if (meta.parkId) entry.parkId = meta.parkId;
  if (meta.parkName) entry.parkName = meta.parkName;
  const laps = savedLaps(meta.laps);
  if (laps.length > 0) entry.laps = laps;
  return entry;
}

/**
 * Persist the hybrid session (single doc). Dynamic import keeps this module free
 * of Firebase at load time. Called unconditionally from useHybridRun.finishHybrid()
 * — see header.
 */
export async function saveHybridWorkout(
  result: HybridFinalizeResult,
  meta: HybridSaveMeta,
): Promise<string | null> {
  const { saveWorkout } = await import('../core/services/storage.service');
  return saveWorkout(buildHybridWorkoutEntry(result, meta));
}
