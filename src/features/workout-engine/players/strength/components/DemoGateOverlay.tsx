'use client';

/**
 * DemoGateOverlay — guided "ככה עושים את זה" sheet (PR-B2), drawn over the ACTIVE view while
 * the player is held paused (see logic/demo-gate.ts). The exercise's demo clip keeps looping
 * behind it (ActiveExerciseView keeps its video playing while the gate is up), the white
 * rounded sheet matches the active card, and it stays low enough (z-[44], ≤ ~220px) that the
 * video's own "צפה בהסבר המלא" CTA (bottom-[236px], z-[46]) remains visible and tappable.
 */
import { motion } from 'framer-motion';
import { Volume2 } from 'lucide-react';
import BrandCtaButton from '@/components/ui/BrandCtaButton';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';

import { useUiDir } from '@/lib/i18n/useUiDir';
interface Props {
  exerciseName: string;
  /** One-line cue (first execution step) when the data has one. */
  cue?: string | null;
  ctaLabel: string;
  /** enable_park_live_v2 (board Park 8): one line above the CTA ("put the phone on the floor…"). */
  hint?: string | null;
  /** Park machines (M16): a "turn the sound on" button above the CTA; runs inside the tap. */
  sound?: { label: string; onTap: () => void } | null;
  /** Must run synchronously inside the tap (it unmutes/plays the clip — a user-gesture API). */
  onStart: () => void;
}

export default function DemoGateOverlay({ exerciseName, cue, ctaLabel, hint, sound, onStart }: Props) {
  const { direction } = useUiDir();
  const t = useT(player);
  return (
    <motion.div
      key="demo-gate"
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="absolute inset-x-0 bottom-0 z-[44] bg-white dark:bg-slate-950 rounded-t-[28px] shadow-2xl px-5 pt-4"
      style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 20px))' }}
      dir={direction}
    >
      <p className="text-[12px] font-bold text-[#00ADEF] mb-1" style={{ fontFamily: 'var(--font-simpler)' }}>
        {t('strengthPlayer.demoGate.eyebrow')}
      </p>
      <h2 className="text-[20px] font-black text-slate-900 dark:text-white leading-tight" style={{ fontFamily: 'var(--font-simpler)' }}>
        {exerciseName}
      </h2>
      {cue ? (
        <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2" style={{ fontFamily: 'var(--font-simpler)' }}>
          {cue}
        </p>
      ) : null}
      {hint ? (
        <p className="mt-3 text-[14px] font-bold leading-snug text-slate-700 dark:text-slate-200" style={{ fontFamily: 'var(--font-simpler)' }}>
          {hint}
        </p>
      ) : null}
      {sound ? (
        <button
          type="button"
          onClick={sound.onTap}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-[14.5px] font-extrabold text-slate-900 shadow-v2-ring active:scale-[0.97] transition-transform"
        >
          <Volume2 size={18} strokeWidth={2.4} aria-hidden />
          {sound.label}
        </button>
      ) : null}
      <BrandCtaButton onClick={onStart} className="w-full h-14 rounded-full text-[16px] font-bold mt-4">
        {ctaLabel}
      </BrandCtaButton>
    </motion.div>
  );
}
