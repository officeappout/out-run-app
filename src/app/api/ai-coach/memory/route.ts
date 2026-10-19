/**
 * /api/ai-coach/memory — "מה קלי זוכר": the user's own memory facts (Kelly phase 3, flag
 * ai_coach_memory; 404 while it is off). ai_coach_memory is server-only, so the screen
 * reads and deletes through here.
 *
 *   GET                                  → { facts: [{ id, category, text, updatedAt }] }
 *   POST { action: 'delete', id }        → removes one fact
 *   POST { action: 'delete_all' }        → removes every fact (and older messages are not re-read)
 *
 * Auth: Bearer Firebase ID token (revocation checked); the uid comes from the token only, so
 * a user can only ever see or delete their own facts. Deleting works even with the flag off
 * (a user can always clear what was stored).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { getServerFeatureFlags } from '@/lib/ai/entitlement.server';
import { deleteAllMemory, deleteMemoryFact, loadMemory } from '@/lib/ai/coach/memory/store.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('delete'), id: z.string().regex(/^m_[a-z0-9]{1,12}$/) }),
  z.object({ action: z.literal('delete_all') }),
]);

async function uidFrom(request: Request): Promise<string | NextResponse> {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 401 });
  try {
    return (await getAdminAuth().verifyIdToken(token, true)).uid;
  } catch {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }
}

export async function GET(request: Request) {
  const uid = await uidFrom(request);
  if (uid instanceof NextResponse) return uid;
  try {
    const db = getAdminDb();
    if ((await getServerFeatureFlags(db)).aiCoachMemory !== true) return NextResponse.json({ error: 'not_enabled' }, { status: 404 });
    const mem = await loadMemory(db, uid);
    return NextResponse.json({ facts: mem.facts.map(({ id, category, text, updatedAt }) => ({ id, category, text, updatedAt })) });
  } catch (err) {
    console.error('[kelly-memory] read failed', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const uid = await uidFrom(request);
  if (uid instanceof NextResponse) return uid;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  try {
    const db = getAdminDb();
    if (parsed.data.action === 'delete_all') {
      await deleteAllMemory(db, uid);
      return NextResponse.json({ ok: true });
    }
    const deleted = await deleteMemoryFact(db, uid, parsed.data.id);
    return deleted ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
  } catch (err) {
    console.error('[kelly-memory] delete failed', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
