/**
 * POST /api/ai-coach/proactive/feedback — the user's answer to Kelly's "איך היה?"
 * (Kelly phase 3, flag ai_coach_proactive; 404 while it is off).
 *
 * Body: { messageId, rating: 'easy' | 'right' | 'hard' }. Auth: Bearer Firebase ID token
 * (revocation checked); the uid comes from the token only, and the message must be this
 * user's post-workout question about a workout of theirs (feedback.server.ts). Stored in
 * workout_feedback/{workoutId}; the client never writes it.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { getServerFeatureFlags } from '@/lib/ai/entitlement.server';
import { saveWorkoutFeedback } from '@/lib/ai/coach/proactive/feedback.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  messageId: z.string().regex(/^proactive_[A-Za-z0-9_-]{1,60}$/),
  rating: z.enum(['easy', 'right', 'hard']),
}).strict();

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
    if (flags.aiCoachProactive !== true) return NextResponse.json({ error: 'not_enabled' }, { status: 404 });
    const res = await saveWorkoutFeedback(db, uid, parsed.data.messageId, parsed.data.rating);
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: res.reason === 'already_answered' ? 409 : 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[kelly-proactive/feedback] failed', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
