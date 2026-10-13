'use client';

import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';

/**
 * BrandCtaButton — the primary brand CTA pill: live brand gradient
 * (#00BAF7 → #0CF2E3), dark `text-on-brand` label, rounded-full, cyan glow.
 *
 * Same visual language as the home workout card's CTA pill
 * (HeroWorkoutCard) and StickyActionButton's 'premium' variant. Dark text is
 * deliberate: white on this gradient is 1.4–2.4:1; slate-900 is 6.9–12.5:1
 * across every stop (see the `on-brand` token in tailwind.config.ts).
 *
 * Layout (width / padding / font size) is the caller's via `className`, so a
 * full-width landing CTA and a compact in-card pill can share one look.
 */
/** Visual identity only (fill + label colour + pill + glow) — for NON-interactive lookalikes (e.g. the
 *  decorative CTA pill inside a clickable card, where a nested <button> would be invalid HTML). */
export const BRAND_CTA_FILL_CLASS =
  'bg-brand-cta text-on-brand font-semibold rounded-full shadow-md shadow-cyan-400/25';

export const BRAND_CTA_CLASS =
  `${BRAND_CTA_FILL_CLASS} transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed`;

export default function BrandCtaButton({
  className = '',
  type = 'button',
  ...rest
}: HTMLMotionProps<'button'>) {
  return <motion.button type={type} className={`${BRAND_CTA_CLASS} ${className}`} {...rest} />;
}
