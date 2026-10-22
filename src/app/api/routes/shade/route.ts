/**
 * POST /api/routes/shade — how shaded our stored routes are, for the route
 * card tag and the route-detail shade row (panel flag enable_route_shade_tag;
 * the app calls this only while the flag is on).
 *
 *   { ids: string[] }  (≤ 30 curated / official route ids)
 *   → { routes: { [id]: { shadedPct, julyByHour? } } }   only ids with something measured
 *
 * Reads `route_scores/{routeId}` with the Admin SDK: the collection has no
 * client rule (derived data, owner Q4), so the app never queries it directly
 * (axiom §25). Only the shade numbers leave the server — no score, no
 * selection data.
 *
 * Auth: Firebase ID token in Authorization: Bearer <token> (any signed-in user).
 * Rate limit: RATE_LIMITS.routeShade per uid (fails open, like every limiter).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { checkRateLimit } from '@/lib/rateLimit';
import { RATE_LIMITS } from '@/lib/rateLimitConfig';
import { ROUTE_SCORES_COLLECTION } from '@/lib/route-score/route-scores-doc';
import { parseRouteShadeRequest, shadeInfoFromScoreDoc, type RouteShadeResponse } from '@/lib/route-shade-view';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const parsed = parseRouteShadeRequest(await req.json().catch(() => null));
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const db = getAdminDb();
  const rl = await checkRateLimit(db, `route-shade:uid:${uid}`, RATE_LIMITS.routeShade.uid());
  if (rl.limited) {
    const retry = Math.ceil((rl.retryAfterMs ?? 60_000) / 1000);
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(retry) } });
  }

  try {
    const col = db.collection(ROUTE_SCORES_COLLECTION);
    const snaps = await db.getAll(...parsed.ids.map((id) => col.doc(id)));
    const body: RouteShadeResponse = { routes: {} };
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const info = shadeInfoFromScoreDoc(snap.data() ?? null);
      if (info) body.routes[snap.id] = info;
    }
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.warn('[routes/shade] read failed:', (e as Error)?.message);
    return NextResponse.json({ error: 'read_failed' }, { status: 502 });
  }
}
