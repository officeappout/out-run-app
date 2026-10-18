/**
 * weekStartScheduler — Scheduled Cloud Function (v2 scheduler).
 *
 * PURPOSE
 * ───────
 * Owner decision 18.10.2026: users who keep Shabbat (Settings → "שמירת שבת",
 * `users/{uid}.settings.shabbatObserver === true`) get no pushes from Friday
 * afternoon until motzei Shabbat (see services/shabbat.service.ts). This sends
 * them ONE short week-start nudge on motzei Shabbat — "שבוע טוב" + an invite
 * to plan the first workout of the week.
 *
 * WHEN
 * ────
 * Saturday 21:15 Asia/Jerusalem — 45 minutes after the Shabbat window ends
 * (20:30) and before quiet hours (22:00). The handler re-checks the time with
 * isMotzeiShabbatWeekStartTime(), which is false when a yom tov starts on
 * Sunday (the rest window then continues through Saturday night) — that week
 * is simply skipped, no deferred send.
 *
 * WHO
 * ───
 * Query: users where settings.shabbatObserver == true, ordered by document
 * id, cursor-paginated (PAGE_SIZE × MAX_PAGES). Equality on one field +
 * orderBy __name__ is served by Firestore's automatic single-field index —
 * no composite index needed. `.select()` keeps the read to the fields used
 * by the cheap pre-filter (push master switch, week_start toggle, tokens).
 *
 * DELIVERY
 * ────────
 * One sendPush() per page on channel 'week_start' (in ENGAGEMENT_CHANNELS, so
 * it counts toward the user's daily engagement cap / notificationFrequency;
 * the per-channel toggle `settings.notificationPrefs.week_start` turns it
 * off). rateCapHours: 72 makes a retried/duplicate run a no-op for the week.
 * Own channel rather than 'training_reminder' so this Saturday-night push
 * never rate-caps Sunday morning's training reminder (22h cap on that one).
 *
 * Copy rotates by week (everyone gets the same variant on a given Saturday),
 * gender-neutral, no emoji. Deep link: /home.
 *
 * ENVIRONMENT VARIABLES (optional)
 * ────────────────────────────────
 *   WEEK_START_TEST_MODE — 'true' logs intent, makes no sendPush() calls.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendPush } from './services/push.service';
import {
  isMotzeiShabbatWeekStartTime,
  isShabbatObserver,
  SHABBAT_OBSERVER_FIELD,
} from './services/shabbat.service';

if (!admin.apps.length) {
  admin.initializeApp();
}

// ─── Config ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 300;
const MAX_PAGES = 20; // 6000 observers per run
const TEST_MODE = process.env.WEEK_START_TEST_MODE === 'true';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const WEEK_START_DEEP_LINK = '/home';

export const WEEK_START_VARIANTS: ReadonlyArray<{ title: string; body: string }> = [
  { title: 'שבוע טוב', body: 'שבוע חדש מתחיל. נקבע אימון ראשון למחר?' },
  { title: 'שבוע טוב', body: 'מתחילים את השבוע בתנועה. כמה דקות מחר כבר עושות את ההבדל.' },
  { title: 'שבוע חדש מתחיל', body: 'מה האימון הראשון שלך השבוע? אפשר לקבוע אותו כבר עכשיו.' },
];

/** Same variant for everyone on a given Saturday, rotating week to week. Exported for tests. */
export function buildWeekStartMessage(now: Date = new Date()): { variant: number; title: string; body: string } {
  const variant = Math.floor(now.getTime() / WEEK_MS) % WEEK_START_VARIANTS.length;
  return { variant, ...WEEK_START_VARIANTS[variant] };
}

/**
 * Cheap pre-filter on the selected user fields: an observer, push on, the
 * week_start toggle not off, at least one token. sendPush() re-applies prefs,
 * caps and quiet hours authoritatively. Exported for tests.
 */
export function isWeekStartRecipient(data: Record<string, unknown> | undefined): boolean {
  const settings = data?.settings as Record<string, unknown> | undefined;
  if (!isShabbatObserver(settings)) return false;
  if (settings?.pushEnabled === false) return false;
  const prefs = settings?.notificationPrefs as Record<string, unknown> | undefined;
  if (prefs?.week_start === false) return false;
  const tokens = data?.fcmTokens;
  return Array.isArray(tokens) && tokens.some((t) => typeof t === 'string' && t.length > 0);
}

export interface WeekStartRunResult {
  ran: boolean;
  candidates: number;
  delivered: number;
  skipped: number;
}

/** The run itself, separated from onSchedule for tests. */
export async function runWeekStart(now: Date = new Date()): Promise<WeekStartRunResult> {
  const out: WeekStartRunResult = { ran: false, candidates: 0, delivered: 0, skipped: 0 };

  if (!isMotzeiShabbatWeekStartTime(now)) {
    logger.info('[weekStart] Not motzei Shabbat (or a yom tov continues) — skipping run.');
    return out;
  }
  out.ran = true;

  const { variant, title, body } = buildWeekStartMessage(now);
  const db = admin.firestore();
  let cursor: admin.firestore.QueryDocumentSnapshot | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    let q = db
      .collection('users')
      .where(SHABBAT_OBSERVER_FIELD, '==', true)
      .orderBy(admin.firestore.FieldPath.documentId())
      .select('settings', 'fcmTokens')
      .limit(PAGE_SIZE);
    if (cursor) q = q.startAfter(cursor);

    let snap: admin.firestore.QuerySnapshot;
    try {
      snap = await q.get();
    } catch (err: unknown) {
      logger.error('[weekStart] observer query failed', err);
      break;
    }

    const uids = snap.docs
      .filter((d) => isWeekStartRecipient(d.data() as Record<string, unknown>))
      .map((d) => d.id);
    out.candidates += uids.length;

    if (uids.length > 0) {
      if (TEST_MODE) {
        logger.warn(`[weekStart] TEST_MODE — would push ${uids.length} uid(s), variant=${variant}`);
      } else {
        try {
          const r = await sendPush({
            toUids: uids,
            channel: 'week_start',
            title,
            body,
            deepLink: WEEK_START_DEEP_LINK,
            data: { triggerType: 'WeekStart', variant: String(variant) },
            rateCapHours: 72,
          });
          out.delivered += r.delivered;
          out.skipped +=
            r.skippedRateCap + r.skippedPrefs + r.skippedDailyCap +
            r.skippedQuietHours + r.skippedShabbat + r.skippedGlobalKill;
        } catch (err: unknown) {
          logger.error(`[weekStart] sendPush failed for page ${page}`, err);
        }
      }
    }

    if (snap.docs.length < PAGE_SIZE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }

  logger.info(
    `[weekStart] Run complete — candidates=${out.candidates} delivered=${out.delivered} ` +
      `skipped=${out.skipped} variant=${variant}`,
  );
  return out;
}

export const weekStartScheduler = onSchedule(
  {
    schedule: '15 21 * * 6',
    timeZone: 'Asia/Jerusalem',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    await runWeekStart();
  },
);
