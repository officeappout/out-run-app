'use client';

import { Sparkles } from 'lucide-react';
import type { UserFullProfile } from '@/types/user-profile';
import type { ProgramTrack } from '@/features/home/utils/program-start-cards';
import AddStrengthProgramCard from '@/features/home/components/AddStrengthProgramCard';
import AddRunningProgramCard from './AddRunningProgramCard';
import { PROGRAM_START_HINT } from './program-start-copy';

interface ProgramStartPairProps {
  order: readonly [ProgramTrack, ProgramTrack];
  profile: UserFullProfile | null | undefined;
  /** Wraps each navigation in home's health gate, per track. */
  onNavigate?: (track: ProgramTrack, navigate: () => void) => void;
}

/**
 * Home v2 (S-7b) — a new user's first carousel slide: two equal start cards
 * side by side ("תוכנית כוח" = the existing AddStrengthProgramCard, compact;
 * "תוכנית ריצה"), then the "you can do both" hint. RTL: the first track sits
 * on the right.
 */
export default function ProgramStartPair({ order, profile, onNavigate }: ProgramStartPairProps) {
  const nav = (track: ProgramTrack) => (onNavigate ? (navigate: () => void) => onNavigate(track, navigate) : undefined);
  return (
    <div className="flex h-full w-full flex-col justify-center" dir="rtl" data-program-start-pair={order.join(',')}>
      <div className="flex items-stretch gap-3">
        {order.map((track) =>
          track === 'strength' ? (
            <AddStrengthProgramCard key={track} compact profile={profile} onNavigate={nav('strength')} />
          ) : (
            <AddRunningProgramCard key={track} profile={profile} onNavigate={nav('running')} />
          ),
        )}
      </div>
      <p className="mt-3 flex items-center justify-center gap-1.5 whitespace-nowrap text-[13px] font-extrabold text-v2-deep">
        <Sparkles size={14} strokeWidth={2.2} aria-hidden="true" />
        {PROGRAM_START_HINT}
      </p>
    </div>
  );
}
