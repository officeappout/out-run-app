'use client';

/** Screen 6 (board Done): "התוכנית שלך מוכנה", the program cards, then on to the explainers. */
import { Button } from '@/components/ui/v2';
import type { Gender } from '@/lib/i18n/core/i18n-core';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import QuizV3Header from './QuizV3Header';
import NormsFactBubble from './NormsFactBubble';
import ProgramSummaryCards from './ProgramSummaryCards';
import type { NormsFact, ProgramSummary } from './quiz-v3-summary';

const LEMUR_NOTEPAD = '/assets/lemur/lemur_notepad.png';

export interface ProgramSummaryScreenProps {
  summary: ProgramSummary;
  gender: Gender;
  /** "הידעת?": hidden until a real norms source is wired (see NormsFactBubble). */
  fact?: NormsFact | null;
  onNext: () => void;
  onBack?: () => void;
}

export default function ProgramSummaryScreen({ summary, gender, fact, onNext, onBack }: ProgramSummaryScreenProps) {
  const t = useT(onboarding);
  return (
    <div className="flex h-full min-h-0 flex-col bg-v2-surface" data-quiz-v3="done">
      <QuizV3Header onBack={onBack} fillPercent={20} phase="summary" />
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 pb-3 pt-2 text-v2-ink">
        <div className="flex items-center gap-2.5">
          <img src={LEMUR_NOTEPAD} alt={t('quizV3.done.lemurAlt')} className="h-[72px] w-[72px] flex-shrink-0 object-contain" />
          <h1 className="m-0 text-[26px] font-black leading-[32px] tracking-v2-tight">{t('quizV3.done.title')}</h1>
        </div>
        <NormsFactBubble fact={fact} gender={gender} />
        <ProgramSummaryCards summary={summary} />
      </div>
      <div className="px-5 pb-7 pt-2">
        <Button variant="cta" size="lg" block onClick={onNext}>
          {t('quizV3.done.cta')}
        </Button>
      </div>
    </div>
  );
}
