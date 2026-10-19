/**
 * POST /api/generation-review/log — store one generated session the user was SHOWN
 * (generation_log/{id}, Admin SDK only; flag enable_generation_review).
 *
 * Auth: Bearer Firebase ID token; the uid comes from the token only. The body is a
 * GenerationLogDraft parsed by a strict, bounded schema (no free text, area = geohash-5 only).
 * Not captured (flag off and not a super admin, or outside the day's sample) → 200
 * { stored: false } and nothing is written.
 */
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { GenerationLogDraftZ } from '@/lib/generation-review/capture/schema';
import { decideCapture } from '@/lib/generation-review/server/gate.server';
import { writeLog } from '@/lib/generation-review/server/log-store.server';
import { uidFromRequest } from '@/lib/generation-review/server/user-auth.server';
import type { GenerationLogDraft } from '@/lib/generation-review/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const uid = await uidFromRequest(request);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = GenerationLogDraftZ.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  try {
    const db = getAdminDb();
    const decision = await decideCapture(db, uid);
    if (!decision.capture) return NextResponse.json({ stored: false });
    const res = await writeLog(db, uid, parsed.data as GenerationLogDraft);
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 409 });
    return NextResponse.json({ stored: true, created: res.created });
  } catch (err) {
    console.error('[generation-review/log] failed', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
