/**
 * Wide-layout decision + scale (enable_wide_player_v1). Pure — no DOM.
 *
 * "Wide" is decided from the player's own container size (not the user agent):
 * a desktop / tablet / TV browser (width >= 900) or a landscape phone
 * (landscape and height < 700). Everything else keeps today's portrait player.
 */

export const WIDE_MIN_WIDTH = 900;
export const WIDE_LANDSCAPE_MAX_HEIGHT = 700;

/** Logical width the cards inside the side panel are designed for (px). */
export const WIDE_PANEL_LOGICAL_WIDTH = 360;
/** Logical height a tallest panel card needs (px) — keeps a landscape phone from clipping. */
export const WIDE_PANEL_LOGICAL_HEIGHT = 420;
/** Share of the container width the side panel takes. */
export const WIDE_PANEL_WIDTH_RATIO = 0.38;
export const WIDE_SCALE_MIN = 0.6;
export const WIDE_SCALE_MAX = 4.5;

export interface Size {
  width: number;
  height: number;
}

export interface WideLayout {
  /** The flag is on (false → every wide / immersive code path stays off). */
  enabled: boolean;
  wide: boolean;
  /** Container is wider than tall (a rotated phone). Only ever true when enabled. */
  landscape: boolean;
  /** Zoom for the side panel's content so it stays proportional from 360px to 3840px. 1 when not wide. */
  scale: number;
}

export const WIDE_OFF: WideLayout = { enabled: false, wide: false, landscape: false, scale: 1 };

export function isWideLayout({ width, height }: Size): boolean {
  if (!(width > 0) || !(height > 0)) return false;
  if (width >= WIDE_MIN_WIDTH) return true;
  return width > height && height < WIDE_LANDSCAPE_MAX_HEIGHT;
}

export function wideScale({ width, height }: Size): number {
  if (!(width > 0) || !(height > 0)) return 1;
  const byWidth = (width * WIDE_PANEL_WIDTH_RATIO) / WIDE_PANEL_LOGICAL_WIDTH;
  const byHeight = (height * 0.9) / WIDE_PANEL_LOGICAL_HEIGHT;
  const raw = Math.min(byWidth, byHeight);
  return Math.round(Math.min(WIDE_SCALE_MAX, Math.max(WIDE_SCALE_MIN, raw)) * 100) / 100;
}

export function computeWideLayout(size: Size): WideLayout {
  const wide = isWideLayout(size);
  return {
    enabled: true,
    wide,
    landscape: size.width > 0 && size.height > 0 && size.width > size.height,
    scale: wide ? wideScale(size) : 1,
  };
}
