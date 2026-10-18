/**
 * GET /api/admin/ai-coach/kelly/thread?uid=… — one unified Kelly conversation for the admin
 * panel: the last 150 messages of every source (user, AI, team, system) oldest first, the
 * thread state, and the user's first name / gender / age group (to answer in the right voice).
 * Never returns the AI turn `log`. Super / root admin only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireKellyTeamAdmin } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { AI_COACH_THREADS } from '@/lib/ai/coach/thread-store.server';
import { kellyAdminMessage, kellyThreadRow } from '@/lib/ai/coach/kelly-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UID_RE = /^[A-Za-z0-9_-]{6,128}$/;

export async function GET(request: NextRequest) {
  const gate = await requireKellyTeamAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const uid = new URL(request.url).searchParams.get('uid') ?? '';
  if (!UID_RE.test(uid)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  try {
    const db = getAdminDb();
    const tRef = db.collection(AI_COACH_THREADS).doc(uid);
    const [tSnap, uSnap, mSnap] = await Promise.all([
      tRef.get(),
      db.collection('users').doc(uid).get(),
      tRef.collection('messages').orderBy('createdAt', 'desc').limit(150).get(),
    ]);
    if (!tSnap.exists && mSnap.empty) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({
      thread: kellyThreadRow(uid, tSnap.data() ?? {}, uSnap.exists ? (uSnap.data() ?? {}) : {}),
      messages: mSnap.docs.map((d) => kellyAdminMessage(d.id, d.data() ?? {})).reverse(),
    });
  } catch (err) {
    console.error('[admin/kelly] thread failed', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
