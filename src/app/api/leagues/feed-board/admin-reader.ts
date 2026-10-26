/**
 * Admin-SDK FeedBoardReader for /api/leagues/feed-board: runs feed-board.core's query on feed_posts
 * (bounded) and batch-reads name docs. A short in-memory cache shares one scan between callers
 * of the same board (the window start is the same for everyone in a time zone).
 */
import type { FeedBoardReader, FeedDoc, PostQuery } from '@/features/arena/services/feed-board.core';

/** Hard cap per unlimited board scan; identical results below it (signalled when hit). */
export const MAX_POSTS_PER_BOARD = 10_000;
const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 100;

const cache = new Map<string, { at: number; docs: FeedDoc[]; truncated: boolean }>();
export function __resetFeedBoardCacheForTests() { cache.clear(); }

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Admin Firestore (typed loosely so the fake test db fits)
export function adminFeedBoardReader(db: any, now = () => Date.now()): FeedBoardReader & { truncated: boolean } {
  const reader = {
    truncated: false,
    async posts(q: PostQuery): Promise<FeedDoc[]> {
      const key = JSON.stringify(q);
      const hit = cache.get(key);
      if (hit && now() - hit.at < CACHE_TTL_MS) { reader.truncated = hit.truncated; return hit.docs; }
      let ref = db.collection('feed_posts');
      for (const [f, op, v] of q.filters) ref = ref.where(f, op, v);
      if (q.orderCreatedDesc) ref = ref.orderBy('createdAt', 'desc');
      const cap = q.limit ?? MAX_POSTS_PER_BOARD;
      const snap = await ref.limit(cap).get();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const docs: FeedDoc[] = snap.docs.map((d: any) => ({ id: d.id, data: d.data() ?? {} }));
      const truncated = q.limit == null && docs.length >= cap;
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(key, { at: now(), docs, truncated });
      reader.truncated = truncated;
      return docs;
    },
    async docs(collection: 'community_groups' | 'authorities', ids: string[]) {
      const out = new Map<string, Record<string, unknown> | undefined>();
      if (ids.length === 0) return out;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const snaps = await db.getAll(...ids.map((id) => db.collection(collection).doc(id)));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      snaps.forEach((s: any, i: number) => out.set(ids[i], s.exists ? (s.data() ?? {}) : undefined));
      return out;
    },
  };
  return reader;
}
