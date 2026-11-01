'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useT } from '@/hooks/useT';
import { onboarding as onboardingNs } from '@/messages/ns/onboarding';
import { BARRIER_STORY_META, barrierStories } from '../intro-copy';
import { introPreloadOrder, warmImages } from '../intro-preload';
import { BarrierBridge } from './BarrierBridge';
import { StoryScreen } from './StoryScreen';

/** -1 = the bridge, 0..4 = the stories. */
type Step = number;

/** The incoming screen fades in over the outgoing one (which stays fully painted underneath). */
const CROSSFADE_S = 0.22;

export interface IntroFlowProps {
  /** Finished or skipped — the caller marks "seen" and goes to the globe. */
  onDone: () => void;
}

/**
 * The intro (enable_entry_intro_v1): the bridge, then the five barrier stories
 * in ring order; after the 5th "הבא" (or any "דלג") hands over to the globe.
 *
 * Pilot note AJ2 (01.11): no blank frames between screens. The old screen was
 * unmounted and the new one faded up from opacity 0, so for a moment the page
 * behind (dark on iOS) showed through and every image re-appeared late. Now:
 *  - a white backdrop is always mounted under the screens;
 *  - the next screen fades in ON TOP of the previous one, which stays mounted
 *    and fully opaque until the fade is done (z-order follows the step);
 *  - every story image is requested and decoded as soon as the intro mounts,
 *    the next screen's first (intro-preload.ts).
 */
export function IntroFlow({ onDone }: IntroFlowProps) {
  const reduce = !!useReducedMotion();
  const [step, setStep] = useState<Step>(-1);
  const t = useT(onboardingNs);
  const stories = useMemo(() => barrierStories(t), [t]);
  const warmed = useRef(new Map());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    warmImages(introPreloadOrder(step), warmed.current, () => new window.Image());
  }, [step]);

  const next = useCallback(() => {
    if (step >= BARRIER_STORY_META.length - 1) onDone();
    else setStep(step + 1);
  }, [step, onDone]);

  const story = step >= 0 ? stories[step] : null;

  return (
    <>
      <div aria-hidden className="fixed inset-0 bg-white" />
      <AnimatePresence initial={false}>
        <motion.div
          key={step}
          className="fixed inset-0"
          style={{ zIndex: step + 2 }}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          // The outgoing screen holds its last frame under the incoming one, then goes.
          exit={{ opacity: 0.99, transition: { duration: CROSSFADE_S } }}
          transition={{ duration: CROSSFADE_S, ease: [0.23, 1, 0.32, 1] }}
        >
          {story ? (
            <StoryScreen story={story} index={step} reduce={reduce} onNext={next} onSkip={onDone} />
          ) : (
            <BarrierBridge reduce={reduce} onNext={next} onSkip={onDone} />
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
