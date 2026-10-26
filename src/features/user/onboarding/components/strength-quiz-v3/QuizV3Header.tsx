'use client';

import { ChevronRight } from 'lucide-react';
import OnboardingStoryBar from '../OnboardingStoryBar';
import { STRENGTH_PHASES, STRENGTH_LABEL_KEYS } from '../../constants/onboarding-phases';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';

interface QuizV3HeaderProps {
  onBack?: () => void;
  /** 0 to 100 inside the assessment phase. */
  fillPercent: number;
}

/** Back button + the strength story bars (phase 3 "מבדק רמה"), same row as the v2 slider header. */
export default function QuizV3Header({ onBack, fillPercent }: QuizV3HeaderProps) {
  const t = useT(onboarding);
  return (
    <header className="flex flex-shrink-0 items-center gap-2 px-3 pb-1 pt-1">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-white shadow-v2-ring touch-manipulation"
          aria-label={t('quiz.slider.back')}
        >
          <ChevronRight size={20} className="text-v2-ink ltr:-scale-x-100" />
        </button>
      ) : (
        <div className="w-10 flex-shrink-0" aria-hidden />
      )}
      <div className="flex min-h-[40px] flex-1 flex-col justify-center">
        <OnboardingStoryBar
          totalPhases={STRENGTH_PHASES.TOTAL}
          currentPhase={STRENGTH_PHASES.ASSESSMENT}
          phaseFillPercent={fillPercent}
          phaseLabel={t(STRENGTH_LABEL_KEYS[STRENGTH_PHASES.ASSESSMENT])}
          noPadding
        />
      </div>
      <div className="w-10 flex-shrink-0" aria-hidden />
    </header>
  );
}
