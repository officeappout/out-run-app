/**
 * POST /api/ai-coach/proactive/run — one slice of the proactive Kelly run
 * (src/lib/ai/coach/proactive/run.server.ts). Kelly phase 3, flag ai_coach_proactive.
 *
 * Callers:
 *   - kellyProactiveScheduler (Cloud Function, every 15 min): Authorization: Bearer
 *     <AI_REVIEW_CRON_SECRET> (the same machine secret as the review run). It calls again
 *     with the returned `cursor` while `remaining` is true.
 *   - a super admin (Firebase ID token), e.g. a dry run from a terminal.
 *
 * Body: { cursor?: string, dryRun?: boolean }. Each call stops starting new users after
 * ~40 s (Vercel caps the route at 60 s). Flag off → { stoppedBy: 'flag_off' }, nothing read.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { isReviewCronCaller } from '@/lib/ai/review/cron-auth.server';
import { runProactiveSlice } from '@/lib/ai/coach/proactive/run.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BodySchema = z.object({ cursor: z.string().max(200).nullable().optional(), dryRun: z.boolean().optional() }).strict();

export async function POST(request: NextRequest) {
  if (!isReviewCronCaller(request)) {
    const denied = await requireSuperAdminApi(request);
    if (denied) return denied;
  }
  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  try {
    const result = await runProactiveSlice(getAdminDb(), { cursor: parsed.data.cursor ?? null, dryRun: parsed.data.dryRun, timeBudgetMs: 40_000 });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[kelly-proactive/run] failed', err);
    return NextResponse.json({ error: 'run_failed' }, { status: 500 });
  }
}
