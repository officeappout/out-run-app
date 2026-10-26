'use client';

/** Explainers 7 to 9 (boards Explain1..3): story bars (one per explainer), "דלג", the content, the CTA. */
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/v2';
import StoryBars from '@/components/ui/v2/StoryBars';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import { EXPLAIN_COUNT } from './quiz-v3-outro';

interface ExplainLayoutProps {
  /** 1-based. */
  index: number;
  children: ReactNode;
  onNext: () => void;
  /** Absent on the last explainer. */
  onSkip?: () => void;
  onBack?: () => void;
  ctaLabel: string;
  /** The last explainer's CTA is the brand one (board Explain3); the others are dark. */
  ctaVariant?: 'dark' | 'cta';
}

export default function ExplainLayout({ index, children, onNext, onSkip, onBack, ctaLabel, ctaVariant = 'dark' }: ExplainLayoutProps) {
  const t = useT(onboarding);
  const segments = Array.from({ length: EXPLAIN_COUNT }, (_, i) => ({ key: `e${i}`, color: '#0e1419', doneColor: '#0e1419' }));
  return (
    <div className="flex h-full min-h-0 flex-col bg-v2-surface" data-quiz-v3={`explain-${index}`}>
      <header className="flex flex-shrink-0 items-center gap-2.5 px-3 pb-1 pt-1">
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
        <div className="flex-1" role="img" aria-label={t('quizV3.explain.stepAria', { current: index, total: EXPLAIN_COUNT })}>
          <StoryBars
            segments={segments}
            currentIndex={index - 1}
            progress={1}
            currentFlex={1}
            trackColor="#dfe7ed"
            barClassName="h-1 rounded-full"
            gapClassName="gap-1"
            direction="inherit"
          />
        </div>
        {onSkip ? (
          <button type="button" onClick={onSkip} className="min-w-10 px-1 text-[13px] font-extrabold text-v2-ink-2">
            {t('quizV3.explain.skip')}
          </button>
        ) : (
          <div className="w-10 flex-shrink-0" aria-hidden />
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-5 pb-3 pt-3 text-v2-ink">{children}</div>
      <div className="px-5 pb-7 pt-2">
        <Button variant={ctaVariant} size="lg" block onClick={onNext}>
          {ctaLabel}
        </Button>
      </div>
    </div>
  );
}
