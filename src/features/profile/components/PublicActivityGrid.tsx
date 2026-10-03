'use client';

/**
 * PublicActivityGrid — public-profile adapter over ActivityTileGrid
 * ("public profile" slice 1). Maps the PUBLIC FeedPost[] (feed.service.ts
 * — feed_posts, audience-gated, never the private WorkoutHistoryEntry[]
 * the self-profile's WorkoutGrid reads) into the shared tile shape.
 *
 * No `onClick` on any tile: confirmed during investigation that
 * feed_posts has no detail-page destination at all (not even for the
 * author) — unlike WorkoutGrid's tiles, which open the real
 * /workouts/[id]/history route. Tapping a tile here does nothing, by
 * design, until such a destination exists.
 *
 * Known data-availability gap (reported, not fixed here): IS_COMMUNITY_
 * FEED_ENABLED=false guards 2 of 3 real createWorkoutPost call sites, and
 * the 3rd is gated only by a separate live Firestore flag — so this grid
 * is likely to render the empty state for most real users today. That's
 * expected, not a bug in this component.
 */

import { Activity, Dumbbell, Moon } from 'lucide-react';
import type { FeedPost } from '@/features/social/services/feed.service';
import ActivityTileGrid, { type ActivityTile } from './ActivityTileGrid';

function getActivityMeta(post: FeedPost): {
  Icon: React.ElementType;
  label: string;
  tileGradient: string;
} {
  switch (post.activityCategory) {
    case 'strength':
      return { Icon: Dumbbell, label: 'אימון כוח', tileGradient: 'from-purple-500 to-purple-400' };
    case 'maintenance':
      return { Icon: Moon, label: 'תחזוקה', tileGradient: 'from-slate-500 to-slate-400' };
    case 'cardio':
    default:
      return { Icon: Activity, label: 'קרדיו', tileGradient: 'from-[#00ADEF] to-[#5BC2F2]' };
  }
}

/** Distance when the post has one (running/cycling), else duration —
 * same headline-stat convention WorkoutGrid uses for its own tiles. */
function tileStat(post: FeedPost): string {
  if (post.distanceKm != null) {
    return `${post.distanceKm.toFixed(1)} ק״מ`;
  }
  return `${post.durationMinutes} דק'`;
}

export default function PublicActivityGrid({
  posts,
  isLoading,
}: {
  posts: FeedPost[];
  isLoading: boolean;
}) {
  const tiles: ActivityTile[] = posts.map((post) => {
    const { Icon, label, tileGradient } = getActivityMeta(post);
    return {
      id: post.id,
      Icon,
      label,
      stat: tileStat(post),
      tileGradient,
    };
  });

  return (
    <ActivityTileGrid
      tiles={tiles}
      isLoading={isLoading}
      emptyMessage={<>אין פעילות אחרונה</>}
    />
  );
}
