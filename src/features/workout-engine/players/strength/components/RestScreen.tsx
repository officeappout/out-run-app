'use client';

/**
 * RestScreen - Premium Design
 * Rest/transition screen between exercises
 * 
 * Layout:
 * - Top Overlay: Next exercise name + equipment badge (z-50)
 * - Video area: Shows next exercise video (rendered by parent)
 * - Bottom Sheet: Large digital timer + skip button (slide-up animation)
 * 
 * Design Specs:
 * - Primary color: #00B4FF
 * - Dark mode: #0F172A
 * - Font: Assistant
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Dumbbell } from 'lucide-react';
import { motion } from 'framer-motion';

interface RestScreenProps {
  duration: number; // Rest duration in seconds
  nextExerciseName: string;
  nextExerciseEquipment?: string[];
  nextExerciseReps?: string;
  onSkip: () => void;
  onComplete: () => void;
  isPaused: boolean;
}

export default function RestScreen({
  duration,
  nextExerciseName,
  nextExerciseEquipment = [],
  nextExerciseReps,
  onSkip,
  onComplete,
  isPaused,
}: RestScreenProps) {
  const [timeRemaining, setTimeRemaining] = useState(duration);
  const hasCompletedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  // Keep onComplete ref updated
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Reset when duration changes
  useEffect(() => {
    setTimeRemaining(duration);
    hasCompletedRef.current = false;
  }, [duration]);

  // Timer countdown
  useEffect(() => {
    if (isPaused || hasCompletedRef.current) return;

    if (timeRemaining <= 0) {
      if (!hasCompletedRef.current) {
        hasCompletedRef.current = true;
        onCompleteRef.current();
      }
      return;
    }

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          if (!hasCompletedRef.current) {
            hasCompletedRef.current = true;
            setTimeout(() => onCompleteRef.current(), 50);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timeRemaining, isPaused]);

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      {/* Top Overlay - Next Exercise Header */}
      <div className="absolute top-0 left-0 right-0 z-50 pt-14 px-6 pb-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-auto">
        <p 
          className="text-sm text-white/70 uppercase tracking-wider mb-1 text-center"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          התרגיל הבא
        </p>
        <h2 
          className="text-2xl font-bold text-white text-center mb-3"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          {nextExerciseName}
        </h2>
        
        {/* Equipment Badge - Only show if equipment exists */}
        {nextExerciseEquipment.length > 0 && (
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#00B4FF]/20 border border-[#00B4FF]/40 rounded-full backdrop-blur-sm">
              <Dumbbell size={16} className="text-[#00B4FF]" />
              <span 
                className="text-sm text-[#00B4FF] font-bold"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                {nextExerciseEquipment[0]}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Sheet - Timer and Skip Button */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="absolute bottom-0 left-0 right-0 z-50 bg-white dark:bg-[#0F172A] rounded-t-[32px] pt-8 pb-10 px-6 shadow-2xl pointer-events-auto"
        dir="rtl"
      >
        {/* Rest Label */}
        <p 
          className="text-sm text-slate-500 dark:text-zinc-400 uppercase tracking-wider text-center mb-4"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          מנוחה
        </p>

        {/* Large Digital Timer */}
        <div className="flex justify-center mb-8">
          <div 
            className="text-7xl font-bold text-slate-900 dark:text-white tracking-tight"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {formatTime(timeRemaining)}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2 bg-slate-200 dark:bg-zinc-800 rounded-full mb-8 overflow-hidden">
          <motion.div
            className="h-full bg-[#00B4FF] rounded-full"
            initial={{ width: '100%' }}
            animate={{ width: `${(timeRemaining / duration) * 100}%` }}
            transition={{ duration: 0.5, ease: 'linear' }}
          />
        </div>

        {/* Skip Rest Button */}
        <button
          onClick={onSkip}
          className="w-full flex items-center justify-center gap-2 py-4 border-2 border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 rounded-2xl font-bold hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all active:scale-[0.98]"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          <X size={20} />
          דלגו על המנוחה
        </button>

        {/* Next Exercise Preview (if reps available) */}
        {nextExerciseReps && (
          <p 
            className="text-sm text-slate-400 dark:text-zinc-500 text-center mt-4"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {nextExerciseReps}
          </p>
        )}
      </motion.div>
    </div>
  );
}
