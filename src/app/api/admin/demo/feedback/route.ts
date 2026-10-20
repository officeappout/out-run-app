/**
 * GET /api/admin/demo/feedback — the "משוב דמו" tab on /admin/demo: demo personas' park / app
 * feedback (demo_registry/life/feedback) + the AI testers' findings (qa_findings), newest first,
 * 30 per page. Super admin only (both collections are closed to clients).
 *
 *   ?source=all|life|testers &type= &severity=P0..P3 &persona= &status=all|open|handled|irrelevant
 *   &from=YYYY-MM-DD &to=YYYY-MM-DD &cursor=<nextCursor of the previous page>
 *   → { items: FeedbackItem[], nextCursor: string | null }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { loadFeedbackPage } from '@/lib/demo-control/feedback.server';
import { decodeCursor, parseFeedbackFilters } from '@/lib/demo-control/feedback-query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  const params = request.nextUrl.searchParams;
  const rawCursor = params.get('cursor');
  const cursor = decodeCursor(rawCursor);
  if (rawCursor && !cursor) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  try {
    const page = await loadFeedbackPage(getAdminDb(), parseFeedbackFilters(params), cursor);
    return NextResponse.json(page, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[/api/admin/demo/feedback] failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
