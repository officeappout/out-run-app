/**
 * Test helper: a FeedBoardReader over the (mocked) client Firestore SDK, so the pre-move unit
 * tests keep driving the SAME feed-board.core engine the server runs through their own fakes.
 */
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { FeedBoardReader, FeedDoc } from '../../feed-board.core';

export function clientSdkReader(): FeedBoardReader {
  return {
    async posts(q) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cs: any[] = q.filters.map(([f, op, v]) => where(f, op, v));
      if (q.orderCreatedDesc) cs.push(orderBy('createdAt', 'desc'));
      if (q.limit != null) cs.push(limit(q.limit));
      const snap = await getDocs(query(collection(db, 'feed_posts'), ...cs));
      const out: FeedDoc[] = [];
      snap.forEach((d) => { out.push({ id: d.id, data: d.data() as Record<string, unknown> }); });
      return out;
    },
    async docs(c, ids) {
      const out = new Map<string, Record<string, unknown> | undefined>();
      await Promise.all(ids.map(async (id) => {
        try {
          const s = await getDoc(doc(db, c, id));
          out.set(id, s.exists() ? ((s.data() as Record<string, unknown>) ?? {}) : undefined);
        } catch {
          out.set(id, undefined);
        }
      }));
      return out;
    },
  };
}
