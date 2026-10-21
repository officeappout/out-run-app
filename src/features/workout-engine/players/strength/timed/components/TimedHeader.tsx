'use client';

/**
 * TimedHeader — top of the timed player (boards A-2b, A-4b, A-5c): story
 * bars (one per workout segment, the block fills with its clock), the cart
 * list button with the block's segmented ring (replaces numbered circles),
 * the block clock ("נותרו 05:48", orange in the last seconds) and the pause
 * pill. Doubles as the drag handle that shrinks the player to the mini bar.
 */
import React from 'react';
import { Info, Play } from 'lucide-react';
import { CartProgressIcon, StoryBars } from '@/components/ui/v2';
import type { CartRingItem } from '@/components/ui/v2';
import type { SegmentBars } from '../logic/timed-header';
import { useUiGender } from '@/hooks/useUiGender';
import { GENDERED_COPY, pickGendered } from '@/lib/i18n/gender-copy';

export interface TimedHeaderProps {
  bars: SegmentBars;
  progress: number;
  cartItems: readonly CartRingItem[];
  caption: string;
  clock: string;
  warn: boolean;
  isPaused: boolean;
  hideList?: boolean;
  onList: () => void;
  onInfo: () => void;
  onTogglePause: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
}

export default function TimedHeader(p: TimedHeaderProps) {
  const gender = useUiGender();
  return (
    <div
      dir="rtl"
      className="absolute inset-x-0 top-0 z-[45] pb-10"
      style={{
        background:
          'linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(255,255,255,0.98) 40%, rgba(255,255,255,0.85) 60%, rgba(255,255,255,0.4) 82%, rgba(255,255,255,0) 100%)',
        touchAction: 'none',
        fontFamily: 'var(--font-simpler)',
      }}
      onPointerDown={p.onPointerDown}
    >
      <div className="px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 0.75rem)' }}>
        <div className="mb-2.5">
          <StoryBars segments={p.bars.segments} currentIndex={p.bars.currentIndex} progress={p.progress} currentFlex={6} />
        </div>
        <div className="flex items-center">
          <div className="flex w-[100px] items-center justify-start gap-1.5">
            {p.hideList ? (
              <div className="h-[54px] w-[54px]" aria-hidden />
            ) : (
              <CartProgressIcon items={p.cartItems} onClick={p.onList} />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-center leading-none">
            <button
              type="button"
              onClick={p.onInfo}
              className="mb-[3px] inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-extrabold text-v2-deep"
              aria-label="מה זה הפורמט"
            >
              {p.caption}
              <Info size={12} strokeWidth={2.6} aria-hidden />
            </button>
            <span
              className={`whitespace-nowrap text-[26px] font-black tabular-nums !tracking-[-0.02em] ${p.warn ? 'text-[#ea580c]' : 'text-v2-ink'}`}
            >
              {p.clock}
            </span>
          </div>
          <div className="flex w-[100px] justify-end">
            <button
              type="button"
              onClick={p.onTogglePause}
              aria-label={pickGendered(gender, p.isPaused ? GENDERED_COPY.resumeWorkout : GENDERED_COPY.stopWorkout)}
              className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
            >
              {p.isPaused ? (
                <Play size={16} className="text-v2-ink" fill="currentColor" aria-hidden />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="text-v2-ink" aria-hidden>
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              )}
              <span className="text-[12px] font-extrabold text-v2-ink">{p.isPaused ? 'המשך' : 'השהייה'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
