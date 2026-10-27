'use client';

import type { ComponentType } from 'react';
import { Check, type LucideProps } from 'lucide-react';

export interface ChoiceTileProps {
  /** A lucide icon on the solid accent square. */
  icon: ComponentType<LucideProps>;
  /** Small meta next to the icon ("4.0 ק״מ", "600 מ׳ ממך"). */
  meta?: string | null;
  title: string;
  /** The green "why it fits" line (with a check); null = none. */
  why?: string | null;
  selected: boolean;
  onSelect: () => void;
  className?: string;
}

/**
 * v2 ChoiceTile — one option in a horizontal row of choices (board RP-14 route
 * tiles): accent icon square + meta, a bold title, one green "why" line. The
 * selected tile gets the accent ring and a tinted fill. A real button
 * (aria-pressed); direction-agnostic.
 */
export default function ChoiceTile({ icon: Icon, meta, title, why, selected, onSelect, className = '' }: ChoiceTileProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      data-v2-choice-tile
      className={`w-[150px] shrink-0 rounded-[18px] px-[11px] py-2.5 text-start transition-all duration-200 ease-v2 active:scale-[0.97] ${
        selected ? 'bg-[#f4fbfe] ring-2 ring-v2-accent' : 'bg-white shadow-v2-ring'
      } ${className}`}
    >
      <span className="flex items-center gap-2">
        <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[10px] bg-v2-accent text-white">
          <Icon size={16} strokeWidth={2.4} aria-hidden />
        </span>
        {meta && <span className="truncate whitespace-nowrap text-[12.5px] font-extrabold text-v2-muted">{meta}</span>}
      </span>
      <span className="mt-1.5 block truncate whitespace-nowrap text-[14px] font-black text-v2-ink">{title}</span>
      {why && (
        <span className="mt-[3px] flex items-center gap-1 whitespace-nowrap text-[11.5px] font-extrabold text-[#0f766e]">
          <Check size={12} strokeWidth={2.4} className="shrink-0" aria-hidden />
          <span className="truncate">{why}</span>
        </span>
      )}
    </button>
  );
}
