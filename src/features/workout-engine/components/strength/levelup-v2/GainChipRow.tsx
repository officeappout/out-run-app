'use client';

/**
 * Bonus chips around the ring — each pops in (ease-out, 240ms) when its step
 * reveals it; the stagger comes from the step plan (~350ms apart). Zero chips
 * never reach here (visibleChips).
 */
import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { GainChip } from '@/features/user/progression/services/levelup-preview';
import { PROGRAM_NAME_HE } from '@/lib/utils/program-names';
import { useT } from '@/hooks/useT';
import { player, type PlayerKey } from '@/messages/ns/player';
import { formatGain } from './levelup-view-model';
import { EASE_OUT } from './LevelRing';

const CHIP_KEY: Partial<Record<GainChip['kind'], PlayerKey>> = {
  completion: 'levelup.chip.completion',
  performance: 'levelup.chip.performance',
  goals: 'levelup.chip.goals',
  mastery: 'levelup.chip.mastery',
};

export default function GainChipRow({
  chips,
  revealedIds,
  reducedMotion,
}: {
  chips: GainChip[];
  revealedIds: string[];
  reducedMotion: boolean;
}) {
  const t = useT(player);
  const shown = chips.filter((c) => revealedIds.includes(c.id));
  return (
    <div className="flex flex-wrap justify-center gap-2 mt-4 min-h-[34px]">
      <AnimatePresence initial={!reducedMotion}>
        {shown.map((chip) => {
          const value = formatGain(chip.gain);
          if (!value) return null;
          const key = CHIP_KEY[chip.kind];
          const label = key ? t(key) : PROGRAM_NAME_HE[chip.programId ?? ''] ?? chip.programId ?? '';
          return (
            <motion.span
              key={chip.id}
              initial={reducedMotion ? false : { opacity: 0, scale: 0.9, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.24, ease: EASE_OUT }}
              className={`h-[34px] px-3 rounded-full text-[13.5px] font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap ${
                chip.pushesRing
                  ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              <span dir="ltr" className="font-black tabular-nums">{value}%</span>
              {label}
            </motion.span>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
