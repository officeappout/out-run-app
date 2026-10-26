'use client';

/**
 * Mutual partners' shares for THIS park, as "מתאמנים כאן" rows (enable_where_to_train_v1). Read
 * through /api/training-here/partners?parkId= (server-side canSeePost), merged by the caller into
 * the list like optimistic arrivals (mergeLocalArrivals drops any the live listener already has).
 */
import { useEffect, useState } from 'react';
import type { SessionEnrichment } from '@/features/parks/core/hooks/useCommunityEnrichment';
import { fetchPartnerTrainingShares } from '@/features/social/services/training-shares.service';
import { partnerShareToArrival } from '../utils/partner-park-shares';

const NONE: SessionEnrichment[] = [];

export function usePartnerParkShares(enabled: boolean, parkId: string | null | undefined): SessionEnrichment[] {
  const [rows, setRows] = useState<SessionEnrichment[]>(NONE);
  useEffect(() => {
    if (!enabled || !parkId) { setRows(NONE); return; }
    let cancelled = false;
    fetchPartnerTrainingShares({ parkId }).then((shares) => {
      if (!cancelled) setRows(shares.length ? shares.map(partnerShareToArrival) : NONE);
    });
    return () => { cancelled = true; };
  }, [enabled, parkId]);
  return rows;
}
