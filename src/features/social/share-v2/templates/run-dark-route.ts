/**
 * Run · "מסלול גדול" (SH-2b story, SH-3d square): night background with a
 * hint of streets, a big lime→turquoise route with numbered km markers, the
 * distance + pace + time, and the pace-per-lap bars (fastest in turquoise).
 */
import { drawLogo } from '../draw/logo';
import { drawPaceBars, drawStatGrid, drawText, fillRound, roundRect, statHeight } from '../draw/primitives';
import { drawRoute } from '../draw/route';
import { stackFromBottom } from '../layout';
import type { SharePalette } from '../palette';
import type { ShareModel } from '../types';
import { drawBigNumber, drawHeader } from './common';
import { PAD, type DrawArgs, type ShareTemplateDef } from './template';

function routeStyle(a: DrawArgs, width: number) {
  const light = a.palette.tone === 'light';
  return {
    ink: (a.bg === 'photo' ? 'white' : 'gradient') as 'white' | 'gradient',
    width,
    kmMarks: a.model.kmMarks,
    markerFill: light ? '#ffffff' : '#0b2230',
  };
}

const panelHeight = (barsH: number) => 10 + 20 + 4 + barsH + 20 + 10;

function splitsPanel(ctx: CanvasRenderingContext2D, m: ShareModel, p: SharePalette, left: number, width: number, top: number, barsH: number) {
  if (!m.splits) return;
  const h = panelHeight(barsH);
  fillRound(ctx, left, top, width, h, 20, p.panelBg);
  roundRect(ctx, left + 0.5, top + 0.5, width - 1, h - 1, 20);
  ctx.strokeStyle = p.panelRing;
  ctx.lineWidth = 1;
  ctx.stroke();
  drawText(ctx, 'קצב לפי הקפה', left + width - 14, top + 10, { size: 15, weight: 800, color: p.sub, lineH: 20 });
  drawPaceBars(ctx, m.splits.heights, m.splits.fastestIndex, m.splits.fastestLabel, left + 14, width - 28, top + 34, barsH, p);
}

function story(a: DrawArgs) {
  const { ctx, frame, model: m, palette: p } = a;
  const headerBottom = drawHeader(a);
  const pad = PAD.story;
  const right = frame.w - pad;
  const width = frame.w - pad * 2;
  const barsH = 72;
  const [eyeY, bigY, panelY] = stackFromBottom(frame.h - 24, [
    { h: 20 },
    { h: 80 * 0.95, gapAbove: 2 },
    { h: m.splits ? panelHeight(barsH) : 0, gapAbove: 14 },
  ]);
  if (m.route) {
    const regionTop = headerBottom + 10;
    const regionH = eyeY - 14 - regionTop;
    const box = Math.min(frame.w - 30, regionH);
    if (box > 120) drawRoute(ctx, m.route, (frame.w - box) / 2, regionTop + (regionH - box) / 2, box, box, routeStyle(a, 6));
  }
  drawText(ctx, m.chip, right, eyeY, { size: 16, weight: 800, color: p.accentText, lineH: 20, maxW: width });
  drawBigNumber(a, right, bigY, 80, 26);
  const side = m.stats.filter((s) => s.unit !== m.hero.unit && s.unit !== 'הקפה מהירה').slice(0, 2);
  if (side.length) {
    const colW = 84;
    drawStatGrid(ctx, side, pad, colW * side.length, bigY + 80 * 0.95 - statHeight(28) - 4, 28, p, { cols: side.length });
  }
  splitsPanel(ctx, m, p, pad, width, panelY, barsH);
}

function square(a: DrawArgs) {
  const { ctx, frame, model: m, palette: p } = a;
  const barsH = 56;
  const panelH = m.splits ? panelHeight(barsH) : 0;
  const panelTop = frame.h - 16 - panelH;
  if (m.route) {
    const h = Math.min(226, (m.splits ? panelTop - 6 : frame.h - 16) - 46);
    drawRoute(ctx, m.route, -8, 46, 220, h, routeStyle(a, 7));
  }
  drawLogo(ctx, 20, 20, 62, p);
  const right = frame.w - 20;
  const colW = 160;
  drawText(ctx, m.chip, right, 22, { size: 15, weight: 800, color: p.accentText, lineH: 20, maxW: colW });
  let y = 52;
  drawBigNumber(a, right, y, 72, 22);
  y += 72 * 0.95 + 14;
  m.stats
    .filter((s) => s.unit !== m.hero.unit && s.unit !== 'הקפה מהירה')
    .slice(0, 2)
    .forEach((s) => {
      if (y + statHeight(28) > (m.splits ? panelTop - 4 : frame.h - 16)) return;
      drawStatGrid(ctx, [s], right - colW, colW, y, 28, p, { cols: 1 });
      y += statHeight(28) + 10;
    });
  splitsPanel(ctx, m, p, 18, frame.w - 36, panelTop, barsH);
}

export const runDarkRoute: ShareTemplateDef = {
  id: 'run-dark-route',
  kind: 'cardio',
  label: 'מסלול גדול',
  formats: ['story', 'square'],
  brand: 'night',
  naturalBackground: () => 'brand',
  scrims: () => [{ deg: 180, stops: [[0, 'rgba(4,12,18,0.7)'], [1, 'rgba(4,12,18,0.85)']] }],
  draw: (a) => (a.frame.format === 'square' ? square(a) : story(a)),
};
