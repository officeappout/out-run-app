'use client';

/**
 * ComboAxisSection — one block of the session list behind the hybrid v2 player, on the side axis
 * (enable_combo_flow_v1, boards PlayerTransitionFrame reveal / move, round 4d): a node + spine in
 * the block's colour, the shared "you" dot (layoutId, so it glides to the next block on "move"),
 * and the block itself: done = collapsed with "details", live = open + "now", a station ahead =
 * closed until you reach it.
 */

import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import { ExerciseSetsTable, type ExerciseSetsRow } from '@/components/ui/v2';
import { HYBRID_AER, HYBRID_STR } from '@/features/parks/core/components/hybrid/hybrid-colors';
import type { HybridListSection } from '../hybrid-v2-list';
import { COMBO_TIMING } from './combo-choreography';
import { comboSectionMode } from './combo-list';

const YOU_DOT = '#0284c7';

interface Props {
  section: HybridListSection;
  rows: ExerciseSetsRow[];
  hasDot: boolean;
  /** Colour of the next block (the spine blends into it); null = last block, no spine. */
  nextColor: string | null;
}

export const axisColor = (kind: HybridListSection['kind']) => (kind === 'run' ? HYBRID_AER : HYBRID_STR);

export default function ComboAxisSection({ section, rows, hasDot, nextColor }: Props) {
  const t = useT(player);
  const reduce = useReducedMotion();
  const [details, setDetails] = useState(false);
  const mode = comboSectionMode(section.kind, section.status);
  const color = axisColor(section.kind);
  const done = section.status === 'done' || section.status === 'skipped';
  const showRows = mode === 'open' || (mode === 'collapsed' && details);

  return (
    <section className="flex gap-3" aria-current={section.status === 'active' ? 'step' : undefined}>
      <div className="relative w-[22px] shrink-0" aria-hidden>
        {nextColor && (
          <span
            className="absolute inset-x-0 top-[18px] mx-auto w-[4px] rounded-full"
            style={{ bottom: -22, background: `linear-gradient(to bottom, ${color}, ${nextColor})`, opacity: done ? 1 : 0.45 }}
          />
        )}
        <span
          className="relative mx-auto mt-[3px] grid h-[18px] w-[18px] place-items-center rounded-full text-white ring-[3px] ring-white"
          style={{ background: done || section.status === 'active' ? color : '#e2e8f0' }}
        >
          {done && <Check size={11} strokeWidth={3.2} />}
        </span>
        {hasDot && (
          <motion.span
            layoutId="combo-you-dot"
            transition={reduce ? { duration: 0 } : { duration: COMBO_TIMING.move / 1000, ease: [0.32, 0.72, 0, 1] }}
            className="absolute inset-x-0 top-[1px] mx-auto h-[22px] w-[22px] rounded-full ring-4 ring-white"
            style={{ background: YOU_DOT, boxShadow: `0 0 0 10px ${YOU_DOT}2e` }}
          />
        )}
      </div>

      <div className="min-w-0 flex-1 pb-5">
        <div className="mb-1.5 flex items-center gap-2">
          <h3 className="min-w-0 truncate whitespace-nowrap text-[15px] font-black text-v2-ink">{section.title}</h3>
          {section.status === 'active' && (
            <span className="shrink-0 whitespace-nowrap rounded-full bg-v2-tint px-2 py-0.5 text-[11.5px] font-extrabold text-v2-deep ring-1 ring-inset ring-v2-accent/40">
              {t('hybrid.v2.list.status.active')}
            </span>
          )}
          {mode === 'collapsed' ? (
            <button
              type="button"
              onClick={() => setDetails((d) => !d)}
              aria-expanded={details}
              className="ms-auto shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[12px] font-extrabold text-v2-deep"
            >
              {t(details ? 'hybrid.v2.combo.list.hideDetails' : 'hybrid.v2.combo.list.details')}
            </button>
          ) : (
            <span className="ms-auto shrink-0 whitespace-nowrap text-[12px] font-bold text-v2-muted">{section.meta}</span>
          )}
        </div>
        {mode === 'collapsed' && !details && <p className="truncate text-[12.5px] font-bold text-v2-muted">{section.meta}</p>}
        {mode === 'closed' && (
          <div className="rounded-[16px] bg-white px-3 py-2.5 ring-1 ring-inset ring-v2-hairline">
            <p className="truncate text-[13px] font-bold text-v2-ink-2">{rows.map((r) => r.name).join(', ')}</p>
            <p className="text-[12px] font-bold text-v2-muted">{t('hybrid.v2.combo.list.opensAtStation')}</p>
          </div>
        )}
        {showRows && <ExerciseSetsTable hideLegend rows={rows} />}
      </div>
    </section>
  );
}
