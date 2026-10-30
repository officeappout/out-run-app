'use client';

/**
 * ParkMachineReady: the last two steps before a park machine's timer (enable_park_live_v2, pilot
 * M16): "a 20-second timer, ready?" → "ready" → a big 3-2-1 → onGo (the caller releases the hold).
 * Drawn over the held active view like the demo gate. Reduced motion: the numbers just swap.
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import BrandCtaButton from '@/components/ui/BrandCtaButton';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import { useUiDir } from '@/lib/i18n/useUiDir';
import { PARK_COUNTDOWN_SEC, type ParkMachineStep } from '../logic/park-machine-flow';

interface Props {
  step: Exclude<ParkMachineStep, 'done'>;
  workSec: number;
  onReady: () => void;
  onGo: () => void;
}

export default function ParkMachineReady({ step, workSec, onReady, onGo }: Props) {
  const { direction } = useUiDir();
  const t = useT(player);
  const reduce = useReducedMotion();
  const [left, setLeft] = useState(PARK_COUNTDOWN_SEC);
  const fired = useRef(false);

  useEffect(() => {
    if (step !== 'count') return;
    fired.current = false;
    setLeft(PARK_COUNTDOWN_SEC);
    const id = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(id);
  }, [step]);
  useEffect(() => {
    if (step !== 'count' || left > 0 || fired.current) return;
    fired.current = true;
    onGo();
  }, [step, left, onGo]);

  if (step === 'count') {
    return (
      <div className="absolute inset-0 z-[44] grid place-items-center bg-black/55" role="status" aria-live="assertive">
        <motion.span
          key={left}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.4 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="text-[120px] font-black tabular-nums text-white"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          {Math.max(1, left)}
        </motion.span>
      </div>
    );
  }
  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="absolute inset-x-0 bottom-0 z-[44] rounded-t-[28px] bg-white px-5 pt-5 shadow-2xl dark:bg-slate-950"
      style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 20px))' }}
      dir={direction}
    >
      <h2 className="text-[22px] font-black leading-tight text-slate-900 dark:text-white" style={{ fontFamily: 'var(--font-simpler)' }}>
        {t('parkLive.ready.title', { sec: String(workSec) })}
      </h2>
      <p className="mt-1 text-[14px] font-bold text-slate-500" style={{ fontFamily: 'var(--font-simpler)' }}>
        {t('parkLive.ready.body')}
      </p>
      <BrandCtaButton onClick={onReady} className="mt-4 h-14 w-full rounded-full text-[16px] font-bold">
        {t('parkLive.ready.cta')}
      </BrandCtaButton>
    </motion.div>
  );
}
