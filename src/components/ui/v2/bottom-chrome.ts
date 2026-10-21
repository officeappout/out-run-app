/**
 * bottom-chrome — where the v2 floating chrome sits at the bottom of the screen and how
 * much room a scroll container needs so its last item is never covered (pure).
 *
 * The v2 bottom nav (BottomNavbar → BottomNavV2) is a 58 px glass pill floating
 * `max(8px, safe-area − 10px)` above the screen edge, with the map as a 64 px circle
 * raised out of it (`-mt-9` → it sticks 21 px above the pill). Anything floating
 * (the home "+" FAB) sits above that whole stack, and a scroll container pads its end
 * by the stack's height (+ the FAB when there is one) so the last card can scroll clear.
 *
 * Two forms of every number: px for a given safe-area inset (tests, reasoning) and a CSS
 * string with `env(safe-area-inset-bottom)` (what the components use).
 */

/** Height of the v2 nav pill. */
export const V2_NAV_HEIGHT = 58;
/** How far the raised map circle sticks out above the pill (64 px circle, -mt-9, centred). */
export const V2_NAV_RAISE = 21;
/** Smallest distance between the pill and the screen edge. */
export const V2_NAV_MIN_GAP = 8;
/** The pill tucks this far into the home-indicator safe area. */
export const V2_NAV_SAFE_TUCK = 10;
/** Floating action button (home "+"). */
export const V2_FAB_SIZE = 56;
/** Gap between stacked floating things (nav → FAB, FAB/nav → last content). */
export const V2_FLOAT_GAP = 16;

const SAFE = 'env(safe-area-inset-bottom, 0px)';

/** `bottom` of the nav pill, px. */
export function navBottomPx(safeInset: number): number {
  return Math.max(V2_NAV_MIN_GAP, safeInset - V2_NAV_SAFE_TUCK);
}

/** Top of the nav stack (pill + raised map circle), measured from the screen bottom, px. */
export function navStackTopPx(safeInset: number): number {
  return navBottomPx(safeInset) + V2_NAV_HEIGHT + V2_NAV_RAISE;
}

/** `bottom` of a FAB floating above the nav stack, px. */
export function fabBottomPx(safeInset: number): number {
  return navStackTopPx(safeInset) + V2_FLOAT_GAP;
}

/**
 * Distance from the screen bottom that the end of a scroll container's content must
 * reach so nothing floating covers it: above the FAB when there is one, else above the
 * nav stack — plus one gap.
 */
export function scrollEndClearancePx(safeInset: number, opts: { fab: boolean }): number {
  const top = opts.fab ? fabBottomPx(safeInset) + V2_FAB_SIZE : navStackTopPx(safeInset);
  return top + V2_FLOAT_GAP;
}

/** CSS `bottom` of the nav pill (same rule as navBottomPx). */
export const V2_NAV_BOTTOM_CSS = `max(${V2_NAV_MIN_GAP}px, calc(${SAFE} - ${V2_NAV_SAFE_TUCK}px))`;

/** CSS `bottom` of a FAB above the nav stack (same rule as fabBottomPx). */
export const V2_FAB_BOTTOM_CSS = `calc(${V2_NAV_BOTTOM_CSS} + ${V2_NAV_HEIGHT + V2_NAV_RAISE + V2_FLOAT_GAP}px)`;

/**
 * CSS `padding-bottom` for the end of a scroll container's content.
 * `reservedCss` = what an ancestor already reserves at the bottom (ClientLayout's <main>
 * pads `3rem + safe-area` on routes with the nav) — subtracted so the total equals
 * scrollEndClearancePx, never less than 0.
 */
export function scrollEndPaddingCss(opts: { fab: boolean; reservedCss?: string }): string {
  const extra = opts.fab
    ? V2_NAV_HEIGHT + V2_NAV_RAISE + V2_FLOAT_GAP + V2_FAB_SIZE + V2_FLOAT_GAP
    : V2_NAV_HEIGHT + V2_NAV_RAISE + V2_FLOAT_GAP;
  const reserved = opts.reservedCss ? ` - (${opts.reservedCss})` : '';
  return `max(0px, calc(${V2_NAV_BOTTOM_CSS} + ${extra}px${reserved}))`;
}

/** What ClientLayout's <main> reserves at the bottom on routes that show the nav. */
export const APP_MAIN_NAV_RESERVE_CSS = `3rem + ${SAFE}`;
/** Same, in px for a given safe-area inset. */
export function appMainNavReservePx(safeInset: number): number {
  return 48 + safeInset;
}

/**
 * Bottom padding for a sheet's scroll body that ends under a sticky footer: the footer's
 * measured height + one gap, never below `minPx` (the static padding used before the
 * footer has been measured).
 */
export function stickyFooterPaddingPx(footerHeight: number | null | undefined, minPx = 144): number {
  if (footerHeight == null || !Number.isFinite(footerHeight) || footerHeight <= 0) return minPx;
  return Math.max(minPx, Math.ceil(footerHeight) + V2_FLOAT_GAP);
}
