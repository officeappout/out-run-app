'use client';

/**
 * OverviewSecondaryButton — the white pill beside the overview drawer's one
 * gradient CTA ("הצע לי מסלול", "בחר במפה", "בלי מסלול"; boards M-6a / 6c /
 * 6i). Same 48px height as OverviewStartButton; never filled.
 */

import type { ReactNode } from 'react';

export interface OverviewSecondaryButtonProps {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  className?: string;
}

export default function OverviewSecondaryButton({ label, icon, onClick, className = '' }: OverviewSecondaryButtonProps) {
  return (
    <button type="button" onClick={onClick}
      className={`flex h-12 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-white text-[14px] font-extrabold text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97] ${className}`}>
      {icon}{label}
    </button>
  );
}
