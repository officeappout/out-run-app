'use client';

import clsx from 'clsx';
import LevelChip from './LevelChip';

/**
 * Label text in the swap marks' hue family (orange = easier, emerald = harder), darkened so 12px
 * text on the light strip passes 4.5:1 (orange-800 / emerald-800 on white / #e6edf2 are about 6:1).
 */
const LABEL_TONE = { easier: 'text-orange-800', harder: 'text-emerald-800' } as const;

interface SliderSideCardProps {
  kind: 'easier' | 'harder';
  /** "קל יותר" / "קשה יותר", or the next exercise's name (skill "not yet" card). */
  label: string | null;
  ariaLabel: string;
  /** The neighbouring exercise's still (owner 28.10, Y1: never a blank grey card). */
  imageUrl?: string | null;
  /** No card here (floor / ceiling): an empty slot keeps the centre card centred. */
  hidden?: boolean;
  onPress: () => void;
}

/** Board Slider: the narrow card on each side of the selected one, showing the neighbouring exercise. */
export default function SliderSideCard({ kind, label, ariaLabel, imageUrl, hidden, onPress }: SliderSideCardProps) {
  if (hidden) return <div className="h-[74%] w-[23%] max-w-[92px] flex-shrink-0" aria-hidden />;
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={ariaLabel}
      data-side-card={kind}
      className="relative flex h-[74%] w-[23%] max-w-[92px] flex-shrink-0 flex-col items-center justify-between overflow-hidden rounded-[22px] bg-[#e6edf2] px-1.5 py-3 transition-transform duration-150 ease-v2 active:scale-[0.97] touch-manipulation"
    >
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" data-side-image />
      )}
      <LevelChip kind={kind} className="relative" />
      {label && (
        <span
          className={clsx(
            'relative line-clamp-2 rounded-xl px-1 text-center text-[12px] font-extrabold',
            imageUrl && 'bg-white/90',
            LABEL_TONE[kind],
          )}
        >
          {label}
        </span>
      )}
    </button>
  );
}
