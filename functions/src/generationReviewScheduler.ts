/**
 * generationReviewScheduler — Scheduled Cloud Function (v2 scheduler), 05:30 Asia/Jerusalem.
 *
 * Drives the nightly generation review (flag enable_generation_review): every generated session
 * logged in generation_log and not yet reviewed goes through the invariant rules (+ the optional
 * Sonnet pass, enable_generation_review_llm) → generation_reviews / generation_review_stats, shown
 * on /admin/generation-review.
 *
 * The work lives in the Next.js app (POST /api/admin/generation-review/run — the rules, the AI
 * wrapper and budget are there). This function calls the route in slices (≤ ~40 s each) via the
 * same loop driver as the Kelly review (lib/aiReviewLoop.ts) until nothing is left, the daily
 * cap or the deadline. Nothing here writes Firestore.
 *
 * DEPLOY (once; the secret is the one aiCoachReviewScheduler already uses):
 *   firebase deploy --only functions:generationReviewScheduler
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { runReviewLoop, type RunSliceResponse } from './lib/aiReviewLoop';

const AI_REVIEW_CRON_SECRET = defineSecret('AI_REVIEW_CRON_SECRET');

/** The production app (src/lib/config/app-urls.ts WEB_BASE_URL). */
const RUN_URL = 'https://outrun.co.il/api/admin/generation-review/run';
const MAX_SESSIONS_PER_DAY = 8000;
const TIMEOUT_SECONDS = 540;

export const generationReviewScheduler = onSchedule(
  {
    schedule: '30 5 * * *',
    timeZone: 'Asia/Jerusalem',
    timeoutSeconds: TIMEOUT_SECONDS,
    memory: '256MiB',
    retryCount: 0,
    secrets: [AI_REVIEW_CRON_SECRET],
  },
  async () => {
    const secret = AI_REVIEW_CRON_SECRET.value();
    if (!secret) {
      logger.warn('[generationReviewScheduler] AI_REVIEW_CRON_SECRET is not set — skipping');
      return;
    }
    const started = Date.now();
    const result = await runReviewLoop(
      async (maxThreads): Promise<RunSliceResponse> => {
        const res = await fetch(RUN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
          body: JSON.stringify({ maxThreads }),
          signal: AbortSignal.timeout(70_000),
        });
        if (!res.ok) throw new Error(`run route HTTP ${res.status}`);
        return (await res.json()) as RunSliceResponse;
      },
      { maxThreads: MAX_SESSIONS_PER_DAY, deadlineMs: started + (TIMEOUT_SECONDS - 75) * 1000, maxCalls: 60 },
    );
    logger.info('[generationReviewScheduler] done', result);
  },
);
