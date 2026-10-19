/**
 * kellyProactiveScheduler — Scheduled Cloud Function (v2), every 15 minutes, Asia/Jerusalem.
 *
 * Kelly phase 3 (flag system_config/feature_flags.ai_coach_proactive, default off): drives
 * POST /api/ai-coach/proactive/run in slices (lib/cursorRunLoop.ts). The run itself — who is
 * due, the caps, quiet hours, Shabbat, calm return, opt-out, the copy — lives in the Next.js
 * app (src/lib/ai/coach/proactive), next to the user sheet and the AI wrapper. It writes at
 * most one Kelly message per user per day; the push is sent by onKellyThreadMessage.
 *
 * Off: the route answers { stoppedBy: 'flag_off' } after one flag read; nothing is written.
 * Nothing here writes Firestore. Quiet hours (22:00–07:00) are skipped without a call.
 *
 * DEPLOY: uses the existing AI_REVIEW_CRON_SECRET secret (already set for
 * aiCoachReviewScheduler, same value as the Vercel env var):
 *   firebase deploy --only functions:kellyProactiveScheduler,functions:onKellyThreadMessage
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { runCursorLoop, type CursorSliceResponse } from './lib/cursorRunLoop';

const AI_REVIEW_CRON_SECRET = defineSecret('AI_REVIEW_CRON_SECRET');

/** The production app (src/lib/config/app-urls.ts WEB_BASE_URL). */
const RUN_URL = 'https://outrun.co.il/api/ai-coach/proactive/run';
const TIMEOUT_SECONDS = 300;

function israelHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hour: 'numeric', hourCycle: 'h23' }).format(now)) % 24;
}

export const kellyProactiveScheduler = onSchedule(
  {
    schedule: '*/15 * * * *',
    timeZone: 'Asia/Jerusalem',
    timeoutSeconds: TIMEOUT_SECONDS,
    memory: '256MiB',
    retryCount: 0,
    secrets: [AI_REVIEW_CRON_SECRET],
  },
  async () => {
    const hour = israelHour();
    if (hour >= 22 || hour < 7) return; // quiet hours: nothing can be sent
    const secret = AI_REVIEW_CRON_SECRET.value();
    if (!secret) {
      logger.warn('[kellyProactiveScheduler] AI_REVIEW_CRON_SECRET is not set — skipping');
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
      { deadlineMs: started + (TIMEOUT_SECONDS - 75) * 1000 },
    );
    if (result.stoppedBy !== 'flag_off') logger.info('[kellyProactiveScheduler] done', result);
  },
);
