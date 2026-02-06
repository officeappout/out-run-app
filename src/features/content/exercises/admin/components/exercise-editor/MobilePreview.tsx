'use client';

import { useState, useEffect } from 'react';
import { ExerciseFormData, AppLanguage } from '../../../core/exercise.types';
import { Program } from '../../../../programs/core/program.types';
import {
  Dumbbell,
  Pause,
  List,
  Volume2,
  Check,
  Play,
  User,
  Image as ImageIcon,
  AlertCircle,
} from 'lucide-react';
import { MUSCLE_GROUP_LABELS } from './shared/constants';
import { safeRenderText } from '@/utils/render-helpers';

interface MobilePreviewProps {
  formData: ExerciseFormData;
  activeLang: AppLanguage;
  programs?: Program[];
}

export default function MobilePreview({ formData, activeLang, programs = [] }: MobilePreviewProps) {
  const [imageError, setImageError] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const name =
    formData.name?.[activeLang] ||
    formData.name?.he ||
    formData.name?.en ||
    formData.name?.es ||
    'שם התרגיל';

  const description = formData.content?.description?.[activeLang] || formData.content?.description?.he || '';
  const highlights = formData.content?.highlights || [];
  const muscleGroups = formData.muscleGroups || [];
  const primaryMuscle = muscleGroups[0];
  const secondaryMuscles = muscleGroups.slice(1, 3);

  // Get video from execution_methods[0] - ensure proper extraction
  const mainVideoUrl = typeof formData.execution_methods?.[0]?.media?.mainVideoUrl === 'string'
    ? formData.execution_methods[0].media.mainVideoUrl
    : String(formData.execution_methods?.[0]?.media?.mainVideoUrl || '');
  const imageUrl = typeof formData.execution_methods?.[0]?.media?.imageUrl === 'string'
    ? formData.execution_methods[0].media.imageUrl
    : String(formData.execution_methods?.[0]?.media?.imageUrl || '');
  const instructionalVideoUrl =
    formData.execution_methods?.[0]?.media?.instructionalVideos?.[0]?.url || '';

  // Reset errors when URL changes
  useEffect(() => {
    setVideoError(false);
  }, [mainVideoUrl]);

  useEffect(() => {
    setImageError(false);
  }, [imageUrl]);

  // Get primary program and level from targetPrograms
  const primaryTarget = formData.targetPrograms?.[0];
  const primaryProgram = primaryTarget ? programs.find((p) => p.id === primaryTarget.programId) : null;
  const primaryLevel = primaryTarget?.level;

  // Get exercise type label for title
  const getExerciseTypeLabel = () => {
    switch (formData.type) {
      case 'reps':
        return '10-15 חזרות';
      case 'time':
        return '30-60 שניות';
      case 'rest':
        return 'התאוששות/חימום';
      default:
        return '10-15 חזרות';
    }
  };

  // Extract YouTube video ID for embed
  const getYouTubeVideoId = (url: string): string | null => {
    const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(youtubeRegex);
    return match ? match[1] : null;
  };

  const youtubeVideoId = instructionalVideoUrl ? getYouTubeVideoId(instructionalVideoUrl) : null;

  // Prevent scroll propagation
  const handleDrawerScroll = (e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
  };

  const handleDrawerTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
  };

  const handleDrawerTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
  };

  return (
    <div className="sticky top-6">
      <div className="relative w-full max-w-md mx-auto overflow-hidden flex flex-col bg-gray-200 dark:bg-gray-800" style={{ height: '800px' }}>
        {/* Hero Section - Video/Image Background (Fixed) */}
        <div className="relative w-full aspect-[9/10] flex-shrink-0 overflow-hidden bg-gray-200 dark:bg-gray-800">
          {mainVideoUrl && !videoError ? (
            <video
              src={mainVideoUrl}
              className="absolute inset-0 w-full h-full object-cover"
              autoPlay
              loop
              muted
              playsInline
              onError={() => setVideoError(true)}
            />
          ) : imageUrl && !imageError ? (
            <img
              src={imageUrl}
              alt={name}
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
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent h-32" />
          
          {/* Status Bar */}
          <div className="absolute top-0 w-full px-4 pt-2 z-20">
            <div className="flex justify-between items-center text-white text-xs font-semibold">
              <span style={{ fontFamily: 'var(--font-simpler)' }}>
                {new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
              </span>
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
                    backgroundColor: i === 8 ? '#00AEEF' : 'rgba(0, 174, 239, 0.4)',
                  }}
                />
              ))}
            </div>
            
            {/* Control Buttons */}
            <div className="flex justify-between items-center mt-4 px-2">
              <button className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
                <Pause size={20} className="text-white" />
              </button>
              <div className="text-white font-bold text-xl tracking-wider" style={{ fontFamily: 'var(--font-simpler)' }}>
                02:20
              </div>
              <button className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
                <List size={20} className="text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Floating Drawer with Scroll Indicator */}
        <div className="relative z-30 -mt-10 flex-shrink-0">
          {/* Scroll Indicator (Grabber Bar) */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-32 h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-full" />
          </div>
          
          {/* Scrollable Drawer Content */}
          <div
            className="bg-white dark:bg-zinc-900 rounded-t-[32px] shadow-[0_-10px_25px_rgba(0,0,0,0.1)] px-6 pt-4 pb-12 overflow-y-auto scrollbar-hide"
            style={{ maxHeight: '400px' }}
            onWheel={handleDrawerScroll}
            onTouchStart={handleDrawerTouchStart}
            onTouchMove={handleDrawerTouchMove}
          >
            {/* Title Section */}
            <div className="text-center mb-6">
              <h1 className="text-3xl font-extrabold text-slate-800 dark:text-white mb-1" style={{ fontFamily: 'var(--font-simpler)' }}>
                {getExerciseTypeLabel()}
              </h1>
              <p className="text-slate-500 dark:text-zinc-400 text-lg mb-2" style={{ fontFamily: 'var(--font-simpler)' }}>
                {safeRenderText(name)}
              </p>
              {/* Program & Level Badge */}
              {primaryProgram && primaryLevel && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#00AEEF]/10 text-[#00AEEF] rounded-full text-xs font-bold">
                  <span>{safeRenderText(primaryProgram.name)}</span>
                  <span>•</span>
                  <span>רמה {primaryLevel}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-4 mb-8">
              <button className="w-14 h-14 flex items-center justify-center rounded-2xl border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300">
                <Volume2 size={24} />
              </button>
              <button className="flex-1 h-14 bg-white dark:bg-zinc-800 border-2 border-slate-100 dark:border-zinc-700 rounded-2xl flex items-center justify-center gap-2 font-bold text-slate-800 dark:text-white shadow-sm active:scale-[0.98] transition-transform" style={{ fontFamily: 'var(--font-simpler)' }}>
                <span>סיימתי</span>
                <Check size={20} className="text-[#00AEEF]" />
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
                        <Dumbbell size={20} className="text-[#00AEEF]" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-zinc-500">שריר ראשי</p>
                        <p className="font-bold text-sm">{safeRenderText(MUSCLE_GROUP_LABELS[primaryMuscle] || primaryMuscle)}</p>
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
                          {secondaryMuscles.map((m) => safeRenderText(MUSCLE_GROUP_LABELS[m] || m)).join(', ')}
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
                <h3 className="text-lg font-bold mb-2 text-slate-800 dark:text-white" style={{ fontFamily: 'var(--font-simpler)' }}>
                  מטרת התרגיל
                </h3>
                <p className="text-slate-600 dark:text-zinc-400 leading-relaxed">{safeRenderText(description)}</p>
              </div>
            )}

            {/* Highlights */}
            {highlights.length > 0 && (
              <div className="mb-10">
                <h3 className="text-lg font-bold mb-4 text-slate-800 dark:text-white" style={{ fontFamily: 'var(--font-simpler)' }}>
                  דגשים
                </h3>
                <ul className="space-y-4">
                  {highlights.map((highlight, index) => (
                    <li key={index} className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#00AEEF]/10 text-[#00AEEF] flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </span>
                      <p className="text-slate-600 dark:text-zinc-400 text-sm leading-relaxed">{safeRenderText(highlight)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Replace Exercise Button */}
            <div className="pt-4 border-t border-slate-100 dark:border-zinc-800">
              <button className="w-full py-4 flex items-center justify-center gap-2 text-slate-500 dark:text-zinc-400 hover:text-[#00AEEF] transition-colors font-semibold" style={{ fontFamily: 'var(--font-simpler)' }}>
                <span className="text-lg">🔄</span>
                <span>החלפת תרגיל</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
