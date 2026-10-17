/**
 * GET /api/feed — feed posts the caller is allowed to see.
 *
 *   (no params)      the caller + everyone they follow (home feed)
 *   ?author=<uid>    one person's posts (their profile)
 *   ?max=<n>         ≤ 50, default 30
 *
 * Reads with the Admin SDK and filters each post with canSeePost(): public →
 * everyone, partners → the author's mutual follows, private → the author.
 * Auth: Firebase ID token in Authorization: Bearer <token>.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { canSeePost, feedPostJson, type AuthorConnections } from '@/features/social/services/feed-visibility';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  let viewer: string;
  try {
    viewer = (await getAdminAuth().verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const q = req.nextUrl.searchParams;
  const author = q.get('author');
  const max = Math.min(50, Math.max(1, Number(q.get('max') ?? 30) || 30));
  const db = getAdminDb();

  let authors: string[];
  if (author) {
    authors = [author];
  } else {
    const mine = (await db.collection('connections').doc(viewer).get()).data() as AuthorConnections | undefined;
    authors = Array.from(new Set([viewer, ...(mine?.following ?? [])]));
  }

  const docs: { id: string; data: Record<string, unknown> }[] = [];
  for (let i = 0; i < authors.length; i += 30) {
    const snap = await db
      .collection('feed_posts')
      .where('authorUid', 'in', authors.slice(i, i + 30))
      .orderBy('createdAt', 'desc')
      .limit(max)
      .get();
    snap.forEach((d) => docs.push({ id: d.id, data: d.data() }));
  }

  // Each author's connections, once — needed only for non-public posts by others.
  const needConn = Array.from(
    new Set(docs.filter((d) => d.data.authorUid !== viewer && d.data.audience !== 'public').map((d) => String(d.data.authorUid))),
  );
  const conns = new Map<string, AuthorConnections>();
  if (needConn.length) {
    const snaps = await db.getAll(...needConn.map((u) => db.collection('connections').doc(u)));
    snaps.forEach((s) => conns.set(s.id, (s.data() as AuthorConnections | undefined) ?? {}));
  }

  const posts = docs
    .filter((d) =>
      canSeePost({ authorUid: String(d.data.authorUid), audience: d.data.audience as string | undefined }, viewer, conns.get(String(d.data.authorUid))),
    )
    .map((d) => feedPostJson(d.id, d.data))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, max);

  return NextResponse.json({ posts });
}
