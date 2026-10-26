/**
 * feed-board.client — the six feed_posts leaderboards through /api/leagues/feed-board (Admin SDK +
 * feed-board.core), so the client never lists feed_posts directly (rules-prep, 26.10). Throws on
 * failure, like the Firestore read it replaces; dates come back revived.
 */
import { auth } from '@/lib/firebase';
import type { FeedBoardRequest, FeedBoardResult } from './feed-board.core';

export async function fetchFeedBoard<T extends FeedBoardResult>(req: FeedBoardRequest): Promise<T> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error('feed-board: not signed in');
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(req)) if (v !== undefined && v !== null) qs.set(k, String(v));
  const res = await fetch(`/api/leagues/feed-board?${qs}`, { headers: { Authorization: `Bearer ${idToken}` } });
  if (!res.ok) throw new Error(`feed-board ${res.status}`);
  const body = (await res.json()) as T & { generatedAt: string };
  return { ...body, generatedAt: new Date(body.generatedAt) } as T;
}
