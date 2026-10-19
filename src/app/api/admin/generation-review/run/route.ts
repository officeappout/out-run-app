/**
 * POST /api/admin/generation-review/run — one slice of the nightly generation review
 * (src/lib/generation-review/review/run.server.ts).
 *
 * Callers:
 *   - generationReviewScheduler (Cloud Function, 05:30 Israel): Authorization: Bearer
 *     <AI_REVIEW_CRON_SECRET> (the same secret as the Kelly review). Calls again while
 *     `remaining` is true.
 *   - a super admin from /admin/generation-review ("הרץ עכשיו"): Firebase ID token.
 *
 * Body: { maxThreads?: number (sessions; the loop driver's name), dryRun?: boolean }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { isReviewCronCaller } from '@/lib/ai/review/cron-auth.server';
import { GEN_REVIEW_MAX_SESSIONS_PER_RUN, runGenerationReview } from '@/lib/generation-review/review/run.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BodySchema = z
  .object({
    maxThreads: z.number().int().min(0).max(100_000).optional(),
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
    const result = await runGenerationReview(getAdminDb(), {
      maxSessions: Math.min(parsed.data.maxThreads ?? GEN_REVIEW_MAX_SESSIONS_PER_RUN, GEN_REVIEW_MAX_SESSIONS_PER_RUN),
      dryRun: parsed.data.dryRun,
      timeBudgetMs: 40_000,
    });
    // A dry run returns rule ids per session only (never the session content).
    const { dryRun, ...rest } = result;
    return NextResponse.json({ ...rest, ...(dryRun ? { dryRun: dryRun.map((d) => ({ type: d.type, rules: d.findings.map((f) => f.ruleId) })) } : {}) });
  } catch (err) {
    console.error('[generation-review/run] failed', err);
    return NextResponse.json({ error: 'review_failed' }, { status: 500 });
  }
}
