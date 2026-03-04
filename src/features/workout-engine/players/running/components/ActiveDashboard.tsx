"use client";

import React from 'react';
import { useRunningPlayer } from '../store/useRunningPlayer';
import { FreeRunView } from './FreeRunView';
import PlannedRun from './PlannedRun';

const ProgrammedRunView: React.FC = () => null;

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
      return <ProgrammedRunView />;
    default:
      return <FreeRunView nextStation={nextStation} />;
  }
};
