'use client';

import { ChevronLeft, Loader2 } from 'lucide-react';
import { Chip } from '@/components/ui/v2';
import type { ProgramTrack } from '@/features/home/utils/program-start-cards';

/** Per-track art + accent (activity colours: strength #00baf7, cardio #65a30d text). */
export const PROGRAM_TRACK_VISUAL: Record<ProgramTrack, { image: string; icon: string; color: string }> = {
  strength: { image: '/images/gateway/card-strength.png', icon: '/icons/programs/muscle.svg', color: '#00baf7' },
  running: { image: '/images/gateway/card-running.png', icon: '/icons/programs/Run.svg', color: '#65a30d' },
};

export interface ProgramStartCardProps {
  track: ProgramTrack;
  title: string;
  /** One-line value promise under the title. */
  valueLine: string;
  /** e.g. "שאלון · 2 דק׳". */
  chipLabel: string;
  loading?: boolean;
  onTap: () => void;
}

/**
 * Home v2 (S-7b) — one of the two equal "start a program" cards: the gateway
 * art on top, the track title + value line, a duration chip and a round go
 * mark. Sized by its parent (the pair splits the carousel slot in two).
 */
export default function ProgramStartCard({ track, title, valueLine, chipLabel, loading = false, onTap }: ProgramStartCardProps) {
  const visual = PROGRAM_TRACK_VISUAL[track];
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={loading}
      data-program-start={track}
      className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-v2-card bg-white text-right shadow-v2-card transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:opacity-60"
      dir="rtl"
    >
      <div
        className="h-[96px] w-full bg-cover bg-center"
        style={{ backgroundImage: `url('${visual.image}')` }}
        aria-hidden="true"
      />
      <div className="flex flex-1 flex-col gap-1 px-3 pb-3 pt-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={visual.icon} alt="" aria-hidden="true" className="h-4 w-4 shrink-0 object-contain" />
          <span className="truncate whitespace-nowrap text-[16px] font-black text-v2-ink">{title}</span>
        </div>
        <p className="min-h-[35px] text-[12.5px] font-bold leading-[1.4] text-v2-muted">{valueLine}</p>
        <div className="mt-auto flex items-center justify-between gap-1 pt-1">
          <Chip tone="accent" className="!h-6 !px-2 !text-[11.5px] !font-extrabold">{chipLabel}</Chip>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-v2-tint text-v2-deep" aria-hidden="true">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <ChevronLeft size={16} strokeWidth={2.6} />}
          </span>
        </div>
      </div>
    </button>
  );
}
