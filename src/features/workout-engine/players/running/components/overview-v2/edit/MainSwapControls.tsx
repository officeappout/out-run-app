'use client';

/**
 * The main-set card's swap controls (boards M-7b / 7c, enable_home_v2):
 *   SwapButton    "החלף" pill in the card header → the "החלף מקטע" drawer
 *   SwappedNote   "הוחלף · היה 6 × 400 מ׳" + "בטל" under the header
 */

import { Repeat2, Undo2 } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';

export function SwapButton({ onClick }: { onClick: () => void }) {
  const t = useT(player);
  return (
    <button type="button" onClick={onClick} aria-label={t('run.overview.edit.swapAria')}
      className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-white px-[9px] text-[12px] font-extrabold text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]">
      <Repeat2 size={13} strokeWidth={2.4} aria-hidden />
      {t('run.overview.edit.swap')}
    </button>
  );
}

export function SwappedNote({ from, onUndo }: { from: string; onUndo: () => void }) {
  const t = useT(player);
  return (
    <>
      <span className="min-w-0 truncate whitespace-nowrap rounded-full bg-v2-tint px-2 py-0.5 text-[11px] font-extrabold text-v2-deep ring-1 ring-inset ring-v2-accent/35">
        {t('run.overview.edit.swappedFrom', { from })}
      </span>
      <button type="button" onClick={onUndo}
        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[12.5px] font-extrabold text-v2-deep transition-transform duration-150 ease-v2 active:scale-[0.97]">
        <Undo2 size={13} strokeWidth={2.4} aria-hidden />
        {t('run.overview.edit.undo')}
      </button>
    </>
  );
}
