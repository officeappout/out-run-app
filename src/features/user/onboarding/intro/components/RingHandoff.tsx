'use client';

import React, { useLayoutEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RING_GREY, RING_TONES } from '../intro-copy';
import {
  HANDOFF_BG, HANDOFF_GREY, HANDOFF_S, handoffRingTrack, trackProps,
} from '../story-timeline';
import { BarrierRing } from './BarrierRing';
import { canvasCenter, cy } from './IntroCanvas';

const RING_BOX = 300;
const RING_LEFT = 45;
const RING_TOP = cy(250);
/** The badge's mini ring box (StoryHeader). */
const MINI_BOX = 22;
/** Mockup fallback if the badge can't be measured. */
const FALLBACK = { dx: 45, dy: -337, scale: 0.075 };

export interface RingHandoffProps {
  /** The barrier this screen is about — its segment stays lit. */
  index: number;
  /** The badge's mini ring (the landing spot). */
  target: React.RefObject<HTMLElement>;
}

/**
 * The 2.4 s hand-off at the start of each story (enable_entry_intro_v1): the big
 * ring is still centred, this barrier's segment is coloured and the others fade,
 * then the ring shrinks and flies into the header badge. Canvas coordinates; the
 * parent unmounts it after HANDOFF_S.
 */
export function RingHandoff({ index, target }: RingHandoffProps) {
  const [fly, setFly] = useState<typeof FALLBACK | null>(null);

  useLayoutEffect(() => {
    const c = canvasCenter(target.current);
    if (!c) {
      setFly(FALLBACK);
      return;
    }
    setFly({
      dx: c.x - (RING_LEFT + RING_BOX / 2),
      dy: c.y - (RING_TOP + RING_BOX / 2),
      scale: MINI_BOX / RING_BOX,
    });
  }, [target]);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-40"
      {...trackProps(HANDOFF_BG, HANDOFF_S, { reduce: false })}
    >
      <div
        className="absolute inset-x-0"
        style={{
          top: cy(236),
          height: 480,
          background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, #fff 8%, #fff 92%, rgba(255,255,255,0) 100%)',
        }}
      />
      {fly && (
        <motion.div
          className="absolute"
          style={{ left: RING_LEFT, top: RING_TOP, transformOrigin: '50% 50%' }}
          {...trackProps(handoffRingTrack(fly.dx, fly.dy, fly.scale), HANDOFF_S, { reduce: false })}
        >
          <BarrierRing
            size={RING_BOX}
            r={110}
            stroke={26}
            colorOf={(i) => (i === index ? RING_TONES[i] : RING_GREY)}
            segMotion={(i) => (i === index ? undefined : trackProps(HANDOFF_GREY, HANDOFF_S, { reduce: false }))}
          />
        </motion.div>
      )}
    </motion.div>
  );
}
