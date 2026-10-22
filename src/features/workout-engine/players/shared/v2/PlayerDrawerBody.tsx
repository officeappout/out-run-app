'use client';

/**
 * PlayerDrawerBody — the inside of a white player card that can collapse
 * (enable_strength_drawer_v1). No drawer → `fallbackGrabber` + children,
 * i.e. exactly today's card. With a drawer: the drag grabber, then either the
 * full content or the compact row. The card component stays mounted across
 * snaps, so timers / fill animations that live in it keep running.
 */

import React from 'react';
import SnapDrawerGrabber from './SnapDrawerGrabber';
import type { SnapDrawerState } from './useSnapDrawer';

export interface PlayerDrawerBodyProps {
  drawer?: SnapDrawerState | null;
  /** Today's grabber, rendered only without a drawer. */
  fallbackGrabber?: React.ReactNode;
  /** The compact row (PlayerDrawerCompact). Null = this phase never collapses. */
  compact?: React.ReactNode;
  children: React.ReactNode;
}

export default function PlayerDrawerBody({ drawer, fallbackGrabber = null, compact = null, children }: PlayerDrawerBodyProps) {
  if (!drawer || compact == null) {
    return (
      <>
        {fallbackGrabber}
        {children}
      </>
    );
  }
  return (
    <>
      <SnapDrawerGrabber drawer={drawer} />
      {drawer.collapsed ? compact : children}
    </>
  );
}
