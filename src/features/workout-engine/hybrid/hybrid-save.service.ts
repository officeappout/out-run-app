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
 * ⚠️ NOT wired into any live path yet. Going live requires suppressing
 * useRunningPlayer.finishWorkout()'s own auto-save (it would otherwise double-write
 * + double-count) — that is the pre-live-save review gate.
 * XP/coins: display-only (design §8). earnedCoins:0; no awardWorkoutXP call here.
 */

import type { WorkoutHistoryEntry } from '../core/services/storage.service';
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
  return entry;
}

/**
 * Persist the hybrid session (single doc). Dynamic import keeps this module free
 * of Firebase at load time. NOT called from any live path yet — see header.
 */
export async function saveHybridWorkout(
  result: HybridFinalizeResult,
  meta: HybridSaveMeta,
): Promise<string | null> {
  const { saveWorkout } = await import('../core/services/storage.service');
  return saveWorkout(buildHybridWorkoutEntry(result, meta));
}
