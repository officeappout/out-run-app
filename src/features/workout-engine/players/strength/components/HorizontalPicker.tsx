'use client';

import React, { useEffect, useRef, useCallback } from 'react';

interface HorizontalPickerProps {
  min?: number;
  max?: number;
  targetValue: number; // הערך שהוגדר באימון (למשל 12)
  value: number;       // הערך שהמשתמש בחר בפועל
  onChange: (value: number) => void;
  unitType: 'reps' | 'time';
}

export default function HorizontalPicker({ 
  min = 0, 
  max = 60, 
  targetValue, 
  value, 
  onChange,
  unitType 
}: HorizontalPickerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemWidth = 80;
  const range = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  // Auto-scroll to target value on mount
  useEffect(() => {
    if (scrollRef.current) {
      const targetIndex = targetValue - min;
      const scrollPosition = targetIndex * itemWidth;
      scrollRef.current.scrollTo({ left: scrollPosition, behavior: 'auto' });
    }
  }, [targetValue, min]);

  // Handle scroll with haptic feedback
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = e.currentTarget.scrollLeft;
    const centerIndex = Math.round(scrollLeft / itemWidth);
    const newValue = range[centerIndex];
    
    if (newValue !== undefined && newValue !== value) {
      // Trigger haptic feedback on value change
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(10);
      }
      onChange(newValue);
    }
  }, [range, value, onChange]);

  const formatDisplay = (num: number) => {
    if (unitType === 'time') {
      const mins = Math.floor(num / 60);
      const secs = num % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return num;
  };

  return (
    <div className="relative w-full h-20 flex flex-col items-center justify-center overflow-hidden">
      {/* Gradient Masks - pointer-events-none to allow touch through */}
      <div className="absolute inset-0 z-10 pointer-events-none bg-gradient-to-r from-white dark:from-[#0F172A] via-transparent to-white dark:to-[#0F172A]" />
      
      {/* Selector Box */}
      <div className="absolute left-1/2 -translate-x-1/2 w-20 h-14 border-2 border-[#00B4FF] rounded-xl z-20 pointer-events-none shadow-[0_0_15px_rgba(0,180,255,0.2)]" />

      {/* Scroll Container - touch-action: pan-x enables horizontal touch scrolling */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory px-[50%] h-full items-center"
        style={{ 
          touchAction: 'pan-x',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {range.map((num) => (
          <div
            key={num}
            className="flex-shrink-0 snap-center flex flex-col items-center justify-center"
            style={{ width: itemWidth }}
          >
            <span className={`text-3xl font-bold transition-all duration-200 ${
              value === num 
                ? 'text-slate-900 dark:text-white scale-110' 
                : 'text-slate-300 dark:text-zinc-600'
            }`}>
              {formatDisplay(num)}
            </span>
            {value === num && (
              <span className="text-[9px] font-bold text-[#00B4FF] mt-0.5 uppercase">
                {unitType === 'reps' ? 'חזרות' : 'שניות'}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
