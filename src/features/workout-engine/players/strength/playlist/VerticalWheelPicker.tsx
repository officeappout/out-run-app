'use client';

/**
 * VerticalWheelPicker — Scroll-snap vertical number wheel.
 *
 * Y-axis port of HorizontalPicker. Shows 3 visible rows:
 * dimmed item above, bold selected center, dimmed item below.
 * CSS scroll-snap handles the physics; no manual scrollTo.
 */

import React, { useRef, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';

interface VerticalWheelPickerProps {
  values: number[];
  selectedValue: number;
  onChange: (value: number) => void;
  label?: string;
}

const ITEM_H = 48;
const VISIBLE_ITEMS = 3;
const CONTAINER_H = ITEM_H * VISIBLE_ITEMS;

export default function VerticalWheelPicker({
  values,
  selectedValue,
  onChange,
  label,
}: VerticalWheelPickerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasMounted = useRef(false);

  const [displayValue, setDisplayValue] = useState(selectedValue);

  const indexOfValue = useCallback(
    (v: number) => {
      const idx = values.indexOf(v);
      if (idx >= 0) return idx;
      let closest = 0;
      let minDiff = Math.abs(values[0] - v);
      for (let i = 1; i < values.length; i++) {
        const diff = Math.abs(values[i] - v);
        if (diff < minDiff) { minDiff = diff; closest = i; }
      }
      return closest;
    },
    [values],
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) {
      const idx = indexOfValue(selectedValue);
      el.scrollTop = idx * ITEM_H;
      setDisplayValue(selectedValue);
    }
    hasMounted.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const readCenteredValue = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return null;
    const idx = Math.round(el.scrollTop / ITEM_H);
    const clamped = Math.min(Math.max(idx, 0), values.length - 1);
    return values[clamped];
  }, [values]);

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

  const paddingY = `${(CONTAINER_H - ITEM_H) / 2}px`;

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative overflow-hidden"
        style={{ height: CONTAINER_H, width: 80 }}
      >
        {/* Top fade mask */}
        <div className="absolute inset-x-0 top-0 h-10 z-20 pointer-events-none bg-gradient-to-b from-white dark:from-slate-800 to-transparent" />
        {/* Bottom fade mask */}
        <div className="absolute inset-x-0 bottom-0 h-10 z-20 pointer-events-none bg-gradient-to-t from-white dark:from-slate-800 to-transparent" />

        {/* Center highlight band */}
        <div
          className="absolute inset-x-1 z-0 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/40 pointer-events-none"
          style={{ top: ITEM_H, height: ITEM_H }}
        />

        {/* Scroll track */}
        <div
          ref={scrollRef}
          className="relative z-10 h-full w-full overflow-y-auto"
          style={{
            scrollSnapType: 'y mandatory',
            WebkitOverflowScrolling: 'touch',
            paddingTop: paddingY,
            paddingBottom: paddingY,
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {values.map((num) => {
            const isSelected = displayValue === num;
            return (
              <div
                key={num}
                className="flex items-center justify-center snap-center"
                style={{ height: ITEM_H }}
              >
                <span
                  className={[
                    'tabular-nums transition-all duration-100 select-none',
                    isSelected
                      ? 'text-2xl font-bold text-slate-900 dark:text-white'
                      : 'text-base text-slate-400 dark:text-slate-500',
                  ].join(' ')}
                >
                  {String(num).padStart(2, '0')}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {label && (
        <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
          {label}
        </span>
      )}
    </div>
  );
}
