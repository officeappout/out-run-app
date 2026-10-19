/**
 * What one share template is: an id + label, the formats it supports, how
 * its 'brand' background looks, its photo scrim, and a draw function that
 * paints the content (the renderer has already painted the background).
 */
import type { ShareImageSource, Scrim } from '../draw/background';
import type { SharePalette } from '../palette';
import type { BrandStyle, ShareBackground, ShareFormat, ShareFrame, ShareKind, ShareModel } from '../types';

export interface DrawArgs {
  ctx: CanvasRenderingContext2D;
  frame: ShareFrame;
  model: ShareModel;
  palette: SharePalette;
  bg: ShareBackground;
  photo?: ShareImageSource | null;
}

export interface ShareTemplateDef {
  id: string;
  kind: ShareKind;
  label: string;
  formats: ShareFormat[];
  brand: BrandStyle;
  /** The template's own background when the user hasn't picked one. */
  naturalBackground: (hasPhoto: boolean) => ShareBackground;
  scrims?: (format: ShareFormat) => Scrim[];
  /** Photo focal point (0..1), default [0.5, 0.4]. */
  focal?: [number, number];
  /** Shown only for workouts that have what it needs (e.g. a group run). */
  available?: (m: ShareModel) => boolean;
  draw: (a: DrawArgs) => void;
}

/** Shared margins (design units) per format. */
export const PAD = { story: 22, square: 20, sticker: 20 } as const;

/** Header: logo on the right (RTL), optional date on the left. Returns the header's bottom y. */
export const HEADER_TOP = { story: 24, square: 20, sticker: 20 } as const;
