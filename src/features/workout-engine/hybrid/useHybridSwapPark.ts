'use client';
/**
 * enable_swap_fixes_v1 — the hybrid overview's swap checks candidates against the STATION's
 * park (its equipment / brands), as the in-station swap already does. Off / no parkId → null
 * (generic park methods, today).
 */
import { useEffect, useState } from 'react';
import type { Park } from '@/types/admin-types';

export function useHybridSwapPark(parkId: string | null | undefined, enabled: boolean): Park | null {
  const [park, setPark] = useState<Park | null>(null);
  useEffect(() => {
    setPark(null);
    if (!enabled || !parkId) return;
    let alive = true;
    import('@/features/parks/core/services/parks.service')
      .then(({ getPark }) => getPark(parkId))
      .then((p) => { if (alive && p) setPark(p as Park); })
      .catch(() => { /* no park → generic park methods */ });
    return () => { alive = false; };
  }, [parkId, enabled]);
  return park;
}
