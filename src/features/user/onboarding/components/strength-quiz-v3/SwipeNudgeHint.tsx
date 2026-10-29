'use client';

/** The finger that rides the cards' nudge (owner 28.10, Y2). Sits on the centre card's image, never on its text. */
import { motion } from 'framer-motion';
import { Pointer } from 'lucide-react';
import { NUDGE_DURATION_S, NUDGE_REPEAT_DELAY_S, nudgeKeyframes } from './swipe-nudge';

export default function SwipeNudgeHint({ label, rtl, reduce }: { label: string; rtl: boolean; reduce: boolean }) {
  return (
    <span className="pointer-events-none absolute inset-x-0 top-[34%] z-20 flex justify-center" data-swipe-hint>
      <motion.span
        className="grid h-12 w-12 place-items-center rounded-full bg-white/95 text-v2-ink shadow-v2-float"
        animate={reduce ? undefined : { x: nudgeKeyframes(rtl) }}
        transition={reduce ? undefined : { duration: NUDGE_DURATION_S, ease: 'easeInOut', repeat: Infinity, repeatDelay: NUDGE_REPEAT_DELAY_S }}
      >
        <Pointer size={24} strokeWidth={2} aria-hidden />
      </motion.span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
