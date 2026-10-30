'use client';

/**
 * BlockSection — one block of a live session list in the block language (enable_combo_flow_v1,
 * board PlayerIntervalsTabata): a title row with its meta and a status chip; a finished block is
 * closed with "details" to open it, the live one is open and marked "now", one ahead is open.
 */

import React, { useState } from 'react';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';

export type BlockSectionStatus = 'done' | 'now' | 'ahead';

export interface BlockSectionProps {
  title: string;
  meta?: string;
  status: BlockSectionStatus;
  /** Dot colour of the block (activity colour). */
  color: string;
  /** Rows of the block; omitted = a one-line block (nothing to open). */
  children?: React.ReactNode;
}

export default function BlockSection({ title, meta, status, color, children }: BlockSectionProps) {
  const t = useT(player);
  const [open, setOpen] = useState(false);
  const showBody = !!children && (status !== 'done' || open);
  return (
    <section className="mt-4" aria-current={status === 'now' ? 'step' : undefined}>
      <div className="mb-1.5 flex items-center gap-2 px-1">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
        <h3 className="min-w-0 truncate whitespace-nowrap text-[15px] font-black text-v2-ink">{title}</h3>
        {status === 'now' && (
          <span className="shrink-0 whitespace-nowrap rounded-full bg-v2-tint px-2 py-0.5 text-[11.5px] font-extrabold text-v2-deep ring-1 ring-inset ring-v2-accent/40">
            {t('blocks.status.now')}
          </span>
        )}
        {status === 'done' && (
          <span className="shrink-0 whitespace-nowrap text-[12px] font-extrabold text-emerald-700">{t('blocks.status.done')}</span>
        )}
        {status === 'done' && children ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="ms-auto shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[12px] font-extrabold text-v2-deep"
          >
            {t(open ? 'blocks.close' : 'blocks.details')}
          </button>
        ) : (
          meta && <span className="ms-auto shrink-0 truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">{meta}</span>
        )}
      </div>
      {status === 'done' && !open && meta && <p className="truncate px-1 text-[12.5px] font-bold text-v2-muted">{meta}</p>}
      {showBody && children}
    </section>
  );
}
