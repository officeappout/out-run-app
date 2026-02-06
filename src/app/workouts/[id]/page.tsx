'use client';

// Force dynamic rendering to prevent SSR issues
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Play, Home } from 'lucide-react';
import WorkoutPreviewHeader from '@/features/workout-engine/components/WorkoutPreviewHeader';
import StrengthExerciseCard from '@/features/workout-engine/components/cards/StrengthExerciseCard';
import RunningSegmentCard from '@/features/workout-engine/components/cards/RunningSegmentCard';
import { getAllExercises, Exercise as FirestoreExercise, getLocalizedText } from '@/features/content/exercises';

interface WorkoutSegment {
  id: string;
  type: 'running' | 'strength';
  title: string;
  durationOrDistance?: string;
  pace?: string;
  statusColor?: string;
  repsOrDuration?: string;
  imageUrl?: string | null;
}

interface WorkoutData {
  id: string;
  title: string;
  description?: string;
  level?: string;
  difficulty?: string;
  duration?: number;
  coverImage?: string;
  routePath?: number[][] | Array<{ lat: number; lng: number }>;
  segments: WorkoutSegment[];
}

/**
 * Fetch workout data from Firestore
 */
async function fetchWorkoutFromFirestore(workoutId: string): Promise<WorkoutData | null> {
  try {
    const exercises = await getAllExercises();
    
    if (!exercises || exercises.length === 0) {
      console.warn('[WorkoutPreviewPage] No exercises found in Firestore');
      return null;
    }

    // Helper to resolve image URL
    const resolveImageUrl = (ex: FirestoreExercise): string | null => {
      if (ex.execution_methods?.[0]?.media?.imageUrl) {
        return ex.execution_methods[0].media.imageUrl;
      }
      if (ex.execution_methods?.[0]?.media?.mainVideoUrl) {
        return ex.execution_methods[0].media.mainVideoUrl;
      }
      if (ex.media?.imageUrl) return ex.media.imageUrl;
      if (ex.media?.videoUrl) return ex.media.videoUrl;
      return null;
    };

    // Convert exercises to workout segments
    const segments: WorkoutSegment[] = exercises.slice(0, 8).map((ex, index) => ({
      id: ex.id,
      type: 'strength' as const,
      title: getLocalizedText(ex.name),
      repsOrDuration: ex.type === 'reps' ? '12 חזרות' : '45 שניות',
      imageUrl: resolveImageUrl(ex),
    }));

    return {
      id: workoutId,
      title: 'אימון כוח מותאם',
      description: 'אימון דינמי המותאם לרמה שלך',
      level: 'medium',
      difficulty: 'medium',
      duration: 45,
      coverImage: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=800&q=80',
      segments,
    };
  } catch (error) {
    console.error('[WorkoutPreviewPage] Error fetching workout:', error);
    return null;
  }
}

export default function WorkoutPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const workoutId = params.id as string;
  const [workout, setWorkout] = useState<WorkoutData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch workout from Firestore
  useEffect(() => {
    async function loadWorkout() {
      setIsLoading(true);
      setError(null);
      
      console.log('[WorkoutPreviewPage] Fetching workout, ID:', workoutId);
      const firestoreWorkout = await fetchWorkoutFromFirestore(workoutId);
      
      if (firestoreWorkout) {
        setWorkout(firestoreWorkout);
      } else {
        setError('לא הצלחנו לטעון את האימון');
      }
      
      setIsLoading(false);
    }
    
    loadWorkout();
  }, [workoutId]);

  const handleStartWorkout = () => {
    // Navigate to active workout page
    router.push(`/workouts/${workoutId}/active`);
  };

  const handleSwapExercise = (segmentId: string) => {
    console.log('Swap exercise for segment:', segmentId);
    // Implement exercise swap logic
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">טוען את האימון...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !workout) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-gray-50" dir="rtl">
        <div className="text-center px-6">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">😕</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">לא הצלחנו לטעון את האימון</h2>
          <p className="text-gray-500 mb-6">{error || 'נסה שוב מאוחר יותר'}</p>
          <button
            onClick={() => router.push('/home')}
            className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 px-8 rounded-xl transition-all"
          >
            חזרה לדף הבית
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-white dark:bg-gray-900 flex flex-col overflow-hidden"
      dir="rtl"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      {/* Hero Section */}
      <WorkoutPreviewHeader
        title={workout.title}
        description={workout.description}
        coverImage={workout.coverImage}
        routePath={workout.routePath || undefined}
        difficulty={workout.difficulty}
        duration={workout.duration}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto pb-24">
        <div className="px-4 py-6 space-y-4">
          {/* Segments Timeline */}
          {workout.segments.map((segment: WorkoutSegment, index: number) => {
            if (segment.type === 'running') {
              return (
                <RunningSegmentCard
                  key={segment.id}
                  title={segment.title}
                  durationOrDistance={segment.durationOrDistance}
                  pace={segment.pace}
                  statusColor={segment.statusColor}
                />
              );
            } else if (segment.type === 'strength') {
              return (
                <StrengthExerciseCard
                  key={segment.id}
                  title={segment.title}
                  repsOrDuration={segment.repsOrDuration}
                  imageUrl={segment.imageUrl || undefined}
                  onSwap={() => handleSwapExercise(segment.id)}
                />
              );
            }
            return null;
          })}
        </div>
      </div>

      {/* Sticky Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-50">
        <div className="px-4 py-4 flex items-center gap-3">
          {/* Start Workout Button */}
          <button
            onClick={handleStartWorkout}
            className="flex-1 bg-[#00ADEF] hover:bg-[#0099D6] text-white font-bold py-4 px-6 rounded-2xl shadow-lg shadow-[#00ADEF]/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Play size={20} fill="currentColor" />
            <span>התחל אימון</span>
          </button>

          {/* Bottom Navigation */}
          <button
            onClick={() => router.push('/home')}
            className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center text-gray-600 dark:text-gray-400 active:scale-95 transition-transform"
            aria-label="בית"
          >
            <Home size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
