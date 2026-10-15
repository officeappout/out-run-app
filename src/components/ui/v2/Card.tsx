'use client';

import { forwardRef, type HTMLAttributes } from 'react';

export type CardVariant = 'light' | 'dark' | 'glass';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

const VARIANT_CLASS: Record<CardVariant, string> = {
  // White card, hairline ring + soft negative-spread lift.
  light: 'bg-white text-v2-ink shadow-v2-card',
  // Dark accent card (site league board): ink fill, white text.
  dark: 'bg-v2-ink text-white shadow-v2-card-dark',
  // Floating glass — only over rich backgrounds.
  glass: 'v2-glass-card text-v2-ink',
};

const PADDING_CLASS: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
}

/** v2 Card — 24px radius. Inner tiles use `rounded-v2-tile` (14px). */
const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'light', padding = 'md', className = '', ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      data-v2-card={variant}
      className={`rounded-v2-card ${VARIANT_CLASS[variant]} ${PADDING_CLASS[padding]} ${className}`}
      {...rest}
    />
  );
});

export default Card;

/**
 * Inner tile for use inside a Card. On a dark card it renders the site's
 * rgba(255,255,255,.1) tile; on light/glass a tinted surface tile.
 */
export function CardTile({
  tone = 'light',
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement> & { tone?: 'light' | 'dark' }) {
  const toneClass = tone === 'dark' ? 'bg-white/10 text-white' : 'bg-v2-surface text-v2-ink';
  return <div data-v2-tile={tone} className={`rounded-v2-tile ${toneClass} ${className}`} {...rest} />;
}
