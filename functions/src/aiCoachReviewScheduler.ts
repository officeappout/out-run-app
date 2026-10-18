/**
 * aiCoachReviewScheduler — Scheduled Cloud Function (v2 scheduler), 06:00 Asia/Jerusalem.
 *
 * Triggers the daily review of the "קלי AI" chat: every thread with new messages since its
 * last review is graded (deterministic pre-checks + one Claude call) and stored in
 * ai_coach_reviews / ai_coach_review_stats for the panel page /admin/ai-coach/reviews.
 *
 * The work itself lives in the Next.js app (POST /api/admin/ai-coach/reviews/run — the
 * Anthropic SDK, the AI budget wrapper and the prompts are there, and functions/ has no
 * Anthropic dependency). This function only drives it: it calls the route in slices
 * (each ≤ ~45 s, Vercel's 60 s cap) until nothing is left or the 200-thread daily cap,
 * a budget stop or the deadline is reached (lib/aiReviewLoop.ts).
 *
 * Turning it off: app_config/ai.reviewBudgetUsd = 0 (the route answers review_off), or the
 * AI kill switch. Nothing here writes Firestore.
 *
 * DEPLOY (once):
 *   firebase functions:secrets:set AI_REVIEW_CRON_SECRET     # same value as the Vercel env var
 *   firebase deploy --only functions:aiCoachReviewScheduler
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { runReviewLoop, type RunSliceResponse } from './lib/aiReviewLoop';

const AI_REVIEW_CRON_SECRET = defineSecret('AI_REVIEW_CRON_SECRET');

/** The production app (src/lib/config/app-urls.ts WEB_BASE_URL). */
const RUN_URL = 'https://outrun.co.il/api/admin/ai-coach/reviews/run';
const MAX_THREADS_PER_DAY = 200;
const TIMEOUT_SECONDS = 540;

export const aiCoachReviewScheduler = onSchedule(
  {
    schedule: '0 6 * * *',
    timeZone: 'Asia/Jerusalem',
    timeoutSeconds: TIMEOUT_SECONDS,
    memory: '256MiB',
    retryCount: 0,
    secrets: [AI_REVIEW_CRON_SECRET],
  },
  async () => {
    const secret = AI_REVIEW_CRON_SECRET.value();
    if (!secret) {
      logger.warn('[aiCoachReviewScheduler] AI_REVIEW_CRON_SECRET is not set — skipping');
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
      // Leave a minute of the function timeout for the last in-flight slice.
      { maxThreads: MAX_THREADS_PER_DAY, deadlineMs: started + (TIMEOUT_SECONDS - 75) * 1000 },
    );
    logger.info('[aiCoachReviewScheduler] done', result);
  },
);
