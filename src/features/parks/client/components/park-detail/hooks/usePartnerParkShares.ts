'use client';

/**
 * Mutual partners' shares for THIS park / route, as "מתאמנים כאן" rows (enable_where_to_train_v1).
 * Read through /api/training-here/partners?parkId= | ?routeId= (server-side canSeePost), merged by
 * the caller into the list like optimistic arrivals (duplicates of live rows are dropped there).
 */
import { useEffect, useState } from 'react';
import type { SessionEnrichment } from '@/features/parks/core/hooks/useCommunityEnrichment';
import { fetchPartnerTrainingShares } from '@/features/social/services/training-shares.service';
import { partnerShareToArrival } from '../utils/partner-park-shares';

const NONE: SessionEnrichment[] = [];

export function usePartnerPlaceShares(
  enabled: boolean,
  kind: 'park' | 'route',
  placeId: string | null | undefined,
): SessionEnrichment[] {
  const [rows, setRows] = useState<SessionEnrichment[]>(NONE);
  useEffect(() => {
    if (!enabled || !placeId) { setRows(NONE); return; }
    let cancelled = false;
    fetchPartnerTrainingShares(kind === 'park' ? { parkId: placeId } : { routeId: placeId }).then((shares) => {
      if (!cancelled) setRows(shares.length ? shares.map(partnerShareToArrival) : NONE);
    });
    return () => { cancelled = true; };
  }, [enabled, kind, placeId]);
  return rows;
}

export function usePartnerParkShares(enabled: boolean, parkId: string | null | undefined): SessionEnrichment[] {
  return usePartnerPlaceShares(enabled, 'park', parkId);
}
