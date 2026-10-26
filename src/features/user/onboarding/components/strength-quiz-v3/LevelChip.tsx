'use client';

import clsx from 'clsx';
import LevelCompareIcon, { LEVEL_COMPARE_ICONS, type LevelComparison } from '@/components/ui/v2/LevelCompareIcon';

export type LevelChipKind = 'easier' | 'harder' | 'mine';

/**
 * The slider's level chips speak the in-workout swap's language (owner 26.10.2026): the same
 * LevelCompareIcon marks and colours as ExerciseReplacementModal. Harder = level_up (green),
 * easier = level_down (orange), the selected card = level_same (brand blue) + "הרמה שלי".
 */
export const CHIP_LEVEL: Record<LevelChipKind, LevelComparison> = {
  easier: 'lower',
  harder: 'higher',
  mine: 'same',
};

const CHIP_BG: Record<LevelChipKind, string> = {
  easier: 'bg-orange-50',
  harder: 'bg-emerald-50',
  mine: 'bg-white shadow-v2-ring',
};

export default function LevelChip({ kind, label, className }: { kind: LevelChipKind; label?: string; className?: string }) {
  const level = CHIP_LEVEL[kind];
  return (
    <span
      data-level-chip={kind}
      data-level-icon={level}
      className={clsx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full text-[12px]',
        kind === 'mine' ? 'px-[9px] py-1 font-black' : 'px-2 py-1 font-extrabold',
        CHIP_BG[kind],
        LEVEL_COMPARE_ICONS[level].color,
        className,
      )}
    >
      <LevelCompareIcon level={level} size={14} />
      {kind === 'mine' && label}
    </span>
  );
}
