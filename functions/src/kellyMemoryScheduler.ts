/**
 * kellyMemoryScheduler — Scheduled Cloud Function (v2), 03:30 Asia/Jerusalem.
 *
 * Kelly phase 3 memory (flag system_config/feature_flags.ai_coach_memory, default off):
 * drives POST /api/ai-coach/memory/run in slices (lib/cursorRunLoop.ts). The extraction (a
 * fast-model pass over the day's user messages, the rules filter, the merge) lives in the
 * Next.js app (src/lib/ai/coach/memory). Off: one flag read in the route, nothing written.
 * Nothing here writes Firestore.
 *
 * DEPLOY (same secret as aiCoachReviewScheduler):
 *   firebase deploy --only functions:kellyMemoryScheduler
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { runCursorLoop, type CursorSliceResponse } from './lib/cursorRunLoop';

const AI_REVIEW_CRON_SECRET = defineSecret('AI_REVIEW_CRON_SECRET');
const RUN_URL = 'https://outrun.co.il/api/ai-coach/memory/run';
const TIMEOUT_SECONDS = 540;

export const kellyMemoryScheduler = onSchedule(
  {
    schedule: '30 3 * * *',
    timeZone: 'Asia/Jerusalem',
    timeoutSeconds: TIMEOUT_SECONDS,
    memory: '256MiB',
    retryCount: 0,
    secrets: [AI_REVIEW_CRON_SECRET],
  },
  async () => {
    const secret = AI_REVIEW_CRON_SECRET.value();
    if (!secret) {
      logger.warn('[kellyMemoryScheduler] AI_REVIEW_CRON_SECRET is not set — skipping');
      return;
    }
    const started = Date.now();
    const result = await runCursorLoop(
      async (cursor): Promise<CursorSliceResponse> => {
        const res = await fetch(RUN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
          body: JSON.stringify(cursor ? { cursor } : {}),
          signal: AbortSignal.timeout(70_000),
        });
        if (!res.ok) throw new Error(`run route HTTP ${res.status}`);
        return (await res.json()) as CursorSliceResponse;
      },
      { deadlineMs: started + (TIMEOUT_SECONDS - 75) * 1000, maxCalls: 40 },
    );
    logger.info('[kellyMemoryScheduler] done', result);
  },
);
