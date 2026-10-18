/**
 * GET /api/admin/ai-coach/kelly?view=queue|recent — unified Kelly admin list.
 *   queue  (default): threads with needsHuman = true, newest request first ("ממתינים למענה")
 *   recent:           the 50 most recently active conversations
 * Super / root admin only (requireKellyTeamAdmin). Read-only.
 *
 * The queue query is equality-only (needsHuman == true) and sorted in memory, so it needs no
 * composite index. Rows carry the uid: the admin panel needs it to open / answer the thread.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireKellyTeamAdmin } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { AI_COACH_THREADS } from '@/lib/ai/coach/thread-store.server';
import { kellyThreadRow, sortQueue, type KellyThreadRow } from '@/lib/ai/coach/kelly-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const gate = await requireKellyTeamAdmin(request);
  if (gate instanceof NextResponse) return gate;

  try {
    const view = new URL(request.url).searchParams.get('view') === 'recent' ? 'recent' : 'queue';
    const db = getAdminDb();
    const col = db.collection(AI_COACH_THREADS);
    const snap =
      view === 'queue'
        ? await col.where('needsHuman', '==', true).limit(300).get()
        : await col.orderBy('lastMessageAt', 'desc').limit(50).get();

    const uids = snap.docs.map((d) => d.id);
    const users = uids.length ? await db.getAll(...uids.map((u) => db.collection('users').doc(u))) : [];
    const byUid = new Map(users.map((u) => [u.id, u.exists ? (u.data() ?? {}) : {}]));

    let rows: KellyThreadRow[] = snap.docs.map((d) => kellyThreadRow(d.id, d.data() ?? {}, byUid.get(d.id) ?? {}));
    if (view === 'queue') rows = sortQueue(rows);
    return NextResponse.json({ view, rows });
  } catch (err) {
    console.error('[admin/kelly] list failed', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
