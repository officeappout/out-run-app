/**
 * GET /api/training-here/partners — the caller's training partners' live / upcoming "training here"
 * shares (planned_sessions), for the feed's activity items (enable_where_to_train_v1).
 *
 * Partners = mutual follows (owner 26.10, same as the feed's 'partners' audience). Reads with the
 * Admin SDK and filters each share with canSeeTrainingShare (→ the feed's canSeePost against the
 * AUTHOR's connections doc): public → yes, partners → only a mutual follow, private / squad / ghost
 * without an audience → no. 'partners' shares are written with privacyMode 'ghost', so no client
 * listener can read them; this route is the only reader besides the author.
 * Optional `?parkId=` / `?routeId=`: only shares for that place (the park page's "מתאמנים כאן");
 * filtered after the read, so no new index is needed.
 * Auth: Firebase ID token in Authorization: Bearer <token>.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import type { AuthorConnections } from '@/features/social/services/feed-visibility';
import {
  canSeeTrainingShare,
  mutualPartnerUids,
  trainingShareJson,
  type TrainingShareJson,
} from '@/features/social/services/training-share-visibility';

export const dynamic = 'force-dynamic';

/** At most this many partners are scanned (3 `in` chunks of 30). */
const MAX_PARTNERS = 90;
const MAX_SHARES = 20;

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  let viewer: string;
  try {
    viewer = (await getAdminAuth().verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const place = req.nextUrl.searchParams;
  const parkId = place.get('parkId');
  const routeId = place.get('routeId');
  const db = getAdminDb();
  const mine = (await db.collection('connections').doc(viewer).get()).data() as AuthorConnections | undefined;
  const partners = mutualPartnerUids(mine, viewer).slice(0, MAX_PARTNERS);
  if (partners.length === 0) return NextResponse.json({ shares: [] });

  const now = new Date();
  const docs: { id: string; data: Record<string, unknown> }[] = [];
  for (let i = 0; i < partners.length; i += 30) {
    // Index: planned_sessions (userId, status, expiresAt) — already in firestore.indexes.json.
    const snap = await db
      .collection('planned_sessions')
      .where('userId', 'in', partners.slice(i, i + 30))
      .where('status', '==', 'planned')
      .where('expiresAt', '>=', now)
      .get();
    snap.forEach((d: { id: string; data: () => Record<string, unknown> }) => docs.push({ id: d.id, data: d.data() }));
  }
  if (docs.length === 0) return NextResponse.json({ shares: [] });

  // Each author's connections (the author decides who is their partner) + gender for the copy, once.
  const authors = Array.from(new Set(docs.map((d) => String(d.data.userId))));
  const [connSnaps, userSnaps] = await Promise.all([
    db.getAll(...authors.map((u) => db.collection('connections').doc(u))),
    db.getAll(...authors.map((u) => db.collection('users').doc(u))),
  ]);
  const conns = new Map<string, AuthorConnections>();
  connSnaps.forEach((s: { id: string; data: () => unknown }) => conns.set(s.id, (s.data() as AuthorConnections | undefined) ?? {}));
  const genders = new Map<string, unknown>();
  userSnaps.forEach((s: { id: string; data: () => unknown }) =>
    genders.set(s.id, (s.data() as { core?: { gender?: unknown } } | undefined)?.core?.gender));

  const shares = docs
    .filter((d) => (!parkId || d.data.parkId === parkId) && (!routeId || d.data.routeId === routeId))
    .filter((d) => canSeeTrainingShare({ ...d.data, userId: String(d.data.userId) }, viewer, conns.get(String(d.data.userId))))
    .map((d) => trainingShareJson(d.id, d.data, genders.get(String(d.data.userId))))
    .filter((s): s is TrainingShareJson => s !== null)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, MAX_SHARES);

  return NextResponse.json({ shares });
}
