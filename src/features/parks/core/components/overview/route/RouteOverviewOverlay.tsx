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
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import OverviewTitleBar from '../../hybrid/OverviewTitleBar';
import RouteOverviewDrawer, { type RouteOverviewDrawerProps } from './RouteOverviewDrawer';

export interface RouteOverviewOverlayProps extends Omit<RouteOverviewDrawerProps, 'onOpenFullDetails' | 'topSlot'> {
  /** The full route page; `close` returns to the drawer. Omit → no "כל פרטי המסלול" link. */
  renderFullDetails?: (close: () => void) => ReactNode;
  /** Board M-6j: a card at the top of the drawer; `open` switches to `renderWorkoutView`. */
  renderTopCard?: (open: () => void) => ReactNode;
  /** Board M-6j → 5c: today's workout on this route, in place of the route drawer; `back` returns. */
  renderWorkoutView?: (back: () => void) => ReactNode;
}

export default function RouteOverviewOverlay({ renderFullDetails, renderTopCard, renderWorkoutView, ...drawer }: RouteOverviewOverlayProps) {
  const t = useT(map);
  const [full, setFull] = useState(false);
  const [workoutView, setWorkoutView] = useState(false);
  if (full && renderFullDetails) return <>{renderFullDetails(() => setFull(false))}</>;
  const showWorkout = workoutView && !!renderWorkoutView;
  return (
    <>
      <motion.div
        key="route-overview-title-bar"
        className="absolute inset-x-0 top-0 z-[70] pointer-events-none"
        initial={{ y: -160, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
      >
        <OverviewTitleBar title={drawer.route.name?.trim() || t('overview.route.nameFallback')} eyebrow={showWorkout ? t('overview.route.titleBar.workout') : t('overview.route.titleBar.route')}
          onBack={showWorkout ? () => setWorkoutView(false) : drawer.onBack} />
      </motion.div>
      {showWorkout
        ? renderWorkoutView!(() => setWorkoutView(false))
        : <RouteOverviewDrawer {...drawer} onOpenFullDetails={renderFullDetails ? () => setFull(true) : undefined}
            topSlot={renderTopCard?.(() => setWorkoutView(true))} />}
    </>
  );
}
