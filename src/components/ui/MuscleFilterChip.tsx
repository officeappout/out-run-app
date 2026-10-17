'use client';

/**
 * MuscleFilterChip — the anatomical muscle chip (icon box + label) shared by
 * the exercise-library's MuscleFilterBar and the home workout builder.
 *
 * Extracted from MuscleFilterBar's own inline chip markup (round: workout
 * builder UX pass v2) so both screens render the SAME visual — box size,
 * teal `primary` selected border/fill, label color — from one place instead
 * of two independently-maintained copies. The search screen only ever needs
 * `selected`; `locked`/`recommended` are additional, builder-only states
 * layered on top (both default to off, so MuscleFilterBar's own behaviour
 * is pixel-identical to before this extraction).
 */

import { Lock } from 'lucide-react';

export interface MuscleFilterChipProps {
  icon: string;
  label: string;
  selected: boolean;
  onClick: () => void;
  /** Builder-only: never assessed in any program that trains this muscle.
   * Still clickable — the click is expected to open the assessment popup,
   * never a silent no-op. Shows a small lock badge, mutes the icon. */
  locked?: boolean;
  /** Builder-only: selected AND still the untouched system recommendation
   * (not yet manually touched) — same selected fill, plus a small marker
   * so it reads as "the system picked this" rather than silently pre-checked. */
  recommended?: boolean;
  /** 'md' matches the exercise-library chip exactly (76px box / 56px icon).
   * 'sm' is a smaller variant for the builder's secondary-muscle row. */
  size?: 'md' | 'sm';
  /** Home v2 look (enable_home_v2): white glass box, brand ring when selected. */
  v2?: boolean;
}

const SIZE_PX: Record<'md' | 'sm', { box: number; icon: number }> = {
  md: { box: 76, icon: 56 },
  sm: { box: 60, icon: 44 },
};

export default function MuscleFilterChip({
  icon,
  label,
  selected,
  onClick,
  locked = false,
  recommended = false,
  size = 'md',
  v2 = false,
}: MuscleFilterChipProps) {
  const { box, icon: iconPx } = SIZE_PX[size];
  // Precedence (bug fix, UX pass v2.1): `locked` must suppress the active/
  // teal treatment regardless of `selected` — a chip can legitimately be
  // auto-selected (its program is chosen) while not yet assessed, and the
  // real tap-time gate (toggleChip's own isAssessed check) already treats
  // it as locked; the paint must agree, or a chip can render teal while
  // actually opening the assessment popup on tap.
  const active = selected && !locked;

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-col items-center gap-1.5 flex-shrink-0"
      style={{ width: box + 8 }}
      aria-pressed={active}
    >
      {locked && (
        <Lock size={11} className="absolute top-0 right-1 text-gray-400 z-10" aria-hidden />
      )}
      {recommended && active && (
        <span className="absolute -top-1 -left-1 text-[11px] leading-none z-10" aria-hidden>✨</span>
      )}
      <div
        className={
          v2
            ? `flex items-center justify-center rounded-[20px] transition-[background-color,box-shadow,transform] duration-150 ease-v2 active:scale-[0.96] ${
                active ? 'bg-v2-tint shadow-v2-card ring-2 ring-v2-accent' : 'bg-white/80 shadow-v2-ring'
              }`
            : `rounded-2xl border flex items-center justify-center transition-all ${
                active
                  ? `bg-cyan-50 border-primary shadow-sm ${recommended ? 'ring-2 ring-primary/30' : ''}`
                  : 'bg-gray-50 border-gray-200'
              }`
        }
        style={{ width: box, height: box }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={icon}
          alt=""
          style={{
            width: iconPx,
            height: iconPx,
            filter: locked ? 'grayscale(100%) opacity(0.5)' : undefined,
          }}
          className="object-contain"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
          }}
        />
      </div>
      <span
        className={`text-[11px] font-semibold whitespace-nowrap ${
          v2
            ? `!text-[12px] !font-extrabold ${active ? 'text-v2-deep' : locked ? 'text-v2-muted' : 'text-v2-ink-2'}`
            : active ? 'text-primary' : locked ? 'text-gray-400' : 'text-gray-600'
        }`}
      >
        {label}
      </span>
    </button>
  );
}
