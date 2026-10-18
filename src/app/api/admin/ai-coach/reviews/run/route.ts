/**
 * POST /api/admin/ai-coach/reviews/run — runs one slice of the daily AI coach conversation
 * review (src/lib/ai/review/reviewer.server.ts).
 *
 * Callers:
 *   - aiCoachReviewScheduler (Cloud Function, 06:00 Israel): Authorization: Bearer
 *     <AI_REVIEW_CRON_SECRET>. It calls repeatedly while `remaining` is true, passing the
 *     threads left of the 200-per-day cap as maxThreads.
 *   - a super admin from /admin/ai-coach/reviews ("run now"): Firebase ID token.
 *
 * Body: { maxThreads?: number, dryRun?: boolean }. Each call stops starting new threads
 * after ~45 s (Vercel caps the route at 60 s) and reports what is left.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { runAiCoachReview } from '@/lib/ai/review/reviewer.server';
import { isReviewCronCaller } from '@/lib/ai/review/cron-auth.server';
import { AI_REVIEW_MAX_THREADS_PER_RUN } from '@/lib/ai/review/review-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BodySchema = z
  .object({
    maxThreads: z.number().int().min(0).max(AI_REVIEW_MAX_THREADS_PER_RUN).optional(),
    dryRun: z.boolean().optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  if (!isReviewCronCaller(request)) {
    const denied = await requireSuperAdminApi(request);
    if (denied) return denied;
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  try {
    const result = await runAiCoachReview(getAdminDb(), {
      maxThreads: parsed.data.maxThreads,
      dryRun: parsed.data.dryRun,
      timeBudgetMs: 45_000,
    });
    const { dryRunDocs, ...rest } = result;
    return NextResponse.json({
      ...rest,
      // A dry run returns only counts per review (never the transcripts) to the caller.
      ...(dryRunDocs ? { dryRun: dryRunDocs.map((d) => ({ turns: d.turns.length, issues: d.issues.length, score: d.score })) } : {}),
    });
  } catch (err) {
    console.error('[ai-review/run] failed', err);
    return NextResponse.json({ error: 'review_failed' }, { status: 500 });
  }
}
