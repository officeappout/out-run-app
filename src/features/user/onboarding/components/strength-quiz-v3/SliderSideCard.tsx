'use client';

import clsx from 'clsx';
import { LEVEL_COMPARE_ICONS } from '@/components/ui/v2/LevelCompareIcon';
import LevelChip, { CHIP_LEVEL } from './LevelChip';

interface SliderSideCardProps {
  kind: 'easier' | 'harder';
  /** "קל יותר" / "קשה יותר", or the next exercise's name (skill "not yet" card). */
  label: string | null;
  ariaLabel: string;
  /** No card here (floor / ceiling): an empty slot keeps the centre card centred. */
  hidden?: boolean;
  onPress: () => void;
}

/** Board Slider: the narrow grey card on each side of the selected one. */
export default function SliderSideCard({ kind, label, ariaLabel, hidden, onPress }: SliderSideCardProps) {
  if (hidden) return <div className="h-[74%] w-[23%] max-w-[92px] flex-shrink-0" aria-hidden />;
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={ariaLabel}
      data-side-card={kind}
      className="flex h-[74%] w-[23%] max-w-[92px] flex-shrink-0 flex-col items-center justify-between rounded-[22px] bg-[#e6edf2] px-1.5 py-3 transition-transform duration-150 ease-v2 active:scale-[0.97] touch-manipulation"
    >
      <LevelChip kind={kind} />
      {label && (
        <span
          className={clsx(
            'line-clamp-2 text-center text-[12px] font-extrabold',
            LEVEL_COMPARE_ICONS[CHIP_LEVEL[kind]].color,
          )}
        >
          {label}
        </span>
      )}
    </button>
  );
}
