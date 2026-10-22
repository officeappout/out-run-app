'use client';

/**
 * The streak celebration screen (designs ST-1…ST-5): close, hero, headline, this week's
 * strip, "המשך" and "שיתוף הרצף". Full screen at z-[112] (see .cursorrules z-index table),
 * safe-area padded, reduced-motion aware.
 */
import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { hapticTap } from '@/lib/haptics';
import { getTodayString } from '@/features/activity/store/useActivityStore';
import type { AppGender } from '@/lib/utils/gendered-text';
import type { FlameTone } from '@/components/ui/v2/streak';
import { weekStrip, type Celebration } from '../core/celebration.core';
import {
  CELEBRATION_CLOSE,
  CELEBRATION_CONTINUE,
  CELEBRATION_SHARE,
  celebrationCopy,
  shareText,
} from '../core/celebration-copy';
import CelebrationHero from './CelebrationHero';
import WeekStrip from './WeekStrip';

export interface StreakCelebrationOverlayProps {
  celebration: Celebration;
  lastStreakDate: string;
  tones: FlameTone[];
  gender: AppGender | null | undefined;
  onClose: () => void;
}

const SHARE_VARIANTS = new Set(['day', 'week', 'milestone']);
const STRIP_VARIANTS = new Set(['day', 'shield', 'back']);
const GLOW_VARIANTS = new Set(['day', 'week', 'milestone']);

function canShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export default function StreakCelebrationOverlay({ celebration: c, lastStreakDate, tones, gender, onClose }: StreakCelebrationOverlayProps) {
  const reduce = useReducedMotion();
  const copy = celebrationCopy(c, gender);
  const strip = useMemo(
    () => (STRIP_VARIANTS.has(c.variant) ? weekStrip(getTodayString(), { currentStreak: c.streak, lastStreakDate }, c.shieldDays) : null),
    [c, lastStreakDate],
  );
  const share = SHARE_VARIANTS.has(c.variant) && canShare();
  const bg = c.variant === 'milestone' ? '#fff7ed' : c.variant === 'back' ? '#ffffff' : '#fffaf5';

  useEffect(() => {
    if (c.variant !== 'back') hapticTap('impact');
  }, [c.variant]);

  const onShare = async () => {
    hapticTap('selection');
    try {
      await navigator.share({ text: shareText(c) });
    } catch {
      /* cancelled */
    }
  };
  const close = () => {
    hapticTap('selection');
    onClose();
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={copy.headline}
      dir="rtl"
      className="fixed inset-0 z-[112] flex flex-col items-center overflow-y-auto text-[#0e1419]"
      style={{
        background: bg,
        fontFamily: 'var(--font-simpler)',
        paddingTop: 'max(12px, env(safe-area-inset-top))',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
      }}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      {GLOW_VARIANTS.has(c.variant) && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[90px] -ml-[210px] h-[420px] w-[420px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(249,115,22,0.22), rgba(249,115,22,0) 65%)' }}
        />
      )}
      <div className="relative flex w-full justify-end px-4 pt-2">
        <button
          type="button"
          onClick={close}
          aria-label={CELEBRATION_CLOSE}
          className="grid h-11 w-11 place-items-center rounded-full bg-white shadow-[0_0_0_1px_rgba(14,27,42,0.08)]"
        >
          <X size={18} strokeWidth={2.4} />
        </button>
      </div>

      <div className="relative flex min-h-[300px] w-full flex-1 flex-col items-center justify-center" style={{ maxHeight: 380 }}>
        <CelebrationHero c={c} tones={tones} unit={copy.unit} />
      </div>

      <div className="relative px-7 text-center">
        <h2 className="text-[28px] font-black leading-[34px]">{copy.headline}</h2>
        <p className="mt-2 text-[15.5px] leading-[23px] text-slate-600">{copy.sub}</p>
      </div>

      {strip && <WeekStrip days={strip} tones={tones} />}

      <div className="flex-1" />
      <div className="relative flex w-full max-w-md flex-col gap-2.5 px-5 pt-3">
        <button
          type="button"
          onClick={close}
          className="h-[54px] rounded-full bg-[#0e1419] text-[16.5px] font-extrabold text-white"
        >
          {CELEBRATION_CONTINUE}
        </button>
        {share && (
          <button type="button" onClick={onShare} className="h-[46px] rounded-full text-[15px] font-extrabold text-[#9a3412]">
            {CELEBRATION_SHARE}
          </button>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}
