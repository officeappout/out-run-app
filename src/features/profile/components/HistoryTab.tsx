'use client';

import React, { useState, useMemo, useCallback } from 'react';
import WorkoutHistoryCard from '@/features/profile/components/WorkoutHistoryCard';
import { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import { WORKOUT_DELETE_EXPANDED_ENABLED } from '@/config/feature-flags';
import DeleteWorkoutConfirmModal from '@/components/ui/DeleteWorkoutConfirmModal';
import { deleteWorkoutWithReversal } from '@/lib/workoutDeletion';

type FilterType = 'all' | 'running' | 'strength';

interface HistoryTabProps {
  onWorkoutClick: (workout: WorkoutHistoryEntry) => void;
  /**
   * List state now lives in ProfilePage (see src/app/profile/page.tsx),
   * not in this component — ProfilePage is the common ancestor that stays
   * mounted across the swap to StrengthHistoryDetail/FreeRunSummary (this
   * component itself gets fully unmounted during that swap, since
   * ProfilePage's top-level `if (selectedWorkout)` early-return replaces its
   * entire returned subtree). Lifting the list here would mean a fresh
   * useWorkoutHistory() instance on every return trip, losing any
   * removeWorkout() call made while the detail view was showing.
   */
  workouts: WorkoutHistoryEntry[];
  isLoading: boolean;
  removeWorkout: (workoutId: string) => void;
}

// Short activity label for the shared delete-confirm modal's copy — same
// simple per-workoutType mapping style AerobicSummaryShell uses for its own
// delete confirmations.
function activityLabelFor(workoutType: WorkoutHistoryEntry['workoutType']): string {
  switch (workoutType) {
    case 'running':
      return 'ריצה';
    case 'walking':
      return 'הליכה';
    case 'cycling':
      return 'רכיבה';
    case 'strength':
      return 'אימון כוח';
    case 'hybrid':
      return 'אימון משולב';
    case 'recovery':
      return 'אימון התאוששות';
    default:
      return 'אימון';
  }
}

// Long-form Hebrew date for the modal body — same Hebrew long-date
// convention used across the workout-history surfaces.
function formatDateLabel(date: Date): string {
  return date.toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function HistoryTab({ onWorkoutClick, workouts, isLoading, removeWorkout }: HistoryTabProps) {
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  // Workout pending delete-confirmation; null when the modal is hidden.
  const [pendingDelete, setPendingDelete] = useState<WorkoutHistoryEntry | null>(null);

  const handleDeleteRequest = useCallback((workout: WorkoutHistoryEntry) => {
    setPendingDelete(workout);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete?.id) {
      // No id to delete against — dismiss rather than calling
      // deleteWorkoutWithReversal with an empty string.
      setPendingDelete(null);
      return;
    }
    const workoutId = pendingDelete.id;
    try {
      const result = await deleteWorkoutWithReversal(workoutId);
      // useWorkoutHistory() is a one-shot fetch, not a live Firestore
      // subscription — it will NOT pick up this deletion on its own, so the
      // row must be removed from local state explicitly, and only once the
      // delete actually succeeded (a failed delete leaves the doc in place,
      // so the row should stay visible for retry).
      if (result.deleted) {
        removeWorkout(workoutId);
      }
    } finally {
      setPendingDelete(null);
    }
  }, [pendingDelete, removeWorkout]);

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
                  onDeleteRequest={handleDeleteRequest}
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

      {WORKOUT_DELETE_EXPANDED_ENABLED && (
        <DeleteWorkoutConfirmModal
          isOpen={pendingDelete !== null}
          activityLabel={pendingDelete ? activityLabelFor(pendingDelete.workoutType) : ''}
          dateLabel={pendingDelete ? formatDateLabel(pendingDelete.date) : ''}
          xpToReverse={pendingDelete?.xpEarned ?? 0}
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
