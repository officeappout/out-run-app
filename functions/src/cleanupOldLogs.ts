/**
 * cleanupOldLogs — monthly retention sweeper for long-lived log
 * collections.
 *
 * Compliance basis
 * ────────────────
 *   • /audit_logs           → 24 months  (OUT Standard / privacy §11)
 *   • /push_messages        → 90 days    (privacy §11 — "הודעות Push
 *                             שנשלחו: נמחקות אוטומטית לאחר 90 יום")
 *
 * This scheduled function runs on the 1st of every month at 03:00 UTC
 * and prunes both collections in a single pass so we have one cron
 * entry, one set of logs, and a single point to extend when adding
 * future log retentions.
 *
 * Push-messages sweep semantics
 * ──────────────────────────────
 * Only documents in a terminal state (sent / failed / no_recipients /
 * no_tokens / permanent_failure) are eligible. We use the presence of
 * `processedAt` as the terminal marker — `sendPushFromQueue` writes it
 * on every terminal branch and never on `pending` / `processing`. This
 * keeps stuck/in-flight rows around for investigation rather than
 * silently dropping them.
 *
 * Implementation notes
 * ────────────────────
 *   • Each collection sweep is independent — a failure in one MUST NOT
 *     skip the other (we still throw at the end if anything failed so
 *     the schedule alert fires, but we always attempt both).
 *   • Uses paged BatchedWrites (max 400 per batch — safely under
 *     Firestore's 500-write ceiling).
 *   • Tagged 'us-central1' to align with the rest of the function set.
 *   • Retention windows are configurable via env vars (mainly for
 *     emulator / smoke-testing) but default to the policy values:
 *       AUDIT_LOG_RETENTION_MONTHS    (default 24)
 *       PUSH_MESSAGES_RETENTION_DAYS  (default 90)
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const AUDIT_LOG_RETENTION_MONTHS = (() => {
  const raw = Number(process.env.AUDIT_LOG_RETENTION_MONTHS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 24;
})();

const PUSH_MESSAGES_RETENTION_DAYS = (() => {
  const raw = Number(process.env.PUSH_MESSAGES_RETENTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 90;
})();

const BATCH_SIZE = 400;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function monthsAgo(months: number, now = new Date()): admin.firestore.Timestamp {
  const c = new Date(now);
  c.setMonth(c.getMonth() - months);
  return admin.firestore.Timestamp.fromDate(c);
}

function daysAgo(days: number, now = new Date()): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.fromMillis(now.getTime() - days * MS_PER_DAY);
}

/**
 * Generic paged sweep: delete every doc in `collection` whose `tsField`
 * is older than `cutoff`. Returns count deleted. Caller chooses the
 * timestamp semantics (created vs processed vs updated).
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

export const cleanupOldLogs = onSchedule(
  {
    schedule: '0 3 1 * *', // 03:00 UTC on the 1st of every month
    timeZone: 'Etc/UTC',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '256MiB',
  },
  async () => {
    const auditCutoff = monthsAgo(AUDIT_LOG_RETENTION_MONTHS);
    const pushCutoff = daysAgo(PUSH_MESSAGES_RETENTION_DAYS);

    logger.info(
      `[cleanupOldLogs] Sweep start — ` +
        `audit_logs<${auditCutoff.toDate().toISOString()} (${AUDIT_LOG_RETENTION_MONTHS}mo), ` +
        `push_messages.processedAt<${pushCutoff.toDate().toISOString()} ` +
        `(${PUSH_MESSAGES_RETENTION_DAYS}d, terminal-state only)`,
    );

    const failures: string[] = [];
    let auditDeleted = 0;
    let pushDeleted = 0;

    try {
      auditDeleted = await sweepCollection('audit_logs', 'timestamp', auditCutoff);
    } catch (err: any) {
      logger.error('[cleanupOldLogs] audit_logs sweep failed:', err?.message, err?.stack);
      failures.push('audit_logs');
    }

    try {
      // `processedAt` is only ever populated on terminal-state writes
      // by sendPushFromQueue. Filtering on it implicitly excludes
      // `pending` and `processing` rows from the sweep — those are
      // in-flight and must not be deleted.
      pushDeleted = await sweepCollection('push_messages', 'processedAt', pushCutoff);
    } catch (err: any) {
      logger.error('[cleanupOldLogs] push_messages sweep failed:', err?.message, err?.stack);
      failures.push('push_messages');
    }

    logger.info(
      `[cleanupOldLogs] Sweep complete — audit_logs=${auditDeleted}, push_messages=${pushDeleted}` +
        (failures.length ? `, FAILED=${failures.join(',')}` : ''),
    );

    // Surface failures so the schedule alarm fires, but only AFTER
    // both sweeps have been attempted.
    if (failures.length) {
      throw new Error(`cleanupOldLogs sweep failed for: ${failures.join(', ')}`);
    }
  },
);
