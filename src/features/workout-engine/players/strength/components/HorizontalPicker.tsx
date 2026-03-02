'use client';

/**
 * HorizontalPicker — Scroll-snap number picker for logging reps/time.
 *
 * Internal scroll state is uncontrolled — the picker owns its scrollLeft.
 * `value` prop is only used for initial snap on mount and styling.
 * `onChange` fires on scroll-end with the committed value.
 * CSS scroll-snap handles the physics; no manual scrollTo.
 */

import React, { useRef, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';

interface HorizontalPickerProps {
  min?: number;
  max?: number;
  targetValue: number;
  value: number;
  onChange: (value: number) => void;
  unitType: 'reps' | 'time';
}

const ITEM_W = 64;

export default function HorizontalPicker({
  min = 1,
  max = 50,
  targetValue,
  value,
  onChange,
  unitType,
}: HorizontalPickerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);
  const hasMounted = useRef(false);

  // Internal display value — decoupled from parent to prevent snap-back
  const [displayValue, setDisplayValue] = useState(value);

  const range = useMemo(() => {
    if (unitType === 'time') {
      const steps: number[] = [];
      const step = 5;
      const start = Math.max(0, min);
      const end = Math.max(max, targetValue + 30);
      for (let i = start; i <= end; i += step) steps.push(i);
      if (!steps.includes(targetValue)) {
        steps.push(targetValue);
        steps.sort((a, b) => a - b);
      }
      return steps;
    }
    const effectiveMin = Math.max(0, min);
    const effectiveMax = Math.max(max, targetValue + 10);
    return Array.from({ length: effectiveMax - effectiveMin + 1 }, (_, i) => effectiveMin + i);
  }, [min, max, targetValue, unitType]);

  const indexOfValue = useCallback(
    (v: number) => {
      const idx = range.indexOf(v);
      if (idx >= 0) return idx;
      let closest = 0;
      let minDiff = Math.abs(range[0] - v);
      for (let i = 1; i < range.length; i++) {
        const diff = Math.abs(range[i] - v);
        if (diff < minDiff) { minDiff = diff; closest = i; }
      }
      return closest;
    },
    [range],
  );

  // Snap to the initial value before first paint — runs once
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) {
      const snapTo = value ?? targetValue;
      const idx = indexOfValue(snapTo);
      el.scrollLeft = idx * ITEM_W;
      setDisplayValue(snapTo);
    }
    hasMounted.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Read centered value from scroll position
  const readCenteredValue = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return null;
    const idx = Math.round(el.scrollLeft / ITEM_W);
    const clamped = Math.min(Math.max(idx, 0), range.length - 1);
    return range[clamped];
  }, [range]);

  // Scroll listener — updates display and commits on scroll-end
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const hasNativeScrollend = 'onscrollend' in window;

    const onScroll = () => {
      const val = readCenteredValue();
      if (val !== null) setDisplayValue(val);

      if (!hasNativeScrollend) {
        if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
        scrollEndTimer.current = setTimeout(() => {
          const final = readCenteredValue();
          if (final !== null) {
            setDisplayValue(final);
            onChange(final);
          }
        }, 100);
      }
    };

    const onScrollEnd = () => {
      const final = readCenteredValue();
      if (final !== null) {
        setDisplayValue(final);
        onChange(final);
      }
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    if (hasNativeScrollend) el.addEventListener('scrollend', onScrollEnd);

    return () => {
      el.removeEventListener('scroll', onScroll);
      if (hasNativeScrollend) el.removeEventListener('scrollend', onScrollEnd);
      if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    };
  }, [readCenteredValue, onChange]);

  // Mouse-drag for desktop
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragScrollLeft.current = el.scrollLeft;
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      e.preventDefault();
      const el = scrollRef.current;
      if (el) el.scrollLeft = dragScrollLeft.current - (e.clientX - dragStartX.current);
    };
    const onUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      const el = scrollRef.current;
      if (el) {
        el.style.cursor = 'grab';
        el.style.userSelect = '';
      }
      const final = readCenteredValue();
      if (final !== null) {
        setDisplayValue(final);
        onChange(final);
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [readCenteredValue, onChange]);

  return (
    <div
      className="relative w-full h-[80px] flex items-center justify-center overflow-hidden pointer-events-auto"
      onPointerDownCapture={(e) => e.stopPropagation()}
      style={{ touchAction: 'pan-x' }}
    >
      {/* Edge fade masks */}
      <div className="absolute inset-y-0 left-0 w-12 z-20 pointer-events-none bg-gradient-to-r from-white dark:from-[#0F172A] to-transparent" />
      <div className="absolute inset-y-0 right-0 w-12 z-20 pointer-events-none bg-gradient-to-l from-white dark:from-[#0F172A] to-transparent" />

      {/* Center selection card frame */}
      <div className="absolute left-1/2 -translate-x-1/2 w-[58px] h-[58px] rounded-xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-zinc-600 shadow-sm z-0 pointer-events-none" />

      {/* Scroll track */}
      <div
        ref={scrollRef}
        className="relative z-10 flex h-full w-full items-center overflow-x-auto pointer-events-auto"
        onMouseDown={handleMouseDown}
        style={{
          touchAction: 'pan-x',
          WebkitOverflowScrolling: 'touch',
          scrollSnapType: 'x mandatory',
          cursor: 'grab',
          paddingLeft: `calc(50% - ${ITEM_W / 2}px)`,
          paddingRight: `calc(50% - ${ITEM_W / 2}px)`,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {range.map((num) => {
          const isSelected = displayValue === num;
          const isTarget = num === targetValue;
          return (
            <div
              key={num}
              className="flex-shrink-0 flex flex-col items-center justify-center snap-center relative z-10"
              style={{
                width: ITEM_W,
                transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                transition: 'transform 120ms ease-out',
              }}
            >
              <span
                className={[
                  'tabular-nums transition-colors duration-100',
                  isSelected
                    ? 'text-[28px] font-black text-slate-900 dark:text-white'
                    : 'text-[18px] font-medium text-slate-300 dark:text-zinc-600',
                ].join(' ')}
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                {num}
              </span>
              {isSelected && (
                <span className="text-[8px] font-bold text-slate-400 dark:text-zinc-500 -mt-0.5">
                  {unitType === 'reps' ? 'חזרות' : 'שניות'}
                </span>
              )}
              {!isSelected && isTarget && (
                <span className="text-[8px] text-slate-400/60 mt-0.5">יעד</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
