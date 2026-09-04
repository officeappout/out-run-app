'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useMapStore } from '../store/useMapStore';

const ParkDetailSheet = dynamic(
  () => import('@/features/parks/client/components/park-detail/ParkDetailSheet'),
  { ssr: false },
);

const RouteDetailSheet = dynamic(
  () => import('@/features/parks/client/components/route-preview/RouteDetailSheet'),
  { ssr: false },
);

/**
 * Renders ParkDetailSheet or RouteDetailSheet as a global overlay
 * on top of any screen. Controlled by useMapStore.globalSheet.
 *
 * Injected once in ClientLayout so it works on Home, Map, or any page.
 *
 * Note on the route Navigate button: when this overlay is mounted
 * outside `/map` (e.g. from Home), tapping Navigate should still
 * funnel into the commute flow. We achieve that by writing to
 * `useMapStore.pendingCommute` then routing to `/map`; DiscoverLayer
 * picks the request up on mount via its pendingCommute consumer.
 *
 * Note on the route Start Workout button (real-steps-connect plan, Bug 1 fix, 04.09.2026):
 * was never wired here before this fix — RouteDetailSheet's own "התחל אימון" button always
 * renders regardless (it calls onStartWorkout?.(route), a silent no-op when the prop is
 * missing), so EVERY existing caller of openGlobalRouteSheet (this overlay, mounted globally
 * outside /map) had a dead Start button already, not just the new safety-net-slot caller
 * this plan adds. Same pendingCommute hand-off pattern as Navigate above.
 */
export default function GlobalDetailOverlay() {
  const globalSheet = useMapStore((s) => s.globalSheet);
  const closeGlobalSheet = useMapStore((s) => s.closeGlobalSheet);
  const setPendingCommute = useMapStore((s) => s.setPendingCommute);
  const setPendingRouteStart = useMapStore((s) => s.setPendingRouteStart);
  const router = useRouter();

  if (!globalSheet) return null;

  if (globalSheet.type === 'park') {
    return (
      <ParkDetailSheet
        isOpen
        onClose={closeGlobalSheet}
      />
    );
  }

  if (globalSheet.type === 'route') {
    return (
      <RouteDetailSheet
        isOpen
        route={globalSheet.route}
        onClose={closeGlobalSheet}
        onStartWorkout={(r) => {
          setPendingRouteStart(r);
          closeGlobalSheet();
          // Map is the only surface that owns DiscoverLayer's pendingRouteStart consumer,
          // so navigate there explicitly when the user is somewhere else in the app (same
          // condition onNavigate below already uses).
          if (typeof window !== 'undefined' && window.location.pathname !== '/map') {
            router.push('/map');
          }
        }}
        onNavigate={(r) => {
          if (!r.path?.length) return;
          const [lng, lat] = r.path[0];
          setPendingCommute({ coords: [lng, lat], label: r.name });
          closeGlobalSheet();
          // Map is the only surface that owns DiscoverLayer's
          // pendingCommute consumer, so navigate there explicitly
          // when the user is somewhere else in the app.
          if (typeof window !== 'undefined' && window.location.pathname !== '/map') {
            router.push('/map');
          }
        }}
      />
    );
  }

  return null;
}
