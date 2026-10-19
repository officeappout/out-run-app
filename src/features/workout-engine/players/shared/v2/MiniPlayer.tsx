'use client';

/**
 * MiniPlayer — the black bar the v2 player shrinks to while the session list
 * (the layer behind) is showing: a block-colour tile, the primary line, a
 * secondary line, pause / resume and an expand chevron. Tap = expand.
 */

import React from 'react';
import { ChevronUp, Pause, Play } from 'lucide-react';

export interface MiniPlayerProps {
  /** Colour of the current block (the tile). */
  color: string;
  /** "ריצה קלה · 14:34". */
  title: string;
  /** "20:26 · 3.4 ק״מ" (rendered LTR). */
  subtitle: string;
  isPaused: boolean;
  onTogglePause: () => void;
  onExpand: () => void;
  /** Drag handle (PlayerShell / TwoLayerShell). */
  onPointerDown?: (e: React.PointerEvent) => void;
  /** Bar height without the safe area. */
  height: number;
  /** Measured safe-area bottom, added as padding. Default 0. */
  safeBottom?: number;
  /** Rounded top corners (off when the host strip already rounds them). Default true. */
  rounded?: boolean;
}

export default function MiniPlayer({
  color,
  title,
  subtitle,
  isPaused,
  onTogglePause,
  onExpand,
  onPointerDown,
  height,
  safeBottom = 0,
  rounded = true,
}: MiniPlayerProps) {
  return (
    <div
      dir="rtl"
      className={`pointer-events-auto flex cursor-pointer items-center gap-3 bg-v2-ink px-4 text-white ${rounded ? 'rounded-t-[22px]' : ''}`}
      style={{ height: height + safeBottom, paddingBottom: safeBottom, touchAction: 'none', fontFamily: 'var(--font-simpler)' }}
      onPointerDown={onPointerDown}
      onClick={onExpand}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onExpand();
        }
      }}
    >
      <span className="h-11 w-11 shrink-0 rounded-[12px]" style={{ background: color }} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate whitespace-nowrap text-[14.5px] font-black">{title}</span>
        <span dir="ltr" className="block truncate whitespace-nowrap text-right text-[12.5px] font-bold tabular-nums text-white/60">
          {subtitle}
        </span>
      </span>
      <button
        type="button"
        aria-label={isPaused ? 'המשך אימון' : 'השהה אימון'}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePause();
        }}
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/10 active:scale-[0.97] transition-transform duration-150 ease-v2"
      >
        {isPaused ? <Play size={20} fill="currentColor" aria-hidden /> : <Pause size={20} fill="currentColor" aria-hidden />}
      </button>
      <ChevronUp size={20} className="shrink-0 text-white/60" aria-hidden />
    </div>
  );
}
