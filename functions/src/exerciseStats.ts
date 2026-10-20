/**
 * Soft-adaptation Phase 0 (18.10.2026) — anonymous per-exercise counters for
 * the admin "תרגילים שמחליפים הכי הרבה" view (src/app/admin/exercises/swap-stats).
 *
 *   onExerciseSwapCreated       exercise_swaps/{swapId} create
 *     → exercise_stats/{fromExerciseId}: swappedAway, byDirection/byTab/
 *       bySource/byLocation/byReason, topReplacements.{toId}
 *     → exercise_stats/{toExerciseId}:   swappedTo
 *   onWorkoutCreateExerciseStats workouts/{docId} create
 *     → exercise_stats/{id}: prescribedCompleted / completedAsReplacement
 *       (the denominator for a swap RATE)
 *
 * Counts only — no uid is copied into exercise_stats. Pure reducers live in
 * lib/exercise-stats.ts (unit-tested). Exactly-once: each event writes a
 * marker exercise_stats_processed/{kind}_{docId} in the SAME transaction as
 * its increments (same pattern as onWorkoutCreateLeagueStats), so a retried
 * trigger never double-counts. Read by nothing that changes app behaviour.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  mergeUpdates,
  swapToStatsUpdates,
  toNestedPatch,
  workoutToStatsUpdates,
  type StatsUpdate,
} from './lib/exercise-stats';
import { isDemoUid } from './lib/demo';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

async function applyStatsUpdates(markerId: string, updates: StatsUpdate[]): Promise<'applied' | 'already' | 'empty'> {
  const merged = mergeUpdates(updates).filter((u) => Object.keys(u.increments).length > 0);
  if (merged.length === 0) return 'empty';
  const marker = db.collection('exercise_stats_processed').doc(markerId);
  return db.runTransaction(async (tx) => {
    if ((await tx.get(marker)).exists) return 'already' as const;
    for (const u of merged) {
      const patch = toNestedPatch(u.increments, u.labels, (n) => admin.firestore.FieldValue.increment(n));
      tx.set(
        db.collection('exercise_stats').doc(u.exerciseId),
        { ...patch, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    tx.set(marker, { at: admin.firestore.FieldValue.serverTimestamp() });
    return 'applied' as const;
  });
}

export const onExerciseSwapCreated = onDocumentCreated('exercise_swaps/{swapId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  if (isDemoUid(snap.data().userId)) return; // demo world guard
  try {
    await applyStatsUpdates(`swap_${event.params.swapId}`, swapToStatsUpdates(snap.data()));
  } catch (e) {
    logger.error('onExerciseSwapCreated failed', { swapId: event.params.swapId, e });
    throw e; // platform retry — the processed marker keeps it exactly-once
  }
});

export const onWorkoutCreateExerciseStats = onDocumentCreated('workouts/{docId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  // Demo world guard: simulated workouts never feed the global counters.
  if (isDemoUid(snap.data().userId)) return;
  const updates = workoutToStatsUpdates(snap.data());
  if (updates.length === 0) return; // non-strength / no per-set detail — nothing to count
  try {
    await applyStatsUpdates(`workout_${event.params.docId}`, updates);
  } catch (e) {
    logger.error('onWorkoutCreateExerciseStats failed', { workoutId: event.params.docId, e });
    throw e;
  }
});
