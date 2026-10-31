"use client";

import React from 'react';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import PlannedRun from './PlannedRun';

interface ActiveDashboardProps {
  nextStation?: string;
}

/**
 * The map's "active" layer: a planned run. Free runs, walks and routes play in FreeRunLayer
 * (MapShell routes runMode 'free' there), so the old free / guided-route views were removed
 * (31.10.2026, archived at tag archive/old-players-2026-10-31).
 */
export const ActiveDashboard: React.FC<ActiveDashboardProps> = () => {
  const { runMode } = useRunningPlayer();
  return runMode === 'plan' ? <PlannedRun /> : null;
};
