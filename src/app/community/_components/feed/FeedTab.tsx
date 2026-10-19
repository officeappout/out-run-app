'use client';

import React from 'react';
import { m } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import type { useRouter } from 'next/navigation';
import type { FeatureFlags } from '@/hooks/useFeatureFlags';
import type { FeedPost } from '@/features/social/services/feed.service';
import type { FeedPrefs } from '@/features/social/services/feed-prefs';
import type { ShareableWorkout } from '@/features/social/components/FeedPublishSheets';
import type { CommunityGroup } from '@/types/community.types';
import { CommunityCircles, FeedPostCard } from '@/app/community/CommunityWidgets';
import type { FeedFilter } from '../../_lib/community-constants';
import { filterFeedPosts } from '../../_lib/community-logic';
import type { PendingShareState } from '../../_hooks/usePendingShare';
import { FeedEmptyState } from './FeedEmptyState';
import { FeedFilterBar } from './FeedFilterBar';
import { FeedShareBlock } from './FeedShareBlock';

type Profile = {
  core?: { neighborhoodId?: string | null } | null;
  social?: { groupIds?: string[] } | null;
} | null | undefined;

export interface FeedTabProps {
  featureFlags: FeatureFlags;
  profile: Profile;
  userId: string | undefined;
  share: PendingShareState;
  feedPrefs: FeedPrefs;
  feedFilter: FeedFilter;
  setFeedFilter: (f: FeedFilter) => void;
  posts: FeedPost[];
  setPosts: React.Dispatch<React.SetStateAction<FeedPost[]>>;
  loadingPosts: boolean;
  fetchPosts: () => Promise<void>;
  following: string[];
  isPartner: (uid: string) => boolean;
  setSelectedGroup: (group: CommunityGroup | null) => void;
  handleCreatePress: () => void;
  refreshProfile: (() => Promise<unknown>) | undefined;
  router: ReturnType<typeof useRouter>;
}

/** ─── Feed tab ─── circles, share prompt, filters and the posts. */
export function FeedTab({
  featureFlags,
  profile,
  userId,
  share,
  feedPrefs,
  feedFilter,
  setFeedFilter,
  posts,
  setPosts,
  loadingPosts,
  fetchPosts,
  following,
  isPartner,
  setSelectedGroup,
  handleCreatePress,
  refreshProfile,
  router,
}: FeedTabProps) {
  const { pendingShare } = share;
  const v2 = featureFlags.enableHomeV2;
  const shareable: ShareableWorkout | null = pendingShare
    ? {
        activityCategory: pendingShare.activityCategory,
        durationMinutes: pendingShare.durationMinutes,
        distanceKm: pendingShare.distanceKm,
        title: pendingShare.title,
        parkName: pendingShare.parkName,
        routeShape: pendingShare.routeShape,
      }
    : null;
  const shareBlock = v2 ? (
    <FeedShareBlock
      share={share}
      shareable={shareable}
      feedPrefs={feedPrefs}
      userId={userId}
      refreshProfile={refreshProfile}
      fetchPosts={fetchPosts}
    />
  ) : null;
  const myHood = profile?.core?.neighborhoodId ?? null;
  const myGroups = new Set(profile?.social?.groupIds ?? []);
  const shown = filterFeedPosts(posts, { v2, filter: feedFilter, isPartner, myHood, myGroups });
  const circles = (
    <CommunityCircles
      onGroupClick={(group) => setSelectedGroup(group)}
      // v2: no big "צור / הצטרף" circle — "create group" lives in the "+"
      // drawer — and no empty strip when you're in no group yet.
      onCreatePress={v2 ? undefined : handleCreatePress}
      hideWhenEmpty={v2}
    />
  );

  if (loadingPosts && posts.length === 0) {
    return (
      <div className="space-y-4 -mx-4">
        {circles}
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-gray-500 animate-pulse">טוען פיד...</p>
        </div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="space-y-4 -mx-4">
        {circles}
        {shareBlock}
        <FeedEmptyState v2={featureFlags.enableHomeV2} onFindPartners={() => router.push('/search?tab=people')} />
      </div>
    );
  }

  return (
    <div className="space-y-3 -mx-4">
      {circles}
      {shareBlock}
      <div className="px-4 space-y-3">
        <div className="flex items-center justify-between px-1 pt-2" dir="rtl">
          <span className="text-[11px] text-gray-500">
            עוקב אחרי {following.length} שותפים
          </span>
          <button
            onClick={fetchPosts}
            className="p-1.5 rounded-lg hover:bg-gray-100 active:scale-90 transition-all"
            aria-label="רענן"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-gray-400 ${loadingPosts ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {v2 && (
          <FeedFilterBar
            feedFilter={feedFilter}
            setFeedFilter={setFeedFilter}
            setPrivacyOpen={share.setPrivacyOpen}
            onFindPartners={() => router.push('/search?tab=people')}
          />
        )}

        {shown.map((post) => (
          <m.div
            key={post.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <FeedPostCard
              post={post}
              currentUid={userId}
              onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
              v2={v2}
            />
          </m.div>
        ))}
        {v2 && shown.length === 0 && (
          <p className="py-10 text-center text-[14px] font-bold text-v2-muted" dir="rtl">אין כאן עדיין פוסטים</p>
        )}
      </div>
    </div>
  );
}
