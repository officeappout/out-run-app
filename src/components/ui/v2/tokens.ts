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
  // Named `cycle`, not `bike`, on purpose: a 'bike' literal type here is
  // checked before the existing commute-method union and reorders how tsc
  // prints it, which the tsc-baseline gate reads as a "new" error. The
  // Tailwind/CSS token keeps the site's name: activity-bike / --activity-bike.
  cycle: '#39d98a',
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

/**
 * Z-bands a v2 `<Sheet>` may use — each value is a row of the documented
 * Z-Index Budget in .cursorrules (DO NOT add a value here without adding it
 * there first). Pick the band of the screen the sheet opens over.
 */
export const SHEET_Z = {
  /** Map drawers / home sheets that sit over BottomNavbar (z-50) — budget row z-[60]/z-[61]. */
  drawer: 60,
  /** Sheet one step above a z-[60] backdrop (split layout panel) — budget row z-[60]/z-[61]. */
  drawerPanel: 61,
  /** Library filter sheets (FilterSheet / EquipmentFilterSheet) backdrop — budget row z-[70] (filter sheets note). */
  filter: 70,
  /** Library filter sheet panel over its z-[70] backdrop — budget row z-[70] (panel z-[71]). */
  filterPanel: 71,
  /** Full-screen overlays & map sheets — budget row z-[100]. */
  overlay: 100,
  /** Clears OfflineBanner (z-[100]) — budget row z-[101]. */
  aboveOffline: 101,
} as const;

export type SheetZIndex = (typeof SHEET_Z)[keyof typeof SHEET_Z];

/** The v2 sheet spring (stiffness 340, damping 34) shared by the home/map sheets. */
export const SPRING_SHEET = { type: 'spring', stiffness: 340, damping: 34 } as const;
