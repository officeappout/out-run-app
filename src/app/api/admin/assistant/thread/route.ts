/**
 * GET /api/admin/assistant/thread — the caller's OWN recent assistant messages (to restore the
 * drawer after a reload). Each admin sees only their own thread.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireAdminAiCaller } from '@/lib/ai/admin-assistant/gate.server';
import { loadAdminThread } from '@/lib/ai/admin-assistant/thread-store.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const caller = await requireAdminAiCaller(request);
  if (caller instanceof NextResponse) return caller;
  try {
    const thread = await loadAdminThread(getAdminDb(), caller.uid, 20);
    return NextResponse.json({ role: caller.role, messages: thread.recent });
  } catch (err) {
    console.error('[admin-ai] thread read failed', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 500 });
  }
}
