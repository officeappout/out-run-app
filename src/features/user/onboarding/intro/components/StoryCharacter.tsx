'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { INTRO_IMG, type BarrierStory } from '../intro-copy';
import { SAD, STORY_S, THINK, happyTrack, trackProps } from '../story-timeline';
import { cy } from './IntroCanvas';

const DEEP = '#007399';
const HAPPY = 124;

export interface StoryCharacterProps {
  story: BarrierStory;
  reduce: boolean;
  delay: number;
}

/**
 * The story's person (enable_entry_intro_v1): the sad version, big, with the
 * name + age and a thought bubble → crossfades to the happy version, which then
 * shrinks into the bottom corner (their side). Canvas coordinates, per the mockup.
 */
export function StoryCharacter({ story, reduce, delay }: StoryCharacterProps) {
  const left = story.side === 'left';
  const t = (track: Parameters<typeof trackProps>[0]) => trackProps(track, STORY_S, { reduce, delay });

  return (
    <>
      <motion.div
        className="absolute z-10 flex h-[300px] w-[300px] justify-center"
        style={{ left: left ? -30 : 90, top: cy(388) }}
        {...t(SAD)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${INTRO_IMG}/sad-${story.id}.jpg`}
          alt=""
          className="h-[300px] max-w-none"
          style={{ mixBlendMode: 'multiply' }}
        />
      </motion.div>

      <motion.div
        className="absolute z-10 w-[140px] text-center text-[14px] font-bold"
        style={{ left: left ? 50 : 170, top: cy(692), color: DEEP }}
        {...t(SAD)}
      >
        {story.person}
      </motion.div>

      <motion.div
        className="absolute z-30 w-[220px] rounded-[22px] bg-white px-3.5 py-3 text-[15px] font-semibold leading-[21px]"
        style={{
          left: left ? 118 : 40,
          top: cy(300),
          boxShadow: '0 10px 26px rgba(9,20,50,0.14)',
          transformOrigin: left ? 'right bottom' : 'left bottom',
        }}
        {...t(THINK)}
      >
        {story.thought}
        <span
          className="absolute -bottom-3 h-3.5 w-3.5 rounded-full bg-white"
          style={{ [left ? 'left' : 'right']: 24, boxShadow: '0 4px 10px rgba(9,20,50,0.1)' }}
        />
        <span
          className="absolute -bottom-6 h-2 w-2 rounded-full bg-white"
          style={{ [left ? 'left' : 'right']: 12 }}
        />
      </motion.div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <motion.img
        src={`${INTRO_IMG}/happy-${story.id}.png`}
        alt={story.person}
        className="absolute z-20 object-contain"
        style={{
          [left ? 'left' : 'right']: 8,
          top: cy(844 - 84 - HAPPY),
          width: HAPPY,
          height: HAPPY,
        }}
        {...t(happyTrack(story.side))}
      />
    </>
  );
}
