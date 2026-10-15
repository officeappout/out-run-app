'use client';

import { forwardRef } from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { PRESS_SCALE } from './tokens';

export type ButtonVariant = 'primary' | 'dark' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  // Site primary CTA: gradient + dark label + inset highlight + cyan glow.
  primary: 'bg-v2-cta text-v2-on-cta shadow-v2-cta',
  // Dark ink pill.
  dark: 'bg-v2-ink text-white shadow-v2-ring',
  // White pill with the 1.5px hairline border.
  ghost: 'bg-white text-v2-ink border-[1.5px] border-v2-pill-border',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-[13px]',
  md: 'h-11 px-5 text-[15px]',
  lg: 'h-14 px-7 text-[17px]',
};

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container width. */
  block?: boolean;
  children?: React.ReactNode;
}

/**
 * v2 Button — pill, heavy label, press scale 0.97 on the v2 curve.
 * Respects prefers-reduced-motion (no press scale when reduced).
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', block = false, className = '', type = 'button', ...rest },
  ref,
) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      ref={ref}
      type={type}
      data-v2-button={variant}
      whileTap={reduce ? undefined : { scale: PRESS_SCALE }}
      transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-full font-extrabold tracking-[-0.01em]',
        'select-none whitespace-nowrap transition-[filter,opacity] duration-200 ease-v2',
        'disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-v2-accent focus-visible:ring-offset-2',
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        block ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    />
  );
});

export default Button;
