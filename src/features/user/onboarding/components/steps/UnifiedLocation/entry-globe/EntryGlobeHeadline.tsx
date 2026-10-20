'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ENTRY_COPY } from './entry-copy';
import { EntryLogoSlot } from './EntryLogoSlot';

const ROTATE_MS = 2600;

/**
 * "בשביל / ‹rotating goal› / לא צריך כלום" over the light sky, with the faint
 * grid (masked to fade out downwards) — the website hero's opener.
 */
export function EntryGlobeHeadline({ logoSlot = false }: { logoSlot?: boolean }) {
  const reduce = !!useReducedMotion();
  const goals = ENTRY_COPY.headlineGoals;
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setIdx((n) => (n + 1) % goals.length), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [reduce, goals.length]);

  return (
    <div className="pointer-events-none absolute inset-0" dir="rtl">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[70%] opacity-70"
        style={{
          backgroundImage:
            'linear-gradient(#e7ecf1 1px, transparent 1px), linear-gradient(90deg, #e7ecf1 1px, transparent 1px)',
          backgroundSize: '97px 80px',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, #000 55%, transparent 100%)',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, #000 55%, transparent 100%)',
        }}
      />
      {logoSlot && <EntryLogoSlot />}
      <h1
        className="relative flex flex-col items-center px-5 text-center text-v2-ink"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 11vh)' }}
      >
        <span className="text-[30px] font-normal leading-[38px] !tracking-[-0.02em]">{ENTRY_COPY.headlinePre}</span>
        {/* every goal stacked invisibly keeps the line steady while it rotates */}
        <span className="relative grid w-full justify-items-center text-[31px] font-black leading-[42px] !tracking-[-0.02em]">
          {goals.map((g) => (
            <span key={g} aria-hidden className="invisible col-start-1 row-start-1 whitespace-nowrap">
              {g}
            </span>
          ))}
          <AnimatePresence initial={false}>
            <motion.span
              key={idx}
              className="col-start-1 row-start-1 whitespace-nowrap bg-v2-cta bg-clip-text text-transparent"
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            >
              {goals[idx]}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="text-[30px] font-normal leading-[40px] !tracking-[-0.02em]">
          {ENTRY_COPY.headlineNeed}{' '}
          <b
            className="font-black"
            style={{ background: 'linear-gradient(transparent 62%, #7dd3fc 62%)' }}
          >
            {ENTRY_COPY.headlineNothing}
          </b>
        </span>
      </h1>
    </div>
  );
}
