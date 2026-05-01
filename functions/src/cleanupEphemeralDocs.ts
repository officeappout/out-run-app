/**
 * cleanupEphemeralDocs — hourly retention sweeper for short-lived
 * realtime collections.
 *
 * Compliance basis
 * ────────────────
 * The privacy policy (PRIVACY_POLICY_HE §11 — מדיניות שמירת נתונים)
 * commits to:
 *   • `presence/{uid}` — deleted after 24 h of inactivity.
 *   • `active_workouts/{uid}` — deleted within 2 h of session end.
 *   • `planned_sessions/{id}` — deleted once `expiresAt` has passed
 *     (TTL is set to startTime + 2 h at creation; this sweep is the
 *     server-side guarantee because client-side cleanup is unreliable).
 *
 * These are best-effort cleared by the client (`clearPresence` /
 * `clearActiveWorkout`) when the user signs out / ends a workout, but
 * client cleanup is unreliable: an app crash, kill-from-tray, or lost
 * network at the moment of teardown leaves an orphaned doc that would
 * otherwise live forever (and continue to leak the user's last known
 * fuzzed location to the heatmap).
 *
 * This scheduled function is the server-side guarantee. It runs every
 * hour and prunes anything past the documented retention window.
 *
 * Implementation notes
 * ────────────────────
 *   • Sweeps each collection independently — failures in one do NOT
 *     block the other.
 *   • Uses paged BatchedWrites (max 400 per batch — safely under the
 *     500-write Firestore ceiling), looped until the result set is
 *     empty for that pass.
 *   • Tagged 'us-central1' to align with the rest of the function set;
 *     pinned in functions index for easy region migration in Phase 8.
 *   • Retention windows are configurable via env vars (mainly for
 *     emulator / smoke-testing) but default to the policy values:
 *       PRESENCE_RETENTION_HOURS         (default 24)
 *       ACTIVE_WORKOUT_RETENTION_HOURS   (default 2)
 *   • Idempotent: re-running the sweep is a no-op once everything is
 *     already inside the retention window.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const PRESENCE_RETENTION_HOURS = (() => {
  const raw = Number(process.env.PRESENCE_RETENTION_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 24;
})();

const ACTIVE_WORKOUT_RETENTION_HOURS = (() => {
  const raw = Number(process.env.ACTIVE_WORKOUT_RETENTION_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 2;
})();

// planned_sessions use an absolute `expiresAt` timestamp; we delete any doc
// whose expiry is in the past (cutoff = now = 0 additional hours of grace).
// Set PLANNED_SESSION_GRACE_HOURS > 0 in env to keep expired docs briefly.
const PLANNED_SESSION_GRACE_HOURS = (() => {
  const raw = Number(process.env.PLANNED_SESSION_GRACE_HOURS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 0;
})();

const BATCH_SIZE = 400;
const MS_PER_HOUR = 60 * 60 * 1000;

function cutoffHoursAgo(hours: number, now = new Date()): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.fromMillis(now.getTime() - hours * MS_PER_HOUR);
}

/**
 * Sweep `collection` deleting every doc whose `tsField` is older than
 * `cutoff`. Returns the number of documents removed.
 *
 * Uses the same loop-until-empty pagination pattern as cleanupOldLogs
 * so we stay safely below the 500-write batch ceiling and do not hold
 * a single multi-megabyte transaction open.
 */
async function sweepCollection(
  collection: string,
  tsField: string,
  cutoff: admin.firestore.Timestamp,
): Promise<number> {
  let totalDeleted = 0;
  while (true) {
    const snap = await db
      .collection(collection)
      .where(tsField, '<', cutoff)
      .limit(BATCH_SIZE)
      .get();

    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    totalDeleted += snap.size;

    if (snap.size < BATCH_SIZE) break;
  }
  return totalDeleted;
}

export const cleanupEphemeralDocs = onSchedule(
  {
    // Hourly at minute 7 — offset from common :00 bursts so we don't
    // contend with other scheduled jobs / external scrapers.
    schedule: '7 * * * *',
    timeZone: 'Etc/UTC',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '256MiB',
  },
  async () => {
    const presenceCutoff = cutoffHoursAgo(PRESENCE_RETENTION_HOURS);
    const activeWorkoutCutoff = cutoffHoursAgo(ACTIVE_WORKOUT_RETENTION_HOURS);
    const plannedSessionCutoff = cutoffHoursAgo(PLANNED_SESSION_GRACE_HOURS);

    logger.info(
      `[cleanupEphemeralDocs] Sweep start — ` +
        `presence<${presenceCutoff.toDate().toISOString()} (${PRESENCE_RETENTION_HOURS}h), ` +
        `active_workouts<${activeWorkoutCutoff.toDate().toISOString()} (${ACTIVE_WORKOUT_RETENTION_HOURS}h), ` +
        `planned_sessions expiresAt<${plannedSessionCutoff.toDate().toISOString()}`,
    );

    let presenceDeleted = 0;
    let activeWorkoutDeleted = 0;
    let plannedSessionDeleted = 0;

    // Run independently so a failure in one collection does not block
    // the other (e.g. transient index/contention errors on presence
    // should not leave stale active_workouts polluting the heatmap).
    try {
      presenceDeleted = await sweepCollection('presence', 'updatedAt', presenceCutoff);
    } catch (err: any) {
      logger.error('[cleanupEphemeralDocs] presence sweep failed:', err?.message, err?.stack);
    }

    try {
      activeWorkoutDeleted = await sweepCollection(
        'active_workouts',
        'lastUpdate',
        activeWorkoutCutoff,
      );
    } catch (err: any) {
      logger.error(
        '[cleanupEphemeralDocs] active_workouts sweep failed:',
        err?.message,
        err?.stack,
      );
    }

    try {
      plannedSessionDeleted = await sweepCollection(
        'planned_sessions',
        'expiresAt',
        plannedSessionCutoff,
      );
    } catch (err: any) {
      logger.error(
        '[cleanupEphemeralDocs] planned_sessions sweep failed:',
        err?.message,
        err?.stack,
      );
    }

    logger.info(
      `[cleanupEphemeralDocs] Sweep complete — presence=${presenceDeleted}, ` +
        `active_workouts=${activeWorkoutDeleted}, planned_sessions=${plannedSessionDeleted}`,
    );
  },
);
