/**
 * POST /api/admin/demo/feedback/status — mark one feedback item "טופל" / "לא רלוונטי" (or reopen).
 * Super admin only. Body: { source: 'life' | 'testers', id, status: 'open' | 'handled' | 'irrelevant' }.
 * Writes { triage: { status, by, at } } on the item's own demo-scoped doc (Admin SDK).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi, resolveAdminUid } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { setFeedbackStatus } from '@/lib/demo-control/feedback.server';
import { parseStatusInput } from '@/lib/demo-control/feedback-query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  const parsed = parseStatusInput(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const uid = (await resolveAdminUid(request)) ?? 'agent';
    const { source, id, status } = parsed.value;
    const found = await setFeedbackStatus(getAdminDb(), uid, source, id, status);
    return found ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
  } catch (err) {
    console.error('[/api/admin/demo/feedback/status] failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}
