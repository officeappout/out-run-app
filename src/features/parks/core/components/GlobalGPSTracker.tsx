'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useGPS } from '../hooks/useGPS';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { GLOBAL_GPS_TRACKING_ENABLED } from '@/config/feature-flags';

/**
 * GlobalGPSTracker — keeps GPS acquisition alive during an active
 * running/walking/hybrid session even when the user has navigated away from
 * /map (e.g. the iOS edge-swipe-back gesture out of MapShellInner).
 *
 * Root cause this fixes: useGPS()'s watch/poll pipeline was previously only
 * ever driven by MapShellInner (mounted exclusively while /map is mounted).
 * The session duration timer, however, is store-owned (useSessionStore) and
 * lifecycle-independent — it keeps climbing even after GPS acquisition dies
 * with the component that owned it, producing inflated/inaccurate distance
 * and pace. Mounting a second useGPS() instance here, independent of any
 * route, closes that gap.
 *
 * Renders nothing — it exists purely to hold a second useGPS({enabled})
 * instance alive from a route-independent mount point (ClientLayout).
 *
 * Single-driver contract (see useGPSStore.ts header): this instance and
 * MapShellInner's (useMapLogic → useGPS(), always enabled while /map is
 * mounted) are mutually exclusive BY CONSTRUCTION — this one is enabled only
 * when `!isMapRoute`, so the two can never both be actively acquiring/writing
 * to useGPSStore at the same time. At most one enabled useGPS() instance
 * exists at any given moment.
 *
 * Gated entirely behind GLOBAL_GPS_TRACKING_ENABLED. While false, the enabled
 * condition passed to useGPS() is forced to always be false — no watch/poll
 * ever starts, no store write ever happens from this instance — byte-identical
 * to today's behaviour (GPS acquisition only ever via MapShellInner).
 */
export default function GlobalGPSTracker() {
  // mounted-gate mirrors ClientLayout's own isMapRoute computation
  // (`mounted && pathname.startsWith('/map')`) — avoids any SSR/client
  // pathname mismatch instead of reinventing route detection.
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const status = useSessionStore((s) => s.status);
  const mode = useSessionStore((s) => s.mode);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isMapRoute = mounted && pathname.startsWith('/map');
  const isTrackableSession =
    (status === 'active' || status === 'paused') &&
    (mode === 'running' || mode === 'walking' || mode === 'hybrid');

  const enabled = GLOBAL_GPS_TRACKING_ENABLED && isTrackableSession && !isMapRoute;

  useGPS({ enabled });

  return null;
}
