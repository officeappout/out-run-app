'use client';

import type { ComponentType, HTMLAttributes } from 'react';
import type { LucideProps } from 'lucide-react';

export type IconTileTone = 'accent' | 'steps' | 'run' | 'bike' | 'gold' | 'neutral' | 'dark';
export type IconTileSize = 'sm' | 'md' | 'lg';

const TONE_CLASS: Record<IconTileTone, string> = {
  accent: 'bg-v2-tint text-v2-deep',
  steps: 'bg-activity-steps/10 text-[#00865a]',
  run: 'bg-activity-run/10 text-[#007fb0]',
  bike: 'bg-activity-bike/10 text-activity-bike',
  gold: 'bg-v2-gold text-v2-on-gold',
  neutral: 'bg-v2-surface text-v2-ink-2 ring-1 ring-inset ring-v2-hairline',
  dark: 'bg-white/10 text-white',
};

const SIZE: Record<IconTileSize, { box: string; icon: number }> = {
  sm: { box: 'w-8 h-8 rounded-[10px]', icon: 16 },
  md: { box: 'w-10 h-10 rounded-[12px]', icon: 20 },
  lg: { box: 'w-12 h-12 rounded-[14px]', icon: 24 },
};

export interface IconTileProps extends HTMLAttributes<HTMLSpanElement> {
  /** A lucide icon component (styled bold: strokeWidth 2.4). */
  icon: ComponentType<LucideProps>;
  tone?: IconTileTone;
  size?: IconTileSize;
  /** Accessible label; omit for decorative tiles (aria-hidden). */
  label?: string;
}

/**
 * IconTile — the site's rounded-square icon holder with a tinted background.
 * The site uses Phosphor (bold); the app keeps lucide and matches the weight
 * with a heavier stroke (see design-language.md §Icons for the decision).
 */
export default function IconTile({ icon: Icon, tone = 'accent', size = 'md', label, className = '', ...rest }: IconTileProps) {
  const s = SIZE[size];
  return (
    <span
      data-v2-icon-tile={tone}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`inline-flex items-center justify-center shrink-0 ${s.box} ${TONE_CLASS[tone]} ${className}`}
      {...rest}
    >
      <Icon size={s.icon} strokeWidth={2.4} aria-hidden />
    </span>
  );
}
