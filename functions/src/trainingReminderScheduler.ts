/**
 * trainingReminderScheduler — Scheduled Cloud Function.
 *
 * PURPOSE
 * ───────
 * Sends a morning reminder to users who have a training session scheduled
 * for today but have not yet completed it.
 *
 * DATA SOURCE
 * ───────────
 * Collection: `userSchedule`
 * Doc ID format: `{uid}_{YYYY-MM-DD}`
 * Doc shape: { userId, date, entries: UserScheduleEntry[], updatedAt }
 *
 * The reminder content is derived from the scheduled entry's `scheduledCategories`
 * field (already denormalised on the doc) so we don't need to fetch the full
 * program document. This fulfils the requirement to connect content to the actual
 * workout ("הכל קשור להכל").
 *
 * Category → Hebrew label mapping:
 *   strength    → "אימון כוח"
 *   cardio      → "ריצה"
 *   maintenance → "תרגול החזקה"
 *   walking     → "הליכה"
 *   (none)      → "אימון"
 *
 * SCHEDULE
 * ────────
 * Runs daily at 07:30 Asia/Jerusalem — early enough to motivate, late enough
 * that most users are awake. push.service.ts quiet-hours check is bypassed
 * (skipQuietHours=true) since 07:30 is just outside the 22:00–07:00 window.
 *
 * ENVIRONMENT VARIABLES (optional overrides for testing)
 * ───────────────────────────────────────────────────────
 *   TRAINING_REMINDER_BATCH    — max docs to process per run (default 500)
 *   TRAINING_REMINDER_TEST_MODE — if 'true', logs intent, skips FCM + writes
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendPush } from './services/push.service';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ─── Config ───────────────────────────────────────────────────────────────────

const BATCH_LIMIT = (() => {
  const raw = Number(process.env.TRAINING_REMINDER_BATCH);
  return Number.isFinite(raw) && raw > 0 && raw <= 1000 ? raw : 500;
})();

const TEST_MODE = process.env.TRAINING_REMINDER_TEST_MODE === 'true';

// ─── Category → label ─────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
  strength: 'אימון כוח',
  cardio: 'ריצה',
  maintenance: 'תרגול החזקה',
  walking: 'הליכה',
};

function categoryLabel(categories: string[] | undefined): string {
  if (!categories || categories.length === 0) return 'אימון';
  const labels = categories
    .map((c) => CATEGORY_LABEL[c])
    .filter(Boolean);
  return labels.length > 0 ? labels.join(' + ') : 'אימון';
}

// ─── Body templates ───────────────────────────────────────────────────────────
// Rotated once per day (not per-user) so the copy stays fresh day-to-day while
// preserving same-day batching (all users on a given day share one message key).
const BODY_VARIANTS: string[] = [
  'האימון שלך מחכה — פתח את האפליקציה ותתחיל.',
  'הזמן שלך להתאמן הגיע. אפילו 15 דקות עושות את ההבדל 💪',
  'רגע קטן לעצמך היום — האימון שלך מוכן ומחכה בפארק.',
];

/** Deterministic day-of-year index so every user in a single run gets the same body. */
function pickBody(): string {
  const now = new Date();
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
  return BODY_VARIANTS[dayOfYear % BODY_VARIANTS.length];
}

/** Build push content from a scheduled entry's categories. */
function buildMessage(workoutLabel: string, startTime?: string): { title: string; body: string } {
  const timeHint = startTime ? ` ב-${startTime}` : ' היום';
  return {
    title: `📅 ${workoutLabel}${timeHint}`,
    body: pickBody(),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Return today's ISO date string in Israel timezone (YYYY-MM-DD). */
function todayISO(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
}

// ─── Main export ──────────────────────────────────────────────────────────────

export const trainingReminderScheduler = onSchedule(
  {
    schedule: '30 7 * * *',
    timeZone: 'Asia/Jerusalem',
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async () => {
    const dateStr = todayISO();
    logger.info(
      `[training-reminder] Starting run for date=${dateStr} ` +
        `batchLimit=${BATCH_LIMIT} testMode=${TEST_MODE}`,
    );

    // Query all userSchedule docs for today.
    let docs: admin.firestore.QueryDocumentSnapshot[];
    try {
      const snap = await db
        .collection('userSchedule')
        .where('date', '==', dateStr)
        .limit(BATCH_LIMIT)
        .get();
      docs = snap.docs;
    } catch (err: unknown) {
      logger.error('[training-reminder] Firestore query failed', err);
      return;
    }

    logger.info(`[training-reminder] ${docs.length} schedule doc(s) found for ${dateStr}`);

    // ── Per-user: find an uncompleted training entry ──────────────────────
    interface UserWorkout {
      uid: string;
      workoutLabel: string;
      startTime?: string;
    }

    const targets: UserWorkout[] = [];

    for (const doc of docs) {
      const data = doc.data() as {
        userId?: string;
        entries?: Array<{
          type?: string;
          completed?: boolean;
          scheduledCategories?: string[];
          startTime?: string;
        }>;
      };

      const uid = data.userId;
      if (!uid) continue;

      const entries = Array.isArray(data.entries) ? data.entries : [];
      // Find first uncompleted training entry for today
      const trainEntry = entries.find(
        (e) => e.type === 'training' && e.completed !== true,
      );
      if (!trainEntry) continue;

      // Skip if the workout's startTime has already passed (no point reminding after the fact)
      if (trainEntry.startTime) {
        const [hh, mm] = trainEntry.startTime.split(':').map(Number);
        if (Number.isFinite(hh) && Number.isFinite(mm)) {
          const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
          if (hh * 60 + mm <= nowIST.getHours() * 60 + nowIST.getMinutes()) continue;
        }
      }

      targets.push({
        uid,
        workoutLabel: categoryLabel(trainEntry.scheduledCategories),
        startTime: trainEntry.startTime,
      });
    }

    logger.info(`[training-reminder] ${targets.length} user(s) with uncompleted training today`);

    if (targets.length === 0) return;

    if (TEST_MODE) {
      targets.forEach((t) =>
        logger.warn(
          `[training-reminder] TEST_MODE — would push uid=${t.uid} ` +
            `workout="${t.workoutLabel}" startTime=${t.startTime ?? 'none'}`,
        ),
      );
      return;
    }

    // ── Group by message so we batch-send identical content together ──────
    // Key = "title|body" to allow reuse of same sendPush call for same workout type
    const byMessage = new Map<string, { uids: string[]; title: string; body: string }>();

    for (const t of targets) {
      const msg = buildMessage(t.workoutLabel, t.startTime);
      const key = `${msg.title}|${msg.body}`;
      if (!byMessage.has(key)) {
        byMessage.set(key, { uids: [], title: msg.title, body: msg.body });
      }
      byMessage.get(key)!.uids.push(t.uid);
    }

    let totalDelivered = 0;

    for (const [, { uids, title, body }] of Array.from(byMessage.entries()) as [string, { uids: string[]; title: string; body: string }][]) {
      try {
        const result = await sendPush({
          toUids: uids,
          channel: 'training_reminder',
          title,
          body,
          deepLink: '/',
          data: { triggerType: 'ScheduledWorkout', date: dateStr },
          rateCapHours: 22, // ~1 per day — slightly under 24h to avoid drift
          skipQuietHours: true,
        });
        totalDelivered += result.delivered;
        logger.info(
          `[training-reminder] "${title}" uids=${uids.length} ` +
            `result=${JSON.stringify(result)}`,
        );
      } catch (err: unknown) {
        logger.error(`[training-reminder] sendPush failed for "${title}"`, err);
      }
    }

    logger.info(
      `[training-reminder] Run complete — targets=${targets.length} delivered=${totalDelivered}`,
    );
  },
);
