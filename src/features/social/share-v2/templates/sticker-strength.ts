/**
 * Strength sticker (SH-5b): transparent PNG — logo, name (2 lines) + level
 * ring when known, three numbers between hairlines, streak when there is one.
 */
import { drawLogo } from '../draw/logo';
import { drawRing, drawStatGrid, drawText, drawWrapped, hline, measureAt, setFont, drawFlame, statHeight } from '../draw/primitives';
import { wrapLines } from '../layout';
import { STICKER_BOX, withStickerBox } from './sticker-common';
import type { DrawArgs, ShareTemplateDef } from './template';

function draw(a: DrawArgs) {
  withStickerBox(a, () => {
    const { ctx, model: m, palette: p } = a;
    const B = STICKER_BOX;
    drawLogo(ctx, (B - 70) / 2, 10, 70, p);
    const left = 22;
    const right = B - 22;
    const ring = m.level ? 70 : 0;
    const nameW = right - left - (ring ? ring + 12 : 0);
    const lines = wrapLines(m.name, nameW, measureAt(ctx, 34, 900), 2).length;
    const textH = 20 + lines * 35;
    const blockH = Math.max(textH, ring);
    const top = 50;
    const tTop = top + (blockH - textH) / 2;
    drawText(ctx, m.chip, right, tTop, { size: 15, weight: 800, color: p.sub, lineH: 20, maxW: nameW });
    drawWrapped(ctx, m.name, right, tTop + 20, nameW, 2, { size: 34, weight: 900, color: p.fg, lineH: 35 });
    if (m.level) drawRing(ctx, left + ring / 2, top + blockH / 2, ring, m.level.frac, p, `${m.level.index}/${m.level.count}`, 'שלב');
    const stats = m.stats.filter((s) => s.unit !== 'ימים ברצף').slice(0, 3);
    const sTop = top + blockH + 14;
    const sH = 14 + statHeight(34) + 14;
    if (stats.length) {
      hline(ctx, 18, sTop, B - 36, p.hairline, 1.5);
      drawStatGrid(ctx, stats, 18, B - 36, sTop + 14, 34, p, { align: 'center', cols: stats.length });
      hline(ctx, 18, sTop + sH, B - 36, p.hairline, 1.5);
    }
    if (m.streakDays) {
      const label = `${m.streakDays} ימים ברצף`;
      setFont(ctx, 15, 800);
      const w = ctx.measureText(label).width + 20;
      const y = Math.min(B - 12 - 20, sTop + sH + 16);
      drawFlame(ctx, B / 2 + w / 2 - 15, y + 2, 15, '#fb923c');
      drawText(ctx, label, B / 2 + w / 2 - 20, y, { size: 15, weight: 800, color: p.fg, lineH: 20 });
    }
  });
}

export const strengthSticker: ShareTemplateDef = {
  id: 'strength-sticker',
  kind: 'strength',
  label: 'נתונים מרכזיים',
  formats: ['sticker'],
  brand: 'navy',
  naturalBackground: () => 'none',
  draw,
};
