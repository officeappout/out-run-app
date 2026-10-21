'use client';

import { Sparkles } from 'lucide-react';
import type { UserFullProfile } from '@/types/user-profile';
import { SuggestionCarousel } from '@/features/workout-engine/core/components/SuggestionCarousel';
import type { ProgramTrack } from '@/features/home/utils/program-start-cards';
import ProgramStartSlide from './ProgramStartSlide';
import { PROGRAM_START_HINT_KEY } from './program-start-copy';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';
import type { ProgramTrackNavigate } from './entry-tap';

export interface ProgramStartCarouselProps {
  order: readonly [ProgramTrack, ProgramTrack];
  profile: UserFullProfile | null | undefined;
  onNavigate?: ProgramTrackNavigate;
}

/** Same card size as home's daily carousel (330 × up to 300), so nothing jumps between them. */
export const START_SLIDE_HEIGHT = 330;
export const START_SLIDE_MAX_W = 300;

/**
 * Home v2 — a new user's carousel when there is nothing else to show (before the first
 * workout, or another day selected): the two questionnaire cards, ONE per slide (owner
 * 20.10.2026), under "בוא נבנה לך תוכנית" with the "you can do both" hint. Once the user has
 * trained, the same slides lead the daily carousel instead (placeProgramSlides).
 */
export default function ProgramStartCarousel({ order, profile, onNavigate }: ProgramStartCarouselProps) {
  const t = useT(home);
  return (
    <div className="mb-4" data-program-start-carousel={order.join(',')}>
      <div className="mb-2 px-5" dir="rtl">
        <h3 className="whitespace-nowrap text-[19px] font-black !tracking-[-0.02em] text-v2-ink">{t('programStart.title')}</h3>
        <p className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-[13px] font-extrabold text-v2-deep">
          <Sparkles size={14} strokeWidth={2.2} aria-hidden="true" />
          {t(PROGRAM_START_HINT_KEY)}
        </p>
      </div>
      <SuggestionCarousel<ProgramTrack>
        items={[...order]}
        keyExtractor={(track) => track}
        cardHeight={START_SLIDE_HEIGHT}
        maxCardWidthPx={START_SLIDE_MAX_W}
        maxCardWidthVw={100}
        renderCard={(track) => <ProgramStartSlide track={track} profile={profile} onNavigate={onNavigate} />}
      />
    </div>
  );
}
