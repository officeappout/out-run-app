'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useT } from '@/hooks/useT';
import { onboarding as onboardingNs } from '@/messages/ns/onboarding';
import { barrierLabels, bridgeCopy, RING_GREY } from '../intro-copy';
import { EASE_BACK, EASE_CSS, tween } from '../story-timeline';
import { BarrierRing } from './BarrierRing';
import { IntroShell } from './IntroShell';
import { cy } from './IntroCanvas';

const DEEP = '#007399';

/** Fade-up, as the mockup's `up` keyframe. */
const up = (delay: number, reduce: boolean) =>
  tween({ opacity: 0, y: 12 }, { opacity: 1, y: 0 }, { duration: 0.6, ease: EASE_CSS, delay }, reduce);

/**
 * Segment i pops in at 0.25 s + 0.18 s·i (mockup `gIn`, tightened for pilot note
 * AJ2: the ring used to finish 2 s in and read as arriving late).
 */
const pop = (i: number, reduce: boolean) =>
  tween({ opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1 }, { duration: 0.4, ease: EASE_BACK, delay: 0.25 + 0.18 * i }, reduce);

export interface BarrierBridgeProps {
  reduce: boolean;
  onNext: () => void;
  onSkip: () => void;
}

/**
 * The bridge into the stories (enable_entry_intro_v1): "זו לא אשמתכם שקשה
 * להתמיד." — five reasons, the big grey ring whose segments pop in one by one
 * with their labels, then "וכל אחד מהם אפשר להסיר." and "בואו נראה".
 */
export function BarrierBridge({ reduce, onNext, onSkip }: BarrierBridgeProps) {
  const t = useT(onboardingNs);
  const copy = bridgeCopy(t);
  const labels = barrierLabels(t);
  return (
    <IntroShell cta={copy.cta} onCta={onNext} onSkip={onSkip}>
      <motion.div
        className="absolute inset-x-0 flex flex-col items-center gap-2.5 px-[26px] text-center"
        style={{ top: cy(56) }}
        {...up(0, reduce)}
      >
        <span className="text-[13px] font-bold" style={{ color: DEEP }}>{copy.eyebrow}</span>
        <h1 className="m-0 text-[29px] font-bold leading-[35px] !tracking-[-0.02em]">
          {copy.titleLines[0]}
          <br />
          {copy.titleLines[1]}
        </h1>
        <span className="text-[18px] font-bold" style={{ color: DEEP }}>{copy.lead}</span>
      </motion.div>

      <div className="absolute" style={{ left: 45, top: cy(250) }}>
        <BarrierRing
          size={300}
          r={110}
          stroke={26}
          colorOf={() => RING_GREY}
          segMotion={(i) => pop(i, reduce)}
          labels={{
            texts: labels,
            radius: 160,
            width: 72,
            className: 'text-[15px] font-bold text-slate-600',
            motionOf: (i) => pop(i, reduce),
          }}
        />
      </div>
      <ul className="sr-only">
        {labels.map((l) => <li key={l}>{l}</li>)}
      </ul>

      <motion.p
        className="absolute inset-x-[30px] m-0 text-center text-[16px] leading-6 text-v2-ink-2"
        style={{ top: cy(585) }}
        {...up(1.35, reduce)}
      >
        {copy.closingLines[0]}
        <br />
        {copy.closingLines[1]}
      </motion.p>
    </IntroShell>
  );
}
