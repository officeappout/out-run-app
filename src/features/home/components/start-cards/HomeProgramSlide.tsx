'use client';

import type { UserFullProfile } from '@/types/user-profile';
import type { ProgramSlidePlan, ProgramTrack } from '@/features/home/utils/program-start-cards';
import ProgramStartCarousel from './ProgramStartCarousel';
import AddTrackCard from './AddTrackCard';
import type { ProgramTrackNavigate } from './entry-tap';

export type { ProgramTrackNavigate };

export interface HomeProgramSlideProps {
  plan: ProgramSlidePlan;
  profile: UserFullProfile | null | undefined;
  onNavigate?: ProgramTrackNavigate;
  onDismissAdd: (track: ProgramTrack) => void;
}

/**
 * Home v2 — the program slide, per resolveProgramSlide's plan. 'add' = the single
 * "רוצה להוסיף …?" card (a carousel slide). 'start' renders here only on its own (no daily
 * carousel to host it): the two start cards as their own carousel, one card per slide —
 * inside a daily carousel each start card is a slide of its own (placeProgramSlides).
 */
export default function HomeProgramSlide({ plan, profile, onNavigate, onDismissAdd }: HomeProgramSlideProps) {
  if (plan.mode === 'start') {
    return <ProgramStartCarousel order={plan.order} profile={profile} onNavigate={onNavigate} />;
  }
  if (plan.mode === 'add') {
    const { track } = plan;
    return (
      <AddTrackCard
        track={track}
        profile={profile}
        onNavigate={onNavigate ? (navigate, cancel) => onNavigate(track, navigate, cancel) : undefined}
        onDismiss={() => onDismissAdd(track)}
      />
    );
  }
  return null;
}
