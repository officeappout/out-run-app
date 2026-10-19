/**
 * GET /api/admin/costs?month=YYYY-MM — the "עלויות" dashboard payload. Super admin only.
 * Read-only: month snapshots (admin_costs), manual items (admin_cost_items), today's AI spend
 * (ai_usage_global). Connector status reports configured: true/false — never an env value.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { getIsraelDateKey } from '@/lib/israelTime';
import { isMonthKey } from '@/lib/costs/month';
import { buildDashboard, monthsToLoad } from '@/lib/costs/dashboard';
import { loadItems, loadMonths, loadTodayAiUsd } from '@/lib/costs/costs-store.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;

  const today = getIsraelDateKey(new Date());
  const asked = new URL(request.url).searchParams.get('month');
  const month = isMonthKey(asked) && asked <= today.slice(0, 7) ? asked : today.slice(0, 7);

  try {
    const db = getAdminDb();
    const [docs, items, todayAiUsd] = await Promise.all([
      loadMonths(db, monthsToLoad(month)),
      loadItems(db),
      loadTodayAiUsd(db, today),
    ]);
    return NextResponse.json(buildDashboard({ month, today, docs, items, env: process.env, todayAiUsd }));
  } catch (err) {
    console.error('[costs] load failed', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
