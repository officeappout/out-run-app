'use client';

import { useState, useEffect } from 'react';
import { useUserStore } from '@/features/user';
import { getMyGroups } from '@/features/arena/services/group.service';
import type { CommunityGroup } from '@/types/community.types';

/**
 * Returns the full CommunityGroup documents for all groups the current user
 * has joined, derived from profile.social.groupIds.
 *
 * Uses a stable string key to avoid re-fetching on every reference change.
 */
export function useMyGroups(): { groups: CommunityGroup[]; isLoading: boolean } {
  const { profile } = useUserStore();
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Stable primitive dep — avoids refetch on array reference changes
  const groupIdsKey = (profile?.social?.groupIds ?? []).join(',');

  useEffect(() => {
    const ids = profile?.social?.groupIds ?? [];
    if (!ids.length) {
      setGroups([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    getMyGroups(ids)
      .then((result) => {
        if (!cancelled) setGroups(result);
      })
      .catch(() => {
        if (!cancelled) setGroups([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIdsKey]);

  return { groups, isLoading };
}
