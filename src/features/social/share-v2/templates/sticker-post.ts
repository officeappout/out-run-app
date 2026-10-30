/**
 * The post family's new transparent stickers (enable_workout_post_v1, board PostStickers / פו9),
 * logo at the bottom (owner rule for transparent stickers):
 *   strength-sticker-table  the name + one row per exercise with its set boxes
 *   run-sticker-splits      the big number + the per-km pace bars (fastest in turquoise)
 * Each shows only when the workout has what it needs.
 */
import { drawLogo, logoHeight } from '../draw/logo';
import { drawPaceBars, drawSetRows, drawWrapped } from '../draw/primitives';
import { centeredBigNumber, STICKER_BOX, withStickerBox } from './sticker-common';
import type { DrawArgs, ShareTemplateDef } from './template';
import { shareT } from '../copy';

const LOGO_W = 64;
const logoAtBottom = (a: DrawArgs) => {
  const B = STICKER_BOX;
  drawLogo(a.ctx, (B - LOGO_W) / 2, B - 6 - logoHeight(LOGO_W), LOGO_W, a.palette);
};

function drawTable(a: DrawArgs) {
  withStickerBox(a, () => {
    const { ctx, model: m, palette: p } = a;
    const B = STICKER_BOX;
    const nameH = drawWrapped(ctx, m.name, B - 20, 8, B - 40, 1, { size: 26, weight: 900, color: p.fg, lineH: 30 });
    drawSetRows(ctx, m.rows, 20, B - 20, 8 + nameH + 10, p, { rowH: 40, box: 30, nameSize: 16 });
    logoAtBottom(a);
  });
}

function drawSplits(a: DrawArgs) {
  withStickerBox(a, () => {
    const { ctx, model: m, palette: p } = a;
    const B = STICKER_BOX;
    const h = centeredBigNumber(a, B / 2, 6, 64, 22);
    if (m.splits) drawPaceBars(ctx, m.splits.heights, m.splits.fastestIndex, m.splits.fastestLabel, 24, B - 48, 6 + h + 12, 150, p);
    logoAtBottom(a);
  });
}

export const strengthStickerTable: ShareTemplateDef = {
  id: 'strength-sticker-table',
  kind: 'strength',
  get label() { return shareT('shareV2.template.exerciseTable'); },
  formats: ['sticker'],
  brand: 'navy',
  naturalBackground: () => 'none',
  available: (m) => !!m.postV1 && m.rows.length > 0,
  draw: drawTable,
};

export const runStickerSplits: ShareTemplateDef = {
  id: 'run-sticker-splits',
  kind: 'cardio',
  get label() { return shareT('shareV2.template.splits'); },
  formats: ['sticker'],
  brand: 'night',
  naturalBackground: () => 'none',
  available: (m) => !!m.postV1 && !!m.splits,
  draw: drawSplits,
};
