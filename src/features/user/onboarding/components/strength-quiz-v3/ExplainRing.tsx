'use client';

/**
 * Explainer 8 (board Explain2): "כל אימון ממלא את הטבעת". Owner 28.10 (Y8): the rings light up one
 * after another (5% → 60% → full), the last becomes the next level with confetti. Reduced motion:
 * the final frame at once, no confetti.
 */
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ArrowUp } from 'lucide-react';
import type { Gender } from '@/lib/i18n/core/i18n-core';
import CircularProgress from '@/components/CircularProgress';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import { firePhaseConfetti } from '../../utils/onboarding-confetti';
import { FINAL_RING_STAGE, RING_STAGE_AT_MS, RING_TARGETS, ringFrame, type RingStage } from './ring-sequence';
import { RevealBlock, RevealText } from './Reveal';
import { revealEnd } from './reveal-timing';

function Arrow({ lit }: { lit: boolean }) {
  return <ChevronLeft size={22} className={clsx('flex-shrink-0 transition-colors duration-300 ltr:-scale-x-100', lit ? 'text-v2-accent' : 'text-v2-hairline')} aria-hidden />;
}

function useRingStage(reduce: boolean): RingStage {
  const [stage, setStage] = useState<RingStage>(reduce ? FINAL_RING_STAGE : 0);
  useEffect(() => {
    if (reduce) { setStage(FINAL_RING_STAGE); return; }
    const timers = RING_STAGE_AT_MS.map((ms, i) => setTimeout(() => setStage((i + 1) as RingStage), ms));
    return () => timers.forEach(clearTimeout);
  }, [reduce]);
  return stage;
}

export default function ExplainRing({ level, gender }: { level: number; gender: Gender }) {
  const t = useT(onboarding);
  const reduce = !!useReducedMotion();
  const stage = useRingStage(reduce);
  const f = ringFrame(stage);
  const captions = [t('quizV3.explain2.today'), t('quizV3.explain2.later')];
  const title = t('quizV3.explain2.title');
  const bulletsAt = revealEnd(title, 0.1) + 0.2;

  useEffect(() => {
    if (f.levelUp && !reduce) void firePhaseConfetti();
  }, [f.levelUp, reduce]);

  return (
    <>
      <span className="self-start rounded-full bg-v2-tint px-3 py-1.5 text-[13px] font-extrabold text-v2-deep">{t('quizV3.explain2.tag')}</span>
      <RevealText as="h1" text={title} delay={0.1} className="m-0 text-[32px] font-black leading-[38px] tracking-v2-tighter" />
      <div className="flex items-center justify-between rounded-[28px] bg-white px-4 py-[18px] shadow-v2-card" aria-hidden data-ring-stage={stage}>
        {RING_TARGETS.map((target, i) => (
          <span key={target} className="contents">
            <span className={clsx('flex flex-col items-center gap-1.5 transition-opacity duration-300', f.lit[i] ? 'opacity-100' : 'opacity-40')}>
              <CircularProgress percentage={f.percents[i]} size={70} strokeWidth={7} colorClass="text-v2-accent" trackClass="text-v2-hairline">
                <span className="text-[14px] font-black text-v2-deep tabular-nums">{t('quizV3.explain2.ringPercent', { percent: f.percents[i] })}</span>
              </CircularProgress>
              <span className="text-[12px] font-bold text-v2-ink-2">{captions[i]}</span>
            </span>
            <Arrow lit={f.lit[i + 1]} />
          </span>
        ))}
        <span className={clsx('flex flex-col items-center gap-1.5 transition-opacity duration-300', f.lit[2] ? 'opacity-100' : 'opacity-40')}>
          {f.levelUp ? (
            <motion.span
              className="flex h-[70px] w-[70px] flex-col items-center justify-center rounded-full bg-v2-cta text-v2-on-cta"
              initial={reduce ? false : { scale: 0.6 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 14 }}
            >
              <ArrowUp size={16} strokeWidth={3} />
              <span className="text-[14px] font-black">{t('quizV3.explain2.ringLevel', { level: level + 1 })}</span>
            </motion.span>
          ) : (
            <CircularProgress percentage={f.lastPercent} size={70} strokeWidth={7} colorClass="text-v2-accent" trackClass="text-v2-hairline">
              <ArrowUp size={18} strokeWidth={3} className="text-v2-deep" />
            </CircularProgress>
          )}
          <span className="text-[12px] font-extrabold text-v2-ink">{t('quizV3.explain2.levelUp', { gender })}</span>
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {(['quizV3.explain2.bullet1', 'quizV3.explain2.bullet2', 'quizV3.explain2.bullet3'] as const).map((k, i) => (
          <li key={k}>
            <RevealBlock delay={bulletsAt + i * 0.3} className="flex gap-2.5 text-[15px] leading-[22px]">
              <span className="mt-[7px] h-2 w-2 flex-shrink-0 rounded-full bg-v2-accent" aria-hidden />
              {t(k, { gender })}
            </RevealBlock>
          </li>
        ))}
      </ul>
    </>
  );
}
