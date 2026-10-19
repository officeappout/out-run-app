/**
 * POST /api/ai-coach/memory/run — one slice of the nightly Kelly memory pass
 * (src/lib/ai/coach/memory/run.server.ts). Kelly phase 3, flag ai_coach_memory.
 *
 * Callers: kellyMemoryScheduler (Cloud Function, 03:30 Israel) with Authorization: Bearer
 * <AI_REVIEW_CRON_SECRET>, calling again with `cursor` while `remaining`; or a super admin.
 * Body: { cursor?: string }. Flag off → { stoppedBy: 'flag_off' }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { isReviewCronCaller } from '@/lib/ai/review/cron-auth.server';
import { runMemorySlice } from '@/lib/ai/coach/memory/run.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BodySchema = z.object({ cursor: z.string().max(200).nullable().optional() }).strict();

export async function POST(request: NextRequest) {
  if (!isReviewCronCaller(request)) {
    const denied = await requireSuperAdminApi(request);
    if (denied) return denied;
  }
  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  try {
    return NextResponse.json(await runMemorySlice(getAdminDb(), { cursor: parsed.data.cursor ?? null, timeBudgetMs: 40_000 }));
  } catch (err) {
    console.error('[kelly-memory/run] failed', err);
    return NextResponse.json({ error: 'run_failed' }, { status: 500 });
  }
}
