import { useCallback, useEffect, useState } from 'react';
import { getFeedPosts, type FeedPost } from '@/features/social/services/feed.service';
import { sortFeedPostsPartnersFirst } from '../_lib/community-logic';

/**
 * ── Fetch feed posts ─────────────────────────────────────────────────────
 * Me + everyone I follow (30 newest, one bounded query), partners first.
 * Fetched once social connections are loaded; `fetchPosts` refreshes.
 */
export function useFeedPosts(
  userId: string | undefined,
  following: string[],
  isPartner: (uid: string) => boolean,
  socialLoaded: boolean,
) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  const fetchPosts = useCallback(async () => {
    if (!userId) return;
    const uids = Array.from(new Set([userId, ...following]));
    setLoadingPosts(true);
    try {
      const fetched = await getFeedPosts(uids, 30);
      sortFeedPostsPartnersFirst(fetched, isPartner);
      setPosts(fetched);
    } catch (err) {
      console.error('[CommunityPage] fetchPosts failed:', err);
    } finally {
      setLoadingPosts(false);
    }
  }, [userId, following, isPartner]);

  useEffect(() => {
    if (socialLoaded && userId) {
      fetchPosts();
    }
  }, [socialLoaded, userId, fetchPosts]);

  return { posts, setPosts, loadingPosts, fetchPosts };
}
