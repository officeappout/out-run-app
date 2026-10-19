'use client';

/**
 * BrandCard — the OUT brand card: white fill with the brand gradient as a 1.5px border
 * (`linear-gradient(135deg,#00baf7,#0cf2e3)` on border-box) and a soft cyan lift. Used where a
 * card should read as "ours" rather than a generic white box (unified search results, …).
 * BRAND_TILE_BG is the watercolour-ish tile gradient for covers / icon tiles without media.
 */
import { createElement, forwardRef, type HTMLAttributes, type ButtonHTMLAttributes } from 'react';

export const BRAND_GRADIENT = 'linear-gradient(135deg,#00baf7,#0cf2e3)';
export const BRAND_BORDER_BG = `linear-gradient(#ffffff,#ffffff) padding-box, ${BRAND_GRADIENT} border-box`;
export const BRAND_TILE_BG = 'linear-gradient(160deg,#2CE0C0,#20C6D6 55%,#2AA3E8)';
export const BRAND_CARD_SHADOW = '0 6px 22px rgba(91,194,242,0.14)';

type Tag = 'div' | 'article' | 'section' | 'button' | 'li';

export type BrandCardProps = (HTMLAttributes<HTMLElement> & ButtonHTMLAttributes<HTMLButtonElement>) & {
  as?: Tag;
  /** px — 16 (rows), 18 (cards), 20 (feature cards). */
  radius?: 16 | 18 | 20;
  /** Stronger lift for the featured card. */
  raised?: boolean;
};

const BrandCard = forwardRef<HTMLElement, BrandCardProps>(function BrandCard(
  { as = 'div', radius = 18, raised = false, className = '', style, ...rest },
  ref,
) {
  return createElement(as, {
    ref,
    'data-brand-card': '',
    className: `border-[1.5px] border-transparent text-v2-ink ${as === 'button' ? 'w-full text-start transition-transform duration-150 ease-v2 active:scale-[0.98]' : ''} ${className}`,
    style: {
      borderRadius: radius,
      background: BRAND_BORDER_BG,
      boxShadow: raised ? '0 8px 28px rgba(91,194,242,0.18)' : BRAND_CARD_SHADOW,
      ...style,
    },
    ...(as === 'button' && !rest.type ? { type: 'button' } : {}),
    ...rest,
  });
});

export default BrandCard;
