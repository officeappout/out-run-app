'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type IconButtonTone = 'white-ring' | 'tint' | 'glass' | 'surface';
export type IconButtonSize = 36 | 40 | 48 | 56;

const TONE_CLASS: Record<IconButtonTone, string> = {
  /** Round header/action button on a light page: white disc + soft ring shadow. */
  'white-ring': 'bg-white text-v2-ink shadow-v2-ring',
  /** Brand tint — an "on" or brand-coloured action. */
  tint: 'bg-v2-tint text-v2-deep',
  /** Over a photo / map / dark media — the site's dark glass chip. */
  glass: 'v2-glass-chip text-white',
  /** The sheet close button: surface fill + inset hairline. */
  surface: 'bg-v2-surface text-v2-ink ring-1 ring-inset ring-v2-hairline',
};

const SIZE_CLASS: Record<IconButtonSize, string> = {
  36: 'h-9 w-9',
  40: 'h-10 w-10',
  48: 'h-12 w-12',
  56: 'h-14 w-14',
};

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  /** Required — an icon-only button has no other accessible name. */
  'aria-label': string;
  tone?: IconButtonTone;
  /** Diameter in px. Default 40. */
  size?: IconButtonSize;
  /** The icon (lucide or an app SVG). Size it yourself (e.g. `h-4 w-4`). */
  children: ReactNode;
}

/**
 * v2 IconButton — round, icon-only button.
 *
 *   <IconButton aria-label="סגירה" tone="surface" size={36} onClick={onClose}><X className="h-4 w-4" /></IconButton>
 *
 * Press feedback is CSS (`active:scale-[0.97]`, 150 ms on the v2 curve), so it
 * needs no JS and adds no layout. `className` is appended — use it for
 * placement (`shrink-0`, margins), not to restyle the tone.
 */
const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { tone = 'white-ring', size = 40, className = '', type = 'button', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      data-v2-icon-button={tone}
      className={[
        'grid place-items-center rounded-full transition-transform duration-150 ease-v2 active:scale-[0.97]',
        'disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-accent',
        SIZE_CLASS[size],
        TONE_CLASS[tone],
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
});

export default IconButton;
