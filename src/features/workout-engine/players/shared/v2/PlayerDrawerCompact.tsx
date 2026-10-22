'use client';

/**
 * PlayerDrawerCompact — the compact snap of a strength / timed player drawer
 * (enable_strength_drawer_v1): one row with the exercise name, an optional
 * caption (round / phase), the big value (timer or target) and, when given,
 * the primary action. Tapping the text part opens the full drawer.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import type { SnapDrawerState } from './useSnapDrawer';

export interface PlayerDrawerCompactProps {
  drawer: SnapDrawerState;
  title: string;
  caption?: string | null;
  /** Big value — the clock or the target ("12", "0:24"). */
  value?: string | null;
  /** Small unit after the value ("חזרות"). */
  unit?: string | null;
  /** Orange value (last seconds). */
  warn?: boolean;
  /** The primary action, already built (keeps its own state/animation). */
  action?: React.ReactNode;
}

export default function PlayerDrawerCompact({ drawer, title, caption, value, unit, warn = false, action }: PlayerDrawerCompactProps) {
  const t = useT(player);
  return (
    <div dir="rtl" className="flex items-center gap-3" style={{ fontFamily: 'var(--font-simpler)' }} data-player-drawer-compact="">
      <motion.button
        type="button"
        onPanStart={drawer.onPanStart}
        onPanEnd={drawer.onPanEnd}
        onClick={drawer.toggle}
        aria-label={t('strength.drawer.expandAria')}
        className="flex min-w-0 flex-1 items-center gap-3 text-right"
        style={{ touchAction: 'none' }}
      >
        {value && (
          <span className="flex shrink-0 items-baseline gap-1" dir="ltr">
            <span className={`text-[26px] font-black leading-none tabular-nums !tracking-[-0.02em] ${warn ? 'text-[#ea580c]' : 'text-v2-ink'}`}>
              {value}
            </span>
            {unit && <span className="whitespace-nowrap text-[12px] font-extrabold text-v2-deep">{unit}</span>}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          {caption && (
            <span className={`truncate whitespace-nowrap text-[12px] font-extrabold tabular-nums ${warn ? 'text-[#ea580c]' : 'text-v2-deep'}`}>
              {caption}
            </span>
          )}
          <span className="truncate whitespace-nowrap text-[15px] font-black text-v2-ink">{title}</span>
        </span>
      </motion.button>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
