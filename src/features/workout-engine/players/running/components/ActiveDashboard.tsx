"use client";

import React from 'react';
import { useRunningPlayer } from '../store/useRunningPlayer';
import { FreeRunView } from './FreeRunView';
import PlannedRun from './PlannedRun';
import GuidedRouteView from './GuidedRouteView';

interface ActiveDashboardProps {
  nextStation?: string;
}

export const ActiveDashboard: React.FC<ActiveDashboardProps> = ({ nextStation }) => {
  const { runMode } = useRunningPlayer();

  switch (runMode) {
    case 'free':
      return <FreeRunView nextStation={nextStation} />;
    case 'plan':
      return <PlannedRun />;
    case 'my_routes':
      // Guided official route → free-run player + route name / progress overlay.
      // Turn-by-turn instructions come from the TurnCarousel mounted by MapShell.
      return <GuidedRouteView />;
    default:
      return <FreeRunView nextStation={nextStation} />;
  }
};
