/**
 * Transparent stickers (SH-5a/b): everything is drawn in a 300-unit box
 * (the boards' sticker size) scaled onto the 390 frame, with one ink colour
 * and a soft shadow so it reads on any photo.
 */
import type { RouteStyle } from '../draw/route';
import { drawText, setFont } from '../draw/primitives';
import type { DrawArgs } from './template';

export const STICKER_BOX = 300;

export function withStickerBox(a: DrawArgs, body: () => void) {
  const { ctx, frame, palette: p } = a;
  ctx.save();
  ctx.scale(frame.w / STICKER_BOX, frame.w / STICKER_BOX);
  if (p.shadow) {
    ctx.shadowColor = p.shadow;
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 1.5;
  }
  body();
  ctx.restore();
}

export function stickerRouteInk(a: DrawArgs): RouteStyle['ink'] {
  return a.palette.tone === 'ink-white' ? 'white' : a.palette.tone === 'ink-dark' ? 'dark' : 'gradient';
}

/** "5.2 ק״מ" centred on cx (number first in RTL = on the right). Returns the line height. */
export function centeredBigNumber(a: DrawArgs, cx: number, top: number, size: number, unitSize: number): number {
  const { ctx, model: m, palette: p } = a;
  setFont(ctx, size, 900);
  const nw = ctx.measureText(m.hero.value).width;
  setFont(ctx, unitSize, 900);
  const uw = ctx.measureText(m.hero.unit).width;
  const gap = 8;
  const right = cx + (nw + gap + uw) / 2;
  const lineH = size * 0.95;
  drawText(ctx, m.hero.value, right, top, { size, weight: 900, color: p.fg, lineH });
  drawText(ctx, m.hero.unit, right - nw - gap, top + lineH - unitSize * 1.15 - size * 0.06, { size: unitSize, weight: 900, color: p.fg, lineH: unitSize * 1.1 });
  return lineH;
}
