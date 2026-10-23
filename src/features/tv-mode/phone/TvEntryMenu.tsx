'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Tv } from 'lucide-react';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useT } from '@/hooks/useT';
import { wide } from '@/messages/ns/wide';
import TvLargeScreenSheet from './TvLargeScreenSheet';
import { useTvPhoneStore } from './phone-store';
import { workoutInfoFrom, type WorkoutLike } from './workout-info';

/**
 * ⋯ in the workout overview → "הצגה על מסך גדול" → sheet (W-17 / W-18) → pairing.
 * Before the workout starts ONLY — the overview is the only place this is mounted.
 * Flag off = renders nothing at all.
 */
export default function TvEntryMenu({
  workout,
  onStart,
  prepareShare,
  buttonClassName,
}: {
  workout: WorkoutLike;
  /** The overview's own "start workout" handler (the host panel calls it). */
  onStart: () => void;
  prepareShare?: () => Promise<string | undefined>;
  buttonClassName?: string;
}) {
  const { flags } = useFeatureFlags();
  const t = useT(wide);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const firstItem = useRef<HTMLButtonElement>(null);
  const openPair = useTvPhoneStore((s) => s.openPair);

  useEffect(() => {
    if (menu) firstItem.current?.focus();
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (!wrap.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);

  if (!flags.enableTvModeV1) return null;

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-label={t('pair.menu.aria')}
        aria-haspopup="menu"
        aria-expanded={menu}
        onClick={() => setMenu((v) => !v)}
        className={buttonClassName ?? 'flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-[0_0_0_1px_rgba(14,27,42,0.08)] active:scale-90 transition-all'}
      >
        <MoreHorizontal size={20} strokeWidth={1.8} className="text-gray-500" aria-hidden="true" />
      </button>
      {menu && (
        <div role="menu" className="absolute end-0 top-full z-20 mt-2 w-60 rounded-[18px] bg-white p-1.5 shadow-[0_12px_32px_-8px_rgba(9,30,50,0.35),0_0_0_1px_rgba(14,27,42,0.08)]">
          <button
            type="button"
            role="menuitem"
            ref={firstItem}
            className="flex min-h-[48px] w-full items-center gap-3 rounded-[14px] px-3 text-start hover:bg-[#f1f5f9] focus-visible:bg-[#f1f5f9] focus-visible:outline-none"
            onClick={() => {
              setMenu(false);
              setSheet(true);
            }}
          >
            <Tv size={20} aria-hidden="true" className="text-[#0284c7]" />
            <span>
              <span className="block text-[14.5px] font-extrabold">{t('pair.menu.item')}</span>
              <span className="block text-[12px] font-semibold text-[#64748b]">{t('pair.menu.hint')}</span>
            </span>
          </button>
        </div>
      )}
      <TvLargeScreenSheet
        open={sheet}
        onClose={() => setSheet(false)}
        onPickCode={() => {
          setSheet(false);
          openPair({ info: workoutInfoFrom(workout), onStart, prepareShare });
        }}
      />
    </div>
  );
}
