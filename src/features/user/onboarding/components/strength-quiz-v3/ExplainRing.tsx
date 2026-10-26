'use client';

/** Explainer 8 (board Explain2): "כל אימון ממלא את הטבעת", rings 5% → 60% → level up, three bullets. */
import { ChevronLeft, ArrowUp } from 'lucide-react';
import type { Gender } from '@/lib/i18n/core/i18n-core';
import CircularProgress from '@/components/CircularProgress';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';

/** Illustration values from the board (not user data). */
const RING_STEPS = [5, 60] as const;

function Arrow() {
  return <ChevronLeft size={22} className="flex-shrink-0 text-v2-muted ltr:-scale-x-100" aria-hidden />;
}

export default function ExplainRing({ level, gender }: { level: number; gender: Gender }) {
  const t = useT(onboarding);
  const captions = [t('quizV3.explain2.today'), t('quizV3.explain2.later')];
  return (
    <>
      <span className="self-start rounded-full bg-v2-tint px-3 py-1.5 text-[13px] font-extrabold text-v2-deep">{t('quizV3.explain2.tag')}</span>
      <h1 className="m-0 text-[32px] font-black leading-[38px] tracking-v2-tighter">{t('quizV3.explain2.title')}</h1>
      <div className="flex items-center justify-between rounded-[28px] bg-white px-4 py-[18px] shadow-v2-card" aria-hidden>
        {RING_STEPS.map((pct, i) => (
          <span key={pct} className="contents">
            <span className="flex flex-col items-center gap-1.5">
              <CircularProgress percentage={pct} size={70} strokeWidth={7} colorClass="text-v2-accent" trackClass="text-v2-hairline">
                <span className="text-[14px] font-black text-v2-deep tabular-nums">{t('quizV3.explain2.ringPercent', { percent: pct })}</span>
              </CircularProgress>
              <span className="text-[12px] font-bold text-v2-ink-2">{captions[i]}</span>
            </span>
            <Arrow />
          </span>
        ))}
        <span className="flex flex-col items-center gap-1.5">
          <span className="flex h-[70px] w-[70px] flex-col items-center justify-center rounded-full bg-v2-cta text-v2-on-cta">
            <ArrowUp size={16} strokeWidth={3} />
            <span className="text-[14px] font-black">{t('quizV3.explain2.ringLevel', { level: level + 1 })}</span>
          </span>
          <span className="text-[12px] font-extrabold text-v2-ink">{t('quizV3.explain2.levelUp', { gender })}</span>
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {(['quizV3.explain2.bullet1', 'quizV3.explain2.bullet2', 'quizV3.explain2.bullet3'] as const).map((k) => (
          <li key={k} className="flex gap-2.5 text-[15px] leading-[22px]">
            <span className="mt-[7px] h-2 w-2 flex-shrink-0 rounded-full bg-v2-accent" aria-hidden />
            {t(k, { gender })}
          </li>
        ))}
      </ul>
    </>
  );
}
