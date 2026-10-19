'use client';

import type { UserFullProfile } from '@/types/user-profile';
import type { ProgramSlidePlan, ProgramTrack } from '@/features/home/utils/program-start-cards';
import ProgramStartPair from './ProgramStartPair';
import AddTrackCard from './AddTrackCard';

export interface HomeProgramSlideProps {
  plan: ProgramSlidePlan;
  profile: UserFullProfile | null | undefined;
  onNavigate?: (track: ProgramTrack, navigate: () => void) => void;
  onDismissAdd: (track: ProgramTrack) => void;
}

/** Home v2 — the daily carousel's program slide, per resolveProgramSlide's plan. */
export default function HomeProgramSlide({ plan, profile, onNavigate, onDismissAdd }: HomeProgramSlideProps) {
  if (plan.mode === 'start') {
    return <ProgramStartPair order={plan.order} profile={profile} onNavigate={onNavigate} />;
  }
  if (plan.mode === 'add') {
    const { track } = plan;
    return (
      <AddTrackCard
        track={track}
        profile={profile}
        onNavigate={onNavigate ? (navigate) => onNavigate(track, navigate) : undefined}
        onDismiss={() => onDismissAdd(track)}
      />
    );
  }
  return null;
}
