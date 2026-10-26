'use client';

/** Partners' live / upcoming training-here shares for the feed (enable_where_to_train_v1). */
import { useCallback, useEffect, useState } from 'react';
import { fetchPartnerTrainingShares } from '@/features/social/services/training-shares.service';
import type { TrainingShareJson } from '@/features/social/services/training-share-visibility';

export function usePartnerTrainingShares(enabled: boolean, userId: string | undefined) {
  const [shares, setShares] = useState<TrainingShareJson[]>([]);
  const refresh = useCallback(async () => {
    if (!enabled || !userId) { setShares([]); return; }
    setShares(await fetchPartnerTrainingShares());
  }, [enabled, userId]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { shares, refresh };
}
