'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { BARRIER_STORIES, INTRO_UI, RING_GREY, RING_TONES, type BarrierStory } from '../intro-copy';
import { BADGE, BADGE_S, trackProps } from '../story-timeline';
import { BarrierRing } from './BarrierRing';
import { cy } from './IntroCanvas';

const DEEP = '#007399';

export interface StoryHeaderProps {
  story: BarrierStory;
  index: number;
  reduce: boolean;
  /** The badge's mini ring — the hand-off ring flies into it. */
  ringRef: React.Ref<HTMLSpanElement>;
}

/**
 * Top of a story screen: the badge (mini ring lit up to this barrier + its name
 * + "i מתוך 5"), the two-line title and the sub. Canvas coordinates.
 */
export function StoryHeader({ story, index, reduce, ringRef }: StoryHeaderProps) {
  const total = BARRIER_STORIES.length;
  return (
    <div
      className="absolute inset-x-0 flex flex-col items-center gap-[9px] px-[26px] text-center"
      style={{ top: cy(48) }}
    >
      <motion.span
        className="flex h-[30px] items-center gap-[7px] rounded-full bg-white pe-3 ps-[5px] shadow-[0_4px_14px_rgba(9,20,50,0.08)]"
        {...trackProps(BADGE, BADGE_S, { reduce })}
      >
        <span ref={ringRef} className="block">
          <BarrierRing
            size={22}
            r={8}
            stroke={4}
            colorOf={(i) => (i <= index ? RING_TONES[i] : RING_GREY)}
          />
        </span>
        <span className="text-[13px] font-bold" style={{ color: DEEP }}>{story.barrier}</span>
        <span className="text-[12px] text-slate-400">{INTRO_UI.of(index + 1, total)}</span>
      </motion.span>
      <h1 className="m-0 text-[30px] font-bold leading-[35px] !tracking-[-0.02em]">
        {story.titleLines[0]}
        <br />
        {story.titleLines[1]}
      </h1>
      <p className="m-0 max-w-[320px] text-[15px] leading-[22px] text-v2-ink-2">{story.sub}</p>
    </div>
  );
}
