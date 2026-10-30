'use client';
/**
 * FloatingStatusChip — the calm in-workout status chip (first built as the strength "goal reached"
 * chip, 3e): top-centre, non-blocking (pointer-events none), polite live region, a short drop-in;
 * reduced motion → a plain fade. The caller owns when it shows (`chipKey` null = hidden) and how
 * long; a new key replays the entrance.
 */
import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

export interface FloatingStatusChipProps {
  /** null = hidden. A new key replays the entrance. */
  chipKey: string | null;
  children?: React.ReactNode;
  /** CSS `top`. Default: under the status bar + 72px. */
  top?: string;
  /** The pill's own classes. Default: the goal-reached pill. */
  pillClassName?: string;
}

const DEFAULT_PILL = 'rounded-full bg-white/95 dark:bg-slate-800/95 shadow-v2-card px-4 py-2 text-sm font-bold text-slate-800 dark:text-white';

export default function FloatingStatusChip({ chipKey, children, top, pillClassName }: FloatingStatusChipProps) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {chipKey && (
        <motion.div
          key={chipKey}
          role="status"
          aria-live="polite"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.96 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-4"
          style={{ top: top ?? 'calc(env(safe-area-inset-top, 0px) + 72px)' }}
        >
          <div className={pillClassName ?? DEFAULT_PILL}>{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
