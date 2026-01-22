'use client';

import React, { useState, useMemo } from 'react';
import { useWorkoutHistory } from '@/features/profile/hooks/useWorkoutHistory';
import WorkoutHistoryCard from '@/features/profile/components/WorkoutHistoryCard';
import { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';

type FilterType = 'all' | 'running' | 'strength';

interface HistoryTabProps {
  onWorkoutClick: (workout: WorkoutHistoryEntry) => void;
}

export default function HistoryTab({ onWorkoutClick }: HistoryTabProps) {
  const { workouts, isLoading } = useWorkoutHistory();
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  // Filter workouts based on active filter
  const filteredWorkouts = useMemo(() => {
    if (activeFilter === 'all') {
      return workouts;
    }
    return workouts.filter((workout) => {
      if (activeFilter === 'running') {
        return workout.workoutType === 'running' || workout.workoutType === 'walking' || workout.workoutType === 'cycling';
      }
      if (activeFilter === 'strength') {
        return workout.workoutType === 'strength';
      }
      return true;
    });
  }, [workouts, activeFilter]);

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'הכל' },
    { key: 'running', label: 'ריצה' },
    { key: 'strength', label: 'כוח' },
  ];

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide" dir="rtl">
        {filters.map((filter) => (
          <button
            key={filter.key}
            onClick={() => setActiveFilter(filter.key)}
            className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
              activeFilter === filter.key
                ? 'bg-[#00ADEF] text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Workout Cards */}
      {isLoading ? (
        <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
          <p className="text-gray-500">טוען אימונים...</p>
        </div>
      ) : filteredWorkouts.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
          <p className="text-gray-500 text-sm font-simpler">אין אימונים רשומים</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredWorkouts.map((workout) => {
            try {
              // Validate workout data before rendering
              if (!workout || !workout.id) {
                console.warn('[HistoryTab] Skipping invalid workout:', workout);
                return null;
              }
              
              return (
                <WorkoutHistoryCard
                  key={workout.id}
                  workout={workout}
                  onClick={() => onWorkoutClick(workout)}
                />
              );
            } catch (error) {
              console.error('[HistoryTab] Error rendering workout card:', workout?.id, error);
              // Return a fallback card instead of crashing
              return (
                <div
                  key={workout?.id || `error-${Math.random()}`}
                  className="w-full bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center"
                >
                  <p className="text-sm text-gray-500">שגיאה בטעינת האימון</p>
                </div>
              );
            }
          })}
        </div>
      )}
    </div>
  );
}
