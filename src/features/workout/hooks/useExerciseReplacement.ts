/**
 * Hook for managing exercise replacement modal
 */
import { useState } from 'react';
import { Exercise, ExecutionMethod } from '@/types/exercise.type';
import { getExercise } from '@/features/admin/services/exercise.service';

export function useExerciseReplacement() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentExercise, setCurrentExercise] = useState<Exercise | null>(null);
  const [replacementCallback, setReplacementCallback] = useState<
    ((newExercise: Exercise, executionMethod: ExecutionMethod) => void) | null
  >(null);

  const openModal = async (
    exerciseId: string,
    onReplace: (newExercise: Exercise, executionMethod: ExecutionMethod) => void
  ) => {
    try {
      // Fetch full exercise data from Firestore
      const exercise = await getExercise(exerciseId);
      if (!exercise) {
        console.error('Exercise not found:', exerciseId);
        return;
      }

      setCurrentExercise(exercise);
      setReplacementCallback(() => onReplace);
      setIsModalOpen(true);
    } catch (error) {
      console.error('Error opening replacement modal:', error);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setCurrentExercise(null);
    setReplacementCallback(null);
  };

  const handleReplace = (newExercise: Exercise, executionMethod: ExecutionMethod) => {
    if (replacementCallback) {
      replacementCallback(newExercise, executionMethod);
    }
    closeModal();
  };

  return {
    isModalOpen,
    currentExercise,
    openModal,
    closeModal,
    handleReplace,
  };
}
