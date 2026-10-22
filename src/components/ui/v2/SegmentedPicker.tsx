'use client';

/**
 * SegmentedPicker — a full-width row of 2–4 equal options in one white pill
 * (icon on top, nowrap label under it). The selected option takes the brand
 * TINT (never black). Same shape as the overview drawer's intensity trio
 * (קליל / מאוזן / עוצמתי); used by the route overview for the activity
 * (הליכה · 50׳ / ריצה · 25׳ / רכיבה · 13׳).
 *
 *   <SegmentedPicker ariaLabel="בחירת פעילות" value={act} onChange={setAct}
 *     options={[{ key: 'walking', label: 'הליכה · 50׳', icon: <Walk/> }, …]} />
 */

import type { ReactNode } from 'react';
import { hapticTap } from '@/lib/haptics';

export interface SegmentedOption<K extends string> {
  key: K;
  label: string;
  icon?: ReactNode;
}

export interface SegmentedPickerProps<K extends string> {
  options: readonly SegmentedOption<K>[];
  value: K;
  onChange: (key: K) => void;
  ariaLabel: string;
  className?: string;
}

export default function SegmentedPicker<K extends string>({ options, value, onChange, ariaLabel, className = '' }: SegmentedPickerProps<K>) {
  return (
    <div role="group" aria-label={ariaLabel}
      className={`flex w-full items-stretch gap-1 rounded-full bg-white p-1 shadow-v2-ring ${className}`}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button key={o.key} type="button" onClick={() => { if (!active) hapticTap('selection'); onChange(o.key); }} aria-pressed={active}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1.5 py-[7px] transition-all duration-150 ease-v2 active:scale-[0.97] ${
              active ? 'bg-v2-tint ring-1 ring-inset ring-v2-accent/40' : 'bg-transparent'
            }`}>
            {o.icon != null && <span aria-hidden className={`inline-flex ${active ? 'text-v2-deep' : 'text-v2-muted'}`}>{o.icon}</span>}
            <span className={`whitespace-nowrap text-[12.5px] font-extrabold ${active ? 'text-v2-deep' : 'text-v2-ink-2'}`}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
