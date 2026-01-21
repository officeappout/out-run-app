"use client";

import React from 'react';
import { useRunningPlayer } from '../store/useRunningPlayer';
import { FreeRunView } from './FreeRunView';
import { IntervalRunView } from './IntervalRunView';

// Placeholder until ProgrammedRunView is implemented
const ProgrammedRunView: React.FC = () => null;

interface ActiveDashboardProps {
  nextStation?: string;
}

// View Dispatcher for running modes
export const ActiveDashboard: React.FC<ActiveDashboardProps> = ({ nextStation }) => {
  const { runMode } = useRunningPlayer();

  switch (runMode) {
    case 'free':
      return <FreeRunView nextStation={nextStation} />;
    // In a fuller implementation, interval mode would be driven by the current RunBlock
    case 'plan':
      return <IntervalRunView />;
    case 'my_routes':
      return <ProgrammedRunView />;
    default:
      return <FreeRunView nextStation={nextStation} />;
  }
};
