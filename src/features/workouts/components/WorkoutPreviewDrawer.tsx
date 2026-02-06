'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { Play, X, Info, Package, Activity, Target, ArrowRight, Share2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { WorkoutPlan, WorkoutSegment, Exercise as WorkoutExercise } from '@/features/parks';
import StrengthOverviewCard from '@/features/workout-engine/components/StrengthOverviewCard';
import ExpandableText from './ExpandableText';
import { generateWorkoutExperience } from '@/features/workout-engine/utils/messageGenerator';
import { getClassificationLabel, type WorkoutClassification } from '@/features/workout-engine/utils/classification';
import { useUserStore } from '@/features/user';
import { getAllExercises, Exercise as FirestoreExercise, getLocalizedText } from '@/features/content/exercises';

/**
 * Convert Firestore exercises to WorkoutPlan format
 * Organizes exercises into segments: Warm-up, Strength, Cool-down
 */
async function convertExercisesToWorkoutPlan(exercises: FirestoreExercise[]): Promise<WorkoutPlan> {
  // Separate exercises by role
  const warmupExercises = exercises.filter((ex) => ex.exerciseRole === 'warmup');
  const mainExercises = exercises.filter((ex) => ex.exerciseRole === 'main' || !ex.exerciseRole);
  const cooldownExercises = exercises.filter((ex) => ex.exerciseRole === 'cooldown');

  const segments: WorkoutSegment[] = [];

  // Helper function to resolve image URL with priority
  const resolveImageUrl = (ex: FirestoreExercise): string | undefined => {
    // Priority 1: execution_methods[0].media.imageUrl (The new structure)
    if (ex.execution_methods?.[0]?.media?.imageUrl) {
      return ex.execution_methods[0].media.imageUrl;
    }
    
    // Priority 2: execution_methods[0].media.mainVideoUrl (As a fallback to show a video thumbnail)
    if (ex.execution_methods?.[0]?.media?.mainVideoUrl) {
      return ex.execution_methods[0].media.mainVideoUrl;
    }
    
    // Priority 3: Legacy media.imageUrl
    if (ex.media?.imageUrl) return ex.media.imageUrl;
    
    // Priority 4: Legacy media.videoUrl
    if (ex.media?.videoUrl) return ex.media.videoUrl;
    
    return undefined;
  };

  // Warm-up segment
  if (warmupExercises.length > 0) {
    const warmupWorkoutExercises: WorkoutExercise[] = warmupExercises.map((ex) => {
      // Get media from execution methods (first method, home location preferred)
      const executionMethod = ex.execution_methods?.find((m) => m.location === 'home') || ex.execution_methods?.[0];
      const mainVideoUrl = executionMethod?.media?.mainVideoUrl || ex.media?.videoUrl;
      const imageUrl = resolveImageUrl(ex);

      // Determine target (time for warmup, or from exercise type)
      let targetType: 'time' | 'reps' = 'time';
      let targetValue = 60; // Default 60 seconds for warmup
      let reps: string | undefined;
      let duration: string | undefined;

      if (ex.type === 'time') {
        targetType = 'time';
        targetValue = ex.secondsPerRep ? ex.secondsPerRep * 10 : 60; // Estimate
        duration = `${targetValue} שניות`;
      } else if (ex.type === 'reps') {
        targetType = 'reps';
        targetValue = 10; // Default
        reps = '10 חזרות';
      } else {
        // Follow-along: use video duration or default
        duration = '5 דקות';
      }

      return {
        id: ex.id,
        name: getLocalizedText(ex.name),
        reps,
        duration,
        videoUrl: mainVideoUrl,
        imageUrl,
        instructions: ex.content?.highlights || [],
        icon: '🔥',
      };
    });

    segments.push({
      id: 'warmup-segment',
      type: 'station',
      title: 'חימום',
      icon: '🔥',
      target: {
        type: 'time',
        value: warmupExercises.reduce((sum, ex) => {
          if (ex.type === 'time' && ex.secondsPerRep) {
            return sum + ex.secondsPerRep * 10;
          }
          return sum + 60; // Default 60 seconds per warmup exercise
        }, 0),
      },
      exercises: warmupWorkoutExercises,
      isCompleted: false,
    });
  }

  // Strength segment(s) - group main exercises
  if (mainExercises.length > 0) {
    const strengthWorkoutExercises: WorkoutExercise[] = mainExercises.map((ex) => {
      // Get media from execution methods
      const executionMethod = ex.execution_methods?.find((m) => m.location === 'home') || ex.execution_methods?.[0];
      const mainVideoUrl = executionMethod?.media?.mainVideoUrl || ex.media?.videoUrl;
      const imageUrl = resolveImageUrl(ex);

      // Determine target based on exercise type
      let targetType: 'time' | 'reps' = 'reps';
      let targetValue = 12; // Default
      let reps: string | undefined;
      let duration: string | undefined;

      if (ex.type === 'time') {
        targetType = 'time';
        targetValue = ex.secondsPerRep ? ex.secondsPerRep * 10 : 45;
        duration = `${targetValue} שניות`;
      } else if (ex.type === 'reps') {
        targetType = 'reps';
        targetValue = 12; // Default
        reps = '12 חזרות';
      }

      return {
        id: ex.id,
        name: getLocalizedText(ex.name),
        reps,
        duration,
        videoUrl: mainVideoUrl,
        imageUrl,
        instructions: ex.content?.highlights || [],
        icon: '💪',
      };
    });

    segments.push({
      id: 'strength-segment',
      type: 'station',
      title: 'תרגילי כוח',
      icon: '💪',
      target: {
        type: mainExercises[0]?.type === 'time' ? 'time' : 'reps',
        value: mainExercises[0]?.type === 'time' ? 45 : 12,
      },
      exercises: strengthWorkoutExercises,
      isCompleted: false,
    });
  }

  // Cool-down segment
  if (cooldownExercises.length > 0) {
    const cooldownWorkoutExercises: WorkoutExercise[] = cooldownExercises.map((ex) => {
      // Get media from execution methods
      const executionMethod = ex.execution_methods?.find((m) => m.location === 'home') || ex.execution_methods?.[0];
      const mainVideoUrl = executionMethod?.media?.mainVideoUrl || ex.media?.videoUrl;
      const imageUrl = resolveImageUrl(ex);

      return {
        id: ex.id,
        name: getLocalizedText(ex.name),
        duration: '5 דקות',
        videoUrl: mainVideoUrl,
        imageUrl,
        instructions: ex.content?.highlights || [],
        icon: '🧘',
      };
    });

    segments.push({
      id: 'cooldown-segment',
      type: 'station',
      title: 'קירור',
      icon: '🧘',
      target: {
        type: 'time',
        value: cooldownExercises.length * 60, // 1 minute per exercise
      },
      exercises: cooldownWorkoutExercises,
      isCompleted: false,
    });
  }

  // Calculate total duration (rough estimate)
  const totalDuration = segments.reduce((sum, seg) => {
    if (seg.target.type === 'time') {
      return sum + seg.target.value;
    }
    // For reps, estimate 3 seconds per rep
    return sum + (seg.target.value * 3);
  }, 0);

  return {
    id: 'real-workout-' + Date.now(),
    name: 'אימון כוח',
    segments,
    totalDuration: Math.ceil(totalDuration / 60), // Convert to minutes
    difficulty: 'medium' as const,
  };
}

// No more MOCK_WORKOUT - we use real data from Firestore

interface WorkoutSegment {
  id: string;
  type: 'running' | 'strength';
  title: string;
  durationOrDistance?: string;
  pace?: string;
  statusColor?: string;
  repsOrDuration?: string;
  imageUrl?: string | null;
  tags?: string[];
  matchesUserEquipment?: boolean; // Whether this exercise was selected because of user-owned equipment
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

interface WorkoutPreviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  workout: WorkoutData | null;
  onStartWorkout?: (workoutId: string) => void;
}

const DRAWER_HEIGHT = '85vh';
const CLOSE_THRESHOLD = 200; // pixels to drag down before closing

/**
 * WorkoutPreviewDrawer - Draggable bottom sheet for workout preview
 */
/**
 * Convert WorkoutData to WorkoutPlan format
 */
function convertWorkoutDataToPlan(workoutData: WorkoutData): WorkoutPlan {
  const segments = workoutData.segments.map((segment) => {
    let targetType: 'distance' | 'time' | 'reps' = 'time';
    let targetValue = 30;

    if (segment.repsOrDuration) {
      if (segment.repsOrDuration.includes('חזרות') || segment.repsOrDuration.includes('reps')) {
        targetType = 'reps';
        const match = segment.repsOrDuration.match(/(\d+)/);
        targetValue = match ? parseInt(match[1], 10) : 10;
      } else if (segment.repsOrDuration.includes('שניות') || segment.repsOrDuration.includes('seconds')) {
        targetType = 'time';
        const match = segment.repsOrDuration.match(/(\d+)/);
        targetValue = match ? parseInt(match[1], 10) : 30;
      } else if (segment.durationOrDistance) {
        targetType = 'time';
        const match = segment.durationOrDistance.match(/(\d+)/);
        targetValue = match ? parseInt(match[1], 10) * 60 : 300;
      }
    }

    return {
      id: segment.id,
      type: segment.type === 'strength' ? 'station' : 'travel',
      title: segment.title,
      subTitle: segment.repsOrDuration || segment.durationOrDistance,
      icon: segment.imageUrl || '💪',
      target: {
        type: targetType,
        value: targetValue,
      },
      exercises: segment.type === 'strength' ? [
        {
          id: `${segment.id}-exercise`,
          name: segment.title,
          reps: segment.repsOrDuration?.includes('חזרות') ? segment.repsOrDuration : undefined,
          duration: segment.repsOrDuration?.includes('שניות') ? segment.repsOrDuration : undefined,
          videoUrl: segment.imageUrl || undefined,
        },
      ] : undefined,
      isCompleted: false,
    };
  });

  return {
    id: workoutData.id,
    name: workoutData.title,
    segments,
    totalDuration: (workoutData.duration || 45) * 60,
    difficulty: (workoutData.difficulty || 'medium') as 'easy' | 'medium' | 'hard',
  };
}

export default function WorkoutPreviewDrawer({
  isOpen,
  onClose,
  workout,
  onStartWorkout,
}: WorkoutPreviewDrawerProps) {
  const router = useRouter();
  const { profile } = useUserStore();
  const y = useMotionValue(0);
  const opacity = useTransform(y, [0, 300], [1, 0]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);
  const [realWorkoutPlan, setRealWorkoutPlan] = useState<WorkoutPlan | null>(null);
  const [isLoadingExercises, setIsLoadingExercises] = useState(false);
  const [dynamicContent, setDynamicContent] = useState<{ 
    title: string; 
    description: string; 
    classification?: WorkoutClassification;
    isPersonalized?: boolean;
    matchedGoals?: string[];
  } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Get user goals - use profile.selectedGoals directly to avoid re-render loops
  // Fallback to empty array if not set to prevent undefined issues
  const userGoals = profile?.selectedGoals || [];

  // Generate dynamic content when workout changes
  useEffect(() => {
    if (workout && isOpen) {
      setIsGenerating(true);
      generateWorkoutExperience(workout, undefined, userGoals).then(result => {
        setDynamicContent({
          title: result.title,
          description: result.description,
          classification: result.classification,
          isPersonalized: result.isPersonalized,
          matchedGoals: result.matchedGoals,
        });
        setIsGenerating(false);
      }).catch(error => {
        console.error('[WorkoutPreviewDrawer] Error generating dynamic content:', error);
        // Fallback to original content
        setDynamicContent({
          title: workout.title || '',
          description: workout.description || '',
        });
        setIsGenerating(false);
      });
    } else {
      setDynamicContent(null);
      setIsGenerating(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout?.id, isOpen]); // Only depend on workout.id and isOpen to prevent loops

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Track scroll for collapsing header
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || !isOpen) return;

    const handleScroll = () => {
      setScrollY(scrollContainer.scrollTop);
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [isOpen]);

  // Calculate scroll-based animations
  const maxScroll = 200; // Collapse threshold
  const scrollProgress = Math.min(scrollY / maxScroll, 1);
  
  // Image stays visible longer, then fades
  const imageOpacity = Math.max(1 - scrollProgress * 0.7, 0);
  const imageScale = Math.max(1 - scrollProgress * 0.2, 0.8);
  const headerOpacity = Math.min(scrollProgress * 2, 1);
  
  // Dynamic height calculation - reduced for tighter look
  const initialHeight = 320;
  const minHeight = 64; // Sticky header height
  const dynamicHeight = Math.max(initialHeight - scrollY * 0.8, minHeight);
  
  // Title position and size animation - shrinks into sticky header
  const titleScale = Math.max(1 - scrollProgress * 0.3, 0.7);
  const titleY = scrollProgress * 20;

  // Fetch real exercises when drawer opens
  useEffect(() => {
    if (isOpen && !realWorkoutPlan && !isLoadingExercises) {
      setIsLoadingExercises(true);
      getAllExercises()
        .then((exercises) => {
          if (!exercises || exercises.length === 0) {
            console.warn('[WorkoutPreviewDrawer] No exercises found in Firestore');
            setIsLoadingExercises(false);
            return;
          }
          // Take latest 8 exercises for the workout
          const latestExercises = exercises.slice(-8);
          return convertExercisesToWorkoutPlan(latestExercises);
        })
        .then((plan) => {
          if (plan) {
            // Use the workout ID from props if available
            if (workout?.id) {
              plan.id = workout.id;
            }
            setRealWorkoutPlan(plan);
          }
          setIsLoadingExercises(false);
        })
        .catch((error) => {
          console.error('[WorkoutPreviewDrawer] Error fetching exercises:', error);
          setIsLoadingExercises(false);
        });
    }
  }, [isOpen, realWorkoutPlan, isLoadingExercises, workout?.id]);

  // Use real workout plan if available
  const workoutPlan = realWorkoutPlan;

  const handleDragEnd = (_event: any, info: any) => {
    // If dragged down past threshold, close the drawer
    if (info.offset.y > CLOSE_THRESHOLD || info.velocity.y > 500) {
      onClose();
    }
  };

  const handleStartWorkout = () => {
    if (workout) {
      // Store workout plan in sessionStorage to pass to active page
      if (typeof window !== 'undefined') {
        // Clear any old workout data first
        sessionStorage.removeItem('currentWorkoutPlan');
        sessionStorage.removeItem('currentWorkoutPlanId');
        
        if (workoutPlan) {
          // Ensure the workout plan has the correct ID
          const planWithCorrectId = {
            ...workoutPlan,
            id: workout.id, // Use the actual workout ID from props
          };
          sessionStorage.setItem('currentWorkoutPlan', JSON.stringify(planWithCorrectId));
          sessionStorage.setItem('currentWorkoutPlanId', workout.id);
        }
      }
      if (onStartWorkout) {
        onStartWorkout(workout.id);
      } else {
        router.push(`/workouts/${workout.id}/active`);
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && workout && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
          />

          {/* Drawer */}
          <motion.div
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{
              type: 'spring',
              damping: 30,
              stiffness: 300,
            }}
            style={{ y, opacity, height: DRAWER_HEIGHT, maxHeight: '90vh', fontFamily: 'var(--font-simpler)' }}
            className="fixed bottom-0 left-0 right-0 z-[100] bg-white dark:bg-slate-900 rounded-t-[32px] shadow-2xl overflow-hidden"
            dir="rtl"
          >
            {/* Sticky Header - Appears on scroll */}
            <div
              className={`fixed top-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 transition-opacity duration-300 ${
                headerOpacity > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
              style={{ opacity: headerOpacity }}
            >
              <div className="flex items-center justify-between px-4 py-3">
                <button
                  onClick={onClose}
                  className="w-10 h-10 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-gray-700 dark:text-gray-300 active:scale-90 transition-transform"
                  aria-label="סגור"
                >
                  <ArrowRight size={20} />
                </button>
                <h1 className="text-lg font-black text-gray-900 dark:text-white flex-1 text-center px-4">
                  {dynamicContent?.title || workout.title}
                </h1>
                <button
                  className="w-10 h-10 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-gray-700 dark:text-gray-300 active:scale-90 transition-transform"
                  aria-label="שתף"
                >
                  <Share2 size={20} />
                </button>
              </div>
            </div>

            {/* Unified Scrollable Container */}
            <div
              ref={scrollContainerRef}
              className="h-full overflow-y-auto"
            >
              {/* Hero Section with Title Attached - Collapsing Header */}
              <div
                className="relative w-full overflow-hidden transition-all duration-300"
                style={{
                  height: `${dynamicHeight}px`,
                  opacity: imageOpacity,
                  transform: `scale(${imageScale})`,
                }}
              >
                {/* Hero Image */}
                {workout.coverImage && (
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{
                      backgroundImage: `url(${workout.coverImage})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  >
                    {/* Premium White Melting Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-white via-white/80 to-transparent" />
                  </div>
                )}

                {/* Top Controls - Only visible when image is visible */}
                <div
                  className={`absolute top-0 left-0 right-0 p-4 pt-14 flex justify-between items-start z-10 transition-opacity duration-300 ${
                    imageOpacity > 0.5 ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                >
                  <button
                    onClick={onClose}
                    className="w-10 h-10 bg-white/20 dark:bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg text-white active:scale-90 transition-transform"
                    aria-label="סגור"
                  >
                    <X size={20} />
                  </button>
                  <button
                    className="w-10 h-10 bg-white/20 dark:bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg text-white active:scale-90 transition-transform"
                    aria-label="שתף"
                  >
                    <Share2 size={20} />
                  </button>
                </div>

                {/* Workout Title - Sits exactly where image melts into white */}
                <div
                  className="absolute bottom-0 left-0 right-0 p-6 z-10"
                  style={{
                    transform: `translateY(-${titleY}px) scale(${titleScale})`,
                    transformOrigin: 'bottom center',
                  }}
                >
                  <h1 className="text-3xl font-black mb-2 text-slate-900 transition-all duration-300">
                    {dynamicContent?.title || workout.title || workoutPlan.name}
                  </h1>
                </div>
              </div>

              {/* Content Section - Shell background, no rounded-t or pt-8 gap */}
              <div className="bg-white dark:bg-slate-900 -mt-12 relative z-10 px-6 pb-32">

                {/* Professional Badge & Personalized Indicator */}
                {(dynamicContent?.classification || dynamicContent?.isPersonalized) && (
                  <div className="px-4 pt-2 flex items-center gap-2 flex-wrap mb-4">
                    {dynamicContent?.classification && (
                      <motion.span
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.2 }}
                        className="inline-block px-3 py-1.5 bg-[#00ADEF]/10 text-[#00ADEF] text-xs font-bold rounded-lg border border-[#00ADEF]/20"
                      >
                        {getClassificationLabel(dynamicContent.classification)}
                      </motion.span>
                    )}
                    {dynamicContent?.isPersonalized && (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3, delay: 0.3 }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 text-xs font-bold rounded-lg border border-green-200"
                      >
                        <Target size={14} />
                        מותאם עבורך
                      </motion.span>
                    )}
                  </div>
                )}

                {/* StrengthOverviewCard - Premium Content with 26 exercises */}
                {workoutPlan && (
                  <StrengthOverviewCard
                    workoutPlan={workoutPlan}
                    userProfile={profile || undefined}
                    coverImage={workout.coverImage}
                    onStartWorkout={handleStartWorkout}
                  />
                )}
              </div>

              {/* Start Workout Button - Fixed at bottom */}
              <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-t border-gray-200/50 dark:border-gray-800/50">
                <div className="pb-10 pt-4 px-6">
                  <button
                    onClick={handleStartWorkout}
                    className="w-full bg-[#00B4D8] hover:bg-[#0099C4] text-white font-bold py-4 px-6 rounded-2xl shadow-2xl shadow-[#00B4D8]/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    <Play size={20} fill="currentColor" />
                    <span>מתחילים את האימון</span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
