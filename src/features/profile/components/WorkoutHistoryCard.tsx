'use client';

import React from 'react';
import { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import RunningHistoryCard from './cards/RunningHistoryCard';
import StrengthHistoryCard from './cards/StrengthHistoryCard';
import ActivityHistoryCard from './cards/ActivityHistoryCard';

interface WorkoutHistoryCardProps {
  workout: WorkoutHistoryEntry;
  onClick: () => void;
}

/**
 * WorkoutHistoryCard - The Hub Component
 * Routes to the appropriate card component based on workoutType
 */
export default function WorkoutHistoryCard({ workout, onClick }: WorkoutHistoryCardProps) {
  // Route to appropriate card based on workout type
    switch (workout.workoutType) {
      case 'running':
      return <RunningHistoryCard workout={workout} onClick={onClick} />;
    
      case 'strength':
      return <StrengthHistoryCard workout={workout} onClick={onClick} />;
    
      case 'walking':
      case 'cycling':
      case 'hybrid':
      default:
      return <ActivityHistoryCard workout={workout} onClick={onClick} />;
  }
}
