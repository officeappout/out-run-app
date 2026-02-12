'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { Play, X, Info, Package, Activity, Target, ArrowRight, Share2, Volume2, VolumeX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { WorkoutPlan, WorkoutSegment, Exercise as WorkoutExercise } from '@/features/parks';
import StrengthOverviewCard from '@/features/workout-engine/components/StrengthOverviewCard';
import ExpandableText from './ExpandableText';
import { generateWorkoutExperience } from '@/features/workout-engine/utils/messageGenerator';
import { getClassificationLabel, type WorkoutClassification } from '@/features/workout-engine/utils/classification';
import { useUserStore } from '@/features/user';
import { getAllExercises, Exercise as FirestoreExercise, getLocalizedText } from '@/features/content/exercises';
import { GeneratedWorkout, WorkoutExercise as EngineWorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';

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

  // Smart image resolution: loop through ALL execution_methods until a non-null media URL is found
  const resolveImageUrl = (ex: FirestoreExercise): string | undefined => {
    const methods = ex.execution_methods || [];
    for (const m of methods) {
      if (m?.media?.imageUrl && typeof m.media.imageUrl === 'string' && m.media.imageUrl.trim()) {
        return m.media.imageUrl;
      }
      if (m?.media?.mainVideoUrl && typeof m.media.mainVideoUrl === 'string' && m.media.mainVideoUrl.trim()) {
        return m.media.mainVideoUrl;
      }
    }
    // Fallback to legacy media
    if (ex.media?.imageUrl) return ex.media.imageUrl;
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
  /**
   * When provided, displays the engine-generated workout exercises
   * with clean sets/reps formatting (no rest timers).
   * Bypasses the old Firestore fetch path.
   */
  generatedWorkout?: GeneratedWorkout | null;
  /** Active workout location (e.g. 'park', 'home') — persisted to sessionStorage for the player */
  workoutLocation?: string;
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
  generatedWorkout,
  workoutLocation,
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

  // ── Global Audio Control ──
  const [isAudioEnabled, setIsAudioEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('isAudioEnabled') === 'true';
    }
    return false;
  });

  const toggleAudio = useCallback(() => {
    setIsAudioEnabled((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('isAudioEnabled', String(next));
      }
      return next;
    });
  }, []);

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

  // ── SYNC FIX: When generatedWorkout exists, it overrides ALL display data ──
  // This ensures that after an adjustment, the drawer shows the engine's
  // real title/description/duration instead of stale dynamicContent.
  const displayTitle = generatedWorkout?.title || dynamicContent?.title || workout?.title || '';
  const displayDescription = generatedWorkout?.description || dynamicContent?.description || workout?.description || '';
  const displayDuration = generatedWorkout?.estimatedDuration || workout?.duration || 0;

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

  // Fetch real exercises when drawer opens — SKIP if we have a generatedWorkout
  useEffect(() => {
    if (isOpen && !generatedWorkout && !realWorkoutPlan && !isLoadingExercises) {
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
      // Store workout plan + location in sessionStorage to pass to active page
      if (typeof window !== 'undefined') {
        // Clear any old workout data first
        sessionStorage.removeItem('currentWorkoutPlan');
        sessionStorage.removeItem('currentWorkoutPlanId');
        sessionStorage.removeItem('currentWorkoutLocation');
        
        if (workoutPlan) {
          // Ensure the workout plan has the correct ID
          const planWithCorrectId = {
            ...workoutPlan,
            id: workout.id, // Use the actual workout ID from props
          };
          sessionStorage.setItem('currentWorkoutPlan', JSON.stringify(planWithCorrectId));
          sessionStorage.setItem('currentWorkoutPlanId', workout.id);
        }
        // Persist workout location for the player to use for media selection
        if (workoutLocation) {
          sessionStorage.setItem('currentWorkoutLocation', workoutLocation);
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
            {/* Sticky Header - Appears on scroll (absolute within drawer) */}
            <div
              className={`absolute top-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 transition-opacity duration-300 ${
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
                  {displayTitle}
                </h1>
                <button
                  className="w-10 h-10 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-gray-700 dark:text-gray-300 active:scale-90 transition-transform"
                  aria-label="שתף"
                >
                  <Share2 size={20} />
                </button>
              </div>
            </div>

            {/* Unified Scrollable Container — pb-36 clears the absolute footer */}
            <div
              ref={scrollContainerRef}
              className="h-full overflow-y-auto pb-36"
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
                    {displayTitle}
                  </h1>
                </div>
              </div>

              {/* Content Section - Shell background */}
              <div className="bg-white dark:bg-slate-900 -mt-12 relative z-10 px-6 pb-8">

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

                {/* Generated Workout: Clean sets/reps display — NO rest timers */}
                {generatedWorkout ? (
                  <GeneratedWorkoutExerciseList generatedWorkout={generatedWorkout} />
                ) : (
                  /* Fallback: StrengthOverviewCard for park-route workouts */
                  workoutPlan && (
                    <StrengthOverviewCard
                      workoutPlan={workoutPlan}
                      userProfile={profile || undefined}
                      coverImage={workout.coverImage}
                      onStartWorkout={handleStartWorkout}
                    />
                  )
                )}
              </div>

            </div>

            {/* Start Workout Button + Audio Toggle — ALWAYS VISIBLE, absolute bottom-0 */}
            <div
              className="absolute bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-gray-200/50 dark:border-gray-800/50 px-6 pt-3"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 12px))' }}
            >
              <div className="flex items-center gap-3">
                {/* Audio Toggle */}
                <button
                  onClick={toggleAudio}
                  className={`flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center transition-all active:scale-90 shadow-lg border-2 ${
                    isAudioEnabled
                      ? 'bg-cyan-50 border-cyan-300 text-cyan-600'
                      : 'bg-gray-100 border-gray-200 text-gray-400'
                  }`}
                  title={isAudioEnabled ? 'השתק סרטונים' : 'הפעל שמע'}
                  aria-label={isAudioEnabled ? 'השתק סרטונים' : 'הפעל שמע'}
                >
                  {isAudioEnabled ? <Volume2 size={22} /> : <VolumeX size={22} />}
                </button>

                {/* Start Workout */}
                <button
                  onClick={handleStartWorkout}
                  className="flex-1 bg-[#00B4D8] hover:bg-[#0099C4] text-white font-extrabold py-4 px-6 rounded-2xl shadow-2xl shadow-[#00B4D8]/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-lg"
                >
                  <Play size={22} fill="currentColor" />
                  <span>מתחילים את האימון</span>
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// TYPES for section grouping
// ============================================================================

/** Section groups for exercise display (חימום, סופר-סט, סט רגיל, מתיחות) */
interface ExerciseSection {
  id: string;
  title: string;
  rounds: number;
  exercises: EngineWorkoutExercise[];
}

/** Map exercise role / tags → section type */
function groupExercisesIntoSections(exercises: EngineWorkoutExercise[]): ExerciseSection[] {
  const warmup: EngineWorkoutExercise[] = [];
  const supersets: EngineWorkoutExercise[] = [];
  const regular: EngineWorkoutExercise[] = [];
  const cooldown: EngineWorkoutExercise[] = [];

  for (const ex of exercises) {
    const role = ex.exercise.exerciseRole;
    if (role === 'warmup') {
      warmup.push(ex);
    } else if (role === 'cooldown') {
      cooldown.push(ex);
    } else if (ex.exercise.tags?.includes('compound' as any)) {
      supersets.push(ex);
    } else {
      regular.push(ex);
    }
  }

  // If no role-based grouping available, split by priority
  if (warmup.length === 0 && cooldown.length === 0) {
    const all = [...exercises];
    // First exercise → warmup, last → cooldown, rest split evenly
    if (all.length >= 4) {
      warmup.push(all.shift()!);
      cooldown.push(all.pop()!);
      const mid = Math.ceil(all.length / 2);
      supersets.push(...all.slice(0, mid));
      regular.push(...all.slice(mid));
    } else {
      regular.push(...all);
    }
  }

  const sections: ExerciseSection[] = [];
  if (warmup.length > 0) sections.push({ id: 'warmup', title: 'חימום', rounds: 1, exercises: warmup });
  if (supersets.length > 0) sections.push({ id: 'superset', title: 'סופר סט', rounds: 3, exercises: supersets });
  if (regular.length > 0) sections.push({ id: 'regular', title: 'סט רגיל', rounds: 3, exercises: regular });
  if (cooldown.length > 0) sections.push({ id: 'cooldown', title: 'מתיחות', rounds: 1, exercises: cooldown });
  return sections;
}

/** Resolve exercise thumbnail image URL */
function resolveExerciseImage(ex: EngineWorkoutExercise): string {
  const exercise = ex.exercise;
  // Priority 1: execution method media
  const methodMedia = exercise.execution_methods?.[0]?.media || exercise.executionMethods?.[0]?.media;
  if (methodMedia?.imageUrl) return methodMedia.imageUrl;
  if (methodMedia?.mainVideoUrl) return methodMedia.mainVideoUrl;
  // Priority 2: legacy media
  if (exercise.media?.imageUrl) return exercise.media.imageUrl;
  if (exercise.media?.videoUrl) return exercise.media.videoUrl;
  // Fallback
  return 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=160&q=60';
}

/** Equipment Hebrew labels */
const EQUIP_LABEL_HE: Record<string, string> = {
  rings: 'טבעות', bar: 'מוט', dumbbells: 'משקולות', bands: 'גומיות התנגדות',
  pullUpBar: 'מתח', mat: 'מזרן', kettlebell: 'קטלבל', bench: 'ספסל',
  lowBar: 'מקבילים', highBar: 'מתח גבוה', parallelBars: 'מקבילים',
  cable: 'כבל', trx: 'TRX', ball: 'כדור', foam_roller: 'רולר',
};

/** Collect unique equipment names from exercises */
function collectEquipment(exercises: EngineWorkoutExercise[]): string[] {
  const seen = new Set<string>();
  for (const ex of exercises) {
    // From execution method gear/equipment IDs
    const method = ex.method;
    if (method?.gearIds) {
      for (const gid of method.gearIds) seen.add(gid);
    }
    if (method?.equipmentIds) {
      for (const eid of method.equipmentIds) seen.add(eid);
    }
    // From legacy equipment array
    for (const eq of ex.exercise.equipment || []) {
      if (eq) seen.add(eq);
    }
  }
  return Array.from(seen).slice(0, 6).map((eq) => EQUIP_LABEL_HE[eq] || eq);
}

/** Muscle label map (Hebrew) */
const MUSCLE_LABEL_HE: Record<string, string> = {
  chest: 'חזה', back: 'גב', shoulders: 'כתפיים', biceps: 'יד קדמית',
  triceps: 'יד אחורית', quads: 'ארבע-ראשי', hamstrings: 'המסטרינג',
  glutes: 'ישבן', calves: 'שוקיים', abs: 'בטן', obliques: 'אלכסונים',
  forearms: 'אמות', traps: 'טרפז', core: 'ליבה', legs: 'רגליים',
  middle_back: 'גב אמצעי', rear_delt: 'כתף אחורית',
};

/** Collect unique primary muscles */
function collectMuscles(exercises: EngineWorkoutExercise[]): string[] {
  const seen = new Set<string>();
  for (const ex of exercises) {
    if (ex.exercise.primaryMuscle) seen.add(ex.exercise.primaryMuscle);
  }
  return Array.from(seen).slice(0, 6);
}

// ============================================================================
// GeneratedWorkoutExerciseList — HTML-Reference Visual Design
// ============================================================================

function GeneratedWorkoutExerciseList({ generatedWorkout }: { generatedWorkout: GeneratedWorkout }) {
  const sections = groupExercisesIntoSections(generatedWorkout.exercises);
  const equipment = collectEquipment(generatedWorkout.exercises);
  const muscles = collectMuscles(generatedWorkout.exercises);

  return (
    <div dir="rtl">
      {/* ── Description ── */}
      <section className="mb-6">
        <p className="text-slate-600 dark:text-slate-400 text-right leading-relaxed text-sm">
          {generatedWorkout.description}
        </p>
        {generatedWorkout.aiCue && (
          <p className="text-sm text-cyan-600 font-medium mt-2">{generatedWorkout.aiCue}</p>
        )}
      </section>

      {/* ── ציוד (Equipment) — Horizontal scroll chips ── */}
      {equipment.length > 0 && (
        <section className="mb-8">
          <h3 className="text-right font-bold text-lg mb-3">ציוד</h3>
          <div className="flex flex-row-reverse gap-3 overflow-x-auto no-scrollbar -mx-6 px-6">
            {equipment.map((eq) => (
              <div
                key={eq}
                className="flex-shrink-0 flex items-center gap-2 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 bg-slate-50 dark:bg-slate-800/50"
              >
                <span className="text-sm font-medium">{eq}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── שרירים (Muscles) — Horizontal scroll circles ── */}
      {muscles.length > 0 && (
        <section className="mb-8">
          <h3 className="text-right font-bold text-lg mb-3">שרירים</h3>
          <div className="flex flex-row-reverse gap-6 overflow-x-auto no-scrollbar -mx-6 px-6">
            {muscles.map((m) => (
              <div key={m} className="flex flex-col items-center gap-1">
                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <span className="text-[#00E5FF] text-lg font-bold">
                    {(MUSCLE_LABEL_HE[m] || m).charAt(0)}
                  </span>
                </div>
                <span className="text-xs font-medium">{MUSCLE_LABEL_HE[m] || m}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Exercise Sections (חימום, סופר-סט, סט רגיל, מתיחות) ── */}
      {sections.map((section) => (
        <section key={section.id} className="mb-8">
          {/* Section Header */}
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-1 text-slate-400">
              <span className="text-sm font-medium">{section.rounds}x סבבים</span>
            </div>
            <h3 className="text-right font-bold text-lg text-slate-900 dark:text-white">
              {section.title}
            </h3>
          </div>

          {/* Exercise Cards */}
          <div className="space-y-3">
            {section.exercises.map((ex, idx) => {
              const name = typeof ex.exercise.name === 'string'
                ? ex.exercise.name
                : getLocalizedText(ex.exercise.name, 'he');

              const volume = ex.isTimeBased
                ? `${ex.sets} × ${ex.reps} שניות`
                : `${ex.sets} × ${ex.reps} חזרות`;

              const imageUrl = resolveExerciseImage(ex);

              return (
                <div
                  key={`${ex.exercise.id}-${idx}`}
                  className="bg-[#F8FAFC] dark:bg-[#1E293B] rounded-2xl overflow-hidden flex flex-row items-stretch shadow-sm border border-slate-100 dark:border-slate-800"
                >
                  {/* Thumbnail — FIRST in DOM = RIGHT side in RTL flex-row.
                      Edge-to-edge: no padding, rounded only on the right (start) via parent overflow-hidden. */}
                  <div className="w-[88px] min-h-[80px] flex-shrink-0">
                    <img
                      alt={name}
                      className="w-full h-full object-cover"
                      src={imageUrl}
                      loading="lazy"
                    />
                  </div>

                  {/* Info — SECOND in DOM = LEFT side in RTL flex-row */}
                  <div className="flex-grow text-right min-w-0 flex flex-col justify-center py-3 pr-4 pl-3">
                    <div className="font-bold text-[15px] leading-tight truncate text-black dark:text-white">
                      {name}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1">
                      {volume}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* ── Volume Badge ── */}
      {generatedWorkout.volumeAdjustment && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl mb-4">
          <p className="text-xs font-bold text-blue-700 dark:text-blue-300">
            {generatedWorkout.volumeAdjustment.badge}
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
            Sets: {generatedWorkout.volumeAdjustment.originalSets} → {generatedWorkout.volumeAdjustment.adjustedSets}{' '}
            (-{generatedWorkout.volumeAdjustment.reductionPercent}%)
          </p>
        </div>
      )}
    </div>
  );
}
