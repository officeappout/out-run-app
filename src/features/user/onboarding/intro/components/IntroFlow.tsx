'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useT } from '@/hooks/useT';
import { onboarding as onboardingNs } from '@/messages/ns/onboarding';
import { BARRIER_STORY_META, barrierStories, storyImages } from '../intro-copy';
import { BarrierBridge } from './BarrierBridge';
import { StoryScreen } from './StoryScreen';

/** -1 = the bridge, 0..4 = the stories. */
type Step = number;

function preload(srcs: string[]) {
  if (typeof window === 'undefined') return;
  for (const src of srcs) {
    const img = new window.Image();
    img.decoding = 'async';
    img.src = src;
  }
}

export interface IntroFlowProps {
  /** Finished or skipped — the caller marks "seen" and goes to the globe. */
  onDone: () => void;
}

/**
 * The intro (enable_entry_intro_v1): the bridge, then the five barrier stories
 * in ring order. Preloads the next screen's images; after the 5th "הבא" (or any
 * "דלג") hands over to the globe.
 */
export function IntroFlow({ onDone }: IntroFlowProps) {
  const reduce = !!useReducedMotion();
  const [step, setStep] = useState<Step>(-1);
  const t = useT(onboardingNs);
  const stories = useMemo(() => barrierStories(t), [t]);

  useEffect(() => {
    const next = BARRIER_STORY_META[step + 1];
    if (next) preload(storyImages(next));
  }, [step]);

  const next = useCallback(() => {
    if (step >= BARRIER_STORY_META.length - 1) onDone();
    else setStep(step + 1);
  }, [step, onDone]);

  const story = step >= 0 ? stories[step] : null;

  return (
    <motion.div
      key={step}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      {story ? (
        <StoryScreen story={story} index={step} reduce={reduce} onNext={next} onSkip={onDone} />
      ) : (
        <BarrierBridge reduce={reduce} onNext={next} onSkip={onDone} />
      )}
    </motion.div>
  );
}
