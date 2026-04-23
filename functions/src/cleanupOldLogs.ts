/**
 * cleanupOldLogs — monthly retention sweeper for /audit_logs.
 *
 * Compliance basis
 * ────────────────
 * OUT Standard requires that audit data be retained no longer than
 * 24 months. This scheduled function runs on the 1st of every month at
 * 03:00 UTC and deletes any /audit_logs/{doc} whose `timestamp` field
 * is older than 24 calendar months.
 *
 * Implementation notes
 * ────────────────────
 *   • Uses paged BatchedWrites (max 500 per batch — Firestore limit).
 *   • Tagged 'us-central1' to align with the rest of the function set.
 *   • `dryRun` is logged but not exposed to callers — this is purely
 *     a scheduler-driven function.
 *   • The retention window is configurable via env var
 *     AUDIT_LOG_RETENTION_MONTHS (defaults to 24).
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const RETENTION_MONTHS = (() => {
  const raw = Number(process.env.AUDIT_LOG_RETENTION_MONTHS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 24;
})();

const BATCH_SIZE = 400; // safely under Firestore's 500-write batch ceiling

function cutoffDate(now = new Date()): Date {
  const c = new Date(now);
  c.setMonth(c.getMonth() - RETENTION_MONTHS);
  return c;
}

async function deleteOlderThan(cutoff: Date): Promise<number> {
  let totalDeleted = 0;
  // Loop until no more matching docs.
  // Each pass: query → batch-delete → repeat.
  // Bounded to a few hundred passes by FN timeout (540s default).
  // For the audit_logs volume (a few rows per admin action), one sweep
  // per month is more than sufficient.
   
  while (true) {
    const snap = await db
      .collection('audit_logs')
      .where('timestamp', '<', admin.firestore.Timestamp.fromDate(cutoff))
      .limit(BATCH_SIZE)
      .get();

    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    totalDeleted += snap.size;

    // If we got fewer than BATCH_SIZE we're done.
    if (snap.size < BATCH_SIZE) break;
  }

  return totalDeleted;
}

export const cleanupOldLogs = onSchedule(
  {
    schedule: '0 3 1 * *', // 03:00 UTC on the 1st of every month
    timeZone: 'Etc/UTC',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '256MiB',
  },
  async () => {
    const cutoff = cutoffDate();
    logger.info(
      `[cleanupOldLogs] Starting sweep — deleting audit_logs older than ${cutoff.toISOString()} ` +
        `(retention=${RETENTION_MONTHS} months)`,
    );

    try {
      const deleted = await deleteOlderThan(cutoff);
      logger.info(
        `[cleanupOldLogs] Sweep complete — deleted ${deleted} document(s) older than ${cutoff.toISOString()}`,
      );
    } catch (err: any) {
      logger.error('[cleanupOldLogs] Sweep failed:', err?.message, err?.stack);
      throw err;
    }
  },
);
