'use client';

/**
 * RouteOverviewSheet — the v2 route overview as a standalone sheet, for a
 * route opened outside the map that the map can't take right now
 * (enable_map_polish_v1; route-open-target.ts → 'sheet'): a route with < 2
 * points (no line to draw), or /map with Discover down. Same drawer + title
 * bar as on the map, over a dimmed backdrop instead of the map line; the
 * route's data credits sit under "פירוט" (no legacy RouteDetailSheet).
 * Start sets the player's activity first (as DiscoverLayer's startRouteAs does).
 */

import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import RouteOverviewOverlay from './RouteOverviewOverlay';
import type { RouteOverviewDrawerProps } from './RouteOverviewDrawer';
import { playerActivityFor } from './route-overview';

export type RouteOverviewSheetProps = Omit<RouteOverviewDrawerProps, 'onOpenFullDetails' | 'topSlot' | 'showCredits'>;

export default function RouteOverviewSheet(props: RouteOverviewSheetProps) {
  return (
    <div className="fixed inset-0 z-[100]" data-testid="route-overview-sheet">
      <div className="absolute inset-0 bg-black/30" onClick={props.onBack} aria-hidden />
      <RouteOverviewOverlay {...props} showCredits
        onStart={(r, act) => { useRunningPlayer.getState().setActivityType(playerActivityFor(act)); props.onStart(r, act); }} />
    </div>
  );
}
