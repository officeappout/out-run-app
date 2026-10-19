/**
 * POST /api/ai-coach/schedule-proposal — the user's tap on Kelly's schedule-change card
 * (Kelly phase 2, flag ai_coach_phase2; 404 while it is off).
 *
 *   { messageId, proposalId, action: 'confirm' }  → { status: 'applying', plan } once, or
 *                                                   { status: 'applied', already: true }
 *   { ..., action: 'applied' | 'failed' }          → the device reports how its write went
 *   { ..., action: 'dismiss' }                     → "בטל"
 *
 * The schedule itself is written by the DEVICE through the existing schedule-builder save
 * executor (saveScheduleProposal → userSchedule.service / replaceRecurringSchedule, the same
 * writer the builder's approve button uses, under the user's own Firestore rules): this route
 * adds no schedule writer. What it guarantees is that a plan is released only for the
 * signed-in owner, only once, only while fresh, and only if the schedule did not change since
 * Kelly prepared it. Kelly never reaches this route: only the user's tap does.
 *
 * Auth: Bearer Firebase ID token (revocation checked); the uid comes from the token only.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { getServerFeatureFlags } from '@/lib/ai/entitlement.server';
import { runProposalTransition } from '@/lib/ai/coach/schedule-proposal/proposal-store.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  messageId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  proposalId: z.string().min(1).max(64),
  action: z.enum(['confirm', 'applied', 'failed', 'dismiss']),
});

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
    if (flags.aiCoachPhase2 !== true) return NextResponse.json({ error: 'not_enabled' }, { status: 404 });

    const { messageId, proposalId, action } = parsed.data;
    const r = await runProposalTransition(db, uid, messageId, proposalId, action);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.httpStatus });
    return NextResponse.json({ ok: true, status: r.status, ...(r.plan ? { plan: r.plan } : {}), ...(r.already ? { already: true } : {}) });
  } catch (err) {
    console.error('[ai-coach/schedule-proposal] failed', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
