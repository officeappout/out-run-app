'use client';

import React, { useState, useMemo } from 'react';
import { Exercise as FirestoreExercise, LoggingMode, MovementGroup, findMethodForLocation } from '@/features/content/exercises';
import { WorkoutPlan, WorkoutSegment, Exercise as WorkoutExercise } from '@/features/parks';
import { useTranslation } from '@/hooks/useTranslation';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Pause,
  List,
  Volume2,
  Check,
  Play,
  Dumbbell,
  User,
  ArrowRight,
} from 'lucide-react';

// Activity type icons mapping
const ACTIVITY_ICONS = {
  walk: '🚶',
  strength: '💪',
  run: '🏃',
  rest: '🧘',
};

// Movement group labels
const MOVEMENT_GROUP_LABELS: Record<MovementGroup, { label: string; description: string }> = {
  squat: { label: 'סקוואט', description: 'תנועת כיפוף ברכיים' },
  hinge: { label: 'ציר', description: 'תנועת ציר ירך' },
  horizontal_push: { label: 'דחיפה אופקית', description: 'דחיפה קדימה' },
  vertical_push: { label: 'דחיפה אנכית', description: 'דחיפה מעלה' },
  horizontal_pull: { label: 'משיכה אופקית', description: 'משיכה אחורה' },
  vertical_pull: { label: 'משיכה אנכית', description: 'משיכה מעלה' },
  core: { label: 'ליבה', description: 'חיזוק ליבה' },
  isolation: { label: 'בידוד', description: 'תרגיל בידוד' },
};

// Muscle group labels
const MUSCLE_GROUP_LABELS: Record<string, string> = {
  chest: 'חזה',
  back: 'גב',
  shoulders: 'כתפיים',
  abs: 'בטן',
  obliques: 'אלכסונים',
  forearms: 'אמות',
  biceps: 'דו-ראשי',
  triceps: 'שלושה ראשים',
  quads: 'ארבע ראשי',
  hamstrings: 'המסטרינג',
  glutes: 'ישבן',
  calves: 'שוקיים',
  traps: 'טרפז',
  cardio: 'קרדיו',
  full_body: 'כל הגוף',
  core: 'ליבה',
  legs: 'רגליים',
};

interface ActiveWorkoutScreenProps {
  workoutPlan: WorkoutPlan;
  currentSegmentIndex: number;
  currentExerciseIndex: number;
  elapsedTime: number; // in seconds
  isPaused: boolean;
  // Optional: Full Firestore exercise data (if available)
  currentExerciseData?: FirestoreExercise;
  /** Active workout location (e.g. 'park', 'home') — used to select the correct execution_method media */
  workoutLocation?: string;
  onPause: () => void;
  onResume: () => void;
  onNext: () => void;
  onComplete: (reps?: number) => void;
}

export default function ActiveWorkoutScreen({
  workoutPlan,
  currentSegmentIndex,
  currentExerciseIndex,
  elapsedTime,
  isPaused,
  currentExerciseData,
  workoutLocation,
  onPause,
  onResume,
  onNext,
  onComplete,
}: ActiveWorkoutScreenProps) {
  const { t, getLocalized, language } = useTranslation();
  const { direction } = useLanguage();
  const [repsInput, setRepsInput] = useState<string>('');

  // Get current segment and exercise
  const currentSegment = workoutPlan.segments[currentSegmentIndex];
  const currentWorkoutExercise = currentSegment?.exercises?.[currentExerciseIndex];
  
  // Use full Firestore exercise data if available, otherwise fall back to workout exercise
  const currentExercise = currentExerciseData;

  // Calculate progress (0-9 segments)
  const progressSegments = useMemo(() => {
    const totalSegments = workoutPlan.segments.length;
    const completedSegments = currentSegmentIndex;
    const currentProgress = Math.min(
      Math.floor((completedSegments / totalSegments) * 9),
      8
    );
    return Array.from({ length: 9 }, (_, i) => i <= currentProgress);
  }, [currentSegmentIndex, workoutPlan.segments.length]);

  // Get activity type for current segment
  const getActivityType = (segment: WorkoutSegment): 'walk' | 'strength' | 'run' | 'rest' => {
    if (segment.type === 'travel') {
      if (segment.title.includes('ריצה') || segment.title.includes('run')) return 'run';
      if (segment.title.includes('מנוחה') || segment.title.includes('rest')) return 'rest';
      return 'walk';
    }
    return 'strength';
  };

  const activityType = currentSegment ? getActivityType(currentSegment) : 'walk';

  // Get exercise type label
  const getExerciseTypeLabel = (exercise: FirestoreExercise | undefined, workoutExercise: WorkoutExercise | undefined): string => {
    if (exercise) {
      switch (exercise.type) {
        case 'reps':
          return '10-15 חזרות';
        case 'time':
          return '30-60 שניות';
        case 'rest':
          return 'התאוששות/חימום';
        default:
          return '10-15 חזרות';
      }
    }
    // Fallback to workout exercise reps/duration
    if (workoutExercise?.reps) return workoutExercise.reps;
    if (workoutExercise?.duration) return workoutExercise.duration;
    return '10-15 חזרות';
  };

  // Get main video URL from exercise — location-aware
  const getMainVideoUrl = (exercise: FirestoreExercise | undefined, workoutExercise: WorkoutExercise | undefined): string => {
    if (exercise) {
      const method = findMethodForLocation(exercise, workoutLocation);
      if (method?.media?.mainVideoUrl) return method.media.mainVideoUrl;
      return exercise.media?.videoUrl || '';
    }
    return workoutExercise?.videoUrl || '';
  };

  // Get instructional video URL — location-aware
  const getInstructionalVideoUrl = (exercise: FirestoreExercise | undefined): string => {
    if (!exercise) return '';
    const method = findMethodForLocation(exercise, workoutLocation);
    const instructionalVideos = method?.media?.instructionalVideos || [];
    const video = instructionalVideos.find((v) => v.lang === language) || instructionalVideos[0];
    return video?.url || '';
  };

  // Extract YouTube video ID
  const getYouTubeVideoId = (url: string): string | null => {
    const youtubeRegex =
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(youtubeRegex);
    return match ? match[1] : null;
  };

  const mainVideoUrl = getMainVideoUrl(currentExercise, currentWorkoutExercise);
  const instructionalVideoUrl = getInstructionalVideoUrl(currentExercise);
  const youtubeVideoId = instructionalVideoUrl ? getYouTubeVideoId(instructionalVideoUrl) : null;

  // Format elapsed time
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get exercise name
  const exerciseName = currentExercise
    ? getLocalized(currentExercise.name, 'שם התרגיל')
    : currentWorkoutExercise?.name || currentSegment?.title || '';

  // Get movement group
  const movementGroup = currentExercise?.movementGroup;
  const movementBadge = movementGroup ? MOVEMENT_GROUP_LABELS[movementGroup] : null;

  // Get muscle groups
  const muscleGroups = currentExercise?.muscleGroups || [];
  const primaryMuscle = muscleGroups[0];
  const secondaryMuscles = muscleGroups.slice(1, 3);

  // Get highlights/instructions
  const highlights = currentExercise?.content?.highlights || currentWorkoutExercise?.instructions || [];
  const instructions = currentExercise?.content?.instructions
    ? getLocalized(currentExercise.content.instructions, '')
    : '';

  // Get logging mode
  const loggingMode: LoggingMode = currentExercise?.loggingMode || 'reps';
  const isRepsMode = loggingMode === 'reps';

  // Handle completion
  const handleComplete = () => {
    if (isRepsMode) {
      const reps = parseInt(repsInput, 10);
      if (!isNaN(reps) && reps > 0) {
        onComplete(reps);
        setRepsInput('');
      }
    } else {
      onComplete();
    }
  };

  // Format current time
  const currentTime = new Date().toLocaleTimeString(language === 'he' ? 'he-IL' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className="relative h-screen w-full max-w-md mx-auto overflow-hidden flex flex-col bg-gray-200 dark:bg-gray-800"
      dir={direction}
    >
      {/* Hero Section - Video/Image Background */}
      <div className="relative flex-grow w-full overflow-hidden bg-gray-200 dark:bg-gray-800">
        {mainVideoUrl ? (
          <video
            src={mainVideoUrl}
            className="absolute inset-0 w-full h-full object-cover"
            autoPlay
            loop
            muted={typeof window !== 'undefined' ? sessionStorage.getItem('isAudioEnabled') !== 'true' : true}
            playsInline
          />
        ) : (
          <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
            <Dumbbell size={48} className="text-gray-600" />
          </div>
        )}

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent h-32" />

        {/* Status Bar & Controls */}
        <div className="absolute top-0 w-full px-4 pt-2 z-20">
          {/* Status Bar */}
          <div className="flex justify-between items-center text-white text-xs font-semibold">
            <span style={{ fontFamily: 'var(--font-simpler)' }}>{currentTime}</span>
            <span className="text-sm">🔋</span>
          </div>

          {/* Progress Segments */}
          <div className="flex mt-3">
            {progressSegments.slice(0, 9).map((isActive, index) => (
              <div
                key={index}
                className="progress-segment"
                style={{
                  height: '4px',
                  backgroundColor: isActive ? '#00AEEF' : 'rgba(0, 174, 239, 0.4)',
                }}
              />
            ))}
          </div>

          {/* Control Buttons */}
          <div className="flex justify-between items-center mt-4 px-2">
            <button
              onClick={isPaused ? onResume : onPause}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-md"
            >
              {isPaused ? (
                <Play size={20} className="text-white" fill="white" />
              ) : (
                <Pause size={20} className="text-white" />
              )}
            </button>
            <div
              className="text-white font-bold text-xl tracking-wider"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              {formatTime(elapsedTime)}
            </div>
            <button className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
              <List size={20} className="text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Floating Drawer */}
      <div className="flex-1 bg-white dark:bg-zinc-900 rounded-t-[32px] -mt-10 relative z-10 px-6 pt-8 pb-10 shadow-[0_-10px_25px_rgba(0,0,0,0.1)] overflow-y-auto scrollbar-hide">
        {/* Title Section */}
        <div className="text-center mb-6">
          <h1
            className="text-3xl font-extrabold text-slate-800 dark:text-white mb-1"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {getExerciseTypeLabel(currentExercise, currentWorkoutExercise)}
          </h1>
          <p
            className="text-slate-500 dark:text-zinc-400 text-lg"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {exerciseName}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-4 mb-8">
          <button className="w-14 h-14 flex items-center justify-center rounded-2xl border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300">
            <Volume2 size={24} />
          </button>
          {isRepsMode ? (
            <div className="flex-1 h-14 bg-white dark:bg-zinc-800 border-2 border-slate-100 dark:border-zinc-700 rounded-2xl flex items-center justify-center gap-2 font-bold text-slate-800 dark:text-white shadow-sm active:scale-[0.98] transition-transform">
              <input
                type="number"
                value={repsInput}
                onChange={(e) => setRepsInput(e.target.value)}
                placeholder="כמות חזרות"
                className="flex-1 h-full bg-transparent text-center text-xl font-bold text-slate-800 dark:text-white focus:outline-none"
                style={{ fontFamily: 'var(--font-simpler)' }}
              />
              <button
                onClick={handleComplete}
                disabled={!repsInput || parseInt(repsInput, 10) <= 0}
                className="px-4 h-full flex items-center justify-center text-[#00AEEF] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check size={20} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleComplete}
              className="flex-1 h-14 bg-white dark:bg-zinc-800 border-2 border-slate-100 dark:border-zinc-700 rounded-2xl flex items-center justify-center gap-2 font-bold text-slate-800 dark:text-white shadow-sm active:scale-[0.98] transition-transform"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              <span>סיימתי</span>
              <Check size={20} className="text-[#00AEEF]" />
            </button>
          )}
        </div>

        {/* Instructional Video */}
        {youtubeVideoId && (
          <div className="mb-8 overflow-hidden rounded-2xl bg-black aspect-video relative group">
            <iframe
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="w-full h-full"
              frameBorder="0"
              src={`https://www.youtube.com/embed/${youtubeVideoId}?controls=0`}
              title="YouTube video player"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none group-hover:bg-transparent transition-all">
              <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center text-white shadow-lg">
                <Play size={24} className="text-white" fill="white" />
              </div>
            </div>
          </div>
        )}

        {/* Muscle Groups Section */}
        {muscleGroups.length > 0 && (
          <div className="mb-8">
            <h3
              className="text-lg font-bold mb-4 text-slate-800 dark:text-white"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              שרירי התרגיל
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {primaryMuscle && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-50 dark:bg-zinc-800 rounded-lg flex items-center justify-center">
                    <Dumbbell size={20} className="text-[#00AEEF]" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-zinc-500">שריר ראשי</p>
                    <p className="font-bold text-sm">{MUSCLE_GROUP_LABELS[primaryMuscle] || primaryMuscle}</p>
                  </div>
                </div>
              )}
              {secondaryMuscles.length > 0 && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-50 dark:bg-zinc-800 rounded-lg flex items-center justify-center">
                    <User size={20} className="text-slate-400" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-zinc-500">שרירים משניים</p>
                    <p className="font-bold text-sm">
                      {secondaryMuscles.map((m) => MUSCLE_GROUP_LABELS[m] || m).join(', ')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Exercise Goal */}
        {instructions && (
          <div className="mb-8">
            <h3
              className="text-lg font-bold mb-2 text-slate-800 dark:text-white"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              מטרת התרגיל
            </h3>
            <p className="text-slate-600 dark:text-zinc-400 leading-relaxed">{instructions}</p>
          </div>
        )}

        {/* Highlights */}
        {highlights.length > 0 && (
          <div className="mb-10">
            <h3
              className="text-lg font-bold mb-4 text-slate-800 dark:text-white"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              דגשים
            </h3>
            <ul className="space-y-4">
              {highlights.map((highlight, index) => (
                <li key={index} className="flex gap-3">
                  <span
                    className="flex-shrink-0 w-6 h-6 rounded-full bg-[#00AEEF]/10 text-[#00AEEF] flex items-center justify-center text-xs font-bold"
                  >
                    {index + 1}
                  </span>
                  <p className="text-slate-600 dark:text-zinc-400 text-sm leading-relaxed">{highlight}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Replace Exercise Button */}
        <div className="pt-4 border-t border-slate-100 dark:border-zinc-800">
          <button
            className="w-full py-4 flex items-center justify-center gap-2 text-slate-500 dark:text-zinc-400 hover:text-[#00AEEF] transition-colors font-semibold"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            <span className="text-lg">🔄</span>
            <span>החלפת תרגיל</span>
          </button>
        </div>
      </div>

      {/* Bottom Indicator */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-full z-20" />
    </div>
  );
}
