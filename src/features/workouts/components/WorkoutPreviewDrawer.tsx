'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { Play, X, Target, ArrowRight, Share2, Volume2, VolumeX, Link2, MapPin, PersonStanding, Loader2, Heart, ArrowDownCircle, WifiOff } from 'lucide-react';
import ExerciseReplacementModal from '@/features/workout-engine/players/strength/components/ExerciseReplacementModal';
import SwapIcon from '@/features/workout-engine/components/SwapIcon';
import { ExecutionMethod } from '@/features/content/exercises';
import type { ExecutionLocation } from '@/features/content/exercises';
import { useRouter } from 'next/navigation';
import { WorkoutPlan, WorkoutSegment as ParkWorkoutSegment, Exercise as WorkoutExercise, getAllParks, type Park } from '@/features/parks';
import StrengthOverviewCard from '@/features/workout-engine/components/StrengthOverviewCard';
import ExpandableText from './ExpandableText';
import { generateWorkoutExperience } from '@/features/workout-engine/utils/messageGenerator';
import { type WorkoutClassification } from '@/features/workout-engine/utils/classification';
import { useUserStore } from '@/features/user';
import { getAllExercises, Exercise as FirestoreExercise, getLocalizedText } from '@/features/content/exercises';
import { GeneratedWorkout, WorkoutExercise as EngineWorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import { calculateDistance } from '@/lib/services/location.service';
import { resolveEquipmentLabel, resolveEquipmentIconKey, resolveEquipmentSvgPath, normalizeGearId, getMuscleGroupLabel } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import ExerciseDetailContent, { type ProgramRef } from '@/features/workout-engine/players/strength/components/ExerciseDetailContent';
import { getCachedPrograms } from '@/features/workout-engine/services/program-hierarchy.utils';
import { resolveExerciseMedia } from '@/features/workout-engine/shared/utils/media-resolution.utils';
import { shareWorkout } from '@/features/workout-engine/services/share.service';
import { useFavoritesStore } from '@/features/favorites/store/useFavoritesStore';
import { useCachedMediaUrl, useCachedMediaMap } from '@/features/favorites/hooks/useCachedMedia';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/**
 * Convert Firestore exercises to WorkoutPlan format
 * Organizes exercises into segments: Warm-up, Strength, Cool-down
 */
async function convertExercisesToWorkoutPlan(exercises: FirestoreExercise[]): Promise<WorkoutPlan> {
  const mergeEquipment = (ex: FirestoreExercise): string[] => {
    const method = ex.execution_methods?.find((m: any) => m.location === 'home') || ex.execution_methods?.[0];
    const raw = [
      ...((method as any)?.gearIds || []),
      ...((method as any)?.equipmentIds || []),
      ...((method as any)?.gearId ? [(method as any).gearId] : []),
      ...((method as any)?.equipmentId ? [(method as any).equipmentId] : []),
    ].filter(Boolean);
    const seen = new Set<string>();
    const result: string[] = [];
    for (const id of raw) {
      const norm = normalizeGearId(id);
      if (norm !== 'none' && norm !== 'bodyweight' && !seen.has(norm)) {
        seen.add(norm);
        result.push(norm);
      }
    }
    return result;
  };

  // Separate exercises by role
  const warmupExercises = exercises.filter((ex) => ex.exerciseRole === 'warmup');
  const mainExercises = exercises.filter((ex) => ex.exerciseRole === 'main' || !ex.exerciseRole);
  const cooldownExercises = exercises.filter((ex) => ex.exerciseRole === 'cooldown');

  const segments: ParkWorkoutSegment[] = [];

  const resolveImageUrl = (ex: FirestoreExercise): string | undefined => {
    const method = ex.execution_methods?.find((m) => m.location === 'home') || ex.execution_methods?.[0];
    const { imageUrl } = resolveExerciseMedia(ex as any, method as any);
    return imageUrl;
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
        equipment: mergeEquipment(ex),
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
        equipment: mergeEquipment(ex),
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
        equipment: mergeEquipment(ex),
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
  difficulty?: 'easy' | 'medium' | 'hard';
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
  /** Callback fired when the user swaps an exercise, with the updated GeneratedWorkout */
  onGeneratedWorkoutUpdate?: (updated: GeneratedWorkout) => void;
}

// ── Nearby Parks (Where to Train) ──
import { useNearbyParks, PARK_FALLBACK_IMAGE } from '@/features/parks/core/hooks/useNearbyParks';

function ParkCardImage({ src, fallback, alt, eager }: { src?: string; fallback: string; alt: string; eager: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const resolvedSrc = errored ? fallback : (src || fallback);

  return (
    <div className="relative w-full h-[120px] overflow-hidden bg-slate-200 dark:bg-slate-700">
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-slate-200 dark:bg-slate-700" />
      )}
      <img
        src={resolvedSrc}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        loading={eager ? 'eager' : 'lazy'}
        onLoad={() => setLoaded(true)}
        onError={() => { setErrored(true); setLoaded(true); }}
      />
    </div>
  );
}

const DRAWER_HEIGHT = '95vh';
const CLOSE_THRESHOLD = 200; // pixels to drag down before closing

/**
 * WorkoutPreviewDrawer - Draggable bottom sheet for workout preview
 */
/**
 * Convert WorkoutData to WorkoutPlan format
 */
function convertWorkoutDataToPlan(workoutData: WorkoutData): WorkoutPlan {
  const segments: ParkWorkoutSegment[] = workoutData.segments.map((segment) => {
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
      type: (segment.type === 'strength' ? 'station' : 'travel') as 'station' | 'travel',
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
  onGeneratedWorkoutUpdate,
}: WorkoutPreviewDrawerProps) {
  const router = useRouter();
  const { profile } = useUserStore();
  const y = useMotionValue(0);
  const rawOpacity = useTransform(y, [0, 300], [1, 0]);
  const opacity = useTransform(rawOpacity, (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1));
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

  const isOnline = useOnlineStatus();

  // ── Nearby Parks for "Where to Train" section ──
  const nearbyParks = useNearbyParks(isOpen);

  // ── Hero media from Home Screen (sessionStorage) ──
  const [heroMedia, setHeroMedia] = useState<{ thumbnailUrl?: string; videoUrl?: string } | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = sessionStorage.getItem('workout_hero_media');
      if (raw) setHeroMedia(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // ── Offline-cached hero media ──
  const cachedHeroThumb = useCachedMediaUrl(heroMedia?.thumbnailUrl || workout?.coverImage || null);
  const cachedHeroVideo = useCachedMediaUrl(heroMedia?.videoUrl || null);

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

  // ── Exercise Replacement Modal State ──
  const [replacementModalOpen, setReplacementModalOpen] = useState(false);
  const [exerciseToReplace, setExerciseToReplace] = useState<FirestoreExercise | null>(null);
  const [exerciseToReplaceLevel, setExerciseToReplaceLevel] = useState(1);

  // ── Exercise Detail Hero Drawer ──
  // Dynamic-height pattern: the drawer fits its content (up to 90vh cap),
  // so no snap-points are needed — the sheet is just as tall as the data
  // dictates and scrolls internally past the cap.
  const [detailExercise, setDetailExercise] = useState<EngineWorkoutExercise | null>(null);
  const detailY = useMotionValue(0);
  const detailRef = useRef<HTMLDivElement>(null);

  // ── Program ID → Hebrew name map (loaded once) ──
  const [programMap, setProgramMap] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const SLUG_TO_HE: Record<string, string> = {
      full_body: 'כל הגוף', fullbody: 'כל הגוף',
      upper_body: 'פלג גוף עליון', push: 'דחיפה', pushing: 'דחיפה',
      lower_body: 'רגליים', legs: 'רגליים',
      pull: 'משיכה', pulling: 'משיכה', calisthenics: 'קליסטניקס',
      running: 'ריצה', cardio: 'קרדיו', core: 'ליבה',
      pilates: 'פילאטיס', yoga: 'יוגה',
      healthy_lifestyle: 'אורח חיים בריא', pull_up_pro: 'מתח מקצועי',
      planche: 'פלאנש', handstand: 'עמידת ידיים', muscle_up: 'מאסל אפ',
      front_lever: 'פרונט לבר', back_lever: 'בק לבר',
    };
    getCachedPrograms().then((programs) => {
      if (cancelled) return;
      const map: Record<string, string> = { ...SLUG_TO_HE };
      for (const p of programs) {
        map[p.id] = SLUG_TO_HE[p.id] || p.name;
      }
      setProgramMap(map);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Share State ──
  const [isSharing, setIsSharing] = useState(false);

  const handleShare = useCallback(async () => {
    if (isSharing) return;

    if (!generatedWorkout) {
      // Fallback: share a plain text link when no GeneratedWorkout is available
      const title = workout?.title || 'אימון כוח';
      const text = `💪 ${title}\nבוא/י לנסות את האימון שלי ב-Out!\nhttps://out-run-app.vercel.app`;
      if (typeof navigator !== 'undefined' && navigator.share) {
        try { await navigator.share({ title, text }); } catch { /* cancelled */ }
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      }
      return;
    }

    setIsSharing(true);
    try {
      await shareWorkout(generatedWorkout, workoutLocation);
    } catch (err) {
      console.error('[WorkoutPreviewDrawer] Share failed:', err);
      // Surface the error as a basic fallback share
      const text = `💪 ${generatedWorkout.title}\nבוא/י לנסות את האימון שלי ב-Out!\nhttps://out-run-app.vercel.app`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    } finally {
      setIsSharing(false);
    }
  }, [generatedWorkout, workout, workoutLocation, isSharing]);

  // ── Favorites ──
  const {
    toggleFavorite, triggerDownload,
    isFavorited: checkIsFavorited, isToggling: checkIsToggling,
    getFavoriteId: checkGetFavoriteId, isDownloaded: checkIsDownloaded,
    isDownloading: checkIsDownloading, getDownloadProgress: checkDownloadProgress,
    loadFavorites, _hydrated: favsHydrated,
  } = useFavoritesStore();

  useEffect(() => {
    if (!favsHydrated) loadFavorites();
  }, [favsHydrated, loadFavorites]);

  const isFav = generatedWorkout ? checkIsFavorited(generatedWorkout) : false;
  const isFavToggling = generatedWorkout ? checkIsToggling(generatedWorkout) : false;
  const favId = generatedWorkout ? checkGetFavoriteId(generatedWorkout) : undefined;
  const isFavDownloaded = favId ? checkIsDownloaded(favId) : false;
  const isFavDownloading = favId ? checkIsDownloading(favId) : isFavToggling;
  const dlProgress = favId ? checkDownloadProgress(favId) : 0;

  const handleToggleFavorite = useCallback(async () => {
    if (isFavToggling) return;
    if (!generatedWorkout) {
      console.warn('[WorkoutPreviewDrawer] Cannot favorite — no generatedWorkout available');
      return;
    }
    try {
      await toggleFavorite(generatedWorkout, workoutLocation);
    } catch (err) {
      console.error('[WorkoutPreviewDrawer] toggleFavorite failed:', err);
    }
  }, [generatedWorkout, isFavToggling, toggleFavorite, workoutLocation]);

  const handleDownload = useCallback(async () => {
    if (isFavToggling || isFavDownloading) return;
    if (!generatedWorkout) return;
    if (!isFav) {
      try {
        await toggleFavorite(generatedWorkout, workoutLocation);
      } catch (err) {
        console.error('[WorkoutPreviewDrawer] download-favorite failed:', err);
      }
    } else if (!isFavDownloaded && favId) {
      try {
        await triggerDownload(favId);
      } catch (err) {
        console.error('[WorkoutPreviewDrawer] triggerDownload failed:', err);
      }
    }
  }, [generatedWorkout, isFav, isFavDownloaded, isFavToggling, isFavDownloading, favId, toggleFavorite, triggerDownload, workoutLocation]);

  const resolvedLocation: ExecutionLocation = (workoutLocation as ExecutionLocation) || 'park';

  const handleOpenSwapModal = useCallback((exercise: FirestoreExercise, level: number) => {
    setExerciseToReplace(exercise);
    setExerciseToReplaceLevel(level);
    setReplacementModalOpen(true);
  }, []);

  const handleExerciseTap = useCallback((ex: EngineWorkoutExercise) => {
    setDetailExercise(ex);
    detailY.set(0);
  }, [detailY]);

  const handleDetailDismiss = useCallback(() => {
    setDetailExercise(null);
  }, []);

  // With dynamic height there's no snap state — the drag handle only
  // dismisses the drawer when pulled down past a threshold or flung.
  const handleDetailDragEnd = useCallback((_: any, info: any) => {
    const { offset, velocity } = info;
    if (offset.y > 100 || velocity.y > 350) {
      handleDetailDismiss();
    }
  }, [handleDetailDismiss]);

  const VOLUME_ADJUSTMENT_FACTOR = 0.2;

  const handleExerciseReplace = useCallback((newExercise: FirestoreExercise, method: ExecutionMethod, levelComparison: 'lower' | 'same' | 'higher') => {
    if (!generatedWorkout || !exerciseToReplace) return;

    const updatedExercises = generatedWorkout.exercises.map((we) => {
      if (we.exercise.id !== exerciseToReplace.id) return we;

      let adjustedReps = we.reps;
      let adjustedRange = we.repsRange;

      if (levelComparison === 'higher') {
        adjustedReps = Math.max(1, Math.round(we.reps * (1 - VOLUME_ADJUSTMENT_FACTOR)));
        if (adjustedRange) {
          adjustedRange = {
            min: Math.max(1, Math.round(adjustedRange.min * (1 - VOLUME_ADJUSTMENT_FACTOR))),
            max: Math.max(1, Math.round(adjustedRange.max * (1 - VOLUME_ADJUSTMENT_FACTOR))),
          };
        }
      } else if (levelComparison === 'lower') {
        adjustedReps = Math.round(we.reps * (1 + VOLUME_ADJUSTMENT_FACTOR));
        if (adjustedRange) {
          adjustedRange = {
            min: Math.round(adjustedRange.min * (1 + VOLUME_ADJUSTMENT_FACTOR)),
            max: Math.round(adjustedRange.max * (1 + VOLUME_ADJUSTMENT_FACTOR)),
          };
        }
      }

      return {
        ...we,
        exercise: newExercise,
        method,
        reps: adjustedReps,
        repsRange: adjustedRange,
        wasSwapped: true,
      };
    });

    const updated: GeneratedWorkout = { ...generatedWorkout, exercises: updatedExercises };
    onGeneratedWorkoutUpdate?.(updated);
  }, [generatedWorkout, exerciseToReplace, onGeneratedWorkoutUpdate]);

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
  const displayDescription = generatedWorkout?.logicCue || generatedWorkout?.description || dynamicContent?.description || workout?.description || '';
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

  // Calculate scroll-based animations — clamp every value to a safe finite number
  const safe = (v: number, fallback: number) => Number.isFinite(v) ? v : fallback;
  const safeScrollY = safe(scrollY, 0);
  const maxScroll = 200;
  const scrollProgress = safe(Math.min(safeScrollY / maxScroll, 1), 0);

  const imageOpacity = safe(Math.max(1 - scrollProgress * 0.7, 0), 1);
  const imageScale = safe(Math.max(1 - scrollProgress * 0.2, 0.8), 1);
  const headerOpacity = safe(Math.min(scrollProgress * 2, 1), 0);

  const initialHeight = 320;
  const minHeight = 64;
  const dynamicHeight = safe(Math.max(initialHeight - safeScrollY * 0.8, minHeight), minHeight);

  const titleScale = safe(Math.max(1 - scrollProgress * 0.3, 0.7), 1);
  const titleY = safe(scrollProgress * 20, 0);

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
    const workoutId = workout?.id || 'favorites-workout';

    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('currentWorkoutPlan');
      sessionStorage.removeItem('currentWorkoutPlanId');
      sessionStorage.removeItem('currentWorkoutLocation');

      if (workoutPlan) {
        const planWithCorrectId = { ...workoutPlan, id: workoutId };
        sessionStorage.setItem('currentWorkoutPlan', JSON.stringify(planWithCorrectId));
        sessionStorage.setItem('currentWorkoutPlanId', workoutId);
      }
      if (workoutLocation) {
        sessionStorage.setItem('currentWorkoutLocation', workoutLocation);
      }
    }

    if (onStartWorkout) {
      onStartWorkout(workoutId);
    } else {
      router.push(`/workouts/${workoutId}/active`);
    }
  };

  return (
    <>
    <AnimatePresence>
      {isOpen && (workout || generatedWorkout) && (
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
              damping: 40,
              stiffness: 260,
              mass: 0.8,
            }}
            style={{ y, opacity, height: DRAWER_HEIGHT, maxHeight: '95vh', fontFamily: 'var(--font-simpler)', willChange: 'transform' }}
            className="fixed bottom-0 left-0 right-0 z-[100] bg-white dark:bg-slate-900 rounded-t-[32px] shadow-2xl overflow-hidden"
            dir="rtl"
          >
            {/* Drag Handle — always visible at the very top */}
            <div className="absolute top-0 left-0 right-0 z-[60] flex justify-center pt-3 pb-1 pointer-events-none">
              <div className="w-10 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>

            {/* Sticky Header - Appears on scroll (absolute within drawer) */}
            <div
              className={`absolute top-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 transition-opacity duration-300 ${
                headerOpacity > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
              style={{ opacity: headerOpacity }}
            >
              <div className="flex items-center justify-between px-4 pt-10 pb-3">
                <button
                  onClick={onClose}
                  className="w-10 h-10 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-gray-700 dark:text-gray-300 active:scale-90 transition-transform"
                  aria-label="סגור"
                >
                  <ArrowRight size={20} />
                </button>
                <h1 className="text-base font-bold text-gray-900 dark:text-white flex-1 text-center px-4 leading-tight line-clamp-2">
                  {displayTitle}
                </h1>
                <div className="w-10" />
              </div>
            </div>

            {/* Unified Scrollable Container — hero image is full-bleed under the drag handle */}
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
                {/* Hero Image — uses cached blob URL when offline */}
                {(cachedHeroThumb || heroMedia?.thumbnailUrl || workout?.coverImage) && (
                  <div className="absolute inset-0">
                    <img
                      src={cachedHeroThumb || heroMedia?.thumbnailUrl || workout?.coverImage}
                      alt={displayTitle}
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    {(cachedHeroVideo || heroMedia?.videoUrl) && (
                      <video
                        src={cachedHeroVideo || heroMedia?.videoUrl}
                        autoPlay loop muted playsInline preload="auto"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                    {/* Subtle top vignette for nav buttons */}
                    <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/25 to-transparent pointer-events-none" />
                    {/* White gradient fade — bottom 70%, very smooth 20%-50%-100% stops */}
                    <div
                      className="absolute bottom-0 inset-x-0 h-[85%] pointer-events-none"
                      style={{ background: 'linear-gradient(to top, white 15%, rgba(255,255,255,0.6) 50%, transparent 100%)' }}
                    />
                  </div>
                )}

                {/* Top Controls - Close button pinned to top-right (RTL leading) */}
                <div
                  className={`absolute top-0 right-0 p-3 pt-12 z-10 transition-opacity duration-300 ${
                    imageOpacity > 0.5 ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                >
                  <button
                    onClick={onClose}
                    className="w-9 h-9 rounded-full bg-white/90 shadow-md flex items-center justify-center text-slate-700 active:scale-90 transition-transform"
                    aria-label="סגור"
                  >
                    <X size={20} strokeWidth={2.5} />
                  </button>
                </div>

              </div>

              {/* Workout Title — pulled OUTSIDE the hero so it escapes the hero's
                  transform-based stacking context and renders above the content section. */}
              <div
                className="relative z-20 -mt-14 px-6 pb-2"
                style={{
                  transform: `scale(${titleScale})`,
                  transformOrigin: 'bottom right',
                  transition: 'transform 0.3s ease',
                }}
              >
                <div className="flex items-start gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/programs/full_body.svg" alt="" width={20} height={20} className="flex-shrink-0 mt-0.5" style={{ filter: 'brightness(0)' }} />
                  <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight whitespace-normal">
                    {displayTitle}
                  </h1>
                </div>
              </div>

              {/* Action Row removed — icons now integrated into metadata pills row */}

              {/* Content Section — 16px side padding, 16px gap below hero title row */}
              <div className="bg-white dark:bg-slate-900 relative z-10 px-4 pt-4 pb-8">

                {/* Generated Workout: Clean exercise list */}
                {generatedWorkout ? (
                  <GeneratedWorkoutExerciseList
                    generatedWorkout={generatedWorkout}
                    onSwap={handleOpenSwapModal}
                    onExerciseTap={handleExerciseTap}
                    actions={{
                      isFav,
                      isFavToggling,
                      isFavDownloading,
                      isFavDownloaded,
                      downloadProgress: dlProgress,
                      isSharing,
                      onToggleFavorite: handleToggleFavorite,
                      onShare: handleShare,
                      onDownload: handleDownload,
                    }}
                  />
                ) : (
                  /* Fallback: StrengthOverviewCard for park-route workouts */
                  workoutPlan && (
                    <StrengthOverviewCard
                      workoutPlan={workoutPlan}
                      userProfile={profile || undefined}
                      coverImage={workout?.coverImage}
                      onStartWorkout={handleStartWorkout}
                    />
                  )
                )}

                {/* ── Where to Train — Nearest Parks (bottom of scroll) ── */}
                {nearbyParks.length > 0 && (
                  <section className="mt-6 mb-2">
                    <h3 className="text-right font-bold text-lg text-slate-900 dark:text-white mb-3">איפה כדאי להתאמן?</h3>
                    <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-6 px-6 pb-1" dir="rtl">
                      {nearbyParks.map((park, idx) => (
                        <motion.div
                          key={park.id}
                          initial={{ opacity: 0, x: 30 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.08, duration: 0.35 }}
                          className="flex-shrink-0 w-[200px] rounded-2xl border-[0.5px] border-[#E0E9FF] dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800/60 shadow-sm"
                        >
                          <ParkCardImage src={park.imageUrl} fallback={PARK_FALLBACK_IMAGE} alt={park.name} eager={idx < 2} />
                          <div className="p-3">
                            <p className="font-bold text-sm text-gray-900 dark:text-white truncate">{park.name}</p>
                            <div className="flex items-center gap-1 mt-1.5 text-slate-500 dark:text-slate-400">
                              <MapPin size={13} className="flex-shrink-0" />
                              <span className="text-xs font-medium">
                                {park.walkingMinutes <= 1 ? 'דקה הליכה ממך' : `${park.walkingMinutes} דקות הליכה ממך`}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </section>
                )}
              </div>

            </div>

            {/* Start Workout Button + Audio Toggle — ALWAYS VISIBLE, absolute bottom-0 */}
            <div
              className="absolute bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-gray-200/50 dark:border-gray-800/50 px-4 pt-3"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 12px))' }}
            >
              {!isOnline && !isFavDownloaded && (
                <div className="flex items-center justify-center gap-1.5 pb-2" dir="rtl">
                  <WifiOff size={12} className="text-gray-400" />
                  <span className="text-[11px] text-gray-400">שמור אימון למועדפים כדי להתאמן אופליין</span>
                </div>
              )}
              <div className="flex items-center gap-3" dir="rtl">
                {/* Start Workout — gradient pill, full-width (RIGHT in RTL) */}
                <button
                  onClick={handleStartWorkout}
                  disabled={!isOnline && !isFavDownloaded}
                  className="flex-1 text-white font-extrabold rounded-full active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-lg border-0 outline-none disabled:opacity-40 disabled:active:scale-100"
                  style={{ background: 'linear-gradient(to left, #0CF2E3, #00BAF7)', height: 42 }}
                >
                  <Play size={20} fill="currentColor" />
                  <span>התחלת אימון</span>
                </button>

                {/* Audio Toggle — circle, pill-border (LEFT in RTL) */}
                <button
                  onClick={toggleAudio}
                  className="flex-shrink-0 w-[42px] h-[42px] rounded-full flex items-center justify-center transition-all active:scale-90 shadow-sm"
                  style={{ background: isAudioEnabled ? '#F0FDFA' : '#FEFEFE', border: PILL_BORDER_DRAWER }}
                  title={isAudioEnabled ? 'השתק סרטונים' : 'הפעל שמע'}
                  aria-label={isAudioEnabled ? 'השתק סרטונים' : 'הפעל שמע'}
                >
                  {isAudioEnabled
                    ? <Volume2 size={20} className="text-cyan-600" />
                    : <VolumeX size={20} className="text-slate-400" />}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>

    {/* ── Exercise Detail Hero Drawer ── */}
    <AnimatePresence>
      {detailExercise && (() => {
        const exercise = detailExercise.exercise;
        const method = detailExercise.method;

        const name = typeof exercise.name === 'string'
          ? exercise.name
          : getLocalizedText(exercise.name, 'he');

        const methodMedia = method?.media || exercise.execution_methods?.[0]?.media;
        const heroVideoUrl = methodMedia?.mainVideoUrl || exercise.media?.videoUrl || null;
        const { imageUrl: heroPosterUrl } = resolveExerciseMedia(exercise as any, method as any);

        const ytUrl =
          methodMedia?.instructionalVideos?.[0]?.url ||
          exercise.execution_methods?.[0]?.media?.instructionalVideos?.[0]?.url ||
          null;

        const eqIds: string[] = [
          ...(method?.gearIds ?? []),
          ...(method?.equipmentIds ?? []),
        ].filter((v, i, a) => a.indexOf(v) === i);

        const primary = exercise.primaryMuscle || null;
        const secondary = exercise.secondaryMuscles?.filter((m: string) => m !== primary) || [];

        const allCues: string[] = [];
        const contentCues = exercise.content?.specificCues;
        if (contentCues) {
          for (const c of contentCues) {
            const text = typeof c === 'string' ? c : (c as any)?.he || (c as any)?.male || '';
            if (text) allCues.push(text);
          }
        }
        const methodCues = method?.specificCues;
        if (methodCues) {
          for (const c of methodCues) {
            const text = typeof c === 'string' ? c : (c as any)?.he || (c as any)?.male || '';
            if (text && !allCues.includes(text)) allCues.push(text);
          }
        }
        const highlights = method?.highlights || exercise.content?.highlights;
        if (highlights) {
          for (const h of highlights) {
            const text = typeof h === 'string' ? h : (h as any)?.he || (h as any)?.male || '';
            if (text && !allCues.includes(text)) allCues.push(text);
          }
        }

        const goalText =
          (typeof exercise.content?.goal === 'string'
            ? exercise.content.goal
            : (exercise.content?.goal as any)?.he || null) || null;

        const descriptionText = (() => {
          const d = exercise.content?.description;
          if (!d) return null;
          if (typeof d === 'string') return d;
          return (d as any)?.he || null;
        })();

        const instructionsText = (() => {
          const inst = exercise.content?.instructions;
          if (!inst) return null;
          if (typeof inst === 'string') return inst;
          return (inst as any)?.he || null;
        })();

        const notesArr: string[] = [];
        const rawNotes = exercise.content?.notes;
        if (rawNotes && Array.isArray(rawNotes)) {
          for (const n of rawNotes) {
            const text = typeof n === 'string' ? n : (n as any)?.he || '';
            if (text) notesArr.push(text);
          }
        }

        // Resolve programs from targetPrograms (multi-program with levels)
        const resolvedPrograms: ProgramRef[] = [];
        if (exercise.targetPrograms && exercise.targetPrograms.length > 0) {
          for (const tp of exercise.targetPrograms) {
            const label = programMap[tp.programId] || programMap[tp.programId.toLowerCase()] || tp.programId;
            resolvedPrograms.push({ name: label, level: tp.level });
          }
        } else if (exercise.programIds && exercise.programIds.length > 0) {
          for (const pid of exercise.programIds) {
            const label = programMap[pid] || programMap[pid.toLowerCase()] || pid;
            resolvedPrograms.push({ name: label, level: detailExercise.programLevel ?? 1 });
          }
        }

        return (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={handleDetailDismiss}
              className="fixed inset-0 bg-black z-[200]"
            />

            {/*
              Detail Drawer — Dynamic Height (Fit Content, capped at 90vh).
              ─────────────────────────────────────────────────────────────
              • motion.div is `flex flex-col` with NO explicit height; the
                browser sizes it to its children up to `maxHeight: 90vh`.
              • Drag handle is `flex-shrink-0` — keeps its 24px no matter what.
              • Scroll container is the natural-flex child with `min-h-0`
                + `overflow-y-auto` → it reports content height to the parent
                while still allowing internal scrolling once the cap is hit.
              • A short, lean exercise (only video + muscles) opens as a small
                drawer; rich exercises grow up to 90vh and scroll past that.
            */}
            <motion.div
              ref={detailRef}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 36, stiffness: 320, mass: 0.7 }}
              className="fixed bottom-0 left-0 right-0 z-[200] bg-white dark:bg-slate-900 shadow-2xl rounded-t-[20px] flex flex-col"
              style={{
                maxHeight: '90vh',
                fontFamily: 'var(--font-simpler)',
              }}
            >
              {/* Drag handle — only dismisses (no snap toggle); part of flex layout */}
              <motion.div
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={0.5}
                onDragEnd={handleDetailDragEnd}
                onClick={handleDetailDismiss}
                className="flex-shrink-0 flex justify-center pt-2.5 pb-1.5 cursor-grab active:cursor-grabbing select-none"
                style={{ touchAction: 'none' }}
              >
                <div className="w-10 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
              </motion.div>

              {/* Scroll container — fits content; scrolls internally past 90vh.
                  WHITE_FADE on ExerciseDetailContent's hero already smooths
                  the boundary as the user scrolls text content over it. */}
              <div
                className="overflow-y-auto overscroll-contain pb-6"
                style={{ minHeight: 0 }}
              >
                <ExerciseDetailContent
                  exerciseName={name}
                  videoUrl={heroVideoUrl}
                  posterUrl={heroPosterUrl}
                  youtubeUrl={ytUrl}
                  programs={resolvedPrograms.length > 0 ? resolvedPrograms : undefined}
                  equipment={eqIds.length > 0 ? eqIds : undefined}
                  primaryMuscle={primary}
                  secondaryMuscles={secondary.length > 0 ? secondary : undefined}
                  cues={allCues.length > 0 ? allCues : undefined}
                  goal={goalText}
                  description={descriptionText}
                  instructions={instructionsText}
                  notes={notesArr.length > 0 ? notesArr : undefined}
                />
              </div>
            </motion.div>
          </>
        );
      })()}
    </AnimatePresence>

    {/* Exercise Replacement Modal */}
    {exerciseToReplace && profile && (
      <ExerciseReplacementModal
        isOpen={replacementModalOpen}
        onClose={() => { setReplacementModalOpen(false); setExerciseToReplace(null); }}
        currentExercise={exerciseToReplace}
        currentLevel={exerciseToReplaceLevel}
        location={resolvedLocation}
        park={null}
        userProfile={profile as any}
        onReplace={handleExerciseReplace}
      />
    )}
    </>
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

  // Check if exercises carry explicit role metadata (from generator or favorites)
  const hasRoles = exercises.some(
    (ex) => ex.exerciseRole === 'warmup' || ex.exerciseRole === 'cooldown'
      || ex.exercise.exerciseRole === 'warmup' || ex.exercise.exerciseRole === 'cooldown',
  );

  for (const ex of exercises) {
    const role = ex.exerciseRole || ex.exercise.exerciseRole;
    if (role === 'warmup') {
      warmup.push(ex);
    } else if (role === 'cooldown') {
      cooldown.push(ex);
    } else if (ex.pairedWith || ex.exercise.tags?.includes('compound' as any)) {
      supersets.push(ex);
    } else {
      regular.push(ex);
    }
  }

  // Only apply the guessing fallback when NO exercise has an explicit role.
  // Favorites always store exerciseRole, so this branch is skipped for them.
  if (!hasRoles && warmup.length === 0 && cooldown.length === 0) {
    const all = [...exercises];
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
  regular.forEach((ex, i) => {
    sections.push({
      id: `regular-${i}`,
      title: 'סט רגיל',
      rounds: ex.sets || 3,
      exercises: [ex],
    });
  });
  if (cooldown.length > 0) sections.push({ id: 'cooldown', title: 'מתיחות', rounds: 1, exercises: cooldown });
  return sections;
}

/** Resolve exercise thumbnail image URL via shared 5-level deep search */
function resolveExerciseImage(ex: EngineWorkoutExercise): string {
  const { imageUrl } = resolveExerciseMedia(ex.exercise as any, ex.method as any);
  return imageUrl || '/images/park-placeholder.svg';
}

interface EquipmentEntry { id: string; label: string }

/** Collect unique equipment entries (canonical ID + Hebrew label) from exercises */
function collectEquipment(exercises: EngineWorkoutExercise[]): EquipmentEntry[] {
  const seenNorms = new Set<string>();
  const seenLabels = new Set<string>();
  const result: EquipmentEntry[] = [];
  for (const ex of exercises) {
    const method = ex.method;
    const ids: string[] = [
      ...(method?.gearIds ?? []),
      ...(method?.equipmentIds ?? []),
    ];
    for (const id of ids) {
      if (!id) continue;
      // Normalise immediately so Firestore doc IDs (e.g. '9HVoe7t0PmaP5YJOYAlv')
      // resolve to their canonical key ('pullup_bar'). DrawerEquipmentBadge then
      // receives the canonical key and can always resolve the SVG path.
      const norm = normalizeGearId(id);
      if (norm === 'bodyweight' || norm === 'none' || norm === 'unknown_gear') continue;
      if (seenNorms.has(norm)) continue;
      seenNorms.add(norm);
      const label = resolveEquipmentLabel(norm);
      if (seenLabels.has(label)) continue;
      seenLabels.add(label);
      result.push({ id: norm, label });
    }
  }

  return result.slice(0, 6);
}


/** Collect unique primary muscles from main exercises (excludes warmup/cooldown) */
function collectMuscles(exercises: EngineWorkoutExercise[]): string[] {
  const seen = new Set<string>();
  for (const ex of exercises) {
    const role = ex.exercise.exerciseRole;
    if (role === 'warmup' || role === 'cooldown') continue;
    if (ex.exercise.primaryMuscle) seen.add(ex.exercise.primaryMuscle);
  }
  return Array.from(seen).slice(0, 6);
}

// ============================================================================
// DrawerEquipmentBadge — icon + Hebrew label in a frosted pill
// ============================================================================
function DrawerEquipmentBadge({ id, label }: { id: string; label: string }) {
  const iconSrc = resolveEquipmentSvgPath(id);
  // Track whether the SVG failed to load so we can fall back to Dumbbell.
  const [imgFailed, setImgFailed] = React.useState(false);
  const showImg = !imgFailed && iconSrc && iconSrc.startsWith('/');

  return (
    <div
      className="flex-shrink-0 flex items-center gap-2 bg-white dark:bg-slate-800/90 shadow-sm rounded-lg px-4 py-2"
      style={{ border: '0.5px solid #E0E9FF' }}
      dir="rtl"
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconSrc!}
          alt={label}
          width={18}
          height={18}
          className="object-contain"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <PersonStanding size={18} className="text-slate-400 flex-shrink-0" />
      )}
      <span className="text-sm font-normal text-gray-800 dark:text-gray-100 whitespace-nowrap">{label}</span>
    </div>
  );
}

// ============================================================================
// DrawerMuscleBadge — icon + Hebrew label, no border
// Falls back: /icons/muscles/{file}.svg → /icons/muscles/male/{file}.svg → letter
// ============================================================================

const MUSCLE_FILE: Record<string, string> = {
  chest: 'chest', back: 'back', shoulders: 'shoulders',
  biceps: 'biceps', triceps: 'triceps', forearms: 'forearms',
  traps: 'traps', lats: 'back', upper_back: 'back',
  lower_back: 'back', quads: 'quads', hamstrings: 'hamstrings',
  glutes: 'glutes', calves: 'calves', legs: 'quads',
  hip_flexors: 'hip_flexors', adductors: 'adductors',
  abductors: 'adductors', core: 'abs', abs: 'abs',
  obliques: 'obliques', full_body: 'chest', cardio: 'calves',
  neck: 'traps', serratus: 'chest',
};

function DrawerMuscleBadge({ muscle }: { muscle: string }) {
  const label = getMuscleGroupLabel(muscle);
  const file = MUSCLE_FILE[muscle] ?? muscle;
  const [tier, setTier] = React.useState(0);

  const src = tier === 0 ? `/icons/muscles/${file}.svg` : `/icons/muscles/male/${file}.svg`;

  return (
    <div className="flex-shrink-0 flex items-center gap-1.5" dir="rtl">
      {tier < 2 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} width={28} height={28} onError={() => setTier((p) => p + 1)} />
      ) : (
        <span className="text-cyan-500 text-sm font-bold w-7 h-7 flex items-center justify-center">{label.charAt(0)}</span>
      )}
      <span className="text-[13px] font-normal text-gray-800 dark:text-gray-200">{label}</span>
    </div>
  );
}

// ============================================================================
// GeneratedWorkoutExerciseList — HTML-Reference Visual Design
// ============================================================================

const CATEGORY_ICON_FILTER_CYAN =
  'brightness(0) saturate(100%) invert(68%) sepia(65%) saturate(2000%) hue-rotate(160deg) brightness(102%) contrast(101%)';
const BOLT_FILTER_CYAN_DRAWER =
  'brightness(0) saturate(100%) invert(68%) sepia(65%) saturate(2000%) hue-rotate(160deg) brightness(102%) contrast(101%)';
const BOLT_FILTER_DARK_DRAWER =
  'brightness(0) saturate(100%) invert(22%) sepia(10%) saturate(750%) hue-rotate(176deg) brightness(95%) contrast(90%)';
const DIFF_LABELS_DRAWER: Record<number, string> = { 1: 'קל', 2: 'בינוני', 3: 'קשה' };
const PILL_BORDER_DRAWER = '0.5px solid #E0E9FF';

function DrawerBoltIcon({ filled }: { filled: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/ui/Bolt.svg"
      alt=""
      width={14}
      height={14}
      style={{ filter: filled ? BOLT_FILTER_CYAN_DRAWER : BOLT_FILTER_DARK_DRAWER }}
    />
  );
}

const DL_CIRCLE_SIZE = 28;
const DL_CIRCLE_STROKE = 2.5;
const DL_CIRCLE_RADIUS = (DL_CIRCLE_SIZE - DL_CIRCLE_STROKE) / 2;
const DL_CIRCLE_CIRCUMFERENCE = 2 * Math.PI * DL_CIRCLE_RADIUS;

function DownloadProgressCircle({ progress }: { progress: number }) {
  const clamped = Math.min(100, Math.max(0, progress));
  const offset = DL_CIRCLE_CIRCUMFERENCE - (clamped / 100) * DL_CIRCLE_CIRCUMFERENCE;

  return (
    <div className="relative flex items-center justify-center" style={{ width: DL_CIRCLE_SIZE, height: DL_CIRCLE_SIZE }}>
      <svg
        width={DL_CIRCLE_SIZE}
        height={DL_CIRCLE_SIZE}
        viewBox={`0 0 ${DL_CIRCLE_SIZE} ${DL_CIRCLE_SIZE}`}
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx={DL_CIRCLE_SIZE / 2}
          cy={DL_CIRCLE_SIZE / 2}
          r={DL_CIRCLE_RADIUS}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={DL_CIRCLE_STROKE}
        />
        <motion.circle
          cx={DL_CIRCLE_SIZE / 2}
          cy={DL_CIRCLE_SIZE / 2}
          r={DL_CIRCLE_RADIUS}
          fill="none"
          stroke="#06b6d4"
          strokeWidth={DL_CIRCLE_STROKE}
          strokeLinecap="round"
          strokeDasharray={DL_CIRCLE_CIRCUMFERENCE}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        />
      </svg>
      <ArrowDownCircle size={16} strokeWidth={1.8} className="text-cyan-500 relative z-[1]" />
    </div>
  );
}

interface WorkoutActions {
  isFav: boolean;
  isFavToggling: boolean;
  isFavDownloading: boolean;
  isFavDownloaded: boolean;
  downloadProgress: number;
  isSharing: boolean;
  onToggleFavorite: () => void;
  onShare: () => void;
  onDownload: () => void;
}

function GeneratedWorkoutExerciseList({
  generatedWorkout,
  onSwap,
  onExerciseTap,
  actions,
}: {
  generatedWorkout: GeneratedWorkout;
  onSwap?: (exercise: FirestoreExercise, level: number) => void;
  onExerciseTap?: (ex: EngineWorkoutExercise) => void;
  actions?: WorkoutActions;
}) {
  const sections = groupExercisesIntoSections(generatedWorkout.exercises);
  const equipment = collectEquipment(generatedWorkout.exercises);
  const muscles = collectMuscles(generatedWorkout.exercises);

  const allMediaUrls = useMemo(() => {
    const urls: (string | null)[] = [];
    for (const ex of generatedWorkout.exercises) {
      urls.push(resolveExerciseImage(ex));
    }
    return urls;
  }, [generatedWorkout.exercises]);
  const cachedMediaMap = useCachedMediaMap(allMediaUrls);

  const displayText = generatedWorkout.logicCue || generatedWorkout.description;
  const diff = generatedWorkout.difficulty;
  const dur = generatedWorkout.estimatedDuration;

  return (
    <div dir="rtl">
      {/* ── Top row: [Difficulty · Duration] ←→ [Share · Heart · Download] ── */}
      <div className="flex items-center justify-between mb-3">
        {/* Start (RTL right): stat pills */}
        <div className="flex items-center gap-2">
          {diff != null && (
            <div
              className="flex-shrink-0 flex items-center gap-1.5 bg-white dark:bg-slate-800/90 shadow-sm rounded-lg px-3 py-1.5"
              style={{ border: PILL_BORDER_DRAWER }}
            >
              <div className="flex items-center gap-0.5">
                {[1, 2, 3].map((n) => (
                  <DrawerBoltIcon key={n} filled={n <= diff} />
                ))}
              </div>
              <span className="text-[13px] font-normal text-gray-800 dark:text-gray-100">{DIFF_LABELS_DRAWER[diff] || ''}</span>
            </div>
          )}
          {dur != null && dur > 0 && (
            <div
              className="flex-shrink-0 flex items-center gap-1.5 bg-white dark:bg-slate-800/90 shadow-sm rounded-lg px-3 py-1.5"
              style={{ border: PILL_BORDER_DRAWER }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 flex-shrink-0"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              <span className="text-[13px] font-normal text-gray-800 dark:text-gray-100">{dur} דק&apos;</span>
            </div>
          )}
        </div>

        {/* End (RTL left): action icons */}
        {actions && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={actions.onShare}
              disabled={actions.isSharing}
              className="w-10 h-10 flex items-center justify-center rounded-full active:scale-90 transition-all disabled:opacity-50"
              aria-label="שתף"
            >
              {actions.isSharing
                ? <Loader2 size={20} className="animate-spin text-gray-400" />
                : <Share2 size={20} strokeWidth={1.8} className="text-gray-500" />
              }
            </button>
            <button
              onClick={actions.onToggleFavorite}
              disabled={actions.isFavToggling}
              className="w-10 h-10 flex items-center justify-center rounded-full active:scale-90 transition-all disabled:opacity-50"
              aria-label={actions.isFav ? 'הסר ממועדפים' : 'מועדפים'}
            >
              {actions.isFavToggling ? (
                <Loader2 size={20} className="animate-spin text-gray-400" />
              ) : (
                <Heart
                  size={20}
                  strokeWidth={1.8}
                  className={actions.isFav ? 'text-red-500 fill-red-500' : 'text-gray-500'}
                />
              )}
            </button>
            <button
              onClick={actions.onDownload}
              disabled={actions.isFavToggling || actions.isFavDownloading || actions.isFavDownloaded}
              className="w-10 h-10 flex items-center justify-center rounded-full active:scale-90 transition-all disabled:opacity-50 relative"
              aria-label="הורדה לאופליין"
            >
              {actions.isFavDownloading ? (
                <DownloadProgressCircle progress={actions.downloadProgress} />
              ) : actions.isFavDownloaded ? (
                <ArrowDownCircle size={21} className="text-emerald-500 fill-emerald-100" />
              ) : (
                <ArrowDownCircle size={20} strokeWidth={1.8} className="text-gray-500" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── Workout description ── */}
      {displayText && (
        <p className="text-slate-600 dark:text-slate-400 text-right leading-relaxed text-sm mb-3">
          {displayText}
        </p>
      )}

      {/* ── ציוד (Equipment) ── */}
      {equipment.length > 0 && (
        <section className="mb-4">
          <h3 className="text-right text-[15px] font-semibold text-slate-900 dark:text-white mb-2" style={{ fontFamily: 'var(--font-simpler)' }}>ציוד</h3>
          <div className="flex flex-nowrap gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1" dir="rtl">
            {equipment.map((eq) => (
              <DrawerEquipmentBadge key={eq.id} id={eq.id} label={eq.label} />
            ))}
            <div className="flex-shrink-0 w-2" aria-hidden />
          </div>
        </section>
      )}

      {/* ── שרירים (Muscles) ── */}
      {muscles.length > 0 && (
        <section className="mb-4">
          <h3 className="text-right text-[15px] font-semibold text-slate-900 dark:text-white mb-2" style={{ fontFamily: 'var(--font-simpler)' }}>שרירים</h3>
          <div className="flex flex-wrap gap-2" dir="rtl">
            {muscles.map((m) => (
              <DrawerMuscleBadge key={m} muscle={m} />
            ))}
          </div>
        </section>
      )}

      {/* ── Exercise Sections (חימום, סופר-סט, סט רגיל, מתיחות) ── */}
      {sections.map((section) => {
        // Strict: only the "superset" section gets the cyan connector — not regular multi-exercise sections
        const isSuperset = section.id === 'superset';

        return (
          <section key={section.id} className="mb-8">
            {/* Section Header — RTL: title pinned right, rounds pinned left */}
            <div className="w-full flex items-center justify-between mb-3" dir="rtl">
              <div className="flex items-center gap-2">
                {isSuperset && <Link2 size={14} className="text-cyan-500" />}
                <h3 className={`text-[16px] font-semibold ${isSuperset ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-900 dark:text-white'}`} style={{ fontFamily: 'var(--font-simpler)' }}>
                  {section.title}
                </h3>
              </div>
              <span className="text-sm font-medium text-slate-400">{section.rounds}x סבבים</span>
            </div>

            {/* Exercise Cards — with superset border connector when applicable */}
            <div className={isSuperset ? 'border-r-[3px] border-cyan-400/70 dark:border-cyan-600/50 pr-3 mr-1 space-y-2' : 'space-y-3'}>
              {section.exercises.map((ex, idx) => {
                const name = typeof ex.exercise.name === 'string'
                  ? ex.exercise.name
                  : getLocalizedText(ex.exercise.name, 'he');

                // Range-based display (no sets prefix -- sets visible in section header)
                // Format: "12 (8-15) חזרות" — final resolved target + original range for transparency
                const volume = (() => {
                  const uniLabel = ex.exercise.symmetry === 'unilateral' ? ' (לכל צד)' : '';
                  if (ex.repsRange && ex.repsRange.min !== ex.repsRange.max) {
                    const unit = ex.isTimeBased ? 'שניות' : 'חזרות';
                    return `${ex.repsRange.min}-${ex.repsRange.max} ${unit}${uniLabel}`;
                  }
                  return ex.isTimeBased ? `${ex.reps} שניות` : `${ex.reps} חזרות${uniLabel}`;
                })();

                const imageUrl = resolveExerciseImage(ex);
                const isGoal = ex.isGoalExercise;

                return (
                  <div
                    key={`${ex.exercise.id}-${idx}`}
                    dir="rtl"
                    role="button"
                    tabIndex={0}
                    onClick={() => onExerciseTap?.(ex)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onExerciseTap?.(ex); }}
                    className={`relative w-full bg-white dark:bg-[#1E293B] rounded-lg overflow-hidden h-[70px] border-[0.5px] cursor-pointer active:scale-[0.98] transition-transform ${
                      isGoal
                        ? 'ring-2 ring-cyan-400 border-cyan-200 dark:border-cyan-800 bg-cyan-50/30 dark:bg-cyan-900/20'
                        : isSuperset
                          ? 'border-[#E0E9FF]/40 dark:border-slate-800/50 shadow-none'
                          : 'border-[#E0E9FF] dark:border-slate-700 shadow-sm'
                    }`}
                  >
                    {/* Three-column grid: Thumbnail (right) | Info (center) | Actions (left) */}
                    <div className="flex items-center h-full">
                      {/* Thumbnail — right edge in RTL, fills full card height */}
                      <div className="w-[70px] h-full flex-shrink-0">
                        <img alt={name} className="w-full h-full object-cover" src={cachedMediaMap.get(imageUrl) || imageUrl} loading="lazy" />
                      </div>

                      {/* Info — fills remaining space */}
                      <div className="flex-1 min-w-0 flex flex-col justify-center py-1.5 pr-3 pl-1">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold text-[14px] leading-tight truncate ${isGoal ? 'text-cyan-700 dark:text-cyan-300' : 'text-black dark:text-white'}`}>
                            {name}
                          </span>
                          {isGoal && (
                            <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-cyan-100 text-cyan-700 text-[10px] font-bold rounded-full border border-cyan-200 flex-shrink-0">
                              <Target size={9} />
                              יעד
                            </span>
                          )}
                        </div>
                        <div className={`text-[13px] font-normal mt-0.5 ${isGoal ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-800 dark:text-slate-300'}`}>
                          {volume}
                        </div>
                      </div>

                      {/* Swap button — pinned to left edge in RTL */}
                      <div className="h-full flex items-center pl-3 flex-shrink-0">
                        <SwapIcon size={18} onClick={() => onSwap?.(ex.exercise, ex.programLevel || 1)} isSwapped={ex.wasSwapped} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

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
