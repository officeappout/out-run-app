/**
 * GET /api/admin/assistant/quick/<metric> — a "תשובה מהירה" chip: Firestore only, no model,
 * no AI budget. Same gate as the chat (person-only root/super + flag). One audit row per call
 * (route 'quick', the metric id as the question) + the day's quick counter.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireAdminAiCaller } from '@/lib/ai/admin-assistant/gate.server';
import { computeQuickCard, isQuickMetricId } from '@/lib/ai/admin-assistant/quick-metrics.server';
import { countAdminAiFreeRoute } from '@/lib/ai/admin-assistant/budget.server';
import { writeAdminAudit } from '@/lib/ai/admin-assistant/audit.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { metric: string } }) {
  const caller = await requireAdminAiCaller(request);
  if (caller instanceof NextResponse) return caller;
  const metric = params.metric;
  if (!isQuickMetricId(metric)) return NextResponse.json({ error: 'unknown metric' }, { status: 404 });
  const db = getAdminDb();
  try {
    const card = await computeQuickCard(db, metric, caller.role);
    await Promise.all([
      countAdminAiFreeRoute('quick', { db }),
      writeAdminAudit(db, { uid: caller.uid, question: `quick:${metric}`, route: 'quick', tools: [], model: null, usage: null, modelCalls: 0, costUsd: 0, guardFailed: null }),
    ]);
    return NextResponse.json({ card });
  } catch (err) {
    console.error(`[admin-ai] quick ${metric} failed`, err);
    return NextResponse.json({ error: 'unavailable' }, { status: 500 });
  }
}
