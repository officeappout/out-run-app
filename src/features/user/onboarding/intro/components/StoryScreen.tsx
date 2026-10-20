'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { INTRO_IMG, INTRO_UI, type BarrierStory } from '../intro-copy';
import { HANDOFF_S, STORY_S, phoneTrack, trackProps } from '../story-timeline';
import { IntroShell } from './IntroShell';
import { cy } from './IntroCanvas';
import { StoryHeader } from './StoryHeader';
import { StoryCharacter } from './StoryCharacter';
import { PhoneFrame, PHONE_W } from './PhoneFrame';
import { LockScreenPush } from './LockScreenPush';
import { RingHandoff } from './RingHandoff';

export interface StoryScreenProps {
  story: BarrierStory;
  index: number;
  reduce: boolean;
  onNext: () => void;
  onSkip: () => void;
}

/**
 * One barrier story (enable_entry_intro_v1), data-driven by BARRIER_STORIES:
 * ring hand-off into the badge → the sad person + thought → the phone with the
 * push → it grows, a tap opens the app → the happy person settles in the corner.
 * Plays once and holds the last frame; "הבא" and "דלג" are live throughout.
 */
export function StoryScreen({ story, index, reduce, onNext, onSkip }: StoryScreenProps) {
  const badgeRing = useRef<HTMLSpanElement>(null);
  const [handoff, setHandoff] = useState(!reduce);
  const delay = reduce ? 0 : HANDOFF_S;

  useEffect(() => {
    if (!handoff) return;
    const id = window.setTimeout(() => setHandoff(false), HANDOFF_S * 1000);
    return () => window.clearTimeout(id);
  }, [handoff]);

  return (
    <IntroShell cta={INTRO_UI.next} onCta={onNext} onSkip={onSkip}>
      <StoryHeader story={story} index={index} reduce={reduce} ringRef={badgeRing} />

      <motion.div
        className="absolute z-0"
        style={{ left: '50%', marginLeft: -PHONE_W / 2, top: cy(232), transformOrigin: '50% 0' }}
        {...trackProps(phoneTrack(story.side), STORY_S, { reduce, delay })}
      >
        <PhoneFrame>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${INTRO_IMG}/phone-${story.phone}.jpg`}
            alt=""
            className="absolute inset-x-0 top-0 h-auto w-full"
          />
          <LockScreenPush clock={story.clock} push={story.push} reduce={reduce} delay={delay} />
        </PhoneFrame>
      </motion.div>

      <StoryCharacter story={story} reduce={reduce} delay={delay} />

      {handoff && <RingHandoff index={index} target={badgeRing} />}
    </IntroShell>
  );
}
