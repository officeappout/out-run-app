/**
 * Run · "מינימל" (SH-2c): clean background, a small route mark, the
 * distance huge, pace and time underneath.
 */
import { drawRoute } from '../draw/route';
import { drawStatGrid, drawText, hline, measureAt, statHeight } from '../draw/primitives';
import { fitFontSize } from '../layout';
import { drawHeader } from './common';
import type { DrawArgs, ShareTemplateDef } from './template';

function draw(a: DrawArgs) {
  const { ctx, frame, model: m, palette: p } = a;
  const story = frame.format === 'story';
  const headerBottom = drawHeader(a);
  const rest = m.stats.filter((s) => s.unit !== m.hero.unit && s.unit !== 'הקפה מהירה').slice(0, 2);
  const side = 40;
  const statsH = rest.length ? 16 + statHeight(30) : 0;
  const statsTop = frame.h - (story ? 40 : 24) - statsH;
  if (rest.length) {
    hline(ctx, side, statsTop, frame.w - side * 2, p.hairline);
    drawStatGrid(ctx, rest, side, frame.w - side * 2, statsTop + 16, 30, p, { align: 'center', cols: rest.length });
  }
  const routeBox = m.route ? (story ? 120 : 84) : 0;
  const heroSize = fitFontSize(m.hero.value, frame.w - 40, story ? 190 : 128, 72, (s) => measureAt(ctx, s, 900)(m.hero.value));
  const heroLine = heroSize * 0.88;
  const unitSize = story ? 32 : 24;
  const groupH = (routeBox ? routeBox + 8 : 0) + heroLine + 4 + unitSize * 1.1;
  let y = headerBottom + (statsTop - headerBottom - groupH) / 2;
  const cx = frame.w / 2;
  if (m.route && routeBox) {
    drawRoute(ctx, m.route, cx - routeBox / 2, y, routeBox, routeBox, { ink: a.bg === 'photo' ? 'white' : 'gradient', width: story ? 6 : 5 });
    y += routeBox + 8;
  }
  drawText(ctx, m.hero.value, cx, y, { size: heroSize, weight: 900, color: p.fg, align: 'center', lineH: heroLine });
  const unit = m.hero.unit === 'ק״מ' ? 'קילומטר' : m.hero.unit;
  drawText(ctx, unit, cx, y + heroLine + 4, { size: unitSize, weight: 900, color: p.accentText, align: 'center', lineH: unitSize * 1.1 });
}

export const runMinimal: ShareTemplateDef = {
  id: 'run-minimal',
  kind: 'cardio',
  label: 'מינימל',
  formats: ['story', 'square'],
  brand: 'night',
  naturalBackground: () => 'plain',
  scrims: () => [{ deg: 180, stops: [[0, 'rgba(4,12,18,0.55)'], [1, 'rgba(4,12,18,0.75)']] }],
  draw,
};
