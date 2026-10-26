'use client';

/**
 * useMutualPartners — a user's training partners (mutual follows) via getMutualPartners, with its
 * own loading state. Extracted from the public profile page so the own profile's "שותפי אימון" row
 * (enable_where_to_train_v1) reads the SAME slice. `enabled` false → nothing is read.
 */
import { useEffect, useState } from 'react';
import { getMutualPartners } from '@/features/social/services/mutual-partners.service';
import type { UserSearchResult } from '@/features/social/services/user-search.service';

export function useMutualPartners(
  targetUid: string | null | undefined,
  viewerUid: string | null | undefined,
  viewerAgeGroup: unknown,
  enabled = true,
): { partners: UserSearchResult[]; loading: boolean } {
  const [partners, setPartners] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled || !targetUid || !viewerUid) {
      setLoading(false);
      return;
    }
    // getUsersByUids' required age-scoping — wait until the viewer's ageGroup hydrates.
    if (viewerAgeGroup !== 'minor' && viewerAgeGroup !== 'adult') {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getMutualPartners(targetUid, viewerAgeGroup, viewerUid)
      .then((result) => {
        if (!cancelled) setPartners(result);
      })
      .catch((err) => {
        console.error('[useMutualPartners] getMutualPartners failed:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [targetUid, viewerUid, viewerAgeGroup, enabled]);

  return { partners, loading };
}
