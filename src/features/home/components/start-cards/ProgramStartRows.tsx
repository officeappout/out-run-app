'use client';

import { Sparkles } from 'lucide-react';
import type { UserFullProfile } from '@/types/user-profile';
import type { ProgramTrack } from '@/features/home/utils/program-start-cards';
import ProgramStartRow from './ProgramStartRow';
import { PROGRAM_START_COPY, PROGRAM_START_HINT } from './program-start-copy';
import { useOnboardingEntryTap } from './useOnboardingEntryTap';
import type { ProgramTrackNavigate } from './ProgramStartPair';

const TRACK_ENTRY = { strength: 'STRENGTH', running: 'RUNNING' } as const;

function TrackRow({ track, profile, onNavigate }: { track: ProgramTrack; profile: UserFullProfile | null | undefined; onNavigate?: ProgramTrackNavigate }) {
  const { loading, tap } = useOnboardingEntryTap(
    profile,
    TRACK_ENTRY[track],
    onNavigate ? (navigate, cancel) => onNavigate(track, navigate, cancel) : undefined,
  );
  const copy = PROGRAM_START_COPY[track];
  return <ProgramStartRow track={track} title={copy.title} valueLine={copy.valueLine} chipLabel={copy.chip} loading={loading} onTap={tap} />;
}

export interface ProgramStartRowsProps {
  order: readonly [ProgramTrack, ProgramTrack];
  profile: UserFullProfile | null | undefined;
  onNavigate?: ProgramTrackNavigate;
}

/**
 * Home v2 — a new user's start cards, stacked full-width rows right under the week strip
 * (the page's primary thing), then the "you can do both" hint. Replaces the carousel's
 * ProgramStartPair for that user (owner 20.10.2026). The running row is also the walk
 * entry: walking is a goal inside the aerobic questionnaire (#534).
 */
export default function ProgramStartRows({ order, profile, onNavigate }: ProgramStartRowsProps) {
  return (
    <div className="mx-auto mb-5 flex w-full max-w-[358px] flex-col gap-3 px-4" dir="rtl" data-program-start-rows={order.join(',')}>
      <h3 className="whitespace-nowrap text-[19px] font-black !tracking-[-0.02em] text-v2-ink">בוא נבנה לך תוכנית</h3>
      {order.map((track) => (
        <TrackRow key={track} track={track} profile={profile} onNavigate={onNavigate} />
      ))}
      <p className="flex items-center justify-center gap-1.5 whitespace-nowrap text-[13px] font-extrabold text-v2-deep">
        <Sparkles size={14} strokeWidth={2.2} aria-hidden="true" />
        {PROGRAM_START_HINT}
      </p>
    </div>
  );
}
