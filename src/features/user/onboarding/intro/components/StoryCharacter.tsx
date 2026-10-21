'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { INTRO_IMG, type BarrierStory } from '../intro-copy';
import { trackProps, type Track } from '../story-timeline';
import type { StoryTracks } from '../story-schedule';
import { cy } from './IntroCanvas';

const DEEP = '#007399';
const HAPPY = 124;

export interface StoryCharacterProps {
  story: BarrierStory;
  tracks: StoryTracks;
  reduce: boolean;
  delay: number;
}

/**
 * The story's person (enable_entry_intro_v1): the sad version, big, with the
 * name + age and a thought bubble (held long enough to read) → fades as the
 * phone grows → the happy version settles into the bottom corner (their side)
 * once the push was tapped. Canvas coordinates, per the mockup.
 */
export function StoryCharacter({ story, tracks, reduce, delay }: StoryCharacterProps) {
  const left = story.side === 'left';
  const t = (track: Track) => trackProps(track, tracks.total, { reduce, delay });

  return (
    <>
      <motion.div
        className="absolute z-10 flex h-[300px] w-[300px] justify-center"
        style={{ left: left ? -30 : 90, top: cy(388) }}
        {...t(tracks.sad)}
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
        {...t(tracks.sad)}
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
        {...t(tracks.think)}
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
        {...t(tracks.happy)}
      />
    </>
  );
}
