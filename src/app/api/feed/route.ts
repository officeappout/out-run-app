/**
 * GET /api/feed — feed posts the caller is allowed to see.
 *
 *   (no params)      the caller + everyone they follow (home feed)
 *   ?author=<uid>    one person's posts (their profile)
 *   ?max=<n>         ≤ 50, default 30
 *
 * Demo viewer (PR 5): a registered viewer's home feed also carries the demo
 * cities' newest posts (one bounded query), and a demo author's partners
 * post counts as visible to them — they read the demo world as a resident.
 * Nobody else's feed changes.
 *
 * Reads with the Admin SDK and filters each post with canSeePost(): public →
 * everyone, partners → the author's mutual follows, private → the author.
 * Auth: Firebase ID token in Authorization: Bearer <token>.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { canSeePost, feedPostJson, type AuthorConnections } from '@/features/social/services/feed-visibility';
import { isDemoUid } from '@/lib/demo';
import { isInDemoWorld } from '@/lib/demo-world.server';
import { resolveDemoViewerWorld } from '@/lib/demo-viewer-world.server';
import { demoWorldFeedDocs, viewerSeesDemoPost } from '@/features/social/services/feed-demo-viewer';

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
  // Only the viewers doc (cached) is read for a real caller.
  const demoWorld = await resolveDemoViewerWorld(db, viewer);
  if (author) {
    // Demo world guard (demo-users-design.md L2): a demo user's posts reach
    // only someone who follows them (the owner's viewer accounts) — demo users
    // aren't discoverable, so no real user ever follows one.
    // Viewer exception (PR 2): a demo user or the owner's viewer accounts see a
    // demo profile's feed as if they were members of the demo world.
    if (isDemoUid(author) && author !== viewer && !(await isInDemoWorld(db, viewer))) {
      const mine = (await db.collection('connections').doc(viewer).get()).data() as AuthorConnections | undefined;
      if (!(mine?.following ?? []).includes(author)) return NextResponse.json({ posts: [] });
    }
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
  if (demoWorld && !author) {
    const seen = new Set(docs.map((d) => d.id));
    for (const d of await demoWorldFeedDocs(db, demoWorld, max)) if (!seen.has(d.id)) docs.push(d);
  }

  // Each author's connections, once — needed only for non-public posts by others.
  const demoVisible = (d: { data: Record<string, unknown> }) => !!demoWorld && viewerSeesDemoPost(d.data);
  const needConn = Array.from(
    new Set(
      docs
        .filter((d) => d.data.authorUid !== viewer && d.data.audience !== 'public' && !demoVisible(d))
        .map((d) => String(d.data.authorUid)),
    ),
  );
  const conns = new Map<string, AuthorConnections>();
  if (needConn.length) {
    const snaps = await db.getAll(...needConn.map((u) => db.collection('connections').doc(u)));
    snaps.forEach((s) => conns.set(s.id, (s.data() as AuthorConnections | undefined) ?? {}));
  }

  const posts = docs
    .filter((d) =>
      demoVisible(d) ||
      canSeePost({ authorUid: String(d.data.authorUid), audience: d.data.audience as string | undefined }, viewer, conns.get(String(d.data.authorUid))),
    )
    .map((d) => feedPostJson(d.id, d.data))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, max);

  return NextResponse.json({ posts });
}
