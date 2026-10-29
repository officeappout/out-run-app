'use client';

/** Screen 1 (board Bodyweight): the lemur's welcome, what calisthenics is, the push ladder, skills. */
import type { ReactNode } from 'react';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import PushLadderCard from './PushLadderCard';
import { RevealBlock, RevealText } from './Reveal';
import { revealEnd } from './reveal-timing';

export default function WelcomeCalisthenicsScreen() {
  const t = useT(onboarding);
  const bubble = t('quizV3.welcome.bubble');
  const title = t('quizV3.welcome.title');
  const body = t('quizV3.welcome.body');
  // Y4: the bubble, then the title, then the body type in; the cards follow.
  const titleAt = revealEnd(bubble, 0.15);
  const bodyAt = revealEnd(title, titleAt);
  const cardsAt = revealEnd(body, bodyAt);
  return (
    <div className="w-full max-w-md mx-auto px-5 py-4 flex flex-col gap-3.5 text-v2-ink" data-quiz-v3="welcome">
      <div className="flex items-end gap-3">
        <img
          src="/assets/lemur/lemur-avatar.png"
          alt={t('quizV3.welcome.lemurAlt')}
          className="w-[88px] h-[88px] object-contain shrink-0"
        />
        <RevealText
          text={bubble}
          delay={0.15}
          className="m-0 bg-white rounded-[22px] rounded-es-md px-3.5 py-3 shadow-v2-card text-[15px] leading-[22px] font-semibold"
        />
      </div>

      <RevealText as="h1" text={title} delay={titleAt} className="m-0 text-[28px] leading-[34px] font-black tracking-v2-tighter" />
      <RevealText text={body} delay={bodyAt} className="m-0 text-[15px] leading-[23px] text-v2-ink-2" />

      <RevealBlock delay={cardsAt}>
        <PushLadderCard />
      </RevealBlock>

      <RevealBlock delay={cardsAt + 0.3} className="flex items-center gap-3 bg-white rounded-[20px] px-3.5 py-3 shadow-v2-ring">
        <span className="w-11 h-11 rounded-v2-tile bg-v2-tint flex items-center justify-center shrink-0">
          <img src="/icons/programs/planche.svg" alt="" className="w-[30px]" />
        </span>
        <span className="text-[14px] leading-[21px]">
          {t.rich('quizV3.welcome.skills', { b: (c: ReactNode) => <b>{c}</b> })}
        </span>
      </RevealBlock>
    </div>
  );
}
