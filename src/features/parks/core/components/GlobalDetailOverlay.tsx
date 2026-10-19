'use client';

import React, { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import { useMapStore } from '../store/useMapStore';
import { routeOpenTarget } from '../utils/route-open-target';

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
 *
 * Note on the park Start Workout button (park-start-workout-wiring-plan, Phase 1,
 * 15.09.2026): same dead-button/no-global-drawer-mount gap ParkDetailSheet.onStartWorkout
 * had (confirmed — neither this overlay nor park-preview/index.tsx's local mount ever
 * passed it). Unlike the route case, the target isn't the live player directly — it's
 * WorkoutPreviewDrawer, which is page-local state on `/home` (no global mount exists for
 * it). So this hands off via pendingParkWorkoutStart to `/home`'s own consumer effect
 * instead of driving anything here directly. See docs/research/park-start-workout-wiring-plan.md.
 *
 * Route under enable_home_v2 (19.10.2026): not the legacy RouteDetailSheet — the
 * route goes to the map (useMapStore.pendingRouteOverview → DiscoverLayer), which
 * selects it and opens the ONE route overview drawer (RouteOverviewOverlay).
 * Falls back to the legacy sheet when the map can't take it (route-open-target.ts).
 */
export default function GlobalDetailOverlay() {
  const globalSheet = useMapStore((s) => s.globalSheet);
  const closeGlobalSheet = useMapStore((s) => s.closeGlobalSheet);
  const setPendingCommute = useMapStore((s) => s.setPendingCommute);
  const setPendingRouteStart = useMapStore((s) => s.setPendingRouteStart);
  const setPendingParkWorkoutStart = useMapStore((s) => s.setPendingParkWorkoutStart);
  const router = useRouter();
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;
  const hostMounted = useMapStore((s) => s.routeOverviewHostMounted);
  const setPendingRouteOverview = useMapStore((s) => s.setPendingRouteOverview);

  const sheetRoute = globalSheet?.type === 'route' ? globalSheet.route : null;
  const routeTarget = sheetRoute
    ? routeOpenTarget({
      v2,
      route: sheetRoute,
      onMap: typeof window !== 'undefined' && window.location.pathname === '/map',
      hostMounted,
    })
    : null;

  // v2: hand the route to the map's overview drawer (selected + focused there).
  useEffect(() => {
    if (!sheetRoute || routeTarget !== 'map') return;
    setPendingRouteOverview(sheetRoute);
    closeGlobalSheet();
    if (window.location.pathname !== '/map') router.push('/map');
  }, [sheetRoute, routeTarget, setPendingRouteOverview, closeGlobalSheet, router]);

  if (!globalSheet) return null;

  if (globalSheet.type === 'park') {
    return (
      <ParkDetailSheet
        isOpen
        onClose={closeGlobalSheet}
        onStartWorkout={() => {
          setPendingParkWorkoutStart(globalSheet.park);
          closeGlobalSheet();
          if (typeof window !== 'undefined' && window.location.pathname !== '/home') {
            router.push('/home');
          }
        }}
      />
    );
  }

  if (globalSheet.type === 'route') {
    if (routeTarget === 'map') return null;
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
