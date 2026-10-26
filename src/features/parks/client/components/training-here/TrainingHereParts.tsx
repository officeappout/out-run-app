'use client';

/**
 * Small render-only parts of the "I'm training here" sheet (board RP-13 phone 5): the prefilled
 * info row, a row of choice pills, and the share switch. v2 tokens only; logical (RTL-safe) spacing.
 */
import type { ReactNode } from 'react';
import { hapticTap } from '@/lib/haptics';

export const SECTION_LABEL = 'mb-2 text-[13px] font-extrabold text-v2-deep';

export function InfoRow({ icon, label, value, action }: {
  icon: ReactNode;
  label: string;
  value: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-[16px] bg-v2-surface px-3 py-2.5 shadow-v2-ring">
      <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[12px] bg-v2-tint text-v2-deep" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-extrabold text-v2-muted">{label}</span>
        <span className="block truncate text-[15px] font-black text-v2-ink">{value}</span>
      </span>
      {action}
    </div>
  );
}

export interface ChoiceOption<K extends string> {
  key: K;
  label: string;
}

export function ChoicePills<K extends string>({ options, value, onChange, ariaLabel, compact = false }: {
  options: readonly ChoiceOption<K>[];
  value: K | null;
  onChange: (key: K) => void;
  ariaLabel: string;
  /** Smaller chips that scroll (the time chips). */
  compact?: boolean;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={`flex gap-2 ${compact ? 'overflow-x-auto no-scrollbar' : ''}`}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={active}
            onClick={() => { if (!active) hapticTap('selection'); onChange(o.key); }}
            className={`${compact ? 'h-10 shrink-0 px-4 text-[14px] tabular-nums' : 'h-[46px] flex-1 text-[14.5px]'} rounded-full font-extrabold transition-all duration-150 ease-v2 active:scale-[0.97] ${
              active ? 'bg-v2-tint text-v2-deep ring-[1.5px] ring-inset ring-v2-accent/50' : 'bg-white text-v2-ink-2 shadow-v2-ring'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ShareSwitch({ on, onToggle, title, sub }: {
  on: boolean;
  onToggle: () => void;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-black text-v2-ink">{title}</span>
        <span className="block text-[12px] font-bold text-v2-muted">{sub}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        onClick={() => { hapticTap('selection'); onToggle(); }}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150 ease-v2 ${on ? 'bg-v2-accent' : 'bg-v2-pill-border'}`}
      >
        {/* The knob sits at the inline END when on (left in RTL), like the design and ShareAsLiveToggle. */}
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-all duration-150 ease-v2 ${on ? 'end-0.5' : 'start-0.5'}`} />
      </button>
    </div>
  );
}
