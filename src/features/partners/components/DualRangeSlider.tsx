'use client';

/**
 * DualRangeSlider — two overlapping native <input type="range"> elements
 * sharing one visual track. The inputs themselves are pointer-events:none;
 * only their thumbs remain interactive (Tailwind v3 arbitrary variant on
 * the WebKit/Moz thumb pseudo-elements). A filled segment between the
 * two values is rendered behind the inputs, and floating value labels
 * track each thumb above the track.
 *
 * RTL convention: the partners feature is dir="rtl", so the smaller
 * value (the lo handle) sits on the RIGHT and grows toward the LEFT. We
 * achieve this by setting dir="rtl" on each <input>, and by anchoring
 * the visual elements (filled segment + floating labels) from the right
 * edge using `right: ${pct}%` instead of `left: ${pct}%`. Numeric/format
 * labels stay LTR (`dir="ltr"`) so values like "5:30" don't read as "30:5".
 *
 * Used by:
 *   - PartnerFilterBar (level range, pace range)
 *   - PartnerFilterSheet (age range)
 */

import React from 'react';

const ACCENT = '#00ADEF';

export interface DualRangeSliderProps {
  min: number;
  max: number;
  step: number;
  values: [number, number];
  onChange: (next: [number, number]) => void;
  /** Format helper for both floating labels (defaults to String(v)). */
  formatLabel?: (value: number) => string;
  ariaLabelMin: string;
  ariaLabelMax: string;
}

export function DualRangeSlider({
  min,
  max,
  step,
  values,
  onChange,
  formatLabel,
  ariaLabelMin,
  ariaLabelMax,
}: DualRangeSliderProps) {
  const [lo, hi] = values;
  const span = max - min;
  const minPct = span > 0 ? Math.max(0, Math.min(100, ((lo - min) / span) * 100)) : 0;
  const maxPct = span > 0 ? Math.max(0, Math.min(100, ((hi - min) / span) * 100)) : 100;
  const labelFor = formatLabel ?? ((v: number) => String(v));

  // Common Tailwind classes that disable input chrome and re-enable thumb
  // pointer events. Width/position is set via the wrapper.
  const inputClass =
    'absolute inset-0 w-full h-full appearance-none bg-transparent ' +
    'pointer-events-none ' +
    '[&::-webkit-slider-thumb]:pointer-events-auto ' +
    '[&::-moz-range-thumb]:pointer-events-auto';

  return (
    <div className="relative w-full" style={{ height: 36 }}>
      {/* Floating value labels (above the thumbs).
          Anchored from the right edge so they track the RTL thumb position;
          translateX(50%) re-centers the label over the thumb. */}
      <div
        className="absolute text-[11px] font-black pointer-events-none whitespace-nowrap"
        dir="ltr"
        style={{
          top: 0,
          right: `${minPct}%`,
          transform: 'translateX(50%)',
          color: ACCENT,
        }}
      >
        {labelFor(lo)}
      </div>
      <div
        className="absolute text-[11px] font-black pointer-events-none whitespace-nowrap"
        dir="ltr"
        style={{
          top: 0,
          right: `${maxPct}%`,
          transform: 'translateX(50%)',
          color: ACCENT,
        }}
      >
        {labelFor(hi)}
      </div>

      {/* Track + filled segment + the two range inputs share this row */}
      <div className="absolute left-0 right-0" style={{ top: 20, height: 16 }}>
        {/* Static (empty) track */}
        <div className="absolute top-1/2 left-0 right-0 h-1.5 -translate-y-1/2 bg-gray-200 rounded-full" />
        {/* Filled segment between thumbs (RTL: lo on right, hi on left). */}
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
          style={{
            right: `${minPct}%`,
            left: `${100 - maxPct}%`,
            backgroundColor: ACCENT,
          }}
        />
        {/* Min handle (lo) — visually on the right side under RTL. */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          dir="rtl"
          onChange={(e) => {
            const next = Math.min(Number(e.target.value), hi);
            onChange([next, hi]);
          }}
          className={inputClass}
          style={{ accentColor: ACCENT }}
          aria-label={ariaLabelMin}
        />
        {/* Max handle (hi) — visually on the left side under RTL. */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          dir="rtl"
          onChange={(e) => {
            const next = Math.max(Number(e.target.value), lo);
            onChange([lo, next]);
          }}
          className={inputClass}
          style={{ accentColor: ACCENT }}
          aria-label={ariaLabelMax}
        />
      </div>
    </div>
  );
}

export default DualRangeSlider;
