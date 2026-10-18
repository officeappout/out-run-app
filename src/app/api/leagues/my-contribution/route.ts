/**
 * GET /api/leagues/my-contribution — the CALLER's own contribution to one
 * league scope this period: points and km (home v2 "תרמת X ק״מ לשכונה").
 *
 * The per-member rows live in league_scope_stats/{id}/members/{uid}, which
 * the client can't read (no rules — same reason as /api/leagues/scope-stats).
 * This route reads exactly one member doc with the Admin SDK: the one whose
 * id is the verified token's uid, so nobody can read anyone else's numbers.
 *
 * Auth: Firebase ID token in Authorization: Bearer <token>.
 * Query: granularity = city | neighborhood, scopeId = <authority id>,
 *        window = weekly | monthly.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { kmOf, periodKeysFor } from '@/features/arena/services/league-scope-keys';

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

  const q = req.nextUrl.searchParams;
  const granularity = q.get('granularity') ?? '';
  const window = q.get('window') ?? '';
  const scopeId = q.get('scopeId') ?? '';
  if (
    (granularity !== 'city' && granularity !== 'neighborhood') ||
    (window !== 'weekly' && window !== 'monthly') ||
    !scopeId ||
    scopeId.length > 200 ||
    scopeId.includes('/')
  ) {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }

  const periodKey = periodKeysFor(new Date())[window];
  const snap = await getAdminDb()
    .collection('league_scope_stats')
    .doc(`${window}_${periodKey}_${granularity}_${scopeId}`)
    .collection('members')
    .doc(uid)
    .get();
  const m = snap.data() ?? {};
  const distanceMeters = typeof m.distanceMeters === 'number' ? m.distanceMeters : 0;
  return NextResponse.json({
    periodKey,
    credit: typeof m.credit === 'number' ? m.credit : 0,
    distanceMeters,
    totalKm: kmOf(distanceMeters),
  });
}
