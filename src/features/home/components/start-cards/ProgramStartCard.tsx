'use client';

import { ChevronLeft, Loader2 } from 'lucide-react';
import { Chip } from '@/components/ui/v2';
import type { ProgramTrack } from '@/features/home/utils/program-start-cards';
import { ProgramArt, ProgramTrackIcon } from './program-track-visual';

export interface ProgramStartCardProps {
  track: ProgramTrack;
  title: string;
  /** One-line value promise under the title. */
  valueLine: string;
  /** e.g. "שאלון · 2 דק׳". */
  chipLabel: string;
  loading?: boolean;
  onTap: () => void;
  /**
   * enable_home_v2 (owner 20.10.2026): the card fills a whole carousel slide (one card per
   * slide, full card width, all text visible) instead of half of a shared tile.
   */
  slide?: boolean;
}

const SIMPLER = { fontFamily: 'var(--font-simpler)' } as const;

/**
 * Home v2 (S-7b) — one of the two equal "start a program" cards, in
 * AddStrengthProgramCard's own look: the track photo full-bleed under the
 * white bottom fade, 24px radius, the program icon + bold title stacked at
 * the bottom, then the duration chip and a round go mark. Sized by its
 * parent (the pair splits the carousel slot in two).
 */
export default function ProgramStartCard({ track, title, valueLine, chipLabel, loading = false, onTap, slide = false }: ProgramStartCardProps) {
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={loading}
      data-program-start={track}
      data-program-start-slide={slide ? '' : undefined}
      className={`group relative ${slide ? 'h-full w-full' : 'h-[244px] min-w-0 flex-1'} overflow-hidden rounded-[24px] bg-white text-right shadow-lg transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:opacity-60`}
      dir="rtl"
    >
      <ProgramArt track={track} crop="tall" fade={slide ? '58%' : '72%'} />
      <div className={`absolute inset-x-0 bottom-0 flex flex-col items-start ${slide ? 'p-4' : 'p-3'}`}>
        <div className="mb-1 flex min-w-0 max-w-full items-center gap-1.5">
          <ProgramTrackIcon track={track} className={slide ? 'h-[22px] w-[22px]' : undefined} />
          <h2 className={`truncate whitespace-nowrap ${slide ? 'text-[22px]' : 'text-[19px]'} font-bold leading-tight text-slate-900`} style={SIMPLER}>
            {title}
          </h2>
        </div>
        <p className={slide ? 'text-[14px] font-medium leading-[1.4] text-slate-900' : 'min-h-[34px] text-[12.5px] font-medium leading-[1.35] text-slate-900'} style={SIMPLER}>
          {valueLine}
        </p>
        <div className="mt-2 flex w-full items-center justify-between gap-1">
          <Chip tone="accent" className="!h-6 !px-2 !text-[11.5px] !font-extrabold">{chipLabel}</Chip>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-v2-deep shadow-v2-ring" aria-hidden="true">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <ChevronLeft size={16} strokeWidth={2.6} />}
          </span>
        </div>
      </div>
    </button>
  );
}
