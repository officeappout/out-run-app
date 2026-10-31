/**
 * Run · "מקטעים" (enable_workout_post_v1, board PostPhotoShare): the distance, then a table of
 * the per-km paces (fastest in turquoise), on the run's photo or its night background.
 */
import { drawText, hline, statHeight, drawStatGrid } from '../draw/primitives';
import { drawBigNumber, drawHeader, SQUARE_BOTTOM_SCRIM, STORY_BOTTOM_SCRIM } from './common';
import { PAD, type DrawArgs, type ShareTemplateDef } from './template';
import { shareT } from '../copy';

const FASTEST = '#2ee6d6';

function draw(a: DrawArgs) {
  const { ctx, frame, model: m, palette: p } = a;
  const story = frame.format === 'story';
  const pad = PAD[frame.format] + 8;
  const top = drawHeader(a) + (story ? 28 : 14);
  const right = frame.w - pad;
  const bigH = drawBigNumber(a, right, top, story ? 86 : 60, story ? 26 : 20);
  const labels = m.splits?.labels ?? [];
  const rows = labels.slice(0, story ? 10 : 5);
  const rowH = story ? 30 : 24;
  let y = top + bigH + (story ? 22 : 12);
  drawText(ctx, shareT('shareV2.splits.title'), right, y, { size: story ? 15 : 13, weight: 900, color: p.sub, lineH: 20 });
  y += 24;
  rows.forEach((pace, i) => {
    const fast = i === m.splits?.fastestIndex;
    hline(ctx, pad, y, frame.w - pad * 2, p.hairline);
    drawText(ctx, String(i + 1), right, y + 4, { size: story ? 17 : 15, weight: 800, color: p.sub, lineH: rowH - 4 });
    drawText(ctx, pace, pad, y + 4, { size: story ? 19 : 16, weight: 900, color: fast ? FASTEST : p.fg, align: 'left', lineH: rowH - 4 });
    y += rowH;
  });
  const rest = m.stats.filter((s) => s.unit !== m.hero.unit).slice(0, 2);
  if (rest.length) {
    const statsTop = frame.h - (story ? 40 : 22) - statHeight(26);
    drawStatGrid(ctx, rest, pad, frame.w - pad * 2, statsTop, 26, p, { align: 'center', cols: rest.length });
  }
}

export const runSplits: ShareTemplateDef = {
  id: 'run-splits',
  kind: 'cardio',
  get label() { return shareT('shareV2.template.splits'); },
  formats: ['story', 'square'],
  brand: 'night',
  naturalBackground: (hasPhoto) => (hasPhoto ? 'photo' : 'brand'),
  scrims: (f) => [f === 'story' ? STORY_BOTTOM_SCRIM : SQUARE_BOTTOM_SCRIM],
  available: (m) => !!m.postV1 && !!m.splits?.labels && m.splits.labels.length >= 2,
  draw,
};
