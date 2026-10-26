'use client';

/** Screen 1 (board Bodyweight): the lemur's welcome, what calisthenics is, the push ladder, skills. */
import type { ReactNode } from 'react';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import PushLadderCard from './PushLadderCard';

export default function WelcomeCalisthenicsScreen() {
  const t = useT(onboarding);
  return (
    <div className="w-full max-w-md mx-auto px-5 py-4 flex flex-col gap-3.5 text-v2-ink" data-quiz-v3="welcome">
      <div className="flex items-end gap-3">
        <img
          src="/assets/lemur/lemur-avatar.png"
          alt={t('quizV3.welcome.lemurAlt')}
          className="w-[88px] h-[88px] object-contain shrink-0"
        />
        <p className="m-0 bg-white rounded-[22px] rounded-es-md px-3.5 py-3 shadow-v2-card text-[15px] leading-[22px] font-semibold">
          {t('quizV3.welcome.bubble')}
        </p>
      </div>

      <h1 className="m-0 text-[28px] leading-[34px] font-black tracking-v2-tighter">{t('quizV3.welcome.title')}</h1>
      <p className="m-0 text-[15px] leading-[23px] text-v2-ink-2">{t('quizV3.welcome.body')}</p>

      <PushLadderCard />

      <div className="flex items-center gap-3 bg-white rounded-[20px] px-3.5 py-3 shadow-v2-ring">
        <span className="w-11 h-11 rounded-v2-tile bg-v2-tint flex items-center justify-center shrink-0">
          <img src="/icons/programs/planche.svg" alt="" className="w-[30px]" />
        </span>
        <span className="text-[14px] leading-[21px]">
          {t.rich('quizV3.welcome.skills', { b: (c: ReactNode) => <b>{c}</b> })}
        </span>
      </div>
    </div>
  );
}
