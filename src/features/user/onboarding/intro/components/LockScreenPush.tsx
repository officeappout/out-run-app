'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { INTRO_UI } from '../intro-copy';
import { trackProps, type Track } from '../story-timeline';
import type { StoryTracks } from '../story-schedule';

export interface LockScreenPushProps {
  clock: string;
  push: string;
  tracks: Pick<StoryTracks, 'total' | 'push' | 'tap' | 'lock'>;
  reduce: boolean;
  /** Seconds to wait before the story starts (the ring hand-off). */
  delay: number;
}

/** "יום שלישי, 20 באוקטובר" — today, the way the iOS lock screen writes it. */
function lockDate(): string {
  try {
    return new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  } catch {
    return '';
  }
}

/**
 * The lock screen inside the story phone (enable_entry_intro_v1): date, big
 * clock, the OUT push sliding in, a finger tapping it — then the whole lock
 * screen fades away to the app screen underneath.
 */
export function LockScreenPush({ clock, push, tracks, reduce, delay }: LockScreenPushProps) {
  const date = useMemo(lockDate, []);
  const t = (track: Track) => trackProps(track, tracks.total, { reduce, delay });

  return (
    <motion.div
      className="absolute inset-0 z-20 flex flex-col items-center pt-11"
      style={{ background: 'linear-gradient(170deg, #1c4a5e 0%, #0f2c3a 55%, #0b1f2a 100%)' }}
      {...t(tracks.lock)}
    >
      <span className="text-[12px] text-white/80">{date}</span>
      <span className="text-[58px] font-semibold leading-[64px] text-white" dir="ltr">{clock}</span>
      <motion.div className="mt-[22px] w-[216px]" {...t(tracks.push)}>
        <div
          className="flex gap-2.5 rounded-[18px] border border-white/90 bg-white/[0.88] px-[13px] py-[11px] text-right backdrop-blur-[14px] backdrop-saturate-[1.8]"
          style={{ boxShadow: '0 16px 36px -14px rgba(9,20,50,0.4), 0 0 0 1px rgba(14,27,42,0.05)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/logo/logo-mark.png"
            alt=""
            className="h-[34px] w-[34px] flex-none rounded-[9px] bg-white object-contain shadow-v2-ring"
          />
          <div className="min-w-0 flex-1">
            <div className="flex justify-between gap-2">
              <span className="text-[13px] font-bold text-[#1a2530]">{INTRO_UI.pushApp}</span>
              <span className="text-[11px] text-[#8a98a4]">{INTRO_UI.pushNow}</span>
            </div>
            <p className="m-0 mt-0.5 text-[12.5px] leading-[17px] text-[#1a2530]">{push}</p>
          </div>
        </div>
      </motion.div>
      <motion.span
        aria-hidden
        className="absolute h-[34px] w-[34px] rounded-full bg-white/50"
        style={{ left: 110, top: 186, boxShadow: '0 0 0 7px rgba(255,255,255,0.18)' }}
        {...t(tracks.tap)}
      />
    </motion.div>
  );
}
