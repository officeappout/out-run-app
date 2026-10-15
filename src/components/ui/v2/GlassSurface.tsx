'use client';

import { forwardRef, type HTMLAttributes } from 'react';

export type GlassRecipe = 'bar' | 'card' | 'chip';

const RECIPE_CLASS: Record<GlassRecipe, string> = {
  bar: 'v2-glass-bar',
  card: 'v2-glass-card',
  chip: 'v2-glass-chip',
};

export interface GlassSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * bar  — light glass bar (site header): white gradient, blur 22 + saturate 185%.
   * card — floating glass card: white .88, white border, blur 16 + saturate 180%, soft shadow.
   * chip — dark glass chip: black .35, white .35 border, blur 10.
   */
  recipe?: GlassRecipe;
}

/**
 * GlassSurface — the three site glass recipes as one primitive. The CSS lives
 * in globals.css (`.v2-glass-*`) so every recipe ships `-webkit-backdrop-filter`
 * and an `@supports not (backdrop-filter)` solid fallback in one place.
 *
 * Rules: only over rich content (map, video, imagery, gradients) — glass over
 * flat white is invisible cost. Never nest one blurred layer inside another
 * (Android WebView scroll cost).
 */
const GlassSurface = forwardRef<HTMLDivElement, GlassSurfaceProps>(function GlassSurface(
  { recipe = 'card', className = '', ...rest },
  ref,
) {
  return <div ref={ref} data-v2-glass={recipe} className={`${RECIPE_CLASS[recipe]} ${className}`} {...rest} />;
});

export default GlassSurface;
