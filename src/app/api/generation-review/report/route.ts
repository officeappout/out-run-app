/**
 * POST /api/generation-review/report — "דווח על בעיה": { id, reasons[], note?, draft? }.
 * Allowed for super admins always, for everyone else only while enable_generation_review is on
 * (404 otherwise). Appends to generation_log/{id}.reports; when that session was not sampled the
 * device sends its summary (`draft`) and the report creates the log entry. A report on someone
 * else's session → 403.
 */
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { ReportBodyZ } from '@/lib/generation-review/capture/schema';
import { decideCapture } from '@/lib/generation-review/server/gate.server';
import { writeReport } from '@/lib/generation-review/server/log-store.server';
import { uidFromRequest } from '@/lib/generation-review/server/user-auth.server';
import type { GenerationLogDraft } from '@/lib/generation-review/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const uid = await uidFromRequest(request);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = ReportBodyZ.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  try {
    const db = getAdminDb();
    const decision = await decideCapture(db, uid);
    if (!decision.canReport) return NextResponse.json({ error: 'not_enabled' }, { status: 404 });
    const body = parsed.data;
    const res = await writeReport(db, uid, { ...body, draft: body.draft as GenerationLogDraft | undefined });
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: res.reason === 'not_found' ? 404 : 403 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[generation-review/report] failed', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
