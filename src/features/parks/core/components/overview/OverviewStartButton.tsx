'use client';

/**
 * OverviewStartButton — the overview drawer's single CTA (the one filled
 * gradient on the screen). Moved from HybridOverviewScreen; output there is
 * unchanged. `blocked` (start-experience "too far" state) renders the muted
 * pill and reports the tap via onClick — never a literal `disabled`, same
 * idiom as RouteCardUnified's ctaBlockedReason.
 */

import { Play } from 'lucide-react';

export interface OverviewStartButtonProps {
  v2: boolean;
  label: string;
  ariaLabel: string;
  onClick: () => void;
  blocked?: boolean;
}

export default function OverviewStartButton({ v2, label, ariaLabel, onClick, blocked = false }: OverviewStartButtonProps) {
  if (blocked) {
    return (
      <button type="button" onClick={onClick} aria-label={ariaLabel} aria-disabled
        className="w-full h-12 flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-v2-surface text-[16px] font-extrabold text-v2-muted ring-1 ring-inset ring-v2-hairline transition-transform duration-150 ease-v2 active:scale-[0.97]">
        <Play size={18} />{` ${label}`}
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel}
      className={v2
        ? 'w-full h-12 flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97]'
        : 'w-full flex items-center justify-center gap-2 text-white text-[15px] font-black rounded-2xl active:scale-[0.97] transition-transform'}
      style={v2 ? undefined : { height: 54, background: 'linear-gradient(to left, #0CF2E3, #00BAF7)' }}>
      <Play size={18} className={v2 ? 'fill-current' : undefined} />{` ${label}`}
    </button>
  );
}
