/**
 * Combined (walk / run + strength) · its own card (enable_workout_post_v1, boards PostShare /
 * PostPhotoShare): the name, the total time huge, the aerobic km and the strength sets.
 */
import { drawText, drawStatGrid, hline, statHeight } from '../draw/primitives';
import { drawHeader, SQUARE_BOTTOM_SCRIM, STORY_BOTTOM_SCRIM } from './common';
import { PAD, type DrawArgs, type ShareTemplateDef } from './template';
import { shareT } from '../copy';
import type { ShareKind } from '../types';

function draw(a: DrawArgs) {
  const { ctx, frame, model: m, palette: p } = a;
  const story = frame.format === 'story';
  const pad = PAD[frame.format] + 8;
  const cx = frame.w / 2;
  const headerBottom = drawHeader(a);
  const statsH = m.stats.length ? 18 + statHeight(story ? 34 : 28) : 0;
  const statsTop = frame.h - (story ? 44 : 24) - statsH;
  const heroSize = story ? 170 : 116;
  const heroLine = heroSize * 0.88;
  const groupH = 26 + heroLine + 6 + 34;
  let y = headerBottom + (statsTop - headerBottom - groupH) / 2;
  drawText(ctx, m.chip, cx, y, { size: story ? 18 : 15, weight: 800, color: p.sub, align: 'center', lineH: 24, maxW: frame.w - pad * 2 });
  y += 30;
  drawText(ctx, m.hero.value, cx, y, { size: heroSize, weight: 900, color: p.fg, align: 'center', lineH: heroLine });
  drawText(ctx, m.hero.unit, cx, y + heroLine + 6, { size: story ? 30 : 22, weight: 900, color: p.accentText, align: 'center', lineH: 34 });
  if (m.stats.length) {
    hline(ctx, pad, statsTop, frame.w - pad * 2, p.hairline);
    drawStatGrid(ctx, m.stats, pad, frame.w - pad * 2, statsTop + 18, story ? 34 : 28, p, { align: 'center', cols: m.stats.length });
  }
}

const combinedFor = (kind: ShareKind): ShareTemplateDef => ({
  id: `${kind}-combined-card`,
  kind,
  get label() { return shareT('shareV2.template.combined'); },
  formats: ['story', 'square'],
  brand: 'navy',
  naturalBackground: (hasPhoto) => (hasPhoto ? 'photo' : 'brand'),
  scrims: (f) => [f === 'story' ? STORY_BOTTOM_SCRIM : SQUARE_BOTTOM_SCRIM],
  available: (m) => !!m.postV1 && !!m.combined,
  draw,
});

export const strengthCombinedCard = combinedFor('strength');
export const cardioCombinedCard = combinedFor('cardio');
