/**
 * GET /api/demo/viewer-world — "which world do I read?" for the signed-in
 * caller (demo-users-design.md PR 5, owner 21.10.2026).
 *
 *   registered viewer  → { viewer: true, home, cities, groupIds } (demo ids only)
 *   anyone else        → { viewer: false }
 *
 * The client (features/demo-viewer) caches the answer — a real user asks at
 * most once a day — and overlays the home city / neighbourhood on the READ
 * surfaces only (community, leagues, nearby groups, map presence). Nothing
 * about the demo world leaves the server for a non-viewer.
 * Auth: Firebase ID token (Bearer).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveDemoViewerWorld } from '@/lib/demo-viewer-world.server';

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
  const world = await resolveDemoViewerWorld(getAdminDb(), uid);
  return NextResponse.json(world ?? { viewer: false }, { headers: { 'Cache-Control': 'private, no-store' } });
}
