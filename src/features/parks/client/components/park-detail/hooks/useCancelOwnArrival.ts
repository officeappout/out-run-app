'use client';

/**
 * "ביטול" on my own "מתאמנים כאן" row (enable_where_to_train_v1, phone 7) — the existing
 * cancelPlannedSession (status → 'cancelled'); the park listener then drops the row.
 */
import { useCallback, useState } from 'react';
import type { SessionEnrichment } from '@/features/parks/core/hooks/useCommunityEnrichment';
import { cancelPlannedSession } from '@/features/admin/services/planned-sessions.service';
import { arrivalSessionId } from '../utils/park-detail-logic';

export function useCancelOwnArrival() {
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelledIds, setCancelledIds] = useState<ReadonlySet<string>>(new Set());
  const cancel = useCallback(async (ev: SessionEnrichment) => {
    const id = arrivalSessionId(ev);
    if (!id) return;
    setCancellingId(ev.eventId);
    try {
      await cancelPlannedSession(id);
      setCancelledIds((prev) => new Set(prev).add(ev.eventId));
    } catch (err) {
      console.error('[useCancelOwnArrival] cancelPlannedSession failed:', err);
    } finally {
      setCancellingId(null);
    }
  }, []);
  return { cancellingId, cancelledIds, cancel };
}
