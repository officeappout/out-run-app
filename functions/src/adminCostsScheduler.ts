/**
 * adminCostsScheduler — Scheduled Cloud Function (v2 scheduler), daily 05:30 Asia/Jerusalem.
 *
 * Refreshes the admin "עלויות" dashboard: POST /api/admin/costs/refresh runs every cost
 * connector (AI ledger, Anthropic, Google Cloud billing export, Vercel, Bunny, GitHub) inside
 * the Next.js app and stores admin_costs/{month}. On days 1–5 the route also re-reads the
 * previous month. Nothing here writes Firestore or holds a vendor key — the keys live in Vercel.
 *
 * Auth: the existing AI_REVIEW_CRON_SECRET (same secret aiCoachReviewScheduler uses; the route
 * checks it with isReviewCronCaller). No new secret to create.
 *
 * DEPLOY (once, after merge, from main):
 *   firebase deploy --only functions:adminCostsScheduler
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';

const AI_REVIEW_CRON_SECRET = defineSecret('AI_REVIEW_CRON_SECRET');

/** The production app (src/lib/config/app-urls.ts WEB_BASE_URL). */
const REFRESH_URL = 'https://outrun.co.il/api/admin/costs/refresh';

export const adminCostsScheduler = onSchedule(
  {
    schedule: '30 5 * * *',
    timeZone: 'Asia/Jerusalem',
    timeoutSeconds: 120,
    memory: '256MiB',
    retryCount: 1,
    secrets: [AI_REVIEW_CRON_SECRET],
  },
  async () => {
    const secret = AI_REVIEW_CRON_SECRET.value();
    if (!secret) {
      logger.warn('[adminCostsScheduler] AI_REVIEW_CRON_SECRET is not set — skipping');
      return;
    }
    const res = await fetch(REFRESH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: '{}',
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`refresh route HTTP ${res.status}`);
    logger.info('[adminCostsScheduler] done', await res.json());
  },
);
