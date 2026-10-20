/**
 * GET /api/admin/demo/feedback/screenshot?id=<qa_findings doc id> — a 10-minute signed read URL
 * for the finding's screenshot (qa/… in Storage). Super admin only. The path comes from the
 * finding doc, never from the caller. → { url }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { signFindingScreenshot } from '@/lib/demo-control/feedback.server';
import { isFeedbackDocId } from '@/lib/demo-control/feedback-query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  const id = request.nextUrl.searchParams.get('id');
  if (!isFeedbackDocId(id)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  try {
    const r = await signFindingScreenshot(getAdminDb(), id);
    return r.ok
      ? NextResponse.json({ url: r.url }, { headers: { 'Cache-Control': 'no-store' } })
      : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (err) {
    console.error('[/api/admin/demo/feedback/screenshot] failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
