'use client';

/**
 * FillingButton
 * Auto-filling button component for reps-based exercises
 * Features:
 * - Auto-fill animation from left to right
 * - Auto-complete when time expires
 * - Blue 'V' button design
 * - Smooth animations
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Check } from 'lucide-react';

interface FillingButtonProps {
  autoCompleteTime: number; // Time in seconds before auto-complete
  onClick: () => void;
  label?: string; // Button label (default: "סיימתי")
  isPaused?: boolean;
  className?: string;
  disabled?: boolean;
}

export default function FillingButton({
  autoCompleteTime,
  onClick,
  label = 'סיימתי',
  isPaused = false,
  disabled = false,
  className = '',
}: FillingButtonProps) {
  const [fillProgress, setFillProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Calculate fill progress
  const updateFillProgress = useCallback(() => {
    if (isPaused || disabled || isComplete || !startTimeRef.current) {
      return;
    }

    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const progress = Math.min(elapsed / autoCompleteTime, 1);
    
    setFillProgress(progress);

    if (progress >= 1 && !isComplete) {
      setIsComplete(true);
      onClick();
      return;
    }

    animationFrameRef.current = requestAnimationFrame(updateFillProgress);
  }, [isPaused, disabled, isComplete, autoCompleteTime, onClick]);

  // Start fill animation
  useEffect(() => {
    if (isPaused || disabled || isComplete) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    if (!startTimeRef.current) {
      startTimeRef.current = Date.now();
    }

    animationFrameRef.current = requestAnimationFrame(updateFillProgress);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPaused, disabled, isComplete, updateFillProgress]);

  // Reset when autoCompleteTime changes
  useEffect(() => {
    setFillProgress(0);
    setIsComplete(false);
    startTimeRef.current = null;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, [autoCompleteTime]);

  // Handle manual click
  const handleClick = useCallback(() => {
    if (disabled || isComplete) return;
    setIsComplete(true);
    onClick();
  }, [disabled, isComplete, onClick]);

  // Calculate fill width percentage
  const fillWidth = `${fillProgress * 100}%`;

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isComplete}
      className={`
        relative w-full h-16 
        bg-white dark:bg-gray-800 
        border-2 border-gray-200 dark:border-gray-700 
        rounded-2xl 
        flex items-center justify-center gap-3 
        font-bold text-gray-900 dark:text-white 
        shadow-sm 
        active:scale-[0.98] 
        transition-transform duration-150
        overflow-hidden
        ${disabled || isComplete ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      {/* Fill Background Animation */}
      <div
        className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#00AEEF] to-[#00C9F2] transition-all duration-100 ease-linear"
        style={{
          width: fillWidth,
          transition: isPaused ? 'none' : 'width 0.1s linear',
        }}
      />

      {/* Content (Text + Icon) */}
      <div className="relative z-10 flex items-center gap-3">
        <span className="text-lg text-gray-900 dark:text-white">
          {label}
        </span>
        <Check
          size={24}
          className="text-[#00AEEF] dark:text-[#00AEEF]"
          style={{
            filter: fillProgress > 0 ? 'none' : 'none',
          }}
        />
      </div>

      {/* Border overlay to maintain border visibility */}
      <div className="absolute inset-0 rounded-2xl border-2 border-gray-200 dark:border-gray-700 pointer-events-none" />
    </button>
  );
}
