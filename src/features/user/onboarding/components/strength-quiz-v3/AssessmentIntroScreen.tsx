'use client';

/** Screen 2 (board Main): the short assessment intro. Three numbered steps, the reassurance, the video link. */
import type { ReactNode } from 'react';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';

function StepRow({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex gap-3 items-start bg-white rounded-[20px] px-4 py-3.5 shadow-v2-ring">
      <span className="w-8 h-8 rounded-full bg-v2-tint text-v2-deep font-black text-[15px] flex items-center justify-center shrink-0">
        {n}
      </span>
      <div className="flex flex-col gap-2 min-w-0">{children}</div>
    </div>
  );
}

/** The swipe hint drawn on the board: a strip of cards with the chosen one outlined, an arrow to the end. */
function SwipeHint() {
  return (
    <div aria-hidden="true" className="flex items-center gap-1.5">
      <span className="w-[34px] h-11 rounded-[10px] bg-v2-hairline" />
      <span className="w-10 h-[52px] rounded-xl bg-v2-pill-border" />
      <span className="w-12 h-[62px] rounded-v2-tile bg-white ring-2 ring-v2-accent" />
      <span className="w-10 h-[52px] rounded-xl bg-v2-pill-border" />
      <svg width="40" height="20" viewBox="0 0 40 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-v2-deep ltr:-scale-x-100">
        <path d="M38 10H4M10 4l-6 6 6 6" />
      </svg>
    </div>
  );
}

export interface AssessmentIntroScreenProps {
  /** TODO(strength-quiz-v3): wire the short explainer video once it is filmed. Absent = the link does nothing. */
  onExplainerVideo?: () => void;
}

export default function AssessmentIntroScreen({ onExplainerVideo }: AssessmentIntroScreenProps) {
  const t = useT(onboarding);
  const b = (c: ReactNode) => <b>{c}</b>;
  return (
    <div className="w-full max-w-md mx-auto px-5 py-4 flex flex-col gap-4 text-v2-ink" data-quiz-v3="assessment-intro">
      <h1 className="m-0 text-[28px] leading-[34px] font-black tracking-v2-tight">{t('quizV3.main.title')}</h1>

      <ol className="flex flex-col gap-2.5 list-none m-0 p-0">
        <li>
          <StepRow n={1}>
            <p className="m-0 text-[15px] leading-[22px]">{t.rich('quizV3.main.step1', { b })}</p>
          </StepRow>
        </li>
        <li>
          <StepRow n={2}>
            <p className="m-0 text-[15px] leading-[22px]">{t.rich('quizV3.main.step2', { b })}</p>
            <SwipeHint />
          </StepRow>
        </li>
        <li>
          <StepRow n={3}>
            <p className="m-0 text-[15px] leading-[22px]">{t.rich('quizV3.main.step3', { b })}</p>
          </StepRow>
        </li>
      </ol>

      <p className="m-0 bg-v2-tint rounded-2xl px-3.5 py-3 text-[14px] leading-[21px]">{t('quizV3.main.reassure')}</p>

      <button
        type="button"
        onClick={onExplainerVideo}
        className="flex items-center justify-center gap-2 h-11 text-[14px] font-extrabold text-v2-deep"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M10 8.5l5 3.5-5 3.5z" fill="currentColor" />
        </svg>
        {t('quizV3.main.videoLink')}
      </button>
    </div>
  );
}
