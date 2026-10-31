'use client';
/**
 * After-workout moment (enable_home_after_v1, board HomeAfterMoment): instead of the home banner,
 * a floating card with the lemur drops from the top when the user is back from the summary.
 * Gone by itself after 4 seconds (the progress line), or on a tap / swipe up. Once per workout;
 * the text is the same post_workout smart message the banner showed.
 */
import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { LEMUR_COACH_SRC } from '@/features/schedule/tutorial-v1/components/LemurNote';

export const AFTER_WORKOUT_TOAST_MS = 4000;

interface Props {
  open: boolean;
  text: string;
  subText?: string | null;
  onClose: () => void;
}

export default function AfterWorkoutToast({ open, text, subText, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(onClose, AFTER_WORKOUT_TOAST_MS);
    return () => clearTimeout(id);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ y: -90, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -90, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.6, bottom: 0 }}
          onDragEnd={(_, info) => { if (info.offset.y < -24) onClose(); }}
          onClick={onClose}
          className="fixed inset-x-3 z-[95] mx-auto flex max-w-md items-center gap-3 overflow-hidden rounded-[20px] bg-white px-3.5 py-3 shadow-v2-float"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 10px)', fontFamily: 'var(--font-simpler)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LEMUR_COACH_SRC} alt="" className="h-11 w-11 shrink-0 object-contain" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[16px] font-black leading-tight text-v2-ink">{text}</span>
            {subText ? <span className="text-[13px] font-bold text-v2-muted">{subText}</span> : null}
          </span>
          <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-[#1D9E75]" aria-hidden>
            <Check size={15} strokeWidth={3.2} className="text-white" />
          </span>
          <motion.span
            className="absolute bottom-1.5 start-10 end-10 h-[3px] origin-left rounded-full bg-[#00baf7]"
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            transition={{ duration: AFTER_WORKOUT_TOAST_MS / 1000, ease: 'linear' }}
            aria-hidden
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
