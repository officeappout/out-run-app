'use client';

/**
 * TutorialChip — enable_strength_drawer_v1: the "הסבר" chip that replaces the
 * floating "צפה בהסבר המלא" pill. It sits at the video's top corner (RTL
 * start), under the player header and inside the top safe area, so it never
 * meets the bottom drawer whatever its snap. Same z band as the old pill.
 */

import React from 'react';
import { PlayCircle } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';

/** Header (story bars + control row + pills row) under the top inset. */
export const TUTORIAL_CHIP_TOP = 'calc(env(safe-area-inset-top, 44px) + 9.5rem)';

export default function TutorialChip({ onClick }: { onClick: () => void }) {
  const t = useT(player);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('strength.tutorial.chipAria')}
      className="absolute right-4 z-[46] inline-flex h-9 items-center gap-1.5 rounded-full border border-white/20 bg-black/55 px-3 text-white shadow-lg backdrop-blur-md transition-transform duration-150 active:scale-[0.97]"
      style={{ top: TUTORIAL_CHIP_TOP, fontFamily: 'var(--font-simpler)' }}
      dir="rtl"
      data-tutorial-chip=""
    >
      <PlayCircle size={17} aria-hidden />
      <span className="text-[13px] font-extrabold whitespace-nowrap">{t('strength.tutorial.chip')}</span>
    </button>
  );
}
