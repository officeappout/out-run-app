'use client';

import clsx from 'clsx';
import LevelChip from './LevelChip';

/**
 * Label text in the swap marks' hue family (orange = easier, emerald = harder), darkened so 12px
 * text on the grey card passes 4.5:1 (orange-800 / emerald-800 on #e6edf2 are about 6:1).
 */
const LABEL_TONE = { easier: 'text-orange-800', harder: 'text-emerald-800' } as const;

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
            LABEL_TONE[kind],
          )}
        >
          {label}
        </span>
      )}
    </button>
  );
}
