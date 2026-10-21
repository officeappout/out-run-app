/**
 * GET /api/demo/viewer-presence — the demo users who are "out training" right now, for
 * the owner's registered viewer accounts only (demo-viewer-presence.server.ts).
 * Anyone else: { markers: [] }. Auth: Firebase ID token (Bearer).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { getDemoPresenceForViewer } from '@/lib/demo-viewer-presence.server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const markers = await getDemoPresenceForViewer(getAdminDb(), uid);
  return NextResponse.json({ markers }, { headers: { 'Cache-Control': 'private, no-store' } });
}
