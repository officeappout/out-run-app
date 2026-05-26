'use client';

/**
 * DrumTimePicker — shared drum-scroll time picker (HH:MM, 24-hour, 05:00–22:55).
 * Extracted from AddWorkoutModal so it can be reused in WorkoutBuilderScreen.
 */

import React, { useRef, useEffect, useCallback } from 'react';

const DRUM_ITEM_H = 36; // px — height of each item row

/** Hours available: 05 … 22 */
export const DRUM_HOURS = Array.from({ length: 18 }, (_, i) =>
  String(i + 5).padStart(2, '0'),
);
/** Minutes available: 00, 05, 10, … 55 */
export const DRUM_MINUTES = Array.from({ length: 12 }, (_, i) =>
  String(i * 5).padStart(2, '0'),
);

/**
 * A single scrollable drum column with CSS scroll-snap.
 * The middle row of the 3-visible-item viewport is always the selected value.
 */
function DrumColumn({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Prevents the scroll-sync effect from re-triggering when the value change
  // itself originated from our onScroll handler (avoids feedback loops).
  const fromScrollRef = useRef(false);

  useEffect(() => {
    if (fromScrollRef.current) {
      fromScrollRef.current = false;
      return;
    }
    const idx = Math.max(0, items.indexOf(value));
    ref.current?.scrollTo({ top: idx * DRUM_ITEM_H, behavior: 'instant' as ScrollBehavior });
  }, [value, items]);

  const handleScroll = useCallback(() => {
    if (!ref.current) return;
    const idx = Math.round(ref.current.scrollTop / DRUM_ITEM_H);
    const clamped = Math.max(0, Math.min(idx, items.length - 1));
    const newVal = items[clamped];
    if (newVal !== value) {
      fromScrollRef.current = true;
      onChange(newVal);
    }
  }, [items, value, onChange]);

  return (
    <div className="relative flex-1">
      {/* Selection highlight band */}
      <div
        className="absolute inset-x-0 pointer-events-none rounded-lg bg-[#00C9F2]/10 border-y border-[#00C9F2]/25 z-10"
        style={{ top: DRUM_ITEM_H, height: DRUM_ITEM_H }}
      />
      <div
        ref={ref}
        onScroll={handleScroll}
        className="overflow-y-scroll [&::-webkit-scrollbar]:hidden"
        style={{
          height: DRUM_ITEM_H * 3,
          scrollSnapType: 'y mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        } as React.CSSProperties}
      >
        {/* top padding so first item can centre */}
        <div style={{ height: DRUM_ITEM_H, flexShrink: 0 }} />
        {items.map((item) => (
          <div
            key={item}
            style={{ height: DRUM_ITEM_H, scrollSnapAlign: 'center' }}
            className={`flex items-center justify-center tabular-nums font-bold transition-all duration-100 ${
              item === value ? 'text-[#00C9F2] text-2xl' : 'text-gray-300 text-lg'
            }`}
          >
            {item}
          </div>
        ))}
        {/* bottom padding so last item can centre */}
        <div style={{ height: DRUM_ITEM_H, flexShrink: 0 }} />
      </div>
    </div>
  );
}

/**
 * Drum-scroll time picker. Accepts and returns time as 'HH:MM' (24-hour).
 * Matches the styling used in AddWorkoutModal.
 */
export function DrumTimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const parts = value.split(':');
  const hh = DRUM_HOURS.includes(parts[0]) ? parts[0] : '07';
  const mm = DRUM_MINUTES.includes(parts[1]) ? parts[1] : '00';

  return (
    <div
      dir="ltr"
      className="flex items-center bg-gray-50 border border-gray-100 rounded-xl overflow-hidden px-6 gap-1"
    >
      <DrumColumn
        items={DRUM_HOURS}
        value={hh}
        onChange={(h) => onChange(`${h}:${mm}`)}
      />
      <span className="text-2xl font-black text-gray-300 pb-0.5 select-none flex-shrink-0">
        :
      </span>
      <DrumColumn
        items={DRUM_MINUTES}
        value={mm}
        onChange={(m) => onChange(`${hh}:${m}`)}
      />
    </div>
  );
}
