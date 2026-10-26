/**
 * Where the map places drawer sits and how tall it is (pure CSS strings), so the map's floating
 * HUD (the "+" and recenter buttons) can stack right above it instead of under it.
 * Fixed heights on purpose: open / collapsed are known, never measured.
 */

import { V2_NAV_BOTTOM_CSS, V2_NAV_HEIGHT, V2_NAV_RAISE } from '@/components/ui/v2/bottom-chrome';

/** Above the floating nav pill + its raised map circle, with a small gap. */
export const PLACES_DRAWER_BOTTOM_CSS = `calc(${V2_NAV_BOTTOM_CSS} + ${V2_NAV_HEIGHT + V2_NAV_RAISE + 8}px)`;
/** Open: list / place workouts. */
export const PLACES_DRAWER_OPEN_HEIGHT_CSS = '40vh';
/** Collapsed: grabber + title + chips. */
export const PLACES_DRAWER_PEEK_PX = 124;
const HUD_GAP_PX = 12;

export function placesDrawerHeightCss(open: boolean): string {
  return open ? PLACES_DRAWER_OPEN_HEIGHT_CSS : `${PLACES_DRAWER_PEEK_PX}px`;
}

/** `bottom` of the map HUD column while the drawer is up. */
export function hudBottomAboveDrawerCss(open: boolean): string {
  return `calc(${PLACES_DRAWER_BOTTOM_CSS} + ${placesDrawerHeightCss(open)} + ${HUD_GAP_PX}px)`;
}
