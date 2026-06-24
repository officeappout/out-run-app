'use client';

/**
 * GuidedRouteView
 * ---------------
 * Active-workout view for runMode === 'my_routes' (guided official routes).
 *
 * Composes:
 *   1. <FreeRun /> — full state machine (active / paused / summary),
 *                    GPS lifecycle, pace, laps, stats carousel, save flow.
 *                    FreeRunActive renders RouteStoryBar internally for guided routes.
 *
 * Turn-by-turn instructions are NOT rendered here — the TurnCarousel
 * (mounted by MapShell whenever isNavigationMode || focusedRoute) handles that.
 *
 * Replaces the previous `() => null` ProgrammedRunView stub that left the
 * screen blank when runMode landed on 'my_routes'.
 */

import React from 'react';
import FreeRun from './FreeRun';

const GuidedRouteView: React.FC = () => {
  return <FreeRun />;
};

export default GuidedRouteView;
