/**
 * /api/admin/demo/feedback/owner-rules — the owner's notes to the AI testers (super admin only).
 *   GET  → { notes: OwnerNote[] (newest first), learned: DismissalGroup[] }
 *   POST { text, screen?, severity? } → { note } — appended to demo_registry/owner_rules as OWN-1xx;
 *        the runner reads it at the next run (qaRunnerReport status).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi, resolveAdminUid } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { addOwnerNote, loadOwnerRules } from '@/lib/demo-control/owner-rules.server';
import { parseNoteInput } from '@/lib/demo-control/owner-rules-model';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await loadOwnerRules(getAdminDb()), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[/api/admin/demo/feedback/owner-rules] load failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  const parsed = parseNoteInput(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const uid = (await resolveAdminUid(request)) ?? 'agent';
    const note = await addOwnerNote(getAdminDb(), uid, parsed.value);
    return note ? NextResponse.json({ note }) : NextResponse.json({ error: 'too_many_notes' }, { status: 409 });
  } catch (err) {
    console.error('[/api/admin/demo/feedback/owner-rules] save failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}
