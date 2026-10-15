'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { countUpValue, formatStat } from './logic';

export type StatSize = 'sm' | 'md' | 'lg' | 'hero';

const SIZE_CLASS: Record<StatSize, string> = {
  sm: 'text-[20px]',
  md: 'text-[28px]',
  lg: 'text-[40px]',
  hero: 'text-[56px]',
};

export interface StatNumberProps {
  value: number;
  decimals?: number;
  /** Unit after the number (e.g. "ק״מ", "צעדים"). */
  unit?: string;
  /** Small caption under the number. */
  label?: string;
  size?: StatSize;
  /** Animate from 0 (first mount) or from the previous value (updates). */
  countUp?: boolean;
  durationMs?: number;
  /** Override number formatting entirely (e.g. "23:41" durations). Disables count-up interpolation formatting. */
  format?: (v: number) => string;
  /** Light text on dark/coloured surfaces. */
  inverted?: boolean;
  className?: string;
  align?: 'start' | 'center';
}

/**
 * StatNumber — big black-weight number, tabular-nums, tight tracking.
 * Count-up runs on rAF with the v2 ease-out; it snaps straight to the value
 * under prefers-reduced-motion. The rendered text is always the final value on
 * the server/first paint when countUp is off, so SSR markup is stable.
 */
export default function StatNumber({
  value,
  decimals = 0,
  unit,
  label,
  size = 'md',
  countUp = false,
  durationMs = 900,
  format,
  inverted = false,
  className = '',
  align = 'start',
}: StatNumberProps) {
  const reduce = useReducedMotion();
  const animate = countUp && !reduce;
  const [shown, setShown] = useState(animate ? 0 : value);
  const fromRef = useRef(animate ? 0 : value);

  useEffect(() => {
    if (!animate) {
      setShown(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const v = countUpValue(from, value, now - start, durationMs);
      setShown(v);
      if (v !== value) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = value;
    };
  }, [value, animate, durationMs]);

  const text = format ? format(shown) : formatStat(shown, decimals);
  const color = inverted ? 'text-white' : 'text-v2-ink';
  const labelColor = inverted ? 'text-white/60' : 'text-v2-muted';

  return (
    <div data-v2-stat className={`flex flex-col ${align === 'center' ? 'items-center text-center' : 'items-start'} ${className}`}>
      <span className={`inline-flex items-baseline gap-1 ${color}`}>
        <span className={`font-black tabular-nums leading-none tracking-[-0.03em] ${SIZE_CLASS[size]}`}>{text}</span>
        {unit && <span className={`text-[13px] font-bold ${labelColor}`}>{unit}</span>}
      </span>
      {label && <span className={`mt-1 text-[12px] font-semibold ${labelColor}`}>{label}</span>}
    </div>
  );
}
