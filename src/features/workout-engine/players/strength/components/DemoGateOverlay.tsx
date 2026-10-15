'use client';

/**
 * DemoGateOverlay — guided "ככה עושים את זה" sheet (PR-B2), drawn over the ACTIVE view while
 * the player is held paused (see logic/demo-gate.ts). The exercise's demo clip keeps looping
 * behind it (ActiveExerciseView keeps its video playing while the gate is up), the white
 * rounded sheet matches the active card, and it stays low enough (z-[44], ≤ ~220px) that the
 * video's own "צפה בהסבר המלא" CTA (bottom-[236px], z-[46]) remains visible and tappable.
 */
import { motion } from 'framer-motion';
import BrandCtaButton from '@/components/ui/BrandCtaButton';

interface Props {
  exerciseName: string;
  /** One-line cue (first execution step) when the data has one. */
  cue?: string | null;
  ctaLabel: string;
  /** Must run synchronously inside the tap (it unmutes/plays the clip — a user-gesture API). */
  onStart: () => void;
}

export default function DemoGateOverlay({ exerciseName, cue, ctaLabel, onStart }: Props) {
  return (
    <motion.div
      key="demo-gate"
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="absolute inset-x-0 bottom-0 z-[44] bg-white dark:bg-slate-950 rounded-t-[28px] shadow-2xl px-5 pt-4"
      style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 20px))' }}
      dir="rtl"
    >
      <p className="text-[12px] font-bold text-[#00ADEF] mb-1" style={{ fontFamily: 'var(--font-simpler)' }}>
        ככה עושים את זה
      </p>
      <h2 className="text-[20px] font-black text-slate-900 dark:text-white leading-tight" style={{ fontFamily: 'var(--font-simpler)' }}>
        {exerciseName}
      </h2>
      {cue ? (
        <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2" style={{ fontFamily: 'var(--font-simpler)' }}>
          {cue}
        </p>
      ) : null}
      <BrandCtaButton onClick={onStart} className="w-full h-14 rounded-full text-[16px] font-bold mt-4">
        {ctaLabel}
      </BrandCtaButton>
    </motion.div>
  );
}
