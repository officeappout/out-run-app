/**
 * Run stickers (SH-5a, SH-5d peek): transparent PNG — the route line with
 * its glow, the distance, pace + time, and the logo. No URL.
 */
import { drawLogo, logoHeight } from '../draw/logo';
import { drawStatGrid } from '../draw/primitives';
import { drawRoute } from '../draw/route';
import { centeredBigNumber, STICKER_BOX, stickerRouteInk, withStickerBox } from './sticker-common';
import type { DrawArgs, ShareTemplateDef } from './template';

const side = (a: DrawArgs) => a.model.stats.filter((s) => s.unit !== a.model.hero.unit && s.unit !== 'הקפה מהירה').slice(0, 2);

function drawRouteSticker(a: DrawArgs) {
  withStickerBox(a, () => {
    const { ctx, model: m, palette: p } = a;
    const B = STICKER_BOX;
    const hasRoute = !!m.route && drawRoute(ctx, m.route, (B - 118) / 2, 6, 118, 118, { ink: stickerRouteInk(a), width: 4.5 });
    const numTop = hasRoute ? 132 : 56;
    centeredBigNumber(a, B / 2, numTop, hasRoute ? 76 : 92, hasRoute ? 24 : 28);
    const stats = side(a);
    if (stats.length) drawStatGrid(ctx, stats, 40, B - 80, numTop + (hasRoute ? 80 : 100), 26, p, { align: 'center', cols: stats.length });
    const lw = 64;
    drawLogo(ctx, (B - lw) / 2, B - 4 - logoHeight(lw), lw, p);
  });
}

function drawStatsSticker(a: DrawArgs) {
  withStickerBox(a, () => {
    const { ctx, palette: p } = a;
    const B = STICKER_BOX;
    centeredBigNumber(a, B / 2, 40, 96, 28);
    const stats = side(a);
    if (stats.length) drawStatGrid(ctx, stats, 40, B - 80, 160, 30, p, { align: 'center', cols: stats.length });
    const lw = 70;
    drawLogo(ctx, (B - lw) / 2, B - 14 - logoHeight(lw), lw, p);
  });
}

const base = {
  kind: 'cardio' as const,
  formats: ['sticker' as const],
  brand: 'night' as const,
  naturalBackground: () => 'none' as const,
};

export const runSticker: ShareTemplateDef = { ...base, id: 'run-sticker', label: 'מסלול + נתונים', draw: drawRouteSticker };
export const runStickerStats: ShareTemplateDef = { ...base, id: 'run-sticker-stats', label: 'נתונים', draw: drawStatsSticker };
