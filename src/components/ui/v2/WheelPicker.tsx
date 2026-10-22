'use client';

/**
 * WheelPicker (v2) — the iOS-style inner-scroll wheel. One or more columns,
 * each a vertical native scroll-snap list (momentum comes from the platform,
 * no animation library), a centre selection band and faded top / bottom rows.
 *
 *   <WheelPicker columns={[{ key: 'h', ariaLabel: 'שעה', options, value, onChange }]} />
 *
 * • A column commits its value when the scroll settles (no fighting the finger);
 *   the row under the band is highlighted live and ticks a selection haptic.
 * • Keyboard: each column is a focusable listbox — ↑/↓, PageUp/PageDown, Home/End.
 * • Columns render in the given order inside `dir` (default 'ltr', so a time
 *   reads HH · MM under an RTL page); pass dir="rtl" to mirror.
 * • Reduced motion: programmatic moves jump instead of smooth-scrolling.
 * Logic lives in ./wheel-picker.ts.
 */

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { hapticSelection } from '@/lib/haptics';
import {
  WHEEL_ITEM_HEIGHT,
  WHEEL_VISIBLE_COUNT,
  nextWheelIndex,
  wheelIndexFromScroll,
  wheelPadding,
  wheelScrollTop,
  wheelValueIndex,
} from './wheel-picker';

export type WheelValue = string | number;

export interface WheelOption<V extends WheelValue = WheelValue> {
  value: V;
  label: ReactNode;
}

export interface WheelColumn<V extends WheelValue = WheelValue> {
  key: string;
  ariaLabel: string;
  options: WheelOption<V>[];
  value: V;
  onChange: (value: V) => void;
  /** Width / flex of the column (default flex-1). */
  className?: string;
}

export interface WheelPickerProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: WheelColumn<any>[];
  itemHeight?: number;
  /** Odd number of visible rows (default 5). */
  visibleCount?: number;
  dir?: 'ltr' | 'rtl';
  /** Selection haptic on every row change (default true). */
  haptics?: boolean;
  className?: string;
}

const SETTLE_MS = 110;

function WheelColumnView({ column, itemHeight, visibleCount, haptics }: {
  column: WheelColumn;
  itemHeight: number;
  visibleCount: number;
  haptics: boolean;
}) {
  const reduce = useReducedMotion();
  const baseId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const values = column.options.map((o) => o.value);
  const selected = wheelValueIndex(values, column.value);
  const [live, setLive] = useState(selected);
  const liveRef = useRef(selected);
  const mounted = useRef(false);

  // Keep the scroller on the selected row (initial jump; later smooth unless reduced motion).
  useEffect(() => {
    const el = ref.current;
    liveRef.current = selected;
    setLive(selected);
    if (!el) return;
    const top = wheelScrollTop(selected, itemHeight);
    if (Math.abs(el.scrollTop - top) > 1) {
      if (typeof el.scrollTo === 'function') {
        el.scrollTo({ top, behavior: !mounted.current || reduce ? 'auto' : 'smooth' });
      } else {
        el.scrollTop = top;
      }
    }
    mounted.current = true;
  }, [selected, itemHeight, reduce, column.options.length]);

  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current); }, []);

  const { options, onChange, value } = column;
  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const idx = wheelIndexFromScroll(el.scrollTop, itemHeight, options.length);
    if (idx !== liveRef.current) {
      liveRef.current = idx;
      setLive(idx);
      if (haptics) hapticSelection();
    }
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const opt = options[liveRef.current];
      if (opt && opt.value !== value) onChange(opt.value);
    }, SETTLE_MS);
  }, [itemHeight, options, onChange, value, haptics]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = nextWheelIndex(e.key, selected, options.length);
    if (next === null) return;
    e.preventDefault();
    const opt = options[next];
    if (opt && opt.value !== value) onChange(opt.value);
  };

  const pad = wheelPadding(itemHeight, visibleCount);
  const fade = 'linear-gradient(to bottom, transparent 0%, #000 38%, #000 62%, transparent 100%)';

  return (
    <div
      ref={ref}
      role="listbox"
      tabIndex={0}
      aria-label={column.ariaLabel}
      aria-activedescendant={options.length ? `${baseId}-${selected}` : undefined}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
      className={`relative z-10 h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain no-scrollbar outline-none focus-visible:ring-2 focus-visible:ring-v2-deep/40 rounded-[14px] ${column.className ?? 'flex-1'}`}
      style={{ paddingTop: pad, paddingBottom: pad, maskImage: fade, WebkitMaskImage: fade }}
    >
      {options.map((opt, i) => (
        <div
          key={String(opt.value)}
          id={`${baseId}-${i}`}
          role="option"
          aria-selected={i === selected}
          onClick={() => { if (opt.value !== value) onChange(opt.value); }}
          className={`flex snap-center items-center justify-center whitespace-nowrap tabular-nums transition-colors duration-150 ${
            i === live ? 'text-[20px] font-extrabold text-v2-ink' : 'text-[17px] font-bold text-v2-ink-2/70'
          }`}
          style={{ height: itemHeight }}
        >
          {opt.label}
        </div>
      ))}
    </div>
  );
}

export default function WheelPicker({
  columns,
  itemHeight = WHEEL_ITEM_HEIGHT,
  visibleCount = WHEEL_VISIBLE_COUNT,
  dir = 'ltr',
  haptics = true,
  className = '',
}: WheelPickerProps) {
  const height = itemHeight * visibleCount;
  const bandTop = wheelPadding(itemHeight, visibleCount);
  return (
    <div dir={dir} className={`relative flex gap-1 select-none ${className}`} style={{ height }}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 z-0 rounded-[14px] bg-v2-surface ring-1 ring-inset ring-v2-hairline"
        style={{ top: bandTop, height: itemHeight }}
      />
      {columns.map((c) => (
        <WheelColumnView key={c.key} column={c} itemHeight={itemHeight} visibleCount={visibleCount} haptics={haptics} />
      ))}
    </div>
  );
}
