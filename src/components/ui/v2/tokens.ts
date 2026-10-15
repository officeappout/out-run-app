/**
 * Design language v2 — JS-side tokens.
 *
 * The same values live as CSS variables (`--v2-*` in src/app/globals.css) and
 * Tailwind tokens (`v2-*` / `activity-*` in tailwind.config.ts). This module
 * exists for the places CSS can't reach: framer-motion transitions, inline
 * SVG fills, canvas/chart colours. Source of truth for the language itself:
 * .claude/knowledge/design-language.md (v2), extracted from the marketing
 * site (appout-website).
 *
 * Plain .ts, zero React imports — safe to import from tests and pure logic.
 */

export const V2_COLORS = {
  /** Site accent — 123 uses in the site CSS (gradient start, chart strokes, tab underline). */
  accent: '#00baf7',
  /** Brand cyan var (`--brand-cyan`), the app's historical primary. */
  cyan: '#00c9f2',
  teal: '#00dcd0',
  ctaFrom: '#00baf7',
  ctaTo: '#0cf2e3',
  onCta: '#04222b',
  /** Deep cyan — eyebrows, links, icon colour on a cyan tint. */
  deep: '#0284c7',
  ink: '#0e1419',
  ink2: '#4b5a66',
  muted: '#64748b',
  surface: '#f6fbfd',
  /** Icon-tile / chip tint. */
  tint: '#eef8fc',
  hairline: '#e6edf2',
  hairlineCool: '#e6f0f4',
  pillBorder: '#dfe7ed',
  gold: '#ffc83d',
  onGold: '#7a4a00',
  amber: '#f59e0b',
  up: '#10b981',
  down: '#e5484d',
} as const;

/** Semantic activity colours — the only non-brand hues allowed as accents. */
export const ACTIVITY_COLORS = {
  steps: '#00c07a',
  run: '#00c9f2',
  bike: '#39d98a',
} as const;

export type ActivityTone = keyof typeof ACTIVITY_COLORS;

/** The v2 curve — used for every transition (CSS: `ease-v2`, `var(--v2-ease)`). */
export const EASE_V2 = [0.23, 1, 0.32, 1] as const;
export const EASE_V2_CSS = 'cubic-bezier(0.23, 1, 0.32, 1)';

/** Press feedback scale for anything tappable. */
export const PRESS_SCALE = 0.97;

/** Spring pop-in for chips/badges (site: app-ui/LevelUpRing.tsx). */
export const SPRING_POP = { type: 'spring', stiffness: 400, damping: 15 } as const;

/** Standard durations (seconds, framer-motion units). */
export const DURATION = { fast: 0.18, base: 0.32, slow: 0.6 } as const;
