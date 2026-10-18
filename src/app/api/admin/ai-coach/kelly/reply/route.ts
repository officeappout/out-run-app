/**
 * POST /api/admin/ai-coach/kelly/reply — the team answers in the user's unified Kelly thread.
 *
 *   { uid, text }                → message { source: 'human', senderName: "קלי · צוות OUT" },
 *                                  needsHuman = false, lastHumanReplyAt, unreadForUser + 1.
 *                                  The push (channel 'coach', deep link /ai-coach) is sent by
 *                                  the onKellyThreadMessage function, which applies the push
 *                                  rules (prefs, quiet hours, Shabbat observers, rate cap).
 *   { uid, action: 'resolve' }   → take the thread out of the queue without replying.
 *
 * Super / root admin only (a person; requireKellyTeamAdmin). Replies need kelly_unified_v1 ON
 * (409 flag_off otherwise: with the flag off the user's AI screen would show the reply as an
 * AI message). The acting admin's uid is logged, never stored on the user-readable message.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireKellyTeamAdmin } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { getServerFeatureFlags } from '@/lib/ai/entitlement.server';
import { appendNonAiMessage, resolveNeedsHuman } from '@/lib/ai/coach/thread-store.server';
import { KELLY_TEAM_SENDER_NAME, normalizeTeamReply } from '@/lib/ai/coach/unified-thread';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UID_RE = /^[A-Za-z0-9_-]{6,128}$/;

export async function POST(request: NextRequest) {
  const gate = await requireKellyTeamAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const body = (await request.json().catch(() => null)) as { uid?: unknown; text?: unknown; action?: unknown } | null;
  const uid = typeof body?.uid === 'string' ? body.uid : '';
  if (!UID_RE.test(uid)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  try {
    const db = getAdminDb();

    if (body?.action === 'resolve') {
      await resolveNeedsHuman(db, uid);
      console.info(`[kelly-team] resolve uid=${uid} by=${gate.uid}`);
      return NextResponse.json({ ok: true });
    }

    const text = normalizeTeamReply(body?.text);
    if (!text) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

    const flags = await getServerFeatureFlags(db);
    if (flags.kellyUnifiedV1 !== true) return NextResponse.json({ error: 'flag_off' }, { status: 409 });

    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const messageId = await appendNonAiMessage(db, uid, { source: 'human', text, senderName: KELLY_TEAM_SENDER_NAME });
    console.info(`[kelly-team] reply uid=${uid} msg=${messageId} by=${gate.uid}`);
    return NextResponse.json({ ok: true, messageId });
  } catch (err) {
    console.error('[admin/kelly] reply failed', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
