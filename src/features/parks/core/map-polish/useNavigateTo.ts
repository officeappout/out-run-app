'use client';

/**
 * useNavigateTo — the hook side of navigate-target.ts: returns a function that
 * sends a DestinationTarget into the v2 destination (commute) flow, routing to
 * /map when needed. Returns false when the flow can't take it right now
 * (null target, or on /map with Discover down) so the caller can fall back.
 */

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useMapStore } from '../store/useMapStore';
import { navigationRequest, type DestinationTarget } from './navigate-target';

export function useNavigateTo(): (target: DestinationTarget | null) => boolean {
  const router = useRouter();
  return useCallback((target) => {
    if (!target) return false;
    const { routeOverviewHostMounted, setPendingCommute } = useMapStore.getState();
    const req = navigationRequest({
      pathname: typeof window !== 'undefined' ? window.location.pathname : null,
      hostMounted: routeOverviewHostMounted,
    });
    if (req.kind === 'unavailable') return false;
    setPendingCommute(target);
    if (req.goToMap) router.push('/map');
    return true;
  }, [router]);
}
