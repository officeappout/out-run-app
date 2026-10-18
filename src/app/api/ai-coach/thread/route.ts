/**
 * POST /api/ai-coach/thread — the unified Kelly conversation's non-AI actions (flag
 * kelly_unified_v1; 404 while it is off). The client can't write ai_coach_threads
 * (firestore.rules: server only), so these go through here.
 *
 *   { action: 'read' }                 → unreadForUser = 0
 *   { action: 'message', message }     → "team only" mode: the user's message lands in the
 *                                        conversation with needsHuman = true (admin queue).
 *                                        No AI call. Flood guard: TEAM_MSG_MAX_PER_WINDOW/hour.
 *
 * Auth: Bearer Firebase ID token (revocation checked); the uid comes from the token only.
 * Team-only mode is open to every signed-in user with a profile, minors included — it is the
 * same support channel the old Kelly DM was.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { getServerFeatureFlags } from '@/lib/ai/entitlement.server';
import { CHAT_MESSAGE_MAX_CHARS } from '@/lib/ai/coach/protocol';
import { appendTeamOnlyUserMessage, markThreadRead } from '@/lib/ai/coach/thread-store.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('read') }),
  z.object({ action: z.literal('message'), message: z.string().trim().min(1).max(CHAT_MESSAGE_MAX_CHARS) }),
]);

export async function POST(request: Request) {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 401 });

  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(token, true)).uid;
  } catch {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  try {
    const db = getAdminDb();
    const flags = await getServerFeatureFlags(db);
    if (flags.kellyUnifiedV1 !== true) return NextResponse.json({ error: 'not_enabled' }, { status: 404 });

    if (parsed.data.action === 'read') {
      await markThreadRead(db, uid);
      return NextResponse.json({ ok: true });
    }

    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) return NextResponse.json({ error: 'profile_not_found' }, { status: 403 });

    const res = await appendTeamOnlyUserMessage(db, uid, parsed.data.message);
    if (!res.ok) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(res.retryAfterSec) } });
    }
    return NextResponse.json({ ok: true, messageId: res.id });
  } catch (err) {
    console.error('[ai-coach/thread] failed', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
