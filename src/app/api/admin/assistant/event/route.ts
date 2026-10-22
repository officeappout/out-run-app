/**
 * POST /api/admin/assistant/event — the drawer reports a question answered by LOCAL navigation
 * (no model). Only a daily counter is written (admin_ai_stats.localNav) — never the text.
 * Body: { type: 'local_nav' }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAiCaller } from '@/lib/ai/admin-assistant/gate.server';
import { countAdminAiFreeRoute } from '@/lib/ai/admin-assistant/budget.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const caller = await requireAdminAiCaller(request);
  if (caller instanceof NextResponse) return caller;
  const body = (await request.json().catch(() => null)) as { type?: unknown } | null;
  if (body?.type !== 'local_nav') return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  await countAdminAiFreeRoute('localNav');
  return NextResponse.json({ ok: true });
}
