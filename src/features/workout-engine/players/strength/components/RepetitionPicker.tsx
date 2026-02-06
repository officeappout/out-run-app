'use client';

/**
 * RepetitionPicker
 * Horizontal scroll picker for selecting number of repetitions
 * Features:
 * - Smooth horizontal scrolling with snap points
 * - Visual feedback for selected value
 * - Glassmorphism design
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface RepetitionPickerProps {
  minReps?: number;
  maxReps?: number;
  initialValue?: number;
  targetReps?: number; // Suggested target reps
  onValueChange: (value: number) => void;
  question?: string;
  className?: string;
}

export default function RepetitionPicker({
  minReps = 0,
  maxReps = 50,
  initialValue,
  targetReps,
  onValueChange,
  question = 'כמה חזרות הצלחת מהתרגיל הקודם?',
  className = '',
}: RepetitionPickerProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [selectedValue, setSelectedValue] = useState<number>(
    initialValue ?? targetReps ?? Math.floor((minReps + maxReps) / 2)
  );

  // Generate array of rep values
  const repValues = Array.from({ length: maxReps - minReps + 1 }, (_, i) => minReps + i);

  // Scroll to selected value on mount or when initialValue changes
  useEffect(() => {
    if (scrollContainerRef.current && initialValue !== undefined) {
      const index = repValues.indexOf(initialValue);
      if (index !== -1) {
        const itemWidth = 80; // Width of each item including gap
        const scrollPosition = index * itemWidth - scrollContainerRef.current.offsetWidth / 2 + itemWidth / 2;
        scrollContainerRef.current.scrollTo({
          left: Math.max(0, scrollPosition),
          behavior: 'smooth',
        });
        setSelectedValue(initialValue);
      }
    }
  }, [initialValue, repValues]);

  // Handle scroll to detect selected value
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const containerCenter = container.offsetWidth / 2;
    const items = container.querySelectorAll('.rep-item');
    
    let closestItem: Element | null = null;
    let closestDistance = Infinity;

    items.forEach((item) => {
      const rect = item.getBoundingClientRect();
      const itemCenter = rect.left + rect.width / 2 - container.getBoundingClientRect().left;
      const distance = Math.abs(itemCenter - containerCenter);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestItem = item;
      }
    });

    if (closestItem) {
      const value = parseInt(closestItem.getAttribute('data-value') || '0', 10);
      if (value !== selectedValue) {
        setSelectedValue(value);
        onValueChange(value);
      }
    }
  }, [selectedValue, onValueChange]);

  // Snap to nearest item on scroll end
  const handleScrollEnd = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const containerCenter = container.offsetWidth / 2;
    const items = container.querySelectorAll('.rep-item');
    
    let closestItem: Element | null = null;
    let closestDistance = Infinity;

    items.forEach((item) => {
      const rect = item.getBoundingClientRect();
      const itemCenter = rect.left + rect.width / 2 - container.getBoundingClientRect().left;
      const distance = Math.abs(itemCenter - containerCenter);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestItem = item;
      }
    });

    if (closestItem) {
      const rect = closestItem.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const targetScroll = container.scrollLeft + (rect.left - containerRect.left) - (containerRect.width / 2) + (rect.width / 2);
      
      container.scrollTo({
        left: targetScroll,
        behavior: 'smooth',
      });
    }
  }, []);

  return (
    <div className={`w-full ${className}`} dir="rtl">
      {/* Question */}
      <p
        className="text-lg font-semibold text-gray-900 dark:text-white mb-6 text-center"
        style={{ fontFamily: 'var(--font-simpler)' }}
      >
        {question}
      </p>

      {/* Picker Container */}
      <div className="relative">
        {/* Center Indicator Line */}
        <div className="absolute top-0 bottom-0 left-1/2 transform -translate-x-1/2 w-0.5 bg-[#00AEEF] z-10 pointer-events-none" />

        {/* Scroll Container */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          onTouchEnd={handleScrollEnd}
          onMouseUp={handleScrollEnd}
          className="flex overflow-x-auto snap-x snap-mandatory gap-4 px-6 py-8 scrollbar-hide"
          style={{
            scrollBehavior: 'smooth',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {/* Left Spacer */}
          <div className="min-w-[calc(50%-40px)] shrink-0" />

          {/* Rep Items */}
          {repValues.map((value) => {
            const isSelected = value === selectedValue;
            const isTarget = value === targetReps;

            return (
              <div
                key={value}
                data-value={value}
                className={`
                  rep-item
                  min-w-[80px] h-20
                  flex items-center justify-center
                  rounded-2xl
                  transition-all duration-300
                  snap-center
                  shrink-0
                  ${
                    isSelected
                      ? 'bg-white dark:bg-gray-800 border-2 border-[#00AEEF] shadow-lg scale-110 z-20'
                      : 'bg-white/50 dark:bg-gray-800/50 border-2 border-transparent scale-100'
                  }
                `}
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                <span
                  className={`
                    text-2xl font-bold
                    transition-all duration-300
                    ${isSelected ? 'text-[#00AEEF]' : 'text-gray-600 dark:text-gray-400'}
                  `}
                >
                  {value.toString().padStart(2, '0')}
                </span>
                {isTarget && !isSelected && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />
                )}
              </div>
            );
          })}

          {/* Right Spacer */}
          <div className="min-w-[calc(50%-40px)] shrink-0" />
        </div>
      </div>

      {/* Selected Value Display */}
      <div className="text-center mt-4">
        <p
          className="text-sm text-gray-500 dark:text-gray-400"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          נבחר: <span className="font-bold text-[#00AEEF]">{selectedValue} חזרות</span>
        </p>
      </div>
    </div>
  );
}
