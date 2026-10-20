'use client';

import { ChevronLeft, Loader2 } from 'lucide-react';
import { Chip } from '@/components/ui/v2';
import type { ProgramTrack } from '@/features/home/utils/program-start-cards';
import { ProgramArt, ProgramTrackIcon } from './program-track-visual';

export interface ProgramStartRowProps {
  track: ProgramTrack;
  title: string;
  valueLine: string;
  chipLabel: string;
  loading?: boolean;
  onTap: () => void;
}

const SIMPLER = { fontFamily: 'var(--font-simpler)' } as const;

/**
 * Home v2 — a new user's "start a program" card as a full-width compact ROW (owner
 * 20.10.2026: the half-width pair inside the carousel cut its text). Same pieces as
 * ProgramStartCard: the track photo (a square tile here), the program icon + title, the
 * value line (two lines, never cut), the duration chip and the round go mark.
 */
export default function ProgramStartRow({ track, title, valueLine, chipLabel, loading = false, onTap }: ProgramStartRowProps) {
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={loading}
      data-program-start-row={track}
      className="flex w-full items-center gap-3 rounded-v2-card bg-white p-2.5 text-right shadow-v2-card transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:opacity-60"
      dir="rtl"
    >
      <span className="relative h-[84px] w-[84px] shrink-0 overflow-hidden rounded-[18px]">
        <ProgramArt track={track} crop="wide" fade="0%" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="flex min-w-0 max-w-full items-center gap-1.5">
          <ProgramTrackIcon track={track} />
          <span className="truncate whitespace-nowrap text-[17px] font-bold leading-tight text-v2-ink" style={SIMPLER}>{title}</span>
        </span>
        <span className="text-[13px] font-medium leading-[1.35] text-v2-ink-2" style={SIMPLER}>{valueLine}</span>
        <Chip tone="accent" className="!h-6 !px-2 !text-[11.5px] !font-extrabold">{chipLabel}</Chip>
      </span>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-v2-deep shadow-v2-ring" aria-hidden="true">
        {loading ? <Loader2 size={16} className="animate-spin" /> : <ChevronLeft size={16} strokeWidth={2.6} />}
      </span>
    </button>
  );
}
