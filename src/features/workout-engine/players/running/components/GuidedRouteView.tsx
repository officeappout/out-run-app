'use client';

/**
 * GuidedRouteView
 * ---------------
 * Active-workout view for runMode === 'my_routes' (guided official routes).
 *
 * Composes:
 *   1. <FreeRun />                      — full state machine (active / paused /
 *                                          summary), GPS lifecycle, pace, laps,
 *                                          stats carousel, save flow.
 *   2. <GuidedRouteProgressStrip />     — overlay banner showing route name +
 *                                          progress %.
 *
 * Turn-by-turn instructions are NOT rendered here — the TurnCarousel
 * (mounted by MapShell whenever isNavigationMode || focusedRoute) handles that.
 *
 * Replaces the previous `() => null` ProgrammedRunView stub that left the
 * screen blank when runMode landed on 'my_routes'.
 */

import React from 'react';
import FreeRun from './FreeRun';
import GuidedRouteProgressStrip from './GuidedRouteProgressStrip';

const GuidedRouteView: React.FC = () => {
  return (
    <>
      <FreeRun />
      <GuidedRouteProgressStrip />
    </>
  );
};

export default GuidedRouteView;
