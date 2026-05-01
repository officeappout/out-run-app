'use client';

import React from 'react';
import { ActiveDashboard } from '@/features/workout-engine/players/running';
import { useMapLogic } from '@/features/parks';

type MapLogic = ReturnType<typeof useMapLogic>;

interface ActiveWorkoutLayerProps {
  logic: MapLogic;
}

export default function ActiveWorkoutLayer({ logic }: ActiveWorkoutLayerProps) {
  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      <ActiveDashboard />
    </div>
  );
}
