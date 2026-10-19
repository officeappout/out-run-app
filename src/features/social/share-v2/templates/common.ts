/** Pieces several templates share: the header row and the photo scrims. */
import { drawLogo, logoHeight } from '../draw/logo';
import { drawPill, drawText } from '../draw/primitives';
import type { Scrim } from '../draw/background';
import { HEADER_TOP, PAD, type DrawArgs } from './template';

/**
 * Logo on the right, the date on the left (a glass pill on photos, plain
 * text otherwise). `centered` puts the logo alone in the middle.
 */
export function drawHeader(a: DrawArgs, opts: { logoW?: number; centered?: boolean; date?: boolean } = {}): number {
  const { ctx, frame, palette, model, bg } = a;
  const fmt = frame.format;
  const pad = PAD[fmt];
  const top = HEADER_TOP[fmt];
  const lw = opts.logoW ?? (fmt === 'story' ? 70 : 64);
  const lh = logoHeight(lw);
  if (opts.centered) {
    drawLogo(ctx, (frame.w - lw) / 2, top + 2, lw, palette);
    return top + lh + 2;
  }
  const rowH = 30;
  drawLogo(ctx, frame.w - pad - lw, top + (rowH - lh) / 2, lw, palette);
  if (opts.date !== false && model.dateLabel) {
    if (bg === 'photo') drawPill(ctx, model.dateLabel, pad, top, 'left', 'rgba(255,255,255,0.18)', '#ffffff');
    else drawText(ctx, model.dateLabel, pad, top, { size: 15, weight: 800, color: palette.sub, align: 'left', lineH: rowH });
  }
  return top + rowH;
}

/** Story photos: dark at the top for the header, strong at the bottom for the text. */
export const STORY_BOTTOM_SCRIM: Scrim = {
  deg: 180,
  stops: [
    [0, 'rgba(4,12,18,0.55)'],
    [0.16, 'rgba(4,12,18,0)'],
    [0.36, 'rgba(4,12,18,0)'],
    [0.56, 'rgba(4,12,18,0.72)'],
    [1, 'rgba(4,12,18,0.95)'],
  ],
};

export const SQUARE_BOTTOM_SCRIM: Scrim = {
  deg: 180,
  stops: [
    [0, 'rgba(4,12,18,0.5)'],
    [0.22, 'rgba(4,12,18,0)'],
    [0.42, 'rgba(4,12,18,0.2)'],
    [0.78, 'rgba(4,12,18,0.9)'],
    [1, 'rgba(4,12,18,0.96)'],
  ],
};

/**
 * The big number + its unit on one baseline ("5.2 ק״מ"), right-anchored
 * (RTL: number first). Falls back to the hero (duration) without a distance.
 * Returns the block height.
 */
export function drawBigNumber(a: DrawArgs, right: number, top: number, size: number, unitSize: number, color?: string): number {
  const { ctx, model: m, palette: p } = a;
  const lineH = size * 0.95;
  const w = drawText(ctx, m.hero.value, right, top, { size, weight: 900, color: color ?? p.fg, lineH });
  drawText(ctx, m.hero.unit, right - w - 10, top + lineH - unitSize * 1.15 - size * 0.06, { size: unitSize, weight: 900, color: color ?? p.fg, lineH: unitSize * 1.1 });
  return lineH;
}
