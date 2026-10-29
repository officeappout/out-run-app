'use client';

/**
 * Explainers 7 to 9 (boards Explain1..3): the flow's own story bars (owner 28.10, Y6: the same bars as
 * every other screen, the summary phase filling up), "דלג", the content, the CTA.
 */
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import QuizV3Header from './QuizV3Header';
import { EXPLAIN_COUNT, summaryPhaseFill } from './quiz-v3-outro';

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
  return (
    <div className="flex h-full min-h-0 flex-col bg-v2-surface" data-quiz-v3={`explain-${index}`}>
      <QuizV3Header
        onBack={onBack}
        phase="summary"
        fillPercent={summaryPhaseFill({ kind: 'explain', index: index as 1 | 2 | 3 })}
        trailing={onSkip ? (
          <button type="button" onClick={onSkip} className="min-w-10 flex-shrink-0 px-1 text-[13px] font-extrabold text-v2-ink-2">
            {t('quizV3.explain.skip')}
          </button>
        ) : undefined}
      />
      <span className="sr-only">{t('quizV3.explain.stepAria', { current: index, total: EXPLAIN_COUNT })}</span>
      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-5 pb-3 pt-3 text-v2-ink">{children}</div>
      <div className="px-5 pb-7 pt-2">
        <Button variant={ctaVariant} size="lg" block onClick={onNext}>
          {ctaLabel}
        </Button>
      </div>
    </div>
  );
}
