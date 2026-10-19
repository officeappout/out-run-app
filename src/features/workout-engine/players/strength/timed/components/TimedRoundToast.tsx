'use client';

/**
 * TimedRoundToast — AMRAP round finished (board A-2c): "סבב 3 הושלם" + its
 * time vs the previous round. No rest — the next round already runs under
 * it; the toast floats over the video for a moment and goes.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AmrapState } from '@/features/workout-engine/engines/timed/timed.types';
import { amrapRoundLine } from '../logic/timed-labels';

const SHOW_MS = 2600;

export default function TimedRoundToast({ state }: { state: AmrapState }) {
  const rounds = state.data.rounds.length;
  const prev = useRef(rounds);
  const [shown, setShown] = useState<{ index: number; line: string | null } | null>(null);

  useEffect(() => {
    if (rounds > prev.current && state.status === 'running') {
      const index = rounds - 2; // the round that just closed
      setShown({ index, line: amrapRoundLine(state, index) });
    }
    prev.current = rounds;
  }, [rounds, state]);

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [shown]);

  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key={shown.index}
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
          className="pointer-events-none absolute inset-x-4 top-[38%] z-20 flex flex-col items-center rounded-[22px] bg-white/95 px-4 py-3 shadow-v2-float"
          dir="rtl"
          style={{ fontFamily: 'var(--font-simpler)' }}
          role="status"
        >
          <span className="whitespace-nowrap text-[20px] font-black !tracking-[-0.02em] text-v2-ink">סבב {shown.index + 1} הושלם</span>
          {shown.line && <span className="whitespace-nowrap text-[13px] font-bold tabular-nums text-v2-muted">{shown.line}</span>}
          <span className="mt-0.5 whitespace-nowrap text-[13px] font-extrabold text-v2-deep">מתחילים סבב {shown.index + 2}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
