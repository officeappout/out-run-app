/**
 * POST /api/admin/costs/refresh — runs every cost connector and stores the month snapshot in
 * admin_costs/{month}.
 *
 * Callers:
 *   - adminCostsScheduler (Cloud Function, daily 05:30 Israel): Authorization: Bearer
 *     <AI_REVIEW_CRON_SECRET> — the same cron secret the AI review scheduler already uses.
 *     Body {}: refreshes the running month, and on days 1–5 also the previous one (vendors
 *     finalize last month's numbers a few days late).
 *   - a super admin's "רענן עכשיו" button: Firebase ID token, body { month? }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { getIsraelDateKey } from '@/lib/israelTime';
import { isReviewCronCaller } from '@/lib/ai/review/cron-auth.server';
import { isMonthKey, shiftMonth } from '@/lib/costs/month';
import { refreshMonth } from '@/lib/costs/refresh.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BodySchema = z.object({ month: z.string().optional() }).strict();

export async function POST(request: NextRequest) {
  const isCron = isReviewCronCaller(request);
  if (!isCron) {
    const denied = await requireSuperAdminApi(request);
    if (denied) return denied;
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const now = new Date();
  const today = getIsraelDateKey(now);
  const current = today.slice(0, 7);
  const asked = parsed.data.month;
  if (asked !== undefined && (!isMonthKey(asked) || asked > current)) {
    return NextResponse.json({ error: 'bad_month' }, { status: 400 });
  }
  const months = asked ? [asked] : Number(today.slice(8, 10)) <= 5 ? [current, shiftMonth(current, -1)] : [current];

  try {
    const db = getAdminDb();
    const reports = [];
    for (const m of months) reports.push(await refreshMonth(db, m, { env: process.env, fetch, now }));
    return NextResponse.json({ reports });
  } catch (err) {
    console.error('[costs] refresh failed', err);
    return NextResponse.json({ error: 'refresh_failed' }, { status: 500 });
  }
}
