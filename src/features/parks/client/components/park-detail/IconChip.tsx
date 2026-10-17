'use client';

/**
 * IconChip — small horizontal pill matching the equipment-tag style
 * used in `ExerciseDetailContent.tsx` (the strength-workout exercise
 * detail sheet). Used in the Park Detail sheet for the
 * "פירוט על הפארק" (amenities) section so the visual language stays
 * consistent across screens.
 *
 * Style contract (mirrored 1:1 from ExerciseDetailContent):
 *   • white background (dark variant for slate-800 in dark mode)
 *   • shadow-sm, rounded-lg, height 30px
 *   • 0.5px border `#E0E9FF`
 *   • 16×16 icon on the start side, label right next to it
 *
 * Icon source priority — pass exactly ONE of these:
 *   1. `iconSrc`     — raw URL to an SVG/PNG (used for park-equipment
 *                      assets like `/assets/icons/equipment/...svg`)
 *   2. `IconComponent` — a lucide-react icon component for vector
 *                       fallbacks when no SVG asset exists yet
 *   3. `emoji`       — last-resort placeholder when neither asset nor
 *                      lucide icon fits the tag
 */

import React from 'react';
import { type LucideIcon } from 'lucide-react';

interface IconChipProps {
  label: string;
  iconSrc?: string;
  IconComponent?: LucideIcon;
  emoji?: string;
  /**
   * When set, the chip becomes a clickable button with this handler.
   * Skips the wrapping <button> entirely when undefined so the chip
   * stays semantically inert (no extra a11y / focus chrome) for
   * read-only displays like the amenities grid.
   */
  onClick?: () => void;
  /** Extra classes appended to the root pill — useful for layout overrides. */
  className?: string;
  /** Home v2 look: a 40px white pill on the ring shadow, brand-deep icon. */
  v2?: boolean;
}

const PILL_BORDER = '0.5px solid #E0E9FF';

export default function IconChip({
  label,
  iconSrc,
  IconComponent,
  emoji,
  onClick,
  className = '',
  v2 = false,
}: IconChipProps) {
  if (v2) {
    const V2Wrap: React.ElementType = onClick ? 'button' : 'div';
    return (
      <V2Wrap
        {...(onClick ? { type: 'button' as const, onClick } : {})}
        className={`flex h-10 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3.5 text-[13.5px] font-extrabold text-v2-ink shadow-v2-ring ${onClick ? 'transition-transform duration-150 ease-v2 active:scale-[0.97]' : ''} ${className}`}
      >
        {iconSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={iconSrc} alt="" width={18} height={18} className="object-contain" />
        ) : IconComponent ? (
          <IconComponent size={16} strokeWidth={2.4} className="flex-shrink-0 text-v2-deep" />
        ) : emoji ? (
          <span className="text-base leading-none flex-shrink-0">{emoji}</span>
        ) : null}
        {label}
      </V2Wrap>
    );
  }
  const Wrapper: React.ElementType = onClick ? 'button' : 'div';
  const wrapperProps = onClick
    ? {
        type: 'button' as const,
        onClick,
        className: `flex-shrink-0 flex items-center gap-2 bg-white dark:bg-slate-800/90 shadow-sm rounded-lg px-3 active:scale-[0.97] transition-transform ${className}`,
      }
    : {
        className: `flex-shrink-0 flex items-center gap-2 bg-white dark:bg-slate-800/90 shadow-sm rounded-lg px-3 ${className}`,
      };

  return (
    <Wrapper {...wrapperProps} style={{ border: PILL_BORDER, height: 30 }}>
      {iconSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconSrc}
          alt=""
          width={16}
          height={16}
          className="object-contain"
          onError={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            img.removeAttribute('src');
            img.style.display = 'none';
          }}
        />
      ) : IconComponent ? (
        <IconComponent size={16} className="text-slate-500 flex-shrink-0" />
      ) : emoji ? (
        <span className="text-base leading-none flex-shrink-0">{emoji}</span>
      ) : null}
      <span className="text-xs font-normal text-gray-800 dark:text-gray-100 whitespace-nowrap">
        {label}
      </span>
    </Wrapper>
  );
}
