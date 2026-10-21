'use client';

import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import { coachCopy, FINGER_RIDE_MS, NUDGE_PX, type CoachPill } from './strip-hint';

/**
 * The strength quiz's drag hint visuals (enable_strength_quiz_hint_v2, design Q2/Q3). All of it
 * is pointer-events-none and sits inside the strip's `relative` wrapper in VisualSlider — the
 * strip itself stays fully interactive, the video above stays visible (no mask). State lives in
 * useStripHint / strip-hint.ts; these components only draw it.
 */

interface StripDragHintProps {
  pill: CoachPill;
  isFemale: boolean;
  showEndLabels: boolean;
  showDemoFinger: boolean;
  showStaticFinger: boolean;
  fingerRun: number;
  reducedMotion?: boolean;
  fingerNode: ReactNode;
}

export default function StripDragHint({
  pill,
  isFemale,
  showEndLabels,
  showDemoFinger,
  showStaticFinger,
  fingerRun,
  reducedMotion = false,
  fingerNode,
}: StripDragHintProps) {
  const t = useT(onboarding);
  return (
    <>
      <CoachPillBubble pill={pill} isFemale={isFemale} pulse={!reducedMotion} />

      {/* "קל" on the right (the easiest tile is on the right — CoverflowStrip reverses), "קשה" on the left. */}
      <AnimatePresence>
        {showEndLabels && (
          <motion.div
            key="strip-end-labels"
            className="pointer-events-none absolute inset-x-4 top-0 z-30 flex justify-between text-[11px] font-extrabold text-v2-muted"
            dir="rtl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            aria-hidden
          >
            <span>{t('quiz.hint.easy')}</span>
            <span>{t('quiz.hint.hard')}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The demo's finger — one ride per "harder" move: grabs the tile left of centre and drags it in. */}
      {showDemoFinger && fingerRun > 0 && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center" aria-hidden>
          <motion.span
            key={fingerRun}
            className="mt-12 inline-block"
            initial={{ x: -NUDGE_PX, opacity: 0 }}
            animate={{ x: [-NUDGE_PX, -NUDGE_PX, 0, 0], opacity: [0, 1, 1, 0] }}
            transition={{ duration: FINGER_RIDE_MS / 1000, times: [0, 0.16, 0.7, 1], ease: 'easeInOut' }}
          >
            {fingerNode}
          </motion.span>
        </div>
      )}

      {/* Reduced motion: a still finger on the selected tile. */}
      {showStaticFinger && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center" aria-hidden>
          <span className="ml-8 mt-12 inline-block">{fingerNode}</span>
        </div>
      )}
    </>
  );
}

// Q2's soft pulse: the pill's own drop shadow + a brand-cyan halo that breathes out.
const PILL_SHADOW = '0 10px 24px rgba(9,20,50,0.22)';
const PULSE_SHADOW = [
  `${PILL_SHADOW}, 0 0 0 0 rgba(0,186,247,0.45)`,
  `${PILL_SHADOW}, 0 0 0 10px rgba(0,186,247,0)`,
];
const AFTER_RING = '0 0 0 2px rgba(0,186,247,0.35)';

/** The coach line, centred just above the strip with a small arrow down. Dark (intro) → light (after). */
function CoachPillBubble({ pill, isFemale, pulse }: { pill: CoachPill; isFemale: boolean; pulse: boolean }) {
  const t = useT(onboarding);
  const gender = isFemale ? 'female' : 'other';
  return (
    <AnimatePresence mode="wait">
      {pill && (
        <motion.div
          key={pill}
          className="pointer-events-none absolute inset-x-6 bottom-full z-30 mb-1"
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          dir="rtl"
          role="status"
        >
          <motion.div
            className={clsx(
              'relative flex flex-col items-center gap-0.5 rounded-[18px] px-4 py-[11px] text-center',
              pill === 'intro' ? 'bg-v2-ink text-white' : 'bg-white text-v2-ink',
            )}
            style={{ boxShadow: pill === 'after' ? `${PILL_SHADOW}, ${AFTER_RING}` : PULSE_SHADOW[0] }}
            animate={pulse && pill === 'intro' ? { boxShadow: [PULSE_SHADOW[0], PULSE_SHADOW[1], PULSE_SHADOW[0]] } : undefined}
            transition={pulse ? { duration: 2.2, delay: 0.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
          >
            <span className="text-[15px] font-extrabold leading-tight">{t(coachCopy(pill).title, { gender })}</span>
            <span className="text-[12.5px] font-bold leading-tight opacity-75">{t(coachCopy(pill).sub, { gender })}</span>
            <span
              className={clsx(
                'absolute -bottom-[7px] left-1/2 -ml-2 h-4 w-4 rotate-45 rounded-[3px]',
                pill === 'intro' ? 'bg-v2-ink' : 'bg-white',
              )}
              aria-hidden
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
