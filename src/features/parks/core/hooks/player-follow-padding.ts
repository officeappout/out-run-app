/**
 * PURE follow-camera padding for the home-v2 live players (enable_home_v2).
 *
 * Why: the legacy Waze framing (useCameraController.wazePadding) pads the TOP
 * half of the screen and nothing at the bottom, so the user's marker lands
 * ~25 % from the bottom edge. The v2 players (free run, continuous, planned
 * intervals, hybrid) float a header card at the top AND a tall live card at
 * the bottom — that 25 % band is exactly under the bottom card, so the runner
 * never saw themselves on the map.
 *
 * A v2 player publishes its chrome (useMapStore.playerChrome: px covered from
 * the top edge and from the bottom edge, safe areas included). This helper
 * returns the Mapbox padding that puts the marker inside the uncovered window
 * between them, a little below its middle (road ahead stays visible above
 * the marker in heading-up mode).
 *
 * Mapbox puts the camera centre in the middle of the un-padded area:
 *   y = (padTop + H - padBottom) / 2
 */

export interface PlayerChrome {
  /** px covered from the top edge (safe area + header card + gap). */
  top: number;
  /** px covered from the bottom edge (safe area + live card + gap). */
  bottom: number;
  /**
   * enable_run_player_drawer_v1: the bottom chrome is the run / walk metrics
   * drawer. The camera then uses drawerFollowPadding (never the legacy
   * fallback) and re-follows sooner after a pan. Absent for every other player.
   */
  drawer?: boolean;
}

export interface CameraPadding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Where the marker sits inside the free window (0 = its top, 1 = its bottom). */
export const PLAYER_DOT_FRACTION = 0.6;

/** Below this many free px there's no sensible window — caller keeps its default. */
export const MIN_FREE_WINDOW_PX = 96;

/**
 * Padding that keeps the marker visible between a v2 player's header and
 * bottom card. Returns null when the input is unusable (no chrome, bad
 * numbers, or the cards leave less than MIN_FREE_WINDOW_PX) so the caller
 * falls back to its legacy padding.
 */
export function playerFollowPadding(
  viewportH: number,
  chrome: PlayerChrome | null | undefined,
  dotFraction: number = PLAYER_DOT_FRACTION,
): CameraPadding | null {
  if (!chrome || !Number.isFinite(viewportH) || viewportH <= 0) return null;
  const top = Math.max(0, Number.isFinite(chrome.top) ? chrome.top : 0);
  const bottom = Math.max(0, Number.isFinite(chrome.bottom) ? chrome.bottom : 0);
  const free = viewportH - top - bottom;
  if (free < MIN_FREE_WINDOW_PX) return null;

  const f = Math.min(1, Math.max(0, dotFraction));
  const dotY = top + free * f;
  // Solve (padTop + H - padBottom) / 2 = dotY with padBottom = bottom.
  const padTop = Math.max(0, Math.round(2 * dotY - viewportH + bottom));
  return { top: padTop, bottom: Math.round(bottom), left: 0, right: 0 };
}

/** y (px from the top) where Mapbox will place the camera centre for a padding. */
export function cameraCentreY(viewportH: number, padding: Pick<CameraPadding, 'top' | 'bottom'>): number {
  return (padding.top + viewportH - padding.bottom) / 2;
}

/** Shallow equality so the store write can skip no-op updates. */
export function sameChrome(a: PlayerChrome | null, b: PlayerChrome | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.top === b.top && a.bottom === b.bottom && !!a.drawer === !!b.drawer;
}

/** Drawer players: the marker never sits closer than this to the drawer's top edge. */
export const DRAWER_MARKER_CLEARANCE_PX = 44;
/** …nor closer than this to the screen's top edge (status bar) in the tiny-gap case. */
const DRAWER_MARKER_MIN_Y = 28;

/**
 * Follow padding for the run / walk metrics drawer (enable_run_player_drawer_v1).
 * Same framing as playerFollowPadding while the free window is comfortable;
 * when the header + drawer leave less than MIN_FREE_WINDOW_PX it does NOT give
 * up (the legacy framing put the marker under the card) — the marker goes just
 * above the drawer's top edge instead, even if that is behind the header's
 * fade. Never null for a usable viewport, and the padding always fits it.
 */
export function drawerFollowPadding(
  viewportH: number,
  chrome: PlayerChrome | null | undefined,
  dotFraction: number = PLAYER_DOT_FRACTION,
): CameraPadding | null {
  if (!chrome || !Number.isFinite(viewportH) || viewportH <= 0) return null;
  const normal = playerFollowPadding(viewportH, chrome, dotFraction);
  if (normal && normal.top + normal.bottom < viewportH) return normal;
  const bottom = Math.max(0, Number.isFinite(chrome.bottom) ? chrome.bottom : 0);
  const maxY = viewportH - DRAWER_MARKER_MIN_Y;
  const dotY = Math.min(maxY, Math.max(DRAWER_MARKER_MIN_Y, viewportH - bottom - DRAWER_MARKER_CLEARANCE_PX));
  // Centre y = (padTop + H - padBottom) / 2 = dotY, with only one side padded.
  if (dotY >= viewportH / 2) return { top: Math.round(2 * dotY - viewportH), bottom: 0, left: 0, right: 0 };
  return { top: 0, bottom: Math.round(viewportH - 2 * dotY), left: 0, right: 0 };
}
