'use client';

/** Screen 2 (board Main): the short assessment intro. Three numbered steps, the reassurance, the video link. */
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import { RevealBlock, RevealText } from './Reveal';
import { revealEnd } from './reveal-timing';
import { PUSH_LADDER } from './quiz-v3-entry';
import { usePushLadderMedia } from './usePushLadderMedia';

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

/** Board Main's swipe strip, with the push ladder's real stills (owner 28.10, Y5): the chosen one outlined, an arrow to the end. */
function SwipeHint() {
  const media = usePushLadderMedia();
  const tile = 'relative overflow-hidden bg-v2-pill-border';
  const img = (i: number) => {
    const url = media[PUSH_LADDER[i].exerciseId]?.imageUrl;
    // eslint-disable-next-line @next/next/no-img-element
    return url ? <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null;
  };
  return (
    <div aria-hidden="true" className="flex items-center gap-1.5" data-swipe-strip>
      <span className={clsx(tile, 'w-10 h-[52px] rounded-xl opacity-80')}>{img(0)}</span>
      <span className={clsx(tile, 'w-12 h-[62px] rounded-v2-tile bg-white ring-2 ring-v2-accent')}>{img(1)}</span>
      <span className={clsx(tile, 'w-10 h-[52px] rounded-xl opacity-80')}>{img(2)}</span>
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
  const title = t('quizV3.main.title');
  // Y4: the title types in, then the steps arrive one by one.
  const stepsAt = revealEnd(title, 0.1);
  const at = (i: number) => stepsAt + i * 0.35;
  return (
    <div className="w-full max-w-md mx-auto px-5 py-4 flex flex-col gap-4 text-v2-ink" data-quiz-v3="assessment-intro">
      <RevealText as="h1" text={title} delay={0.1} className="m-0 text-[28px] leading-[34px] font-black tracking-v2-tight" />

      <ol className="flex flex-col gap-2.5 list-none m-0 p-0">
        <li>
          <RevealBlock delay={at(0)}>
            <StepRow n={1}>
              <p className="m-0 text-[15px] leading-[22px]">{t.rich('quizV3.main.step1', { b })}</p>
            </StepRow>
          </RevealBlock>
        </li>
        <li>
          <RevealBlock delay={at(1)}>
            <StepRow n={2}>
              <p className="m-0 text-[15px] leading-[22px]">{t.rich('quizV3.main.step2', { b })}</p>
              <SwipeHint />
            </StepRow>
          </RevealBlock>
        </li>
        <li>
          <RevealBlock delay={at(2)}>
            <StepRow n={3}>
              <p className="m-0 text-[15px] leading-[22px]">{t.rich('quizV3.main.step3', { b })}</p>
            </StepRow>
          </RevealBlock>
        </li>
      </ol>

      <RevealBlock delay={at(3)}>
        <p className="m-0 bg-v2-tint rounded-2xl px-3.5 py-3 text-[14px] leading-[21px]">{t('quizV3.main.reassure')}</p>
      </RevealBlock>

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
