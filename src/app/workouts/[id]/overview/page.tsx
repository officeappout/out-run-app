'use client';

// Force dynamic rendering to prevent SSR issues
export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useIsMounted } from '@/hooks/useIsMounted';
import { ArrowRight, Share2 } from 'lucide-react';
import StrengthOverviewCard from '@/features/workout-engine/components/StrengthOverviewCard';
import { WorkoutPlan } from '@/features/parks';
import { useUserStore } from '@/features/user';
import { getAllExercises, Exercise as FirestoreExercise, getLocalizedText } from '@/features/content/exercises';

/**
 * Fetch workout from Firestore and convert to WorkoutPlan format
 */
async function fetchWorkoutFromFirestore(workoutId: string): Promise<WorkoutPlan | null> {
  try {
    const exercises = await getAllExercises();
    
    if (!exercises || exercises.length === 0) {
      console.warn('[WorkoutOverviewPage] No exercises found in Firestore');
      return null;
    }

    // Separate exercises by role
    const warmupExercises = exercises.filter((ex) => ex.exerciseRole === 'warmup');
    const mainExercises = exercises.filter((ex) => ex.exerciseRole === 'main' || !ex.exerciseRole);
    const cooldownExercises = exercises.filter((ex) => ex.exerciseRole === 'cooldown');

    // Helper function to resolve image URL
    const resolveImageUrl = (ex: FirestoreExercise): string | undefined => {
      if (ex.execution_methods?.[0]?.media?.imageUrl) {
        return ex.execution_methods[0].media.imageUrl;
      }
      if (ex.execution_methods?.[0]?.media?.mainVideoUrl) {
        return ex.execution_methods[0].media.mainVideoUrl;
      }
      if (ex.media?.imageUrl) return ex.media.imageUrl;
      if (ex.media?.videoUrl) return ex.media.videoUrl;
      return undefined;
    };

    const segments: WorkoutPlan['segments'] = [];

    // Warm-up segment
    if (warmupExercises.length > 0) {
      segments.push({
        id: 'warmup-segment',
        type: 'station',
        title: 'חימום',
        icon: '🔥',
        target: { type: 'time', value: warmupExercises.length * 60 },
        exercises: warmupExercises.slice(0, 3).map((ex) => ({
          id: ex.id,
          name: getLocalizedText(ex.name),
          duration: '60 שניות',
          videoUrl: ex.execution_methods?.[0]?.media?.mainVideoUrl || ex.media?.videoUrl,
          imageUrl: resolveImageUrl(ex),
        })),
        isCompleted: false,
      });
    }

    // Main strength segment
    if (mainExercises.length > 0) {
      segments.push({
        id: 'strength-segment',
        type: 'station',
        title: 'תרגילי כוח',
        icon: '💪',
        target: { type: 'reps', value: 12 },
        exercises: mainExercises.slice(0, 6).map((ex) => ({
          id: ex.id,
          name: getLocalizedText(ex.name),
          reps: ex.type === 'reps' ? '12 חזרות' : undefined,
          duration: ex.type === 'time' ? '45 שניות' : undefined,
          videoUrl: ex.execution_methods?.[0]?.media?.mainVideoUrl || ex.media?.videoUrl,
          imageUrl: resolveImageUrl(ex),
        })),
        isCompleted: false,
      });
    }

    // Cool-down segment
    if (cooldownExercises.length > 0) {
      segments.push({
        id: 'cooldown-segment',
        type: 'station',
        title: 'קירור',
        icon: '🧘',
        target: { type: 'time', value: cooldownExercises.length * 60 },
        exercises: cooldownExercises.slice(0, 2).map((ex) => ({
          id: ex.id,
          name: getLocalizedText(ex.name),
          duration: '60 שניות',
          videoUrl: ex.execution_methods?.[0]?.media?.mainVideoUrl || ex.media?.videoUrl,
          imageUrl: resolveImageUrl(ex),
        })),
        isCompleted: false,
      });
    }

    // If no segments were created, create a default one
    if (segments.length === 0 && exercises.length > 0) {
      segments.push({
        id: 'main-segment',
        type: 'station',
        title: 'אימון כוח',
        icon: '💪',
        target: { type: 'reps', value: 12 },
        exercises: exercises.slice(0, 5).map((ex) => ({
          id: ex.id,
          name: getLocalizedText(ex.name),
          reps: '12 חזרות',
          videoUrl: ex.execution_methods?.[0]?.media?.mainVideoUrl || ex.media?.videoUrl,
          imageUrl: resolveImageUrl(ex),
        })),
        isCompleted: false,
      });
    }

    return {
      id: workoutId,
      name: 'אימון כוח',
      segments,
      totalDuration: segments.reduce((sum, seg) => sum + (seg.target?.value || 60), 0),
      difficulty: 'medium' as const,
    };
  } catch (error) {
    console.error('[WorkoutOverviewPage] Error fetching workout:', error);
    return null;
  }
}

export default function WorkoutOverviewPage() {
  const mounted = useIsMounted();
  const params = useParams();
  const router = useRouter();
  const workoutId = params.id as string;
  const userProfile = useUserStore((state) => state.profile);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);
  const [workout, setWorkout] = useState<WorkoutPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch workout from Firestore
  useEffect(() => {
    async function loadWorkout() {
      setIsLoading(true);
      setError(null);
      
      console.log('[WorkoutOverviewPage] Fetching workout, ID:', workoutId);
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
  const workoutType = 'strength' as 'strength' | 'running' | 'hybrid'; // Determine from workout data

  // Hero image - could be from workout.coverImage or persona image
  const heroImage = '/assets/lemur/king-lemur.png'; // Placeholder

  const handleStartWorkout = () => {
    // Navigate to active workout page
    router.push(`/workouts/${workoutId}/active`);
  };

  // Track scroll for collapsing header
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      setScrollY(scrollContainer.scrollTop);
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  // Calculate scroll-based animations
  const maxScroll = 300; // Start collapsing after 300px scroll (longer before fade)
  const scrollProgress = Math.min(scrollY / maxScroll, 1);
  // Image opacity stays at 1 longer, then fades more gradually
  const imageOpacity = Math.max(1 - scrollProgress * 0.7, 0);
  const imageScale = Math.max(1 - scrollProgress * 0.2, 0.8);
  const headerOpacity = Math.min(scrollProgress * 2, 1); // Fade in header faster
  
  // Dynamic height calculation - reduced from 400 to 320px
  const initialHeight = 320; // Initial height in pixels (tighter)
  const minHeight = 64; // Minimum height (sticky header height)
  const dynamicHeight = Math.max(initialHeight - scrollY * 0.8, minHeight);
  
  // Title position and size animation
  const titleScale = Math.max(1 - scrollProgress * 0.3, 0.7);
  const titleY = scrollProgress * 20; // Move up as we scroll

  // Modular rendering based on workout type
  const renderWorkoutSpecificCard = () => {
    // Guard: workout is guaranteed to be non-null here due to early return above
    if (!workout) return null;
    
    switch (workoutType) {
      case 'strength':
        return (
          <StrengthOverviewCard
            workoutPlan={workout}
            userProfile={userProfile || undefined}
            coverImage={heroImage}
            onStartWorkout={handleStartWorkout}
          />
        );
      case 'running':
        return (
          <div className="p-6">
            <p className="text-slate-600">Running workout overview - Coming soon</p>
          </div>
        );
      case 'hybrid':
        return (
          <div className="p-6">
            <p className="text-slate-600">Hybrid workout overview - Coming soon</p>
          </div>
        );
      default:
        return (
          <div className="p-6">
            <p className="text-slate-600">Workout overview - Coming soon</p>
          </div>
        );
    }
  };

  if (!mounted || isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-b from-white to-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">טוען את האימון...</p>
        </div>
      </div>
    );
  }

  if (error || !workout) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-b from-white to-gray-50" dir="rtl">
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
    <div className="min-h-screen bg-white dark:bg-zinc-900 flex flex-col overflow-hidden" dir="rtl">
      {/* Sticky Header - Appears on scroll */}
      <div
        className={`fixed top-0 left-0 right-0 z-50 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 transition-opacity duration-300 ${
          headerOpacity > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ opacity: headerOpacity }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center text-gray-700 dark:text-gray-300 active:scale-90 transition-transform"
            aria-label="חזור"
          >
            <ArrowRight size={20} />
          </button>
          <h1 className="text-lg font-black text-gray-900 dark:text-white flex-1 text-center px-4">
            {workout.name}
          </h1>
          <button
            className="w-10 h-10 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center text-gray-700 dark:text-gray-300 active:scale-90 transition-transform"
            aria-label="שתף"
          >
            <Share2 size={20} />
          </button>
        </div>
      </div>

      {/* Hero Section with Gradient */}
      <div
        className="relative w-full overflow-hidden flex-shrink-0 transition-all duration-300"
        style={{
          height: `${dynamicHeight}px`,
          opacity: imageOpacity,
          transform: `scale(${imageScale})`,
        }}
      >
        {/* Hero Image */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${heroImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {/* White Gradient Overlay (from bottom to top) - Less aggressive gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-white via-white/20 to-transparent" />
        </div>

        {/* Top Controls - Only visible when image is visible */}
        <div
          className={`absolute top-0 left-0 right-0 p-4 pt-14 flex justify-between items-start z-10 transition-opacity duration-300 ${
            imageOpacity > 0.5 ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <button
            onClick={() => router.back()}
            className="w-10 h-10 bg-white/20 dark:bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg text-white active:scale-90 transition-transform"
            aria-label="חזור"
          >
            <ArrowRight size={20} />
          </button>
          <button
            className="w-10 h-10 bg-white/20 dark:bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg text-white active:scale-90 transition-transform"
            aria-label="שתף"
          >
            <Share2 size={20} />
          </button>
        </div>

        {/* Workout Title Overlay - Moves up and shrinks as we scroll */}
        <div
          className={`absolute bottom-0 left-0 right-0 p-6 z-10 transition-opacity duration-300 ${
            imageOpacity > 0.3 ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          style={{
            transform: `translateY(-${titleY}px) scale(${titleScale})`,
            transformOrigin: 'bottom center',
          }}
        >
          <h1
            className="text-3xl font-black mb-2 text-slate-900 transition-all duration-300"
          >
            {workout.name}
          </h1>
        </div>
      </div>

      {/* Main Card - Overlapping by 40px */}
      <div
        ref={scrollContainerRef}
        className="flex-1 bg-white dark:bg-zinc-900 rounded-t-[32px] -mt-10 relative z-10 px-6 pt-8 pb-10 shadow-[0_-10px_25px_rgba(0,0,0,0.1)] overflow-y-auto"
      >
        {/* Scroll Indicator (Grabber Bar) */}
        <div className="flex justify-center pt-3 pb-2 mb-4">
          <div className="w-32 h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-full" />
        </div>

        {/* Workout-Specific Card Content */}
        {renderWorkoutSpecificCard()}
      </div>
    </div>
  );
}
