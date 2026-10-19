'use client';

/**
 * RouteOverviewOverlay — mounts the route overview drawer over the map with
 * the blue route-preview title bar ("מבט על מסלול · name"), and swaps to the
 * full route page (the caller's RouteDetailSheet: community, arrivals, data
 * credits) on "כל פרטי המסלול". enable_home_v2 only — DiscoverLayer mounts it
 * for v2 users in place of RouteDetailSheet / on a generator card tap.
 */

import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import OverviewTitleBar from '../../hybrid/OverviewTitleBar';
import RouteOverviewDrawer, { type RouteOverviewDrawerProps } from './RouteOverviewDrawer';

export interface RouteOverviewOverlayProps extends Omit<RouteOverviewDrawerProps, 'onOpenFullDetails'> {
  /** The full route page; `close` returns to the drawer. Omit → no "כל פרטי המסלול" link. */
  renderFullDetails?: (close: () => void) => ReactNode;
}

export default function RouteOverviewOverlay({ renderFullDetails, ...drawer }: RouteOverviewOverlayProps) {
  const [full, setFull] = useState(false);
  if (full && renderFullDetails) return <>{renderFullDetails(() => setFull(false))}</>;
  return (
    <>
      <motion.div
        key="route-overview-title-bar"
        className="absolute inset-x-0 top-0 z-[70] pointer-events-none"
        initial={{ y: -160, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
      >
        <OverviewTitleBar title={drawer.route.name?.trim() || 'מסלול'} eyebrow="מבט על מסלול" onBack={drawer.onBack} />
      </motion.div>
      <RouteOverviewDrawer {...drawer} onOpenFullDetails={renderFullDetails ? () => setFull(true) : undefined} />
    </>
  );
}
