'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { V2_COLORS } from '@/components/ui/v2/tokens';
import { BARRIER_LABELS, INTRO_IMG, RING_TONES } from '../intro-copy';
import { LOGO_SLOT_ATTR } from '../intro-route';
import { EASE_BACK, EASE_CSS, EASE_IN_OUT, EASE_OUT, tween } from '../story-timeline';
import {
  RING_CLOSE_BEATS as B, SLOT_POLL_MS, SLOT_WAIT_S, ringClosePlan, ringCloseScale, type RingClosePlan,
} from '../ring-close-timeline';
import { BarrierRing } from './BarrierRing';

const RING = 300;
const LOGO_W = 296;
const LOGO_H = 110;
/** Mockup: ring/logo centred at y = 400 of 844. */
const CENTER_Y = 400 / 844;

type Rest = { dx: number; dy: number; scale: number; found: boolean };

/** The headline's logo slot, if it is on screen and laid out. */
function measureSlot(cx: number, cy: number): Rest | null {
  const slot = document.querySelector(`[${LOGO_SLOT_ATTR}]`);
  const r = slot?.getBoundingClientRect();
  if (!r || r.width <= 0 || r.height <= 0) return null;
  return { dx: r.left + r.width / 2 - cx, dy: r.top + r.height / 2 - cy, scale: r.width / LOGO_W, found: true };
}

/** No slot after the wait (e.g. the globe presentation is off): rise to the top and fade with the veil. */
function noSlot(cy: number): Rest {
  return { dx: 0, dy: -(cy - 90), scale: 0.32, found: false };
}

/**
 * The ring closes into the globe (enable_entry_intro_v1, mockup intro-G1): the
 * five coloured segments pop in, the ring closes, it crossfades into the OUT
 * logotype (its own proportions — the ring is not scaled into the "O"), the logo
 * rises into the globe headline's logo slot — waiting for that slot to exist, see
 * ring-close-timeline.ts — and only then the veil lifts over the location step.
 * Played only on the hop from /intro.
 * z-[100]: the full-screen overlay tier (.cursorrules Z-Index Budget).
 */
export function RingCloseOverlay({ onDone }: { onDone: () => void }) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [rest, setRest] = useState<Rest | null>(null);
  const [plan, setPlan] = useState<RingClosePlan | null>(null);
  // The caller's callback may change identity every render — never restart the timeline for it.
  const done = useRef(onDone);
  done.current = onDone;

  useLayoutEffect(() => {
    setBox({ w: window.innerWidth, h: window.innerHeight });
  }, []);

  useEffect(() => {
    if (!box) return;
    const t0 = performance.now();
    const elapsed = () => (performance.now() - t0) / 1000;
    const cx = box.w / 2;
    const cy = box.h * CENTER_Y;
    let timer = 0;
    let end = 0;

    const start = (r: Rest) => {
      const p = ringClosePlan(r.found ? elapsed() : null);
      setRest(r);
      setPlan(p);
      end = window.setTimeout(() => done.current(), Math.max(0, p.doneAt - elapsed()) * 1000);
    };
    const look = () => {
      const r = measureSlot(cx, cy);
      if (r) return start(r);
      if (elapsed() >= B.riseAt + SLOT_WAIT_S) return start(noSlot(cy));
      timer = window.setTimeout(look, SLOT_POLL_MS);
    };
    timer = window.setTimeout(look, B.riseAt * 1000);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(end);
    };
  }, [box]);

  if (!box) return <div className="fixed inset-0 z-[100] bg-[#f8fafc]" />;

  const k = ringCloseScale(box.w);
  const cy = box.h * CENTER_Y;
  const pop = (i: number) =>
    tween(
      { opacity: 0, scale: 0.6, rotate: -30 },
      { opacity: 1, scale: 1, rotate: 0 },
      { duration: 0.45, ease: EASE_BACK, delay: 0.1 + 0.25 * i },
      false,
    );

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[100]">
      {/* The veil: lifts only once the logo has landed in its slot. */}
      <motion.div
        className="absolute inset-0 bg-[#f8fafc]"
        initial={{ opacity: 1 }}
        animate={{ opacity: plan ? 0 : 1 }}
        transition={plan ? { duration: B.veilS, delay: plan.veilStart - plan.riseStart, ease: EASE_OUT } : { duration: 0 }}
      />

      <motion.div
        className="absolute"
        style={{ left: box.w / 2 - RING / 2, top: cy - RING / 2, scale: k }}
        initial={{ opacity: 1 }}
        animate={{ opacity: [1, 1, 0], scale: [k, k, 0.6 * k] }}
        transition={{ duration: B.crossfadeEnd, times: [0, B.crossfadeAt / B.crossfadeEnd, 1], ease: EASE_IN_OUT }}
      >
        <BarrierRing
          size={RING}
          r={120}
          stroke={30}
          padDeg={7}
          colorOf={(i) => RING_TONES[i]}
          segMotion={pop}
          labels={{
            texts: BARRIER_LABELS,
            radius: 178,
            width: 68,
            className: 'text-[14px] font-bold text-[#007399]',
            motionOf: pop,
          }}
        >
          <motion.svg
            width={RING}
            height={RING}
            viewBox={`0 0 ${RING} ${RING}`}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0, 1] }}
            transition={{ duration: B.closeAt + 0.4, times: [0, B.closeAt / (B.closeAt + 0.4), 1], ease: EASE_CSS }}
          >
            <defs>
              <linearGradient id="introRingClose" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={V2_COLORS.accent} />
                <stop offset="1" stopColor="#0cf2e3" />
              </linearGradient>
            </defs>
            <circle cx={RING / 2} cy={RING / 2} r={120} fill="none" stroke="url(#introRingClose)" strokeWidth={44} />
          </motion.svg>
        </BarrierRing>
      </motion.div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <motion.img
        src={`${INTRO_IMG}/logo-out.svg`}
        alt=""
        className="absolute max-w-none"
        style={{ left: box.w / 2 - LOGO_W / 2, top: cy - LOGO_H / 2, width: LOGO_W, height: LOGO_H }}
        initial={{ opacity: 0, scale: 0.7 }}
        animate={
          rest
            ? { opacity: rest.found ? 1 : 0, x: rest.dx, y: rest.dy, scale: rest.scale }
            : { opacity: [0, 0, 1], scale: [0.7, 0.7, 1] }
        }
        transition={
          rest
            ? { duration: B.riseS, ease: EASE_IN_OUT }
            : { duration: B.crossfadeEnd, times: [0, B.crossfadeAt / B.crossfadeEnd, 1], ease: EASE_IN_OUT }
        }
      />
    </div>
  );
}
