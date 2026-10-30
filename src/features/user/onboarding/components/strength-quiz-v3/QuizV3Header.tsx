'use client';

import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import OnboardingStoryBar from '../OnboardingStoryBar';
import { strengthStoryBar } from '../../constants/onboarding-phases';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import { useEntryScrollReset } from './entry-scroll';

interface QuizV3HeaderProps {
  onBack?: () => void;
  /** 0 to 100 inside the phase. */
  fillPercent: number;
  /** Story-bar phase: the assessment (default) or the summary (after it, part C). */
  phase?: 'assessment' | 'summary';
  /** The end slot (the explainers' "דלג"); an empty 40px slot keeps the bars centred. */
  trailing?: ReactNode;
}

/** Back button + the strength v3 story bars (level check, then summary), same row as the v2 slider header. */
export default function QuizV3Header({ onBack, fillPercent, phase = 'assessment', trailing }: QuizV3HeaderProps) {
  const t = useT(onboarding);
  useEntryScrollReset();
  const bar = strengthStoryBar(phase === 'summary' ? 'result' : 'assessment', true);
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
          totalPhases={bar.total}
          currentPhase={bar.current}
          phaseFillPercent={fillPercent}
          phaseLabel={t(bar.labelKey)}
          noPadding
        />
      </div>
      {trailing ?? <div className="w-10 flex-shrink-0" aria-hidden />}
    </header>
  );
}
