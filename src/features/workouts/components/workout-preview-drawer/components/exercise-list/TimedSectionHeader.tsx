'use client';

/**
 * TimedSectionHeader — header of a timed block in the preview drawer
 * (enable_home_v2; boards A-1a, A-2a, A-4a, A-5a): format name + length pill
 * + its one-line rule, and the "i" that explains the FORMAT only (the
 * workout's own description stays visible above).
 */
import React, { useState } from 'react';
import { Info } from 'lucide-react';
import type { TimedBlockSpec } from '@/features/workout-engine/engines/timed/timed.types';
import TimedFormatInfoSheet from '@/features/workout-engine/players/strength/timed/components/TimedFormatInfoSheet';
import { blockHeaderModel } from '../../utils/timed-preview.utils';
import { useT } from '@/hooks/useT';
import { library } from '@/messages/ns/library';

/** Block accent per format (AMRAP sky, EMOM violet, tabata orange — as the boards). */
export const BLOCK_TONE = {
  amrap: { text: 'text-[#0369a1]', pill: 'bg-[#e0f2fe] ring-[#7dd3fc] text-[#0369a1]', rail: 'border-[#0284c7]' },
  emom: { text: 'text-[#7c3aed]', pill: 'bg-[#f5f3ff] ring-[#c4b5fd] text-[#7c3aed]', rail: 'border-[#8b5cf6]' },
  tabata: { text: 'text-[#c2410c]', pill: 'bg-[#fff7ed] ring-[#fdba74] text-[#c2410c]', rail: 'border-orange-400/70' },
} as const;

export default function TimedSectionHeader({ spec }: { spec: TimedBlockSpec }) {
  const [open, setOpen] = useState(false);
  const t = useT(library);
  const h = blockHeaderModel(spec, t);
  const tone = BLOCK_TONE[h.tone];
  return (
    <>
      <div className="mb-2.5 flex items-center gap-2" dir="rtl" style={{ fontFamily: 'var(--font-simpler)' }}>
        <span className={`whitespace-nowrap text-[16px] font-extrabold ${tone.text}`}>{h.name}</span>
        <span dir="ltr" className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-extrabold ring-1 ring-inset ${tone.pill}`}>
          {h.pill}
        </span>
        <span className="truncate whitespace-nowrap text-[13px] font-semibold text-v2-muted">{h.line}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('preview.timed.info', { name: h.name })}
          className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-white shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          <Info size={14} strokeWidth={2.4} className="text-v2-ink-2" aria-hidden />
        </button>
      </div>
      <TimedFormatInfoSheet spec={spec} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
