'use client';

/**
 * CircularTimer
 * Circular countdown timer component for time-based exercises
 * Features:
 * - SVG-based circular progress indicator
 * - Premium countdown overlay (3, 2, 1) with next exercise image
 * - Glassmorphism design
 * - Large, readable text for accessibility
 * - Haptics and sound support
 * 
 * FIX: Countdown now properly triggers onComplete when finished
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CircularTimerProps {
  duration: number; // Duration in seconds
  onComplete: () => void;
  isPaused?: boolean;
  size?: number; // Size in pixels (default: 256)
  className?: string;
  // Premium countdown props
  nextExerciseImage?: string; // Cover image for next exercise
  nextExerciseName?: string; // Name of next exercise
  showCountdownInLastSeconds?: number; // Show countdown in last N seconds (default: 3)
}

// Placeholder functions for haptics and sound
const playBeepSound = () => {
  console.log('🔊 Beep');
};

const playLongBeepSound = () => {
  console.log('🔊 Long Beep');
};

const triggerHaptic = (type: 'light' | 'medium' | 'heavy' = 'medium') => {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    const patterns: Record<string, number[]> = {
      light: [10],
      medium: [20],
      heavy: [30],
    };
    navigator.vibrate(patterns[type]);
  }
};

export default function CircularTimer({
  duration,
  onComplete,
  isPaused = false,
  size = 256,
  className = '',
  nextExerciseImage,
  nextExerciseName,
  showCountdownInLastSeconds = 3,
}: CircularTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(duration);
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownValue, setCountdownValue] = useState(3);
  
  // Ref to track if completion has been triggered (prevent double calls)
  const hasCompletedRef = useRef(false);
  
  // Stable ref for onComplete to avoid effect re-runs
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Calculate progress (0 to 1)
  const progress = (duration - timeRemaining) / duration;
  const circumference = 2 * Math.PI * 45; // radius = 45
  const strokeDashoffset = circumference * (1 - progress);

  // Format time for display
  const formatTime = useCallback((seconds: number): string => {
    return seconds.toString().padStart(2, '0');
  }, []);

  // Reset when duration changes (new timer mounted)
  useEffect(() => {
    console.log('[CircularTimer] Resetting for duration:', duration);
    setTimeRemaining(duration);
    setShowCountdown(false);
    setCountdownValue(showCountdownInLastSeconds);
    hasCompletedRef.current = false;
  }, [duration, showCountdownInLastSeconds]);

  // Main timer effect - single unified countdown
  useEffect(() => {
    if (isPaused || hasCompletedRef.current) return;

    // Check if timer is done
    if (timeRemaining <= 0) {
      if (!hasCompletedRef.current) {
        hasCompletedRef.current = true;
        console.log('[CircularTimer] Timer complete - calling onComplete');
        onCompleteRef.current();
      }
      return;
    }

    // Start countdown overlay in last N seconds
    if (timeRemaining <= showCountdownInLastSeconds && !showCountdown) {
      console.log('[CircularTimer] Starting countdown overlay, timeRemaining:', timeRemaining);
      setShowCountdown(true);
      setCountdownValue(timeRemaining);
    }

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        const newTime = prev - 1;
        
        // Update countdown value when in countdown mode
        if (newTime <= showCountdownInLastSeconds && newTime > 0) {
          setCountdownValue(newTime);
      triggerHaptic('light');
      playBeepSound();
    }
        
        // Timer finished
        if (newTime <= 0) {
          setShowCountdown(false);
          triggerHaptic('heavy');
          playLongBeepSound();
          
          // Trigger completion
          if (!hasCompletedRef.current) {
            hasCompletedRef.current = true;
            console.log('[CircularTimer] Timer hit 0 - calling onComplete');
            // Use setTimeout to ensure state updates complete first
            setTimeout(() => {
              onCompleteRef.current();
            }, 50);
          }
          return 0;
        }
        
        return newTime;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timeRemaining, isPaused, showCountdown, showCountdownInLastSeconds]);

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Glassmorphism Background */}
      <div className="absolute inset-0 rounded-full bg-white/10 dark:bg-black/20 backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-2xl" />

      {/* SVG Circular Timer */}
      <svg
        className="relative transform -rotate-90"
        width={size}
        height={size}
        viewBox="0 0 100 100"
      >
        {/* Background Circle */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="rgba(0, 174, 239, 0.2)"
          strokeWidth="8"
          className="transition-all duration-300"
        />
        
        {/* Progress Circle */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="#00AEEF"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-linear"
          style={{
            filter: 'drop-shadow(0 0 8px rgba(0, 174, 239, 0.5))',
          }}
        />
      </svg>

      {/* Center Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          {showCountdown ? (
            // Premium Countdown Overlay (3, 2, 1)
            <motion.div
              key="countdown"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 flex flex-col items-center justify-center z-20"
            >
              {/* Background: Next Exercise Image with Blur */}
              {nextExerciseImage && (
                <div className="absolute inset-0 overflow-hidden rounded-full">
                  <img
                    src={nextExerciseImage}
                    alt={nextExerciseName || 'Next exercise'}
                    className="w-full h-full object-cover blur-2xl scale-110"
                  />
                  <div className="absolute inset-0 bg-black/50" />
                </div>
              )}
              
              {/* Countdown Content */}
              <div className="relative z-10 flex flex-col items-center">
                {/* Next Up Text */}
                {nextExerciseName && (
                  <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-lg font-bold text-white/90 mb-4 text-center px-4"
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    Next Up: {nextExerciseName}
                  </motion.div>
                )}
                
                {/* Countdown Number with Pulse Animation */}
                <motion.div
                  key={countdownValue}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ 
                    scale: [0.8, 1.1, 1],
                    opacity: 1,
                  }}
                  transition={{
                    duration: 0.5,
                    ease: 'easeOut',
                  }}
                  className="text-9xl font-black text-white"
                  style={{
                    fontFamily: 'var(--font-simpler)',
                    textShadow: '0 0 30px rgba(255, 255, 255, 0.6), 0 4px 20px rgba(0, 0, 0, 0.5)',
                  }}
                >
                  {countdownValue}
                </motion.div>
              </div>
            </motion.div>
          ) : (
            // Timer Display
            <motion.div
              key="timer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center"
            >
              <div
                className="text-6xl font-bold text-white mb-2 transition-all duration-300"
                style={{
                  fontFamily: 'var(--font-simpler)',
                  textShadow: '0 0 15px rgba(255, 255, 255, 0.4), 0 2px 8px rgba(0, 0, 0, 0.3)',
                  letterSpacing: '0.05em',
                }}
              >
                {formatTime(timeRemaining)}
              </div>
              <Clock
                size={28}
                className="text-white/80"
                style={{
                  filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))',
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Pause Indicator */}
      {isPaused && !showCountdown && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-full backdrop-blur-sm">
          <div className="text-white text-xl font-bold" style={{ fontFamily: 'var(--font-simpler)' }}>
            מושהה
          </div>
        </div>
      )}
    </div>
  );
}
