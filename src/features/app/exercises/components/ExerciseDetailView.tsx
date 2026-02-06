'use client';

import React, { useState, useEffect } from 'react';
import { Exercise, ExecutionMethod, getLocalizedText, MuscleGroup } from '@/features/content/exercises';
import { getMuscleGroupLabel } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { Play, CheckCircle2, Volume2, RotateCcw, Dumbbell, Accessibility, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/features/user';
import { resolveDescription, TagResolverContext } from '@/features/content/branding/core/branding.utils';

interface ExerciseDetailViewProps {
  exercise: Exercise;
  executionMethod?: ExecutionMethod;
  onStart?: (isUnilateral?: boolean) => void;
  onBack?: () => void;
}

const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
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

export default function ExerciseDetailView({
  exercise,
  executionMethod,
  onStart,
  onBack,
}: ExerciseDetailViewProps) {
  const router = useRouter();
  const { profile } = useUserStore();
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  const isUnilateral = exercise.symmetry === 'unilateral';
  
  // Get video/image URL from execution method or fallback to legacy media
  const mainVideoUrl = executionMethod?.media?.mainVideoUrl || exercise.media?.videoUrl;
  const imageUrl = executionMethod?.media?.imageUrl || exercise.media?.imageUrl;
  const instructionalVideoUrl = executionMethod?.media?.instructionalVideos?.[0]?.url || 
                               exercise.media?.instructionalVideos?.[0]?.url;

  // Reset errors when URL changes
  useEffect(() => {
    setVideoError(false);
  }, [mainVideoUrl]);

  useEffect(() => {
    setImageError(false);
  }, [imageUrl]);
  
  // Get exercise name
  const exerciseName = getLocalizedText(exercise.name);
  
  // Get muscle groups - primary is first, rest are secondary
  const muscleGroups = exercise.muscleGroups || [];
  const primaryMuscle = muscleGroups[0];
  const secondaryMuscles = muscleGroups.slice(1, 3); // Limit to 2 for display
  
  // Get exercise type label
  const getExerciseTypeLabel = (): string => {
    if (exercise.type === 'reps') return '10-15 חזרות';
    if (exercise.type === 'time') return '30-60 שניות';
    if (exercise.type === 'rest') return 'התאוששות/חימום';
    return '10-15 חזרות';
  };
  
  // Get description with resolved tags
  const getResolvedDescription = (): string => {
    if (!exercise.content?.description) return '';
    
    const rawDescription = getLocalizedText(exercise.content.description);
    
    // Resolve @tags if description contains them (client-side only)
    if (typeof window !== 'undefined' && rawDescription.includes('@')) {
      const context: TagResolverContext = {
        userProfile: profile || undefined,
        userName: profile?.core?.name?.split(' ')[0] || 'משתמש',
        userGoal: profile?.core?.mainGoal === 'healthy_lifestyle' ? 'אורח חיים בריא' :
                 profile?.core?.mainGoal === 'performance_boost' ? 'שיפור ביצועים' :
                 profile?.core?.mainGoal === 'weight_loss' ? 'ירידה במשקל' :
                 profile?.core?.mainGoal === 'skill_mastery' ? 'שליטה במיומנויות' : 'אימון',
        exerciseName: exerciseName,
        category: exercise.programIds?.[0] || 'כוח',
        muscles: muscleGroups,
        location: executionMethod?.location || 'home',
        currentTime: new Date(),
      };
      return resolveDescription(rawDescription, context);
    }
    
    return rawDescription;
  };
  
  // Extract YouTube video ID for embed
  const getYouTubeVideoId = (url: string): string | null => {
    const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(youtubeRegex);
    return match ? match[1] : null;
  };
  
  const youtubeVideoId = instructionalVideoUrl ? getYouTubeVideoId(instructionalVideoUrl) : null;
  
  const handleStart = () => {
    if (onStart) {
      onStart(isUnilateral);
    } else {
      router.push(`/workouts/exercise/${exercise.id}?unilateral=${isUnilateral}`);
    }
  };
  
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  // Get current time for status bar
  const currentTime = new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="w-full bg-white dark:bg-zinc-900 shadow-2xl min-h-screen flex flex-col relative overflow-hidden" dir="rtl">
      {/* Hero Section - Video/Image Background (Fixed) */}
      <div className="relative w-full aspect-[9/10] overflow-hidden flex-shrink-0">
        {mainVideoUrl && !videoError ? (
          <video
            src={mainVideoUrl}
            className="absolute inset-0 w-full h-full object-cover"
            autoPlay
            loop
            muted
            playsInline
            onLoadedData={() => setVideoLoaded(true)}
            onError={() => setVideoError(true)}
          />
        ) : imageUrl && !imageError ? (
          <img
            src={imageUrl}
            alt={exerciseName}
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex flex-col items-center justify-center gap-3">
            {(videoError || imageError) ? (
              <>
                <AlertCircle size={48} className="text-amber-500" />
                <p className="text-xs text-amber-400 font-semibold" style={{ fontFamily: 'var(--font-simpler)' }}>
                  שגיאה בטעינת המדיה
                </p>
                <p className="text-[10px] text-gray-500 text-center px-4">
                  {mainVideoUrl || imageUrl ? 'הקישור לא תקין או שהקובץ לא נגיש' : 'לא הוגדר מדיה'}
                </p>
              </>
            ) : (
              <>
                <Dumbbell size={48} className="text-gray-600" />
                <p className="text-xs text-gray-500" style={{ fontFamily: 'var(--font-simpler)' }}>
                  אין מדיה
                </p>
              </>
            )}
          </div>
        )}
        
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent h-32"></div>
        
        {/* Status Bar & Controls */}
        <div className="absolute top-0 w-full px-4 pt-2 z-20">
          {/* Status Bar */}
          <div className="flex justify-between items-center text-white text-xs font-semibold">
            <span style={{ fontFamily: 'var(--font-simpler)' }}>{currentTime}</span>
            <span className="text-sm">🔋</span>
          </div>
          
          {/* Progress Segments */}
          <div className="flex mt-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="progress-segment"
                style={{
                  height: '4px',
                  backgroundColor: i === 8 ? '#00B4D8' : 'rgba(0, 180, 216, 0.4)',
                  flexGrow: 1,
                  margin: '0 2px',
                  borderRadius: '2px',
                }}
              />
            ))}
          </div>
          
          {/* Control Buttons */}
          <div className="flex justify-between items-center mt-4 px-2">
            <button className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
              <Play size={20} className="text-white" />
            </button>
            <div className="text-white font-bold text-xl tracking-wider" style={{ fontFamily: 'var(--font-simpler)' }}>
              02:20
            </div>
            <button className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
              <RotateCcw size={20} className="text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Floating Drawer with Scroll Indicator */}
      <div className="flex-1 bg-white dark:bg-zinc-900 rounded-t-[32px] -mt-10 relative z-10 px-6 pt-8 pb-10 shadow-[0_-10px_25px_rgba(0,0,0,0.1)] overflow-y-auto scrollbar-hide">
        {/* Scroll Indicator (Grabber Bar) */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-32 h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-full" />
        </div>
        
        {/* Title Section */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-extrabold text-slate-800 dark:text-white mb-1" style={{ fontFamily: 'var(--font-simpler)' }}>
            {getExerciseTypeLabel()}
          </h1>
          <p className="text-slate-500 dark:text-zinc-400 text-lg" style={{ fontFamily: 'var(--font-simpler)' }}>
            {exerciseName}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-4 mb-8">
          <button className="w-14 h-14 flex items-center justify-center rounded-2xl border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300">
            <Volume2 size={24} />
          </button>
          <button
            onClick={handleStart}
            className="flex-1 h-14 bg-white dark:bg-zinc-800 border-2 border-slate-100 dark:border-zinc-700 rounded-2xl flex items-center justify-center gap-2 font-bold text-slate-800 dark:text-white shadow-sm active:scale-[0.98] transition-transform"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            <span>סיימתי</span>
            <CheckCircle2 size={20} className="text-[#00B4D8]" />
          </button>
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
            <h3 className="text-lg font-bold mb-4 text-slate-800 dark:text-white" style={{ fontFamily: 'var(--font-simpler)' }}>
              שרירי התרגיל
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {primaryMuscle && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-50 dark:bg-zinc-800 rounded-lg flex items-center justify-center">
                    <Dumbbell size={20} className="text-[#00B4D8]" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-zinc-500">שריר ראשי</p>
                    <p className="font-bold text-sm">{MUSCLE_GROUP_LABELS[primaryMuscle] || getMuscleGroupLabel(primaryMuscle)}</p>
                  </div>
                </div>
              )}
              {secondaryMuscles.length > 0 && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-50 dark:bg-zinc-800 rounded-lg flex items-center justify-center">
                    <Accessibility size={20} className="text-slate-400" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-zinc-500">שרירים משניים</p>
                    <p className="font-bold text-sm">
                      {secondaryMuscles.map((m) => MUSCLE_GROUP_LABELS[m] || getMuscleGroupLabel(m)).join(', ')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Exercise Goal */}
        {getResolvedDescription() && (
          <div className="mb-8">
            <h3 className="text-lg font-bold mb-2 text-slate-800 dark:text-white" style={{ fontFamily: 'var(--font-simpler)' }}>
              מטרת התרגיל
            </h3>
            <p className="text-slate-600 dark:text-zinc-400 leading-relaxed">
              {getResolvedDescription()}
            </p>
          </div>
        )}

        {/* Highlights */}
        {exercise.content?.highlights && exercise.content.highlights.length > 0 && (
          <div className="mb-10">
            <h3 className="text-lg font-bold mb-4 text-slate-800 dark:text-white" style={{ fontFamily: 'var(--font-simpler)' }}>
              דגשים
            </h3>
            <ul className="space-y-4">
              {exercise.content.highlights.map((highlight, index) => (
                <li key={index} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#00B4D8]/10 text-[#00B4D8] flex items-center justify-center text-xs font-bold">
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
            onClick={handleBack}
            className="w-full py-4 flex items-center justify-center gap-2 text-slate-500 dark:text-zinc-400 hover:text-[#00B4D8] transition-colors font-semibold"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            <RotateCcw size={20} />
            <span>החלפת תרגיל</span>
          </button>
        </div>
      </div>

      {/* Bottom Scroll Indicator */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-full z-20"></div>
    </div>
  );
}
