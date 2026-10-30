'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { V2_COLORS } from '@/components/ui/v2/tokens';
import { useT } from '@/hooks/useT';
import { onboarding as onboardingNs } from '@/messages/ns/onboarding';
import { barrierLabels, INTRO_IMG, RING_TONES } from '../intro-copy';
import { LOGO_SLOT_ATTR } from '../intro-route';
import { EASE_BACK, EASE_CSS, EASE_IN_OUT, EASE_OUT, tween } from '../story-timeline';
import {
  RING_CLOSE_BEATS as B, SLOT_POLL_MS, SLOT_WAIT_S, popDelay, ringClosePlan, ringCloseScale, type RingClosePlan,
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
 * five coloured segments assemble, the ring closes, it condenses into the OUT
 * logotype (its own proportions: the ring is not scaled into the "O"), and the
 * logo rises into the globe headline's logo slot the moment it is formed, while
 * the veil lifts under it; see ring-close-timeline.ts (pilot note AF2). If the
 * slot isn't there yet the logo breathes on the centre until it is.
 * Played only on the hop from /intro.
 * z-[100]: the full-screen overlay tier (.cursorrules Z-Index Budget).
 */
export function RingCloseOverlay({ onDone }: { onDone: () => void }) {
  const labels = barrierLabels(useT(onboardingNs));
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [rest, setRest] = useState<Rest | null>(null);
  const [plan, setPlan] = useState<RingClosePlan | null>(null);
  // The logo is formed but its slot isn't there yet: keep it alive, never frozen.
  const [waiting, setWaiting] = useState(false);
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
    const timers: number[] = [];
    const at = (s: number, fn: () => void) => {
      timers.push(window.setTimeout(fn, Math.max(0, s - elapsed()) * 1000));
    };
    let poll = 0;

    const schedule = (foundAt: number | null) => {
      const p = ringClosePlan(foundAt);
      at(p.riseStart, () => {
        // Re-measure at take-off: the slot's layout may have settled since it was first seen.
        setRest(foundAt == null ? noSlot(cy) : measureSlot(cx, cy) ?? noSlot(cy));
        setPlan(p);
      });
      at(p.doneAt, () => done.current());
    };
    // Look for the slot from the first frame, so a ready globe never costs a hold.
    const look = () => {
      if (measureSlot(cx, cy)) return schedule(elapsed());
      if (elapsed() >= B.riseAt + SLOT_WAIT_S) return schedule(null);
      poll = window.setTimeout(look, SLOT_POLL_MS);
    };
    look();
    at(B.crossfadeEnd, () => setWaiting(true));
    return () => {
      window.clearTimeout(poll);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [box]);

  if (!box) return <div className="fixed inset-0 z-[100] bg-[#f8fafc]" />;

  const k = ringCloseScale(box.w);
  const cy = box.h * CENTER_Y;
  const pop = (i: number) =>
    tween(
      { opacity: 0, scale: 0.6, rotate: -30 },
      { opacity: 1, scale: 1, rotate: 0 },
      { duration: B.popS, ease: EASE_BACK, delay: popDelay(i) },
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
        animate={{ opacity: [1, 1, 0], scale: [k, k, 0.45 * k] }}
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
            texts: labels,
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
            transition={{ duration: B.closeAt + B.closeS, times: [0, B.closeAt / (B.closeAt + B.closeS), 1], ease: EASE_CSS }}
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
        // Comes in from slightly larger while the ring shrinks: both move inward, one gesture.
        initial={{ opacity: 0, scale: 1.25 }}
        animate={
          rest
            ? { opacity: rest.found ? 1 : 0, x: rest.dx, y: rest.dy, scale: rest.scale }
            : waiting
              ? { opacity: 1, scale: [1, 1.04, 1] }
              : { opacity: [0, 0, 1], scale: [1.25, 1.25, 1] }
        }
        transition={
          rest
            ? { duration: B.riseS, ease: EASE_IN_OUT }
            : waiting
              ? { duration: 1.2, ease: EASE_IN_OUT, repeat: Infinity }
              : { duration: B.crossfadeEnd, times: [0, B.crossfadeAt / B.crossfadeEnd, 1], ease: EASE_IN_OUT }
        }
      />
    </div>
  );
}
