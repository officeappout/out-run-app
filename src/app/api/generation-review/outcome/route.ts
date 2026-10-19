/**
 * POST /api/generation-review/outcome — what the user did with a shown session:
 * { id, status: 'started' | 'completed' | 'abandoned', swappedExercises?, completedPct? }.
 * Only the log's own user may write it (the uid comes from the token). Unknown id → 404
 * (the session was not sampled). Writes generation_log/{id}.outcome only.
 */
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { OutcomeBodyZ } from '@/lib/generation-review/capture/schema';
import { writeOutcome } from '@/lib/generation-review/server/log-store.server';
import { uidFromRequest } from '@/lib/generation-review/server/user-auth.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const uid = await uidFromRequest(request);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = OutcomeBodyZ.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  try {
    const res = await writeOutcome(getAdminDb(), uid, parsed.data);
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: res.reason === 'not_found' ? 404 : 403 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[generation-review/outcome] failed', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
