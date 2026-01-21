'use client';

import React, { useState, useMemo } from 'react';
import { WorkoutPlan } from '@/features/parks';
import { Exercise as FirestoreExercise, LoggingMode } from '@/features/content/exercises';
import WorkoutStickyNav from './WorkoutStickyNav';
import { ArrowUp, Pause, Play, Square, Layers, Crosshair, Volume2, Check, Dumbbell, User } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useLanguage } from '@/contexts/LanguageContext';

interface LiveWorkoutOverlayProps {
    plan: WorkoutPlan;
    currentSegmentIndex: number;
    currentExerciseIndex?: number;
    elapsedTime: number; // in seconds
    currentPace: string; // e.g., "5:30"
    distanceToNext: number; // in meters
    distanceCovered: number; // in km
    isPaused: boolean;
    // Optional: Full Firestore exercise data (if available)
    currentExerciseData?: FirestoreExercise;
    onPause: () => void;
    onResume: () => void;
    onStop: () => void;
    onComplete?: (reps?: number) => void;
}

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

export default function LiveWorkoutOverlay({
    plan,
    currentSegmentIndex,
    currentExerciseIndex = 0,
    elapsedTime,
    currentPace,
    distanceToNext,
    distanceCovered,
    isPaused,
    currentExerciseData,
    onPause,
    onResume,
    onStop,
    onComplete,
}: LiveWorkoutOverlayProps) {
    const { getLocalized, language } = useTranslation();
    const { direction } = useLanguage();
    const [repsInput, setRepsInput] = useState<string>('');

    // Get current segment and exercise
    const currentSegment = plan.segments[currentSegmentIndex];
    const currentWorkoutExercise = currentSegment?.exercises?.[currentExerciseIndex];
    const currentExercise = currentExerciseData;

    // Format elapsed time as MM:SS
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Format distance for instruction bar
    const formatDistanceShort = (meters: number): string => {
        if (meters >= 1000) {
            return `${(meters / 1000).toFixed(1)} ק״מ`;
        }
        return `${Math.round(meters)} מ׳`;
    };

    // Get next segment info
    const nextSegment = plan.segments[currentSegmentIndex + 1];
    const nextStationName = nextSegment?.type === 'station'
        ? nextSegment.title.replace('תחנה 1: ', '').replace('תחנה 2: ', '')
        : 'סיום המסלול';

    // Get exercise type label
    const getExerciseTypeLabel = (): string => {
        if (currentExercise) {
            switch (currentExercise.type) {
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
        if (currentWorkoutExercise?.reps) return currentWorkoutExercise.reps;
        if (currentWorkoutExercise?.duration) return currentWorkoutExercise.duration;
        return '10-15 חזרות';
    };

    // Get main video URL from execution_methods[0].media.mainVideoUrl
    const getMainVideoUrl = (): string => {
        if (currentExercise?.execution_methods?.[0]?.media?.mainVideoUrl) {
            return currentExercise.execution_methods[0].media.mainVideoUrl;
        }
        // Fallback to legacy videoUrl
        if (currentExercise?.media?.videoUrl) {
            return currentExercise.media.videoUrl;
        }
        return currentWorkoutExercise?.videoUrl || '';
    };

    // Get instructional video URL
    const getInstructionalVideoUrl = (): string => {
        if (!currentExercise) return '';
        const executionMethod = currentExercise.execution_methods?.[0];
        const instructionalVideos = executionMethod?.media?.instructionalVideos || [];
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

    const mainVideoUrl = getMainVideoUrl();
    const instructionalVideoUrl = getInstructionalVideoUrl();
    const youtubeVideoId = instructionalVideoUrl ? getYouTubeVideoId(instructionalVideoUrl) : null;

    // Get exercise name
    const exerciseName = currentExercise
        ? getLocalized(currentExercise.name, 'שם התרגיל')
        : currentWorkoutExercise?.name || currentSegment?.title || '';

    // Get muscle groups
    const muscleGroups = currentExercise?.muscleGroups || [];
    const primaryMuscle = muscleGroups[0];
    const secondaryMuscles = muscleGroups.slice(1, 3);

    // Get highlights
    const highlights = currentExercise?.content?.highlights || currentWorkoutExercise?.instructions || [];
    const description = currentExercise?.content?.description
        ? getLocalized(currentExercise.content.description, '')
        : currentExercise?.content?.goal || '';

    // Get logging mode
    const loggingMode: LoggingMode = currentExercise?.loggingMode || 'reps';
    const isRepsMode = loggingMode === 'reps';

    // Handle completion
    const handleComplete = () => {
        if (isRepsMode) {
            const reps = parseInt(repsInput, 10);
            if (!isNaN(reps) && reps > 0) {
                onComplete?.(reps);
                setRepsInput('');
            }
        } else {
            onComplete?.();
        }
    };

    return (
        <div className="fixed inset-0 pointer-events-none z-40" dir={direction}>
            {/* Hero Video Background */}
            {mainVideoUrl && (
                <div className="absolute inset-0 w-full h-full overflow-hidden">
                    <video
                        src={mainVideoUrl}
                        className="absolute inset-0 w-full h-full object-cover"
                        autoPlay
                        loop
                        muted
                        playsInline
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent h-32" />
                </div>
            )}

            {/* Top Floating Instruction Pill - Waze Style */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-auto">
                <div className="bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 min-w-[280px]">
                    {/* Direction Arrow */}
                    <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center shrink-0">
                        <ArrowUp size={24} className="text-white" strokeWidth={3} />
                    </div>

                    {/* Distance & Destination */}
                    <div className="flex items-center gap-2 flex-1">
                        <span className="text-3xl font-black tabular-nums">{formatDistanceShort(distanceToNext)}</span>
                        <span className="text-xl font-medium opacity-70">•</span>
                        <span className="text-base font-bold truncate">{nextStationName}</span>
                    </div>
                </div>
            </div>

            {/* Scrollable Drawer - Only show for station segments with exercise data */}
            {currentSegment?.type === 'station' && (currentExercise || currentWorkoutExercise) && (
                <div className="absolute bottom-0 left-0 right-0 pointer-events-auto z-50">
                    <div className="bg-white dark:bg-zinc-900 rounded-t-[40px] shadow-[0_-10px_30px_rgba(0,0,0,0.1)] pt-10 px-8 pb-12 max-h-[70vh] overflow-y-auto scrollbar-hide">
                    {/* Title Section */}
                    <div className="text-center mb-6">
                        <h1
                            className="text-3xl font-extrabold text-slate-800 dark:text-white mb-1"
                            style={{ fontFamily: 'Assistant, sans-serif' }}
                        >
                            {getExerciseTypeLabel()}
                        </h1>
                        <p
                            className="text-slate-500 dark:text-zinc-400 text-lg mb-2"
                            style={{ fontFamily: 'Assistant, sans-serif' }}
                        >
                            {exerciseName}
                        </p>
                        {/* Program & Level Badge */}
                        {currentExercise?.targetPrograms?.[0] && (
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#00AEEF]/10 text-[#00AEEF] rounded-full text-xs font-bold">
                                <span>תוכנית {currentExercise.targetPrograms[0].programId}</span>
                                <span>•</span>
                                <span>רמה {currentExercise.targetPrograms[0].level}</span>
                            </div>
                        )}
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
                                    style={{ fontFamily: 'Assistant, sans-serif' }}
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
                                style={{ fontFamily: 'Assistant, sans-serif' }}
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
                                style={{ fontFamily: 'Assistant, sans-serif' }}
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
                    {description && (
                        <div className="mb-8">
                            <h3
                                className="text-lg font-bold mb-2 text-slate-800 dark:text-white"
                                style={{ fontFamily: 'Assistant, sans-serif' }}
                            >
                                מטרת התרגיל
                            </h3>
                            <p className="text-slate-600 dark:text-zinc-400 leading-relaxed">
                                {currentExercise?.content?.description
                                    ? getLocalized(currentExercise.content.description, '')
                                    : description}
                            </p>
                        </div>
                    )}

                    {/* Highlights */}
                    {highlights.length > 0 && (
                        <div className="mb-10">
                            <h3
                                className="text-lg font-bold mb-4 text-slate-800 dark:text-white"
                                style={{ fontFamily: 'Assistant, sans-serif' }}
                            >
                                דגשים
                            </h3>
                            <ul className="space-y-4">
                                {highlights.map((highlight, index) => (
                                    <li key={index} className="flex gap-3">
                                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#00AEEF]/10 text-[#00AEEF] flex items-center justify-center text-xs font-bold">
                                            {index + 1}
                                        </span>
                                        <p className="text-slate-600 dark:text-zinc-400 text-sm leading-relaxed">{highlight}</p>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                    {/* Workout Timeline - Sits on top of drawer */}
                    <div className="px-4 pb-2 bg-white/95 backdrop-blur-sm rounded-t-2xl shadow-lg border-t border-x border-gray-100 pt-2">
                        <WorkoutStickyNav
                            segments={plan.segments}
                            activeIndex={currentSegmentIndex}
                            onSegmentClick={() => { }} // No action during live workout
                        />
                    </div>
                </div>
            )}

            {/* Bottom Unified Control Panel - Show when not in station drawer mode */}
            {(!currentSegment || currentSegment.type !== 'station' || (!currentExercise && !currentWorkoutExercise)) && (
                <div className="absolute bottom-0 left-0 right-0 pointer-events-auto z-50">
                    {/* Workout Timeline - Sits on top of dashboard */}
                    <div className="px-4 pb-2">
                        <div className="bg-white/95 backdrop-blur-sm rounded-t-2xl shadow-lg border-t border-x border-gray-100 pt-2">
                            <WorkoutStickyNav
                                segments={plan.segments}
                                activeIndex={currentSegmentIndex}
                                onSegmentClick={() => { }} // No action during live workout
                            />
                        </div>
                    </div>

                    {/* Main Dashboard Card */}
                    <div className="bg-white shadow-2xl border-t-2 border-gray-100 px-6 pt-4 pb-8">

                    {/* Row 1: Stats */}
                    <div className="grid grid-cols-3 gap-6 mb-5">
                        {/* Time (Right in RTL) */}
                        <div className="flex flex-col items-center">
                            <div className="text-4xl font-black text-gray-900 tabular-nums leading-none mb-1">
                                {formatTime(elapsedTime)}
                            </div>
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-wide">זמן</div>
                        </div>

                        {/* Pace (Center) */}
                        <div className="flex flex-col items-center">
                            <div className="text-4xl font-black text-gray-900 tabular-nums leading-none mb-1">
                                {currentPace}
                            </div>
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-wide">קצב</div>
                        </div>

                        {/* Distance (Left in RTL) */}
                        <div className="flex flex-col items-center">
                            <div className="text-4xl font-black text-gray-900 tabular-nums leading-none mb-1">
                                {distanceCovered.toFixed(1)}
                            </div>
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-wide">מרחק</div>
                        </div>
                    </div>

                    {/* Row 2: Controls */}
                    <div className="flex items-center justify-center gap-3">
                        {/* Recenter Button */}
                        <button
                            className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                        >
                            <Crosshair size={20} className="text-gray-600" />
                        </button>

                        {/* Pause/Resume Button (Center, Large) */}
                        <button
                            onClick={isPaused ? onResume : onPause}
                            className={`w-16 h-16 rounded-full flex items-center justify-center active:scale-95 transition-all shadow-lg ${isPaused ? 'bg-primary' : 'bg-orange-500'
                                }`}
                        >
                            {isPaused ? (
                                <Play size={28} fill="white" className="text-white ms-1" />
                            ) : (
                                <Pause size={28} className="text-white" strokeWidth={3} />
                            )}
                        </button>

                        {/* Stop Button (Always visible, red when paused) */}
                        <button
                            onClick={onStop}
                            className={`w-12 h-12 rounded-lg flex items-center justify-center active:scale-95 transition-all shadow-lg ${isPaused ? 'bg-red-500' : 'bg-gray-100'
                                }`}
                        >
                            <Square size={20} fill={isPaused ? "white" : "currentColor"} className={isPaused ? "text-white" : "text-gray-600"} />
                        </button>
                    </div>
                </div>
            </div>
            )}
        </div>
    );
}
