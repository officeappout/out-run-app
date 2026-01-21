/**
 * Example: How to integrate ExerciseReplacementModal
 * 
 * This file shows how to use the ExerciseReplacementModal in your workout components.
 * 
 * Example usage in StationCard or similar component:
 */

'use client';

import React from 'react';
import { useExerciseReplacement } from '../hooks/useExerciseReplacement';
import ExerciseReplacementModal from './ExerciseReplacementModal';
import { ExecutionMethod } from '@/types/exercise.type';
import { UserFullProfile } from '@/types/user-profile';
import { Park } from '@/types/admin-types';
import { useUserStore } from '@/features/user/store/useUserStore';

// Example: Integration in a workout component
export function ExampleWorkoutComponent() {
  const replacement = useExerciseReplacement();
  const userProfile = useUserStore((state) => state.profile);
  
  // These would come from your workout state/context
  const currentLevel = 5; // User's current level for the exercise domain
  const location: 'home' | 'park' | 'street' = 'park'; // Current workout location
  const park: Park | null = null; // Current park if at park location

  const handleExerciseReplace = (
    exerciseId: string,
    segmentId: string,
    exerciseIndex: number
  ) => {
    replacement.openModal(exerciseId, (newExercise, executionMethod) => {
      // Update workout state with new exercise
      // This is where you'd update your workout plan/state
      console.log('Replacing exercise:', {
        segmentId,
        exerciseIndex,
        newExercise: newExercise.name,
        videoUrl: executionMethod.media.mainVideoUrl,
      });

      // Example: Update workout state
      // updateWorkoutExercise(segmentId, exerciseIndex, {
      //   id: newExercise.id,
      //   name: newExercise.name,
      //   videoUrl: executionMethod.media.mainVideoUrl,
      //   executionMethod,
      // });
    });
  };

  if (!userProfile) {
    return null; // User not loaded
  }

  return (
    <>
      {/* Your workout UI here */}
      {/* Example button to trigger modal */}
      <button onClick={() => handleExerciseReplace('exercise-id-123', 'segment-1', 0)}>
        Replace Exercise
      </button>

      {/* Modal */}
      {replacement.currentExercise && (
        <ExerciseReplacementModal
          isOpen={replacement.isModalOpen}
          onClose={replacement.closeModal}
          currentExercise={replacement.currentExercise}
          currentLevel={currentLevel}
          location={location}
          park={park}
          userProfile={userProfile}
          onReplace={replacement.handleReplace}
        />
      )}
    </>
  );
}

/**
 * Integration Steps:
 * 
 * 1. Import the hook and modal:
 *    import { useExerciseReplacement } from '@/features/workout/hooks/useExerciseReplacement';
 *    import ExerciseReplacementModal from '@/features/workout/components/ExerciseReplacementModal';
 * 
 * 2. Use the hook in your component:
 *    const replacement = useExerciseReplacement();
 * 
 * 3. Get user profile and workout context:
 *    const userProfile = useUserStore((state) => state.profile);
 *    const currentLevel = /* user's level for exercise domain *\/;
 *    const location = /* 'home' | 'park' | 'street' *\/;
 *    const park = /* Park object if at park *\/;
 * 
 * 4. Add a button/trigger to open the modal:
 *    <button onClick={() => replacement.openModal(exerciseId, handleReplace)}>
 *      Replace Exercise
 *    </button>
 * 
 * 5. Render the modal:
 *    {replacement.currentExercise && (
 *      <ExerciseReplacementModal
 *        isOpen={replacement.isModalOpen}
 *        onClose={replacement.closeModal}
 *        currentExercise={replacement.currentExercise}
 *        currentLevel={currentLevel}
 *        location={location}
 *        park={park}
 *        userProfile={userProfile}
 *        onReplace={replacement.handleReplace}
 *      />
 *    )}
 * 
 * 6. Handle the replacement in your onReplace callback:
 *    const handleReplace = (newExercise, executionMethod) => {
 *      // Update your workout state
 *      // The executionMethod contains the videoUrl for the current context
 *      updateWorkoutExercise(newExercise, executionMethod);
 *    };
 */
